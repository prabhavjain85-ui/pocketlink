/**
 * Pocket-contact fragment selection for experimental Quantum Insight VQE.
 * Picks a ≤2-heavy-atom diatomic from docking contacts or ligand polar pairs.
 * Fragment energy is research-only — not binding affinity or drug energy.
 */

import {
  DOCKING_REFERENCE_TARGETS,
  extractPocketAtoms,
  fetchPdbFromRcsb,
  parsePdbStructure,
  prepareLigand3D,
  scoreLigandPose,
  transformLigandPose,
} from "./dockingEngine";
import { atomsToGeometryString } from "./quantumGeometry";
import { previewQuantumGateFromAtoms } from "./quantumInsightGate";

const DOCKING_SNAPSHOT_PREFIX = "pocketlink-docking-snapshot:";

/** Standard bond lengths (Å) for diatomic fragment geometries along the z-axis. */
const BOND_LENGTHS = {
  "C-C": 1.54,
  "C-N": 1.47,
  "C-O": 1.43,
  "C=O": 1.23,
  "C-H": 1.09,
  "N-H": 1.01,
  "O-H": 0.96,
  "N-O": 1.4,
  "C-F": 1.35,
  "N-N": 1.45,
  "O-O": 1.48,
};

const POLAR_ELEMENTS = new Set(["O", "N", "F", "S"]);
const HBOND_ELEMENTS = new Set(["O", "N", "F"]);

function bondKey(symbolA, symbolB, order = 1) {
  const a = String(symbolA || "C").toUpperCase();
  const b = String(symbolB || "C").toUpperCase();
  const pair = [a, b].sort().join("-");
  if (order >= 2 && ((a === "C" && b === "O") || (a === "C" && b === "N"))) {
    return `${a}=${b}`;
  }
  return pair;
}

function bondLengthFor(symbols, order = 1) {
  const key = bondKey(symbols[0], symbols[1], order);
  return BOND_LENGTHS[key] || BOND_LENGTHS[`${symbols[0]}-${symbols[1]}`] || 1.2;
}

export function parseBondsFromMolblock(molblock) {
  const bonds = [];
  const lines = String(molblock || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("V2000")) continue;
    const atomCount = parseInt(line.substring(0, 3).trim(), 10);
    const bondCount = parseInt(line.substring(3, 6).trim(), 10);
    for (let j = 1; j <= bondCount && i + atomCount + j < lines.length; j++) {
      const bondLine = lines[i + atomCount + j];
      const a = parseInt(bondLine.substring(0, 3).trim(), 10) - 1;
      const b = parseInt(bondLine.substring(3, 6).trim(), 10) - 1;
      const order = parseInt(bondLine.substring(6, 9).trim(), 10) || 1;
      if (a >= 0 && b >= 0) {
        bonds.push({ a, b, order });
      }
    }
    break;
  }
  return bonds;
}

export function parseLigandAtomLabel(label) {
  const match = String(label || "").match(/^([A-Z][a-z]?)-(\d+)$/);
  if (!match) return null;
  return { symbol: match[1], index: parseInt(match[2], 10) - 1 };
}

export function buildDiatomicFragment(symbolA, symbolB, bondOrder = 1) {
  const a = String(symbolA || "C").toUpperCase();
  const b = String(symbolB || "H").toUpperCase();
  const length = bondLengthFor([a, b], bondOrder);
  const atoms = [
    { symbol: a, x: 0, y: 0, z: 0 },
    { symbol: b, x: 0, y: 0, z: length },
  ];
  const formula = `${a}–${b}`;
  return {
    atoms,
    geometry: atomsToGeometryString(atoms),
    formula,
    heavySymbols: [a, b].filter((s) => s !== "H"),
  };
}

function gateFragmentPlan(plan) {
  const preview = previewQuantumGateFromAtoms(plan.atoms);
  return {
    ...plan,
    gate: preview,
    eligible: !preview.overLimit,
    refusal: preview.refusal,
  };
}

function findBondedPartner(atoms, bonds, atomIndex, preferPolar = true) {
  const neighbors = bonds
    .filter((bond) => bond.a === atomIndex || bond.b === atomIndex)
    .map((bond) => (bond.a === atomIndex ? bond.b : bond.a));

  if (!neighbors.length) return null;

  if (preferPolar) {
    const polarNeighbor = neighbors.find((idx) => POLAR_ELEMENTS.has(atoms[idx]?.symbol));
    if (polarNeighbor != null) {
      const bond = bonds.find(
        (b) =>
          (b.a === atomIndex && b.b === polarNeighbor) ||
          (b.b === atomIndex && b.a === polarNeighbor)
      );
      return { index: polarNeighbor, order: bond?.order || 1 };
    }
  }

  const idx = neighbors[0];
  const bond = bonds.find(
    (b) => (b.a === atomIndex && b.b === idx) || (b.b === atomIndex && b.a === idx)
  );
  return { index: idx, order: bond?.order || 1 };
}

function pickPolarBondedPair(atoms, bonds) {
  const polarIndices = atoms
    .map((atom, idx) => ({ atom, idx }))
    .filter(({ atom }) => POLAR_ELEMENTS.has(atom.symbol) || atom.symbol === "C");

  const priorityPairs = [
    (atom, j) => atom.symbol === "O" && atoms[j].symbol === "H",
    (atom, j) => atom.symbol === "N" && atoms[j].symbol === "H",
    (atom, j, order) => atom.symbol === "C" && atoms[j].symbol === "O" && order >= 2,
    (atom, j) => atom.symbol === "C" && atoms[j].symbol === "N",
    (atom, j) => atom.symbol === "C" && atoms[j].symbol === "O",
    (atom, j) => POLAR_ELEMENTS.has(atom.symbol) && POLAR_ELEMENTS.has(atoms[j].symbol),
  ];

  for (const predicate of priorityPairs) {
    for (const { atom, idx } of polarIndices) {
      const partner = findBondedPartner(atoms, bonds, idx, true);
      if (!partner) continue;
      const partnerAtom = atoms[partner.index];
      if (!partnerAtom) continue;
      if (predicate(atom, partner.index, partner.order)) {
        return {
          atomIndex: idx,
          partnerIndex: partner.index,
          order: partner.order,
        };
      }
    }
  }

  if (bonds.length) {
    const bond = bonds[0];
    return { atomIndex: bond.a, partnerIndex: bond.b, order: bond.order || 1 };
  }

  return null;
}

function fragmentFromPair(atoms, pair, meta) {
  const a = atoms[pair.atomIndex];
  const b = atoms[pair.partnerIndex];
  const fragment = buildDiatomicFragment(a.symbol, b.symbol, pair.order || 1);
  return gateFragmentPlan({
    ...fragment,
    ...meta,
    fragment_atoms: [a.symbol, b.symbol],
    bond_order: pair.order || 1,
  });
}

export function selectFragmentFromDocking(dockingResult) {
  const pose = dockingResult?.bestPose || dockingResult?.activePose;
  const interactions = pose?.hbondInteractions || pose?.score?.hbondInteractions || [];
  if (!interactions.length) {
    const breakdown = pose?.residueBreakdown || pose?.score?.residueBreakdown || [];
    if (!breakdown.length) return null;
    const closest = breakdown
      .filter((r) => r.minDistance <= 4.0)
      .sort((a, b) => a.minDistance - b.minDistance)[0];
    if (!closest) return null;
    return {
      contactResidue: `${closest.resName}-${closest.resSeq}`,
      selectionSource: "docking_closest_residue",
      ligandAtomLabel: null,
    };
  }

  const best = interactions.sort((a, b) => a.distance - b.distance)[0];
  return {
    contactResidue: best.residue,
    selectionSource: "docking_hbond",
    ligandAtomLabel: best.ligandAtom,
  };
}

export function readDockingSnapshot(pdbId, smiles) {
  if (typeof sessionStorage === "undefined") return null;
  const key = `${DOCKING_SNAPSHOT_PREFIX}${String(pdbId || "").toUpperCase()}:${String(smiles || "").trim()}`;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDockingSnapshot(pdbId, smiles, dockingResults, activePose) {
  if (typeof sessionStorage === "undefined" || !dockingResults || !activePose) return;
  const key = `${DOCKING_SNAPSHOT_PREFIX}${String(pdbId || "").toUpperCase()}:${String(smiles || "").trim()}`;
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        pdbId: String(pdbId || "").toUpperCase(),
        smiles: String(smiles || "").trim(),
        bestPose: activePose,
        hbondInteractions: activePose.hbondInteractions || activePose.score?.hbondInteractions || [],
        savedAt: Date.now(),
      })
    );
  } catch {
    // Ignore quota errors — fragment path can fall back to pocket probe.
  }
}

function resolvePocketCenter(pdbId, parsedStructure) {
  const preset = DOCKING_REFERENCE_TARGETS.find(
    (t) => t.id.toUpperCase() === String(pdbId || "").toUpperCase()
  );
  if (preset?.center) return preset.center;
  return parsedStructure?.pocketCenter || { x: 0, y: 0, z: 0 };
}

export async function probePocketContacts({ pdbId, smiles, rdkitInstance = null }) {
  const cleanPdb = String(pdbId || "").trim().toUpperCase();
  const cleanSmiles = String(smiles || "").trim();
  if (!cleanPdb || !cleanSmiles) {
    throw new Error("PDB id and SMILES are required for pocket contact probing.");
  }

  const pdbText = await fetchPdbFromRcsb(cleanPdb);
  const structure = parsePdbStructure(pdbText);
  const center = resolvePocketCenter(cleanPdb, structure);
  const { pocketAtoms } = extractPocketAtoms(structure.proteinAtoms, center, 10.0);
  const ligand = await prepareLigand3D(cleanSmiles, rdkitInstance);
  const posedAtoms = transformLigandPose(ligand.atoms, center, {
    r11: 1,
    r12: 0,
    r13: 0,
    r21: 0,
    r22: 1,
    r23: 0,
    r31: 0,
    r32: 0,
    r33: 1,
  });
  const score = scoreLigandPose(posedAtoms, pocketAtoms, ligand.numRotatableBonds);
  return {
    ligandAtoms: posedAtoms,
    pocketAtoms,
    score,
    contactHint: selectFragmentFromDocking({
      bestPose: {
        hbondInteractions: score.hbondInteractions,
        residueBreakdown: score.residueBreakdown,
      },
    }),
  };
}

async function loadLigandGraph(smiles, rdkitInstance = null) {
  const ligand = await prepareLigand3D(smiles, rdkitInstance);
  const { getRDKit } = await import("./rdkitLoader");
  const rdkit = rdkitInstance || (await getRDKit());
  let bonds = [];
  if (rdkit) {
    const mol = rdkit.get_mol(smiles);
    if (mol?.is_valid()) {
      bonds = parseBondsFromMolblock(mol.get_molblock());
      mol.delete();
    }
  }
  return { atoms: ligand.atoms, bonds };
}

function fragmentFromContactHint(contactHint, atoms, bonds, parentSmiles) {
  if (!contactHint) return null;

  if (contactHint.ligandAtomLabel) {
    const parsed = parseLigandAtomLabel(contactHint.ligandAtomLabel);
    if (parsed && atoms[parsed.index]) {
      const partner = findBondedPartner(atoms, bonds, parsed.index, true);
      if (partner) {
        return fragmentFromPair(
          atoms,
          { atomIndex: parsed.index, partnerIndex: partner.index, order: partner.order },
          {
            parent_smiles: parentSmiles,
            contact_residue: contactHint.contactResidue,
            selection_source: contactHint.selectionSource,
            fragment: true,
          }
        );
      }
      const solo = atoms[parsed.index];
      const partnerSymbol = HBOND_ELEMENTS.has(solo.symbol) ? "H" : "O";
      const built = buildDiatomicFragment(solo.symbol, partnerSymbol);
      return gateFragmentPlan({
        ...built,
        parent_smiles: parentSmiles,
        contact_residue: contactHint.contactResidue,
        selection_source: contactHint.selectionSource,
        fragment: true,
        fragment_atoms: [solo.symbol, partnerSymbol],
      });
    }
  }

  const polarPair = pickPolarBondedPair(atoms, bonds);
  if (polarPair) {
    return fragmentFromPair(atoms, polarPair, {
      parent_smiles: parentSmiles,
      contact_residue: contactHint.contactResidue || null,
      selection_source: contactHint.selectionSource,
      fragment: true,
    });
  }

  return null;
}

/**
 * Select a VQE-legal pocket-contact fragment for an oversized parent drug.
 */
export async function selectPocketContactFragment({
  smiles,
  protein = null,
  dockingResult = null,
  rdkitInstance = null,
} = {}) {
  const parentSmiles = String(smiles || "").trim();
  if (!parentSmiles) {
    throw new Error("SMILES is required to select a pocket-contact fragment.");
  }

  const pdbId = protein?.id || protein?.pdb_id || null;
  let contactHint = null;
  let selectionSource = null;

  if (dockingResult) {
    contactHint = selectFragmentFromDocking(dockingResult);
    if (contactHint) selectionSource = contactHint.selectionSource;
  }

  if (!contactHint && pdbId) {
    const cached = readDockingSnapshot(pdbId, parentSmiles);
    if (cached) {
      contactHint = selectFragmentFromDocking(cached);
      if (contactHint) selectionSource = contactHint.selectionSource;
    }
  }

  const { atoms, bonds } = await loadLigandGraph(parentSmiles, rdkitInstance);

  if (!contactHint && pdbId) {
    try {
      const probe = await probePocketContacts({ pdbId, smiles: parentSmiles, rdkitInstance });
      contactHint = probe.contactHint;
      if (contactHint) selectionSource = contactHint.selectionSource;
    } catch {
      // Fall through to ligand polar pair.
    }
  }

  if (contactHint) {
    const fromContact = fragmentFromContactHint(contactHint, atoms, bonds, parentSmiles);
    if (fromContact) return fromContact;
  }

  const polarPair = pickPolarBondedPair(atoms, bonds);
  if (!polarPair) {
    throw new Error("Could not identify a tiny polar bonded pair for fragment VQE.");
  }

  return fragmentFromPair(atoms, polarPair, {
    parent_smiles: parentSmiles,
    contact_residue: contactHint?.contactResidue || null,
    selection_source: pdbId
      ? selectionSource || "ligand_polar_pair_fallback"
      : "ligand_polar_pair_no_pocket",
    fragment: true,
  });
}
