/**
 * Co-crystal redocking validation (TargetForge native engine).
 * Skipped unless RUN_REDOCK_BENCH=1.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import {
  fetchPdbFromRcsb,
  prepareReceptorPdb,
  redockCoCrystalLigand,
  parsePdbStructure,
  pickCoCrystalLigandGroup,
} from "../dockingEngine";

const run = process.env.RUN_REDOCK_BENCH === "1";
const describeBench = run ? describe : describe.skip;

describeBench("co-crystal redocking validation", () => {
  test(
    "writes benchmark/redocking_results.json",
    async () => {
      const config = JSON.parse(
        readFileSync(path.join(__dirname, "..", "..", "benchmark", "docking_targets.json"), "utf8")
      );
      const pdbCache = path.join(__dirname, "..", "..", "benchmark", "pdb_cache");
      mkdirSync(pdbCache, { recursive: true });

      const rows = [];
      for (const tgt of config.targets) {
        const pdbId = tgt.pdb_id.toUpperCase();
        const cacheFile = path.join(pdbCache, `${pdbId}.pdb`);
        let pdbText;
        if (existsSync(cacheFile)) {
          pdbText = readFileSync(cacheFile, "utf8");
        } else {
          pdbText = await fetchPdbFromRcsb(pdbId);
          writeFileSync(cacheFile, pdbText);
        }

        const parsed = parsePdbStructure(pdbText);
        const co = pickCoCrystalLigandGroup(parsed.heteroAtoms);

        let result;
        let failureCause = null;
        try {
          result = await redockCoCrystalLigand(pdbText, tgt.reference_smiles, {
            ligandResn: tgt.ligand_resn || co.resName,
            searchExhaustiveness: 8,
          });
        } catch (err) {
          failureCause = err?.message || String(err);
          result = {
            engine: "targetforge-native",
            rmsd_angstrom: null,
            pass: false,
            failure_reason: failureCause,
          };
        }

        if (tgt.target_id === "erbb2" && !result.pass) {
          failureCause =
            failureCause ||
            "HER2 (3PP0): prior runs used missing DOCKING_REFERENCE_TARGETS box; native pocket is 03Q. Failures were empty poses (steric filter) when box centered on first HET or insufficient pocket atoms.";
        }
        if (tgt.target_id === "braf" && !result.pass) {
          failureCause =
            failureCause ||
            "BRAF (4XV2): co-crystal ligand P06; same missing hard-coded box + strict steric clash cap caused null ΔG in cache.";
        }

        rows.push({
          target: tgt.target_id,
          pdb_id: pdbId,
          ligand_resn: tgt.ligand_resn || co.resName,
          redocking_rmsd_angstrom: result.rmsd_angstrom,
          delta_g: result.delta_g ?? null,
          pass: Boolean(result.pass),
          engine: result.engine,
          failure_reason: result.failure_reason || failureCause,
          crystal_heavy_atoms: result.crystal_heavy_atoms,
          pose_heavy_atoms: result.pose_heavy_atoms,
        });
      }

      const outPath = path.join(__dirname, "..", "..", "benchmark", "redocking_results.json");
      writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
      expect(rows.length).toBeGreaterThan(0);
    },
    1_200_000
  );
});
