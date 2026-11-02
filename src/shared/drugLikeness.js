/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const MAX_CANDIDATES = 5;

export function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function propsOf(candidate) {
  return {
    mw: num(candidate?.molecularWeight ?? candidate?.MolecularWeight),
    xlogp: num(candidate?.xlogp ?? candidate?.XLogP),
    hbd: num(candidate?.hbd ?? candidate?.HBondDonorCount),
    hba: num(candidate?.hba ?? candidate?.HBondAcceptorCount),
    rot: num(candidate?.rotatableBonds ?? candidate?.RotatableBondCount),
    tpsa: num(candidate?.tpsa ?? candidate?.TPSA),
  };
}

export function drugLikenessChecks(candidate) {
  const p = propsOf(candidate);
  return [
    {
      rule: "Lipinski MW <= 500 Da",
      value: p.mw,
      pass: p.mw !== null ? p.mw <= 500 : true,
      boundary: 500,
    },
    {
      rule: "Lipinski XLogP <= 5",
      value: p.xlogp,
      pass: p.xlogp !== null ? p.xlogp <= 5 : true,
      boundary: 5,
    },
    {
      rule: "Lipinski HBD <= 5",
      value: p.hbd,
      pass: p.hbd !== null ? p.hbd <= 5 : true,
      boundary: 5,
    },
    {
      rule: "Lipinski HBA <= 10",
      value: p.hba,
      pass: p.hba !== null ? p.hba <= 10 : true,
      boundary: 10,
    },
    {
      rule: "Veber Rotatable Bonds <= 10",
      value: p.rot,
      pass: p.rot !== null ? p.rot <= 10 : true,
      boundary: 10,
    },
    {
      rule: "Veber TPSA <= 140 A^2",
      value: p.tpsa,
      pass: p.tpsa !== null ? p.tpsa <= 140 : true,
      boundary: 140,
    },
  ];
}
