/**
 * Compact benchmark/reference_sets.json → src/data/targetReferenceFingerprints.json
 * for in-browser Morgan similarity scoring.
 */
import { readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "benchmark", "reference_sets.json");
const OUT_DIR = join(ROOT, "public", "reference-fp");
const OUT_INDEX = join(ROOT, "src", "data", "targetReferenceIndex.json");

function main() {
  const raw = JSON.parse(readFileSync(SRC, "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });
  const index = { version: raw.version || 2, fingerprint: raw.fingerprint || "morgan_r2_2048", targets: {} };
  let totalBytes = 0;
  for (const [targetId, block] of Object.entries(raw.targets || {})) {
    const payload = {
      chembl_target: block.chembl_target,
      pdb_id: block.pdb_id,
      actives: (block.actives || []).slice(0, 80).map((a) => ({
        smiles: a.smiles,
        chembl_id: a.chembl_id,
        fp: a.fp,
      })),
    };
    const file = join(OUT_DIR, `${targetId}.json`);
    writeFileSync(file, JSON.stringify(payload));
    totalBytes += statSync(file).size;
    index.targets[targetId] = { pdb_id: block.pdb_id, url: `/reference-fp/${targetId}.json` };
  }
  writeFileSync(OUT_INDEX, JSON.stringify(index));
  console.log(
    `Wrote ${OUT_DIR} (${(totalBytes / 1024).toFixed(1)} KiB total, ${Object.keys(index.targets).length} targets) + index`
  );
}

main();
