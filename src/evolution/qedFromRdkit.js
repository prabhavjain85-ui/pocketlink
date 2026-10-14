/**
 * QED property vector aligned with RDKit Chem/QED.properties() (Bickerton ADS + WEIGHT_MEAN).
 */
import { bickertonQED } from "./bickertonQED";

const ACCEPTOR_SMARTS = [
  "[oH0;X2]",
  "[OH1;X2;v2]",
  "[OH0;X2;v2]",
  "[OH0;X1;v2]",
  "[O-;X1]",
  "[SH0;X2;v2]",
  "[SH0;X1;v2]",
  "[S-;X1]",
  "[nH0;X2]",
  "[NH0;X1;v3]",
  "[$([N;+0;X3;v3]);!$(N[C,S]=O)]",
];

let qedAlertSmarts = null;

async function loadQedAlertSmarts() {
  if (qedAlertSmarts) return qedAlertSmarts;
  const mod = await import("./qedStructuralAlerts.js");
  qedAlertSmarts = mod.QED_STRUCTURAL_ALERT_SMARTS || [];
  return qedAlertSmarts;
}

function countSubstructMatches(RDKit, mol, smarts) {
  try {
    const q = RDKit.get_qmol(smarts);
    if (!q || typeof mol.get_substruct_matches !== "function") return 0;
    const raw = mol.get_substruct_matches(q);
    if (q.delete) q.delete();
    if (!raw) return 0;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
        if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
      } catch {
        return 0;
      }
    }
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === "object") return Object.keys(raw).length;
    return 0;
  } catch {
    return 0;
  }
}

function countHba(RDKit, mol) {
  let n = 0;
  for (const sm of ACCEPTOR_SMARTS) n += countSubstructMatches(RDKit, mol, sm);
  return n;
}

function aromaticRingCountFromDescriptors(desc) {
  const rings = Number(desc.NumRings ?? 0);
  const aliph = Number(desc.NumAliphaticRings ?? 0);
  return Math.max(0, rings - aliph);
}

function largestOrganicFragment(RDKit, smiles) {
  const parts = String(smiles || "")
    .trim()
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return parts[0] || smiles;
  let best = parts[0];
  let bestHa = -1;
  for (const part of parts) {
    const mol = RDKit.get_mol(part);
    if (!mol) continue;
    try {
      const desc = JSON.parse(mol.get_descriptors() || "{}");
      const ha = Number(desc.NumHeavyAtoms ?? desc.numHeavyAtoms ?? 0);
      if (ha > bestHa) {
        bestHa = ha;
        best = part;
      }
    } finally {
      mol.delete();
    }
  }
  return best;
}

function countQedStructuralAlerts(RDKit, mol, patterns) {
  let n = 0;
  for (const sm of patterns) {
    if (countSubstructMatches(RDKit, mol, sm) > 0) n += 1;
  }
  return n;
}

export function computeQEDFromMol(RDKit, mol, { alertPatterns = null } = {}) {
  const desc = JSON.parse(mol.get_descriptors() || "{}");
  const props = {
    MW: desc.amw ?? desc.MolWt ?? desc.exactmw ?? 0,
    ALOGP: desc.CrippenClogP ?? desc.MolLogP ?? 0,
    HBA: countHba(RDKit, mol),
    HBD: desc.NumHBD ?? desc.numHBD ?? desc.lipinskiHBD ?? 0,
    PSA: desc.TPSA ?? desc.tpsa ?? 0,
    ROTB: desc.NumRotatableBonds ?? desc.numRotatableBonds ?? 0,
    AROM: aromaticRingCountFromDescriptors(desc),
    ALERTS: alertPatterns ? countQedStructuralAlerts(RDKit, mol, alertPatterns) : 0,
  };
  return bickertonQED(props);
}

export async function computeQEDFromSmilesAsync(RDKit, smiles, opts = {}) {
  const fragment = largestOrganicFragment(RDKit, smiles);
  const mol = RDKit.get_mol(fragment);
  if (!mol) return null;
  try {
    const patterns = opts.alertPatterns ?? (await loadQedAlertSmarts());
    return computeQEDFromMol(RDKit, mol, { alertPatterns: patterns });
  } finally {
    mol.delete();
  }
}

export function computeQEDFromSmiles(RDKit, smiles, opts = {}) {
  const fragment = largestOrganicFragment(RDKit, smiles);
  const mol = RDKit.get_mol(fragment);
  if (!mol) return null;
  try {
    const patterns = opts.alertPatterns ?? qedAlertSmarts;
    return computeQEDFromMol(RDKit, mol, { alertPatterns: patterns });
  } finally {
    mol.delete();
  }
}

/** Warm QED alert SMARTS for synchronous scoring paths. */
export async function preloadQedAlerts() {
  qedAlertSmarts = await loadQedAlertSmarts();
}

export { bickertonQED };
