/**
 * QED property vector from RDKit WASM (Bickerton inputs).
 * HBA uses a reduced acceptor SMARTS set; ALERTS uses evolution structural alert count when provided.
 */
import { bickertonQED } from "./bickertonQED.js";

const ACCEPTOR_SMARTS = [
  "[oH0;X2]",
  "[OH1;X2;v2]",
  "[OH0;X2;v2]",
  "[O-;X1]",
  "[nH0;X2]",
  "[NH0;X1;v3]",
];

function countSubstruct(RDKit, mol, smarts) {
  try {
    const q = RDKit.get_qmol(smarts);
    if (!q || typeof mol.get_substruct_match !== "function") return 0;
    const m = mol.get_substruct_match(q);
    if (q.delete) q.delete();
    return m ? 1 : 0;
  } catch {
    return 0;
  }
}

function countHba(RDKit, mol) {
  let n = 0;
  for (const sm of ACCEPTOR_SMARTS) n += countSubstruct(RDKit, mol, sm);
  return n;
}

function aromaticRingCount(mol) {
  try {
    const json = JSON.parse(mol.get_json() || "{}");
    const ext = json?.molecules?.[0]?.extensions?.find((e) => e.name === "rdkitRepresentation");
    const rings = ext?.atomRings || [];
    return rings.length;
  } catch {
    return 0;
  }
}

export function computeQEDFromMol(RDKit, mol, { alertCount = 0 } = {}) {
  const desc = JSON.parse(mol.get_descriptors() || "{}");
  const hbaSub = countHba(RDKit, mol);
  const props = {
    MW: desc.exactmw || desc.amw || desc.MolWt || 0,
    ALOGP: desc.CrippenClogP ?? desc.MolLogP ?? 0,
    HBA: Math.max(hbaSub, Number(desc.lipinskiHBA ?? desc.NumHBA ?? 0)),
    HBD: desc.NumHBD ?? desc.numHBD ?? desc.lipinskiHBD ?? 0,
    PSA: desc.TPSA ?? desc.tpsa ?? 0,
    ROTB: desc.NumRotatableBonds ?? desc.numRotatableBonds ?? 0,
    AROM: aromaticRingCount(mol),
    ALERTS: alertCount,
  };
  return bickertonQED(props);
}

export function computeQEDFromSmiles(RDKit, smiles, opts) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) return null;
  try {
    return computeQEDFromMol(RDKit, mol, opts);
  } finally {
    mol.delete();
  }
}

export { bickertonQED };
