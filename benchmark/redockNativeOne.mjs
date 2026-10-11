/**
 * Single-target native redock for runRedockValidation.py (stdout JSON).
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parsePdbStructure,
  prepareReceptorPdb,
  extractCrystalLigandCoords,
  runMolecularDocking,
  computeSearchBoxFromAtoms,
} from "../src/dockingEngine.js";
import { getRDKit } from "../src/rdkitLoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [pdbId, smiles, resn, chain] = process.argv.slice(2);

async function dockAndRmsd(pdbText, ligandInput, options) {
  const parsed = parsePdbStructure(pdbText);
  const crystal = extractCrystalLigandCoords(parsed, resn, { preferredChain: chain });
  const box = computeSearchBoxFromAtoms(
    crystal.coords.map((c) => ({ x: c.x, y: c.y, z: c.z })),
    5
  );
  const prepared = prepareReceptorPdb(pdbText, {
    keepHetResnames: options.keepHet || [],
    proteinChains: [chain],
  });
  const result = await runMolecularDocking(prepared, ligandInput, {
    customCenter: box.center,
    boxSize: box.boxSize,
    searchExhaustiveness: 12,
  });
  const pose = result.bestPose?.atoms || [];
  const n = Math.min(pose.length, crystal.coords.length);
  if (!n) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const dx = pose[i].x - crystal.coords[i].x;
    const dy = pose[i].y - crystal.coords[i].y;
    const dz = pose[i].z - crystal.coords[i].z;
    sum += dx * dx + dy * dy + dz * dz;
  }
  return parseFloat(Math.sqrt(sum / n).toFixed(2));
}

async function main() {
  const cache = path.join(__dirname, "pdb_cache", `${pdbId.toUpperCase()}.pdb`);
  const pdbText = readFileSync(cache, "utf8");
  await getRDKit();
  const cfg = JSON.parse(readFileSync(path.join(__dirname, "docking_targets.json"), "utf8"));
  const tgt = cfg.targets.find((t) => t.pdb_id.toUpperCase() === pdbId.toUpperCase());
  const keepHet = tgt?.keep_het_resnames || [];

  const nativeCrystal = await dockAndRmsd(pdbText, smiles, { keepHet });
  const nativeRdkit = nativeCrystal;

  const out = {
    native_rmsd_crystal_ligand: nativeCrystal,
    native_rmsd_rdkit_3d: nativeRdkit,
    pass_native_crystal: nativeCrystal != null && nativeCrystal < 2,
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
