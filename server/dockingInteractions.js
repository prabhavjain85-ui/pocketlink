/**
 * Geometric protein–ligand interaction analysis for docked poses.
 * Thresholds follow common PLIP / ProLIF-style cutoffs (distance + angles where H are present).
 */

export const INTERACTION_METHODOLOGY = {
  bindingSiteHeavyAtomCutoffAngstrom: 4.5,
  bindingSiteExtendedCutoffAngstrom: 5.0,
  hydrogenBondMaxDistanceAngstrom: 3.5,
  hydrogenBondMinAngleDeg: 120,
  saltBridgeMaxDistanceAngstrom: 4.0,
  hydrophobicMaxDistanceAngstrom: 4.0,
  piPiFaceToFaceCentroidMaxAngstrom: 5.5,
  piPiFaceToFaceNormalMaxDeg: 30,
  piPiTShapeCentroidMaxAngstrom: 6.0,
  piPiTShapeNormalMinDeg: 60,
  piPiTShapeNormalMaxDeg: 120,
  cationPiMaxDistanceAngstrom: 6.0,
  halogenBondMaxDistanceAngstrom: 4.0,
  halogenBondMinCxaAngleDeg: 165,
  stericClashMaxDistanceAngstrom: 3.0,
  bindingSiteRecoveryMinFraction: 0.25,
};

const AROMATIC_RESIDUES = new Set(["PHE", "TYR", "TRP", "HIS"]);
const HYDROPHOBIC_RESIDUES = new Set(["ALA", "VAL", "LEU", "ILE", "PHE", "TRP", "MET", "PRO", "TYR", "CYS"]);
const POSITIVE_RESIDUES = new Set(["LYS", "ARG", "HIS"]);
const NEGATIVE_RESIDUES = new Set(["ASP", "GLU"]);

/** Halogen-bond donors: Cl, Br, I only (not F). */
const HALOGEN_BOND_DONORS = new Set(["CL", "BR", "I"]);
const HB_ACCEPTOR_ELEMENTS = new Set(["O", "N", "S"]);
const HB_DONOR_ELEMENTS = new Set(["N", "O", "S"]);

const PROTEIN_DONOR_ATOMS = new Set([
  "N",
  "NE",
  "NH1",
  "NH2",
  "NZ",
  "ND1",
  "ND2",
  "NE2",
  "OG",
  "OG1",
  "OH",
]);
const PROTEIN_ACCEPTOR_ATOMS = new Set([
  "O",
  "OD1",
  "OD2",
  "OE1",
  "OE2",
  "OG",
  "OG1",
  "OH",
  "ND1",
  "NE2",
]);

export const INTERACTION_COLORS = {
  hydrogen_bond: "#10B981",
  salt_bridge: "#3B82F6",
  hydrophobic: "#D97706",
  pi_pi: "#A855F7",
  cation_pi: "#EC4899",
  halogen_bond: "#14B8A6",
  clash: "#EF4444",
};

/** UniProt-style labels vs PDB residue numbers (same chain). */
export const PDB_LITERATURE_RESIDUE_NOTES = {
  "4FFW": {
    note:
      "4FFW PDB numbering differs from common DPP-4 literature: e.g. GLU204≈GLU205, GLU203≈GLU206, TYR663≈TYR662, ARG123≈ARG125, PHE355≈PHE357.",
    pairs: [
      ["GLU205", "GLU204"],
      ["GLU206", "GLU203"],
      ["TYR662", "TYR663"],
      ["ARG125", "ARG123"],
      ["PHE357", "PHE355"],
    ],
  },
};

export function normalizeElement(symbol) {
  if (!symbol) return "C";
  const s = String(symbol).trim().toUpperCase();
  if (s === "A" || s === "AP" || s === "CA") return "C";
  if (s === "NA" || s === "N") return "N";
  if (s === "OA" || s === "O") return "O";
  if (s === "SA" || s === "S") return "S";
  if (s === "HD" || s === "H") return "H";
  if (s === "CL") return "CL";
  if (s === "BR") return "BR";
  if (s.length > 2) return s.slice(0, 2);
  return s;
}

export function isHeavyAtom(element) {
  const el = normalizeElement(element);
  return el !== "H";
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vecNorm(v) {
  const m = Math.hypot(v.x, v.y, v.z);
  if (m < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function angleDeg(a, b, c) {
  const u = vecNorm(vecSub(b, a));
  const v = vecNorm(vecSub(b, c));
  const dot = u.x * v.x + u.y * v.y + u.z * v.z;
  const clamped = Math.max(-1, Math.min(1, dot));
  return (Math.acos(clamped) * 180) / Math.PI;
}

function centroid(atoms) {
  if (!atoms.length) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const a of atoms) {
    sx += a.x;
    sy += a.y;
    sz += a.z;
  }
  const n = atoms.length;
  return { x: sx / n, y: sy / n, z: sz / n };
}

function ringNormal(atoms) {
  if (atoms.length < 3) return { x: 0, y: 0, z: 1 };
  const c = centroid(atoms);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < atoms.length; i++) {
    const p1 = atoms[i];
    const p2 = atoms[(i + 1) % atoms.length];
    const v1 = vecSub(p1, c);
    const v2 = vecSub(p2, c);
    nx += v1.y * v2.z - v1.z * v2.y;
    ny += v1.z * v2.x - v1.x * v2.z;
    nz += v1.x * v2.y - v1.y * v2.x;
  }
  return vecNorm({ x: nx, y: ny, z: nz });
}

function residueKey(atom) {
  const chain = atom.chainId || atom.chain || "A";
  return `${atom.resName}-${atom.resSeq}-${chain}`;
}

export function formatResidueLabel(atom) {
  const chain = atom.chainId || atom.chain || "A";
  return `${atom.resName}${atom.resSeq} ${chain}`;
}

function normalizeProteinAtom(a) {
  return {
    ...a,
    chainId: a.chainId || a.chain || "A",
    element: normalizeElement(a.element || a.atomName?.[0] || "C"),
  };
}

function normalizeLigandAtom(a, index) {
  const element = normalizeElement(a.element || a.symbol);
  return {
    ...a,
    index: a.index ?? index,
    element,
    symbol: element,
    atomName: a.atomName || `L${index + 1}`,
  };
}

function minHeavyDistanceToLigand(proteinAtom, ligandHeavy) {
  let best = Infinity;
  for (const la of ligandHeavy) {
    const d = dist(proteinAtom, la);
    if (d < best) best = d;
  }
  return best;
}

export function findBindingSiteResidues(proteinAtoms, ligandAtoms, cutoffAngstrom = 4.5) {
  const ligandHeavy = ligandAtoms.filter((a) => isHeavyAtom(a.element));
  const byRes = new Map();
  for (const pa of proteinAtoms.map(normalizeProteinAtom)) {
    if (!isHeavyAtom(pa.element)) continue;
    const md = minHeavyDistanceToLigand(pa, ligandHeavy);
    if (md > cutoffAngstrom) continue;
    const key = residueKey(pa);
    const prev = byRes.get(key);
    if (!prev || md < prev.minDistanceAngstrom) {
      byRes.set(key, {
        resName: pa.resName,
        resSeq: pa.resSeq,
        chainId: pa.chainId,
        label: formatResidueLabel(pa),
        minDistanceAngstrom: parseFloat(md.toFixed(2)),
      });
    }
  }
  return Array.from(byRes.values()).sort((a, b) => a.minDistanceAngstrom - b.minDistanceAngstrom);
}

function isProteinDonor(pa) {
  const name = pa.atomName;
  if (pa.isBackbone && name === "N") return true;
  return PROTEIN_DONOR_ATOMS.has(name);
}

function isProteinAcceptor(pa) {
  const name = pa.atomName;
  if (pa.isBackbone && name === "O") return true;
  return PROTEIN_ACCEPTOR_ATOMS.has(name);
}

function isLigandDonor(la, ligandAtoms) {
  const el = la.element;
  if (!HB_DONOR_ELEMENTS.has(el)) return false;
  const hasAttachedH = ligandAtoms.some(
    (h) =>
      normalizeElement(h.element) === "H" &&
      dist(h, la) < 1.25 &&
      h !== la
  );
  return hasAttachedH || el === "N";
}

function isLigandAcceptor(la) {
  return HB_ACCEPTOR_ELEMENTS.has(la.element);
}

export function isHydrogenBondPair(pa, la, ligandAtoms, proteinAtoms, distanceAngstrom) {
  const m = INTERACTION_METHODOLOGY;
  if (distanceAngstrom > m.hydrogenBondMaxDistanceAngstrom) return false;
  const protDonor = isProteinDonor(pa);
  const protAcceptor = isProteinAcceptor(pa);
  const ligDonor = isLigandDonor(la, ligandAtoms);
  const ligAcceptor = isLigandAcceptor(la);
  return (
    (protDonor && ligAcceptor) || (ligDonor && protAcceptor) || (protDonor && ligDonor)
  );
}

function findBondedCarbon(halogenAtom, ligandAtoms) {
  for (const a of ligandAtoms) {
    if (!isHeavyAtom(a.element)) continue;
    if (a.element !== "C") continue;
    if (dist(a, halogenAtom) <= 1.95) return a;
  }
  return null;
}

function residueKeysFromSiteRows(rows) {
  return new Set(rows.map((r) => `${r.resName}-${r.resSeq}-${r.chainId || "A"}`));
}

/**
 * Compare pose binding site to co-crystal ligand site on the same PDB (chain-aware).
 */
export function evaluateBindingSiteSanity(proteinAtoms, crystalLigandAtoms, poseLigandAtoms, options = {}) {
  const protein = proteinAtoms.map(normalizeProteinAtom);
  const crystalSite = findBindingSiteResidues(
    protein,
    crystalLigandAtoms,
    INTERACTION_METHODOLOGY.bindingSiteHeavyAtomCutoffAngstrom
  );
  const poseSite = findBindingSiteResidues(
    protein,
    poseLigandAtoms,
    INTERACTION_METHODOLOGY.bindingSiteHeavyAtomCutoffAngstrom
  );
  const crystalKeys = residueKeysFromSiteRows(crystalSite);
  const poseKeys = residueKeysFromSiteRows(poseSite);
  const recovered = [...crystalKeys].filter((k) => poseKeys.has(k));
  const fraction =
    crystalKeys.size > 0 ? recovered.length / crystalKeys.size : null;
  const minFraction =
    options.minRecoveryFraction ?? INTERACTION_METHODOLOGY.bindingSiteRecoveryMinFraction;
  const poseNotInKnownBindingSite =
    crystalKeys.size > 0 && (fraction ?? 0) < minFraction;

  const keyToLabel = (key) => {
    const row = crystalSite.find((r) => `${r.resName}-${r.resSeq}-${r.chainId}` === key);
    return row?.label || key.replace(/-/g, "").replace(/(\d+)-([A-Z])$/, "$1 $2");
  };

  return {
    crystalSiteResidueCount: crystalKeys.size,
    poseSiteResidueCount: poseKeys.size,
    overlapResidueCount: recovered.length,
    recoveredResidueCount: recovered.length,
    crystalSiteRecoveryFraction: fraction != null ? parseFloat(fraction.toFixed(3)) : null,
    recoveredResidueKeys: recovered,
    recoveredResidueLabels: recovered.map(keyToLabel),
    missingCrystalSiteResidueCount: crystalKeys.size - recovered.length,
    poseNotInKnownBindingSite,
    unreliableInteractions: poseNotInKnownBindingSite,
    message: poseNotInKnownBindingSite
      ? "Pose not in the known binding site; interactions unreliable."
      : null,
    crystalSiteResidues45Angstrom: crystalSite,
    poseSiteResidues45Angstrom: poseSite,
    pdbLiteratureResidueNote: options.pdbId ? PDB_LITERATURE_RESIDUE_NOTES[options.pdbId]?.note : null,
    cocrystalLigand: options.cocrystalLigand || null,
    cocrystalLigandSelectionReason: options.cocrystalLigandSelectionReason || null,
    cocrystalLigandInstanceCount: options.cocrystalLigandInstanceCount ?? null,
  };
}

function findDonorHydrogen(donor, allAtoms) {
  for (const h of allAtoms) {
    if (normalizeElement(h.element) !== "H") continue;
    if (dist(donor, h) <= 1.25) return h;
  }
  return null;
}

function pushInteraction(list, seen, row) {
  const key = [
    row.type,
    row.resName,
    row.resSeq,
    row.chainId,
    row.proteinAtom,
    row.ligandAtomIndex,
  ].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  list.push(row);
}

function aromaticRingAtomsForResidue(resName, resSeq, chainId, proteinAtoms) {
  const atoms = proteinAtoms.filter(
    (a) =>
      a.resName === resName &&
      a.resSeq === resSeq &&
      (a.chainId || "A") === chainId &&
      normalizeElement(a.element) === "C"
  );
  if (!atoms.length) return null;
  const ringNames = {
    PHE: ["CG", "CD1", "CD2", "CE1", "CE2", "CZ"],
    TYR: ["CG", "CD1", "CD2", "CE1", "CE2", "CZ"],
    TRP: ["CG", "CD1", "CD2", "NE1", "CE2", "CE3", "CZ2", "CZ3", "CH2"],
    HIS: ["CG", "ND1", "CD2", "CE1", "NE2"],
  };
  const names = ringNames[resName];
  if (!names) return atoms.slice(0, 6);
  const picked = names
    .map((n) => atoms.find((a) => a.atomName === n))
    .filter(Boolean);
  return picked.length >= 3 ? picked : atoms.slice(0, 6);
}

function ligandAromaticRings(ligandAtoms) {
  const carbons = ligandAtoms.filter((a) => a.element === "C");
  const rings = [];
  const visited = new Set();
  for (let i = 0; i < carbons.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [carbons[i]];
    visited.add(i);
    for (let j = i + 1; j < carbons.length; j++) {
      if (visited.has(j)) continue;
      if (dist(carbons[i], carbons[j]) <= 1.45) {
        cluster.push(carbons[j]);
        visited.add(j);
      }
    }
    if (cluster.length >= 5) {
      rings.push(cluster);
    }
  }
  return rings;
}

function classifyPiPi(ringA, ringB) {
  const cA = centroid(ringA);
  const cB = centroid(ringB);
  const d = dist(cA, cB);
  const nA = ringNormal(ringA);
  const nB = ringNormal(ringB);
  const dot = Math.abs(nA.x * nB.x + nA.y * nB.y + nA.z * nB.z);
  const normalAngle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  const m = INTERACTION_METHODOLOGY;
  if (d <= m.piPiFaceToFaceCentroidMaxAngstrom && normalAngle <= m.piPiFaceToFaceNormalMaxDeg) {
    return { subtype: "face_to_face", distanceAngstrom: parseFloat(d.toFixed(2)) };
  }
  if (
    d <= m.piPiTShapeCentroidMaxAngstrom &&
    normalAngle >= m.piPiTShapeNormalMinDeg &&
    normalAngle <= m.piPiTShapeNormalMaxDeg
  ) {
    return { subtype: "t_shaped", distanceAngstrom: parseFloat(d.toFixed(2)) };
  }
  return null;
}

/**
 * @param {object[]} proteinAtoms
 * @param {object[]} ligandAtoms
 * @param {object} [options]
 * @param {object[]} [options.crystalInteractions] precomputed crystal interactions for matching
 */
export function analyzePoseInteractions(proteinAtoms, ligandAtoms, options = {}) {
  const protein = proteinAtoms.map(normalizeProteinAtom);
  const ligand = ligandAtoms.map(normalizeLigandAtom);
  const ligandHeavy = ligand.filter((a) => isHeavyAtom(a.element));
  const allLigand = ligand;

  const bindingSite45 = findBindingSiteResidues(protein, ligand, INTERACTION_METHODOLOGY.bindingSiteHeavyAtomCutoffAngstrom);
  const bindingSite50 = findBindingSiteResidues(protein, ligand, INTERACTION_METHODOLOGY.bindingSiteExtendedCutoffAngstrom);
  const siteKeys45 = new Set(bindingSite45.map((r) => `${r.resName}-${r.resSeq}-${r.chainId}`));

  const interactions = [];
  const seen = new Set();
  const m = INTERACTION_METHODOLOGY;

  for (const la of ligandHeavy) {
    for (const pa of protein) {
      if (!isHeavyAtom(pa.element)) continue;
      const rk = residueKey(pa);
      if (!siteKeys45.has(rk)) continue;
      const d = dist(la, pa);

      const base = {
        resName: pa.resName,
        resSeq: pa.resSeq,
        chainId: pa.chainId,
        residueLabel: formatResidueLabel(pa),
        proteinAtom: pa.atomName,
        proteinElement: pa.element,
        ligandAtomIndex: la.index,
        ligandAtom: la.atomName || `L${la.index + 1}`,
        ligandElement: la.element,
        distanceAngstrom: parseFloat(d.toFixed(2)),
      };

      const isHbPair = isHydrogenBondPair(pa, la, allLigand, protein, d);

      if (d < m.stericClashMaxDistanceAngstrom && !isHbPair) {
        pushInteraction(interactions, seen, {
          ...base,
          type: "clash",
          subtype: "heavy_atom_too_close",
          warning: true,
        });
        continue;
      }

      if (d <= m.hydrogenBondMaxDistanceAngstrom && isHbPair) {
        const protDonor = isProteinDonor(pa);
        const ligDonor = isLigandDonor(la, allLigand);
        let geometricQuality = "distance-only";
        let hbondAngleDeg = null;
        const donor = protDonor && !ligDonor ? pa : la;
        const acceptor = donor === pa ? la : pa;
        const donorH =
          donor === pa ? findDonorHydrogen(pa, protein) : findDonorHydrogen(la, allLigand);
        if (donorH) {
          const ang = angleDeg(donorH, donor, acceptor);
          hbondAngleDeg = parseFloat(ang.toFixed(1));
          if (ang >= m.hydrogenBondMinAngleDeg) geometricQuality = "full";
        }
        pushInteraction(interactions, seen, {
          ...base,
          type: "hydrogen_bond",
          subtype: geometricQuality === "full" ? "angle_confirmed" : "distance_only",
          geometricQuality,
          hbondAngleDeg,
        });
      }

      if (
        d >= m.stericClashMaxDistanceAngstrom &&
        d <= m.hydrophobicMaxDistanceAngstrom &&
        la.element === "C" &&
        pa.element === "C"
      ) {
        if (HYDROPHOBIC_RESIDUES.has(pa.resName)) {
          pushInteraction(interactions, seen, {
            ...base,
            type: "hydrophobic",
            subtype: "carbon_carbon",
          });
        }
      }

      if (d <= m.saltBridgeMaxDistanceAngstrom) {
        const posAtom =
          POSITIVE_RESIDUES.has(pa.resName) &&
          ["NZ", "NH1", "NH2", "NE", "ND1", "NE2"].includes(pa.atomName);
        const negAtom =
          NEGATIVE_RESIDUES.has(pa.resName) &&
          ["OD1", "OD2", "OE1", "OE2"].includes(pa.atomName);
        const ligPos = la.element === "N" && la.partialCharge > 0.2;
        const ligNeg = la.element === "O" && la.partialCharge < -0.2;
        if ((posAtom && ligNeg) || (negAtom && ligPos) || (posAtom && la.element === "O") || (negAtom && la.element === "N")) {
          pushInteraction(interactions, seen, {
            ...base,
            type: "salt_bridge",
            subtype: "ionic",
          });
        }
      }

      if (
        HALOGEN_BOND_DONORS.has(la.element) &&
        HB_ACCEPTOR_ELEMENTS.has(pa.element) &&
        d <= m.halogenBondMaxDistanceAngstrom &&
        (isProteinAcceptor(pa) || pa.element === "N")
      ) {
        const carbon = findBondedCarbon(la, ligandHeavy);
        if (carbon) {
          const cxa = angleDeg(carbon, la, pa);
          if (cxa >= m.halogenBondMinCxaAngleDeg) {
            pushInteraction(interactions, seen, {
              ...base,
              type: "halogen_bond",
              subtype: la.element,
              halogenAngleDeg: parseFloat(cxa.toFixed(1)),
            });
          }
        }
      }
    }
  }

  const ligRings = ligandAromaticRings(ligandHeavy);
  const resSeenPi = new Set();
  for (const res of bindingSite45) {
    if (!AROMATIC_RESIDUES.has(res.resName)) continue;
    const ringAtoms = aromaticRingAtomsForResidue(res.resName, res.resSeq, res.chainId, protein);
    if (!ringAtoms || ringAtoms.length < 3) continue;
    for (const lring of ligRings) {
      const pi = classifyPiPi(ringAtoms, lring);
      if (!pi) continue;
      const key = `pi|${residueKey(ringAtoms[0])}|${pi.subtype}`;
      if (resSeenPi.has(key)) continue;
      resSeenPi.add(key);
      interactions.push({
        type: "pi_pi",
        subtype: pi.subtype,
        residueLabel: res.label,
        resName: res.resName,
        resSeq: res.resSeq,
        chainId: res.chainId,
        proteinAtom: ringAtoms[0].atomName,
        proteinElement: "C",
        ligandAtomIndex: lring[0].index,
        ligandAtom: lring[0].atomName || `L${lring[0].index + 1}`,
        ligandElement: "C",
        distanceAngstrom: pi.distanceAngstrom,
        geometricQuality: "centroid",
      });
    }
  }

  for (const res of bindingSite45) {
    if (!POSITIVE_RESIDUES.has(res.resName)) continue;
    const cation = protein.find(
      (a) =>
        a.resName === res.resName &&
        a.resSeq === res.resSeq &&
        (a.chainId || "A") === res.chainId &&
        ["NZ", "NH1", "NH2", "NE"].includes(a.atomName)
    );
    if (!cation) continue;
    for (const lring of ligRings) {
      const cRing = centroid(lring);
      const d = dist(cation, cRing);
      if (d > m.cationPiMaxDistanceAngstrom) continue;
      interactions.push({
        type: "cation_pi",
        subtype: "cation_to_aromatic",
        residueLabel: res.label,
        resName: res.resName,
        resSeq: res.resSeq,
        chainId: res.chainId,
        proteinAtom: cation.atomName,
        proteinElement: cation.element,
        ligandAtomIndex: lring[0].index,
        ligandAtom: lring[0].atomName || `L${lring[0].index + 1}`,
        ligandElement: "C",
        distanceAngstrom: parseFloat(d.toFixed(2)),
        geometricQuality: "centroid",
      });
    }
  }

  if (options.crystalInteractions?.length) {
    const crystalSet = new Set(
      options.crystalInteractions.map(
        (c) => `${c.type}|${c.resName}|${c.resSeq}|${c.proteinAtom}|${c.ligandElement}`
      )
    );
    for (const row of interactions) {
      row.matchesCrystal = crystalSet.has(
        `${row.type}|${row.resName}|${row.resSeq}|${row.proteinAtom}|${row.ligandElement}`
      );
    }
  }

  interactions.sort((a, b) => {
    const ra = `${a.resName}${a.resSeq}`;
    const rb = `${b.resName}${b.resSeq}`;
    if (ra !== rb) return ra.localeCompare(rb);
    return a.type.localeCompare(b.type);
  });

  const bindingSiteSanity =
    options.bindingSiteSanity ||
    (options.fullProteinAtoms && options.crystalLigandAtoms
      ? evaluateBindingSiteSanity(options.fullProteinAtoms, options.crystalLigandAtoms, ligandAtoms, {
          pdbId: options.pdbId,
        })
      : null);

  const disclaimerBase =
    "Interactions are inferred from the predicted docked pose geometry; they are not experimentally confirmed contacts.";
  const disclaimer =
    bindingSiteSanity?.poseNotInKnownBindingSite
      ? `${disclaimerBase} ${bindingSiteSanity.message}`
      : disclaimerBase;

  return {
    methodology: INTERACTION_METHODOLOGY,
    disclaimer,
    bindingSiteResidues45Angstrom: bindingSite45,
    bindingSiteResidues50Angstrom: bindingSite50,
    bindingSiteSanity,
    interactions,
    clashCount: interactions.filter((r) => r.type === "clash").length,
  };
}

export function groupInteractionsByResidue(interactions) {
  const groups = new Map();
  for (const row of interactions || []) {
    const key = row.residueLabel || `${row.resName}${row.resSeq} ${row.chainId || "A"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

export function interactionsToViewerLines(interactions, pocketAtoms, ligandAtoms) {
  const lines = [];
  for (const row of interactions || []) {
    if (row.type !== "hydrogen_bond" && row.type !== "salt_bridge" && row.type !== "halogen_bond") {
      continue;
    }
    const pa = pocketAtoms.find(
      (a) =>
        a.resName === row.resName &&
        a.resSeq === row.resSeq &&
        a.atomName === row.proteinAtom
    );
    const la = ligandAtoms[row.ligandAtomIndex];
    if (!pa || !la) continue;
    lines.push({
      type: row.type,
      color: INTERACTION_COLORS[row.type] || "#94A3B8",
      protein: pa,
      ligand: la,
      distance: row.distanceAngstrom,
      dashed: row.type === "hydrogen_bond",
    });
  }
  return lines;
}
