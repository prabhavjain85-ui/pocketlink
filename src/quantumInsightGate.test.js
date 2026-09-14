/**
 * Client-side Quantum Insight size gate — mirrors api/quantum_insight_gate.py.
 */

import {
  MAX_ATOMS,
  MAX_NON_H_ATOMS,
  MAX_QUBITS,
  buildRefusalPreview,
  countHeavyAtomsFromSmiles,
  previewQuantumGateFromAtoms,
  previewQuantumGateFromSmiles,
  sizeGateReasons,
} from "./quantumInsightGate";
import { atomsToGeometryString, isH2Smiles } from "./quantumGeometry";

describe("quantum insight size gate", () => {
  test("H2 SMILES recognized and eligible", () => {
    expect(isH2Smiles("[H][H]")).toBe(true);
    expect(isH2Smiles("CCO")).toBe(false);
    const preview = previewQuantumGateFromSmiles("[H][H]");
    expect(preview.overLimit).toBe(false);
    expect(preview.atomCount).toBe(2);
  });

  test("atoms serialize to PySCF geometry string", () => {
    const geometry = atomsToGeometryString([
      { symbol: "H", x: 0, y: 0, z: 0 },
      { symbol: "H", x: 0, y: 0, z: 0.735 },
    ]);
    expect(geometry).toBe("H 0 0 0; H 0 0 0.735");
  });

  test("caffeine SMILES is refused synchronously from heavy-atom count", () => {
    const caffeine = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
    const heavy = countHeavyAtomsFromSmiles(caffeine);
    expect(heavy).toBeGreaterThan(MAX_NON_H_ATOMS);
    const preview = previewQuantumGateFromSmiles(caffeine);
    expect(preview.overLimit).toBe(true);
    expect(preview.refusal?.reasons?.length).toBeGreaterThan(0);
  });

  test("drug-like atom list is refused", () => {
    const atoms = Array.from({ length: 10 }, () => ({ symbol: "C", x: 0, y: 0, z: 0 }));
    const preview = previewQuantumGateFromAtoms(atoms);
    expect(preview.overLimit).toBe(true);
    expect(preview.refusal.reasons.some((r) => r.includes("atoms"))).toBe(true);
  });

  test("qubit cap refusal", () => {
    const reasons = sizeGateReasons(2, 0, MAX_QUBITS + 1);
    expect(reasons.some((r) => r.includes("qubit"))).toBe(true);
  });

  test("refusal preview includes limits", () => {
    const refusal = buildRefusalPreview(21, 13);
    expect(refusal.refused).toBe(true);
    expect(refusal.limits.max_atoms).toBe(MAX_ATOMS);
    expect(refusal.limits.max_non_hydrogen_atoms).toBe(MAX_NON_H_ATOMS);
    expect(refusal.atom_count).toBe(21);
    expect(refusal.non_hydrogen_atom_count).toBe(13);
  });
});
