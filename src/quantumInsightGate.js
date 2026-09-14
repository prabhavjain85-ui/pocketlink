/**
 * Client-side size preview for Quantum Insight — mirrors api/quantum_insight_gate.py.
 * Used to refuse drug-like molecules before RDKit embed or API cold-start.
 */

import { isH2Smiles } from "./quantumGeometry";

export const MAX_QUBITS = 8;
export const MAX_ATOMS = 4;
export const MAX_NON_H_ATOMS = 2;

const AROMATIC_TO_ELEMENT = {
  b: "B",
  c: "C",
  n: "N",
  o: "O",
  p: "P",
  s: "S",
};

function isOrganicElement(symbol) {
  if (!symbol) return false;
  const upper = symbol.charAt(0).toUpperCase() + symbol.slice(1);
  return upper !== "H";
}

function parseBracketElement(inner) {
  const match = String(inner || "").match(/^(\d+)?([A-Z][a-z]?)/);
  return match ? match[2] : null;
}

/**
 * Conservative heavy-atom count from SMILES (explicit + aromatic symbols, excluding H).
 */
export function countHeavyAtomsFromSmiles(smiles) {
  const s = String(smiles || "").trim();
  let count = 0;
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (ch === "[") {
      const end = s.indexOf("]", i + 1);
      if (end === -1) break;
      const element = parseBracketElement(s.slice(i + 1, end));
      if (isOrganicElement(element)) count += 1;
      i = end + 1;
      continue;
    }

    if (ch >= "A" && ch <= "Z") {
      let symbol = ch;
      if (i + 1 < s.length && s[i + 1] >= "a" && s[i + 1] <= "z") {
        symbol += s[i + 1];
        i += 1;
      }
      if (isOrganicElement(symbol)) count += 1;
      i += 1;
      continue;
    }

    if (AROMATIC_TO_ELEMENT[ch]) {
      count += 1;
    }

    i += 1;
  }

  return count;
}

export function countAtomsFromAtomList(atoms) {
  const symbols = (atoms || []).map((a) => String(a.symbol || "").trim()).filter(Boolean);
  const nonH = symbols.filter((s) => s.toUpperCase() !== "H").length;
  return { atomCount: symbols.length, nonHCount: nonH };
}

export function sizeGateReasons(atomCount, nonHCount, nQubits = null) {
  const reasons = [];
  if (atomCount > MAX_ATOMS) {
    reasons.push(
      `Molecule has ${atomCount} atoms (limit: ${MAX_ATOMS}). ` +
        "Drug-like structures are outside this experimental scope."
    );
  }
  if (nonHCount > MAX_NON_H_ATOMS) {
    reasons.push(
      `Molecule has ${nonHCount} non-hydrogen atoms (limit: ${MAX_NON_H_ATOMS}). ` +
        "Larger heteroatom counts are refused to keep simulation time practical."
    );
  }
  if (nQubits != null && nQubits > MAX_QUBITS) {
    reasons.push(
      `Mapped qubit count is ${nQubits} (limit: ${MAX_QUBITS}). ` +
        "This experimental simulator is capped at 8 qubits."
    );
  }
  return reasons;
}

export function buildRefusalPreview(atomCount, nonHCount, nQubits = null, { fragment = false } = {}) {
  const reasons = sizeGateReasons(atomCount, nonHCount, nQubits);
  if (!reasons.length) {
    return null;
  }
  return {
    experimental: true,
    refused: true,
    overLimit: true,
    fragment: Boolean(fragment),
    error: fragment
      ? "Pocket-contact fragment is still too large for experimental quantum simulation."
      : "Molecule too large for experimental quantum simulation.",
    reasons,
    limits: {
      max_atoms: MAX_ATOMS,
      max_non_hydrogen_atoms: MAX_NON_H_ATOMS,
      max_qubits: MAX_QUBITS,
    },
    atom_count: atomCount,
    non_hydrogen_atom_count: nonHCount,
    n_qubits: nQubits,
  };
}

/**
 * Synchronous preview from SMILES only. H₂ is fail-open eligible; other SMILES refuse
 * when heavy-atom count alone exceeds the gate (conservative for drug-like inputs).
 */
export function previewQuantumGateFromSmiles(smiles) {
  const clean = String(smiles || "").trim();
  if (!clean) {
    return { overLimit: false, atomCount: null, nonHCount: null, refusal: null };
  }
  if (isH2Smiles(clean)) {
    return { overLimit: false, atomCount: 2, nonHCount: 0, refusal: null };
  }

  const nonHCount = countHeavyAtomsFromSmiles(clean);
  if (nonHCount > MAX_NON_H_ATOMS) {
    const refusal = buildRefusalPreview(nonHCount, nonHCount);
    return { overLimit: true, atomCount: nonHCount, nonHCount, refusal };
  }

  return { overLimit: false, atomCount: null, nonHCount, refusal: null, needsExactCount: true };
}

/**
 * Exact preview from hydrogen-complete atom coordinates (e.g. RDKit add_hs).
 */
export function previewQuantumGateFromAtoms(atoms) {
  const { atomCount, nonHCount } = countAtomsFromAtomList(atoms);
  const refusal = buildRefusalPreview(atomCount, nonHCount);
  return {
    overLimit: Boolean(refusal),
    atomCount,
    nonHCount,
    refusal,
  };
}
