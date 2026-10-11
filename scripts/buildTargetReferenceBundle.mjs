/**
 * Compact benchmark/reference_sets.json → src/data/targetReferenceFingerprints.json
 * for in-browser Morgan similarity scoring.
 */
import { readFileSync, writeFileSync, statSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "benchmark", "reference_sets.json");
const OUT = join(ROOT, "src", "data", "targetReferenceFingerprints.json");

function main() {
  const raw = JSON.parse(readFileSync(SRC, "utf8"));
  const targets = {};
  for (const [targetId, block] of Object.entries(raw.targets || {})) {
    targets[targetId] = {
      chembl_target: block.chembl_target,
      pdb_id: block.pdb_id,
      actives: (block.actives || []).slice(0, 80).map((a) => ({
        smiles: a.smiles,
        chembl_id: a.chembl_id,
        fp: a.fp,
      })),
    };
  }
  const bundle = {
    version: raw.version || 2,
    fingerprint: raw.fingerprint || "morgan_r2_2048",
    generated_from: "benchmark/reference_sets.json",
    targets,
  };
  writeFileSync(OUT, JSON.stringify(bundle));
  const bytes = statSync(OUT).size;
  console.log(`Wrote ${OUT} (${(bytes / 1024).toFixed(1)} KiB, ${Object.keys(targets).length} targets)`);
}

main();
