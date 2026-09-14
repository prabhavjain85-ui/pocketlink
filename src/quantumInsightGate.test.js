/**
 * Mirrors Python size-gate expectations for documentation / CI without PySCF.
 */

import { atomsToGeometryString, isH2Smiles } from "./quantumGeometry";

const MAX_ATOMS = 4;
const MAX_NON_H_ATOMS = 2;
const MAX_QUBITS = 8;

function countAtomsInGeometry(geometry) {
  const symbols = String(geometry || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/)[0]);
  const nonH = symbols.filter((s) => s.toUpperCase() !== "H").length;
  return { total: symbols.length, nonH };
}

function sizeGateReasons(atomCount, nonHCount, nQubits = null) {
  const reasons = [];
  if (atomCount > MAX_ATOMS) {
    reasons.push(`Molecule has ${atomCount} atoms (limit: ${MAX_ATOMS}).`);
  }
  if (nonHCount > MAX_NON_H_ATOMS) {
    reasons.push(`Molecule has ${nonHCount} non-hydrogen atoms (limit: ${MAX_NON_H_ATOMS}).`);
  }
  if (nQubits != null && nQubits > MAX_QUBITS) {
    reasons.push(`Mapped qubit count is ${nQubits} (limit: ${MAX_QUBITS}).`);
  }
  return reasons;
}

describe("quantum insight size gate", () => {
  test("H2 SMILES recognized", () => {
    expect(isH2Smiles("[H][H]")).toBe(true);
    expect(isH2Smiles("CCO")).toBe(false);
  });

  test("atoms serialize to PySCF geometry string", () => {
    const geometry = atomsToGeometryString([
      { symbol: "H", x: 0, y: 0, z: 0 },
      { symbol: "H", x: 0, y: 0, z: 0.735 },
    ]);
    expect(geometry).toBe("H 0 0 0; H 0 0 0.735");
  });

  test("drug-like atom count is refused", () => {
    const geometry = Array.from({ length: 10 }, (_, i) => `C ${i} 0 0`).join("; ");
    const { total, nonH } = countAtomsInGeometry(geometry);
    const reasons = sizeGateReasons(total, nonH);
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.some((r) => r.includes("atoms"))).toBe(true);
  });

  test("qubit cap refusal", () => {
    const reasons = sizeGateReasons(2, 0, 12);
    expect(reasons.some((r) => r.includes("qubit"))).toBe(true);
  });
});
