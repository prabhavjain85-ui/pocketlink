/**
 * Build 3D atom coordinates for Quantum Insight API payloads.
 * Reuses RDKit molblock parsing (same approach as dockingEngine).
 */

import { getRDKit } from "./rdkitLoader";

const H2_SMILES = new Set(["[H][H]", "HH", "[HH]", "[H]H", "H[H]"]);

export function isH2Smiles(smiles) {
  return H2_SMILES.has(String(smiles || "").trim());
}

function parseAtomsFromMolblock(molblock) {
  const atoms = [];
  const lines = String(molblock || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("V2000")) continue;
    const atomCount = parseInt(line.substring(0, 3).trim(), 10);
    for (let j = 1; j <= atomCount && i + j < lines.length; j++) {
      const atomLine = lines[i + j];
      const x = parseFloat(atomLine.substring(0, 10).trim());
      const y = parseFloat(atomLine.substring(10, 20).trim());
      const z = parseFloat(atomLine.substring(20, 30).trim());
      const symbol = atomLine.substring(31, 34).trim();
      atoms.push({
        symbol,
        x: Number.isFinite(x) ? x : 0,
        y: Number.isFinite(y) ? y : 0,
        z: Number.isFinite(z) ? z : 0,
      });
    }
    break;
  }
  return atoms;
}

/**
 * Return atom list for quantum API, or null for canonical H2 (backend supplies geometry).
 */
export async function buildQuantumAtoms(smiles, rdkitInstance = null) {
  const clean = String(smiles || "").trim();
  if (!clean) {
    throw new Error("SMILES is required for quantum geometry.");
  }
  if (isH2Smiles(clean)) {
    return null;
  }

  const rdkit = rdkitInstance || (await getRDKit());
  if (!rdkit) {
    throw new Error("RDKit is required to derive 3D coordinates for this molecule.");
  }

  const mol = rdkit.get_mol(clean);
  if (!mol) {
    throw new Error(`Could not parse SMILES: ${clean}`);
  }

  let molblock = "";
  try {
    molblock = mol.get_molblock();
  } catch {
    molblock = "";
  }

  const atoms = parseAtomsFromMolblock(molblock);
  if (!atoms.length) {
    throw new Error("Could not extract 3D coordinates from RDKit molblock.");
  }
  return atoms;
}

export function atomsToGeometryString(atoms) {
  return atoms
    .map((a) => `${a.symbol} ${a.x} ${a.y} ${a.z}`)
    .join("; ");
}
