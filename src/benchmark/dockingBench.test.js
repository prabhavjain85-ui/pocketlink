/**
 * Populates benchmark/docking_cache.json using the same dockingEngine + RDKit path as the app.
 * Skipped unless RUN_DOCKING_BENCH=1 (see `npm run benchmark`).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import {
  fetchPdbFromRcsb,
  prepareReceptorPdb,
  runMolecularDocking,
  parsePdbStructure,
  computeSearchBoxFromAtoms,
  pickCoCrystalLigandGroup,
} from "../dockingEngine";

const DOCK_SEED_BASE = 13082026;
const DOCK_EXHAUSTIVENESS = 4;
const runBench = process.env.RUN_DOCKING_BENCH === "1";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const describeBench = runBench ? describe : describe.skip;

describeBench("benchmark docking cache", () => {
  test(
    "populate docking_cache.json for validation panel",
    async () => {
      const benchDir = path.join(__dirname, "..", "..", "benchmark");
      const validation = JSON.parse(
        readFileSync(path.join(benchDir, "validation_set.json"), "utf8")
      );
      const heldout = JSON.parse(readFileSync(path.join(benchDir, "heldout_set.json"), "utf8"));
      const allTargets = [...validation.targets, ...heldout.targets];
      const cachePath = path.join(benchDir, "docking_cache.json");
      const pdbCacheDir = path.join(benchDir, "pdb_cache");

      async function loadPdb(pdbId) {
        mkdirSync(pdbCacheDir, { recursive: true });
        const file = path.join(pdbCacheDir, `${pdbId.toUpperCase()}.pdb`);
        if (existsSync(file)) return readFileSync(file, "utf8");
        const text = await fetchPdbFromRcsb(pdbId);
        writeFileSync(file, text);
        return text;
      }

      const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
      const pdbTexts = {};

      for (const target of allTargets) {
        const pdbId = target.pdb_id;
        if (!pdbTexts[pdbId]) {
          pdbTexts[pdbId] = await loadPdb(pdbId);
        }
        const rawPdb = pdbTexts[pdbId];
        const parsed = parsePdbStructure(rawPdb);
        const co = pickCoCrystalLigandGroup(parsed.heteroAtoms);
        const box = computeSearchBoxFromAtoms(co.atoms, 5);
        const pdbText = prepareReceptorPdb(rawPdb);
        const redockPath = path.join(benchDir, "redocking_results.json");
        let redockOk = true;
        if (existsSync(redockPath)) {
          const redock = JSON.parse(readFileSync(redockPath, "utf8"));
          const row = (redock.rows || []).find((r) => r.pdb_id === pdbId.toUpperCase());
          redockOk = row?.pass === true;
        }

        for (const compound of target.compounds) {
          if (!compound.pubchem_cid) {
            continue;
          }
          const key = `${pdbId}_${compound.pubchem_cid}`;
          if (cache[key]?.delta_g != null) continue;
          if (!redockOk) {
            cache[key] = {
              skipped: true,
              reason: "redocking_validation_failed",
              pdb_id: pdbId,
            };
            continue;
          }

          const seed = DOCK_SEED_BASE + Number(String(compound.pubchem_cid || "0").slice(-6)) % 100000;
          const orig = Math.random;
          Math.random = mulberry32(seed);
          try {
            const result = await runMolecularDocking(pdbText, compound.smiles, {
              searchExhaustiveness: DOCK_EXHAUSTIVENESS,
              customCenter: box.center,
              boxSize: box.boxSize,
            });
            const deltaG = result?.bestPose?.deltaG ?? result?.rankedPoses?.[0]?.deltaG ?? null;
            cache[key] = { delta_g: deltaG, name: compound.name, pdb_id: pdbId };
          } catch (err) {
            cache[key] = { error: err?.message || String(err), name: compound.name, pdb_id: pdbId };
          } finally {
            Math.random = orig;
          }
        }
      }

      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      expect(Object.keys(cache).length).toBeGreaterThan(0);
    },
    900000
  );
});
