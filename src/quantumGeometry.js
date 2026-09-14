/**
 * Build 3D atom coordinates for Quantum Insight API payloads.
 * Uses RDKit WASM add_hs + CoordGen 2D layout, then the same planar-to-3D
 * lift used by docking (liftPlanarAtomsTo3D) when true 3D embed is unavailable.
 */

import { liftPlanarAtomsTo3D } from "./dockingEngine";
import { getRDKit } from "./rdkitLoader";

const H2_SMILES = new Set(["[H][H]", "HH", "[HH]", "[H]H", "H[H]"]);

export function isH2Smiles(smiles) {
  return H2_SMILES.has(String(smiles || "").trim());
}

export function parseAtomsFromMolblock(molblock) {
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

function hasNonPlanarCoordinates(atoms) {
  return atoms.some((a) => Math.abs(a.z) >= 1e-4);
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
  if (!mol || !mol.is_valid()) {
    throw new Error(`Could not parse SMILES: ${clean}`);
  }

  let hsBlock = "";
  try {
    hsBlock = mol.add_hs();
  } catch {
    hsBlock = "";
  }
  mol.delete();

  if (!hsBlock || !String(hsBlock).includes("V2000")) {
    throw new Error(
      "RDKit could not add explicit hydrogens. Quantum Insight requires a hydrogen-complete 3D geometry."
    );
  }

  const molH = rdkit.get_mol(hsBlock);
  if (!molH || !molH.is_valid()) {
    throw new Error("Invalid molecule after adding explicit hydrogens.");
  }

  try {
    // CoordGen 2D layout (RDKit WASM has no ETKDG/MMFF 3D embed API).
    molH.get_new_coords(true);
  } catch {
    // Fall back to existing coordinates in the molblock.
  }

  const atoms = parseAtomsFromMolblock(molH.get_molblock());
  molH.delete();

  if (!atoms.length) {
    throw new Error("Could not extract atomic coordinates from RDKit molblock.");
  }

  const embedded = liftPlanarAtomsTo3D(atoms);
  if (!hasNonPlanarCoordinates(embedded)) {
    throw new Error(
      "3D coordinate embedding failed: the molecule is still planar. Quantum Insight cannot use a flat 2D depiction."
    );
  }

  return embedded.map(({ symbol, x, y, z }) => ({ symbol, x, y, z }));
}

export function atomsToGeometryString(atoms) {
  return atoms
    .map((a) => `${a.symbol} ${a.x} ${a.y} ${a.z}`)
    .join("; ");
}

/**
 * Count hydrogen-complete atoms for size-gate preview (no 3D embed).
 */
export async function countQuantumAtomsFromSmiles(smiles, rdkitInstance = null) {
  const clean = String(smiles || "").trim();
  if (!clean) {
    throw new Error("SMILES is required to count atoms.");
  }
  if (isH2Smiles(clean)) {
    return { atomCount: 2, nonHCount: 0 };
  }

  const rdkit = rdkitInstance || (await getRDKit());
  if (!rdkit) {
    throw new Error("RDKit is required to count atoms for this molecule.");
  }

  const mol = rdkit.get_mol(clean);
  if (!mol || !mol.is_valid()) {
    throw new Error(`Could not parse SMILES: ${clean}`);
  }

  let hsBlock = "";
  try {
    hsBlock = mol.add_hs();
  } catch {
    hsBlock = "";
  }
  mol.delete();

  if (!hsBlock || !String(hsBlock).includes("V2000")) {
    throw new Error("RDKit could not add explicit hydrogens for atom counting.");
  }

  const atoms = parseAtomsFromMolblock(hsBlock);
  if (!atoms.length) {
    throw new Error("Could not extract atoms from RDKit molblock.");
  }

  const nonHCount = atoms.filter((a) => String(a.symbol).toUpperCase() !== "H").length;
  return { atomCount: atoms.length, nonHCount };
}
