import { createRequire } from "module";
import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { scoreSimilarityToReference, resolveTargetKey } = require("../src/targetSimilarityScore.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const MORGAN_PY = join(__dirname, "morganFp.py");
const REF_FP_DIR = join(__dirname, "..", "public", "reference-fp");

export function morganFpText(smiles) {
  try {
    return execFileSync("python3", [MORGAN_PY, smiles], { encoding: "utf8", maxBuffer: 1_000_000 }).trim();
  } catch {
    return null;
  }
}

export function scoreRowKey(c) {
  return String(c.pubchem_cid || c.chembl_id || c.name || c.smiles);
}

function loadReferenceBlock(protein, referenceActives) {
  if (referenceActives?.length) {
    const actives = referenceActives
      .map((a) => ({
        smiles: a.smiles,
        chembl_id: a.chembl_id || a.name,
        fp: a.fp || morganFpText(a.smiles),
      }))
      .filter((a) => a.fp);
    return actives.length ? { actives } : null;
  }
  const key = resolveTargetKey(protein);
  if (!key) return null;
  const path = join(REF_FP_DIR, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export async function buildSimilarityMap(compounds, protein, options = {}) {
  const block = loadReferenceBlock(protein, options.referenceActives);
  if (options.requireReference) {
    if (!block?.actives?.length) {
      const key = resolveTargetKey(protein);
      throw new Error(
        `Benchmark similarity requires non-empty reference actives (target=${key || "unknown"})`
      );
    }
  }
  const map = new Map();
  for (const c of compounds) {
    const key = scoreRowKey(c);
    const smiles = c.smiles;
    const fp = smiles ? morganFpText(smiles) : null;
    const candidate = {
      IsomericSMILES: smiles,
      SMILES: smiles,
      cid: key,
    };
    const row = scoreSimilarityToReference(candidate, protein, fp, block);
    if (options.requireReference && row.similarityScore == null) {
      throw new Error(
        `Benchmark similarity: null similarityScore for compound key=${key} (refs loaded=${block.actives.length})`
      );
    }
    map.set(key, row);
  }
  return map;
}
