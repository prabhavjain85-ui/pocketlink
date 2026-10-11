import { createRequire } from "module";
import { execFileSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { scoreSimilarityToReference } = require("../src/targetSimilarityScore.js");
const __dirname = dirname(fileURLToPath(import.meta.url));
const MORGAN_PY = join(__dirname, "morganFp.py");

export function morganFpText(smiles) {
  try {
    return execFileSync("python3", [MORGAN_PY, smiles], { encoding: "utf8", maxBuffer: 1_000_000 }).trim();
  } catch {
    return null;
  }
}

export async function buildSimilarityMap(compounds, protein) {
  const map = new Map();
  for (const c of compounds) {
    const key = String(c.pubchem_cid || c.chembl_id || c.name || c.smiles);
    const smiles = c.smiles;
    const fp = smiles ? morganFpText(smiles) : null;
    const candidate = {
      IsomericSMILES: smiles,
      SMILES: smiles,
      cid: key,
    };
    const row = scoreSimilarityToReference(candidate, protein, fp);
    map.set(key, row);
  }
  return map;
}
