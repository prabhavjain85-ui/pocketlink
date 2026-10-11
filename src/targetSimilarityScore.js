/**
 * Per-target ChEMBL reference similarity (Morgan r=2, 2048 bits).
 * Reference actives are scaffold-split from benchmark test actives (see benchmark build).
 */

let _bundle = null;

function loadBundle() {
  if (_bundle) return _bundle;
  try {
    _bundle = require("./data/targetReferenceFingerprints.json");
  } catch {
    _bundle = { targets: {} };
  }
  return _bundle;
}

function popcountAnd(a, b) {
  const n = Math.min(a.length, b.length);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] === "1" || a[i] === 1;
    const bi = b[i] === "1" || b[i] === 1;
    if (ai && bi) inter++;
    if (ai || bi) union++;
  }
  return { inter, union: union || 1 };
}

function tanimotoText(fpA, fpB) {
  if (!fpA || !fpB) return 0;
  const { inter, union } = popcountAnd(fpA, fpB);
  return inter / union;
}

function resolveTargetKey(protein) {
  if (!protein) return null;
  const id = String(protein.id || protein.pdb_id || "").toLowerCase();
  const map = {
    "1m17": "egfr",
    "1iep": "abl1",
    "3pp0": "erbb2",
    "4xv2": "braf",
    "4cox": "ptgs2",
    "1hwk": "hmgcr",
    "1udt": "pde5a",
    "3ert": "esr1",
    "1x70": "dpp4",
    "3sn6": "adrb2",
    "1hvr": "hiv_pr",
    "7bqy": "sars_mpro",
    "4bkx": "hdac1",
    "4ji9": "jak2",
    "1dwb": "thrombin",
  };
  if (map[id]) return map[id];
  const qn = String(protein.queryName || protein.name || "").toLowerCase();
  if (qn.includes("egfr")) return "egfr";
  if (qn.includes("abl")) return "abl1";
  if (qn.includes("erbb2") || qn.includes("her2")) return "erbb2";
  if (qn.includes("braf")) return "braf";
  if (qn.includes("cox") || qn.includes("ptgs")) return "ptgs2";
  if (qn.includes("hmg")) return "hmgcr";
  if (qn.includes("pde5")) return "pde5a";
  if (qn.includes("esr")) return "esr1";
  if (qn.includes("dpp")) return "dpp4";
  if (qn.includes("adrb2") || qn.includes("beta")) return "adrb2";
  return null;
}

/**
 * Score candidate by max Tanimoto to reference actives; returns 0–100 and top-3 evidence.
 */
function scoreSimilarityToReference(candidate, protein, precomputedFp = null) {
  const bundle = loadBundle();
  const key = resolveTargetKey(protein);
  const block = key ? bundle.targets?.[key] : null;
  if (!block?.actives?.length) {
    return {
      similarityScore: null,
      maxTanimoto: null,
      evidence: [],
      targetKey: key,
      available: false,
    };
  }

  const smiles = String(
    candidate.IsomericSMILES || candidate.CanonicalSMILES || candidate.SMILES || candidate.smiles || ""
  ).trim();
  if (!smiles) {
    return { similarityScore: null, maxTanimoto: null, evidence: [], targetKey: key, available: false };
  }

  const queryFp = precomputedFp;

  const scored = [];
  for (const ref of block.actives) {
    if (!ref.fp) continue;
    const tan = queryFp ? tanimotoText(queryFp, ref.fp) : null;
    if (tan != null) {
      scored.push({ tanimoto: tan, chembl_id: ref.chembl_id, smiles: ref.smiles });
    }
  }

  if (!scored.length && !queryFp) {
    return {
      similarityScore: null,
      maxTanimoto: null,
      evidence: [],
      targetKey: key,
      available: true,
      needsAsyncFp: true,
      smiles,
    };
  }

  scored.sort((a, b) => b.tanimoto - a.tanimoto);
  const top = scored.slice(0, 3);
  const maxTan = top[0]?.tanimoto ?? 0;
  const similarityScore = Math.round(Math.min(1, Math.max(0, maxTan)) * 100);
  return {
    similarityScore,
    maxTanimoto: maxTan,
    evidence: top,
    targetKey: key,
    available: true,
  };
}

async function scoreSimilarityToReferenceAsync(candidate, protein) {
  const smiles = String(
    candidate.IsomericSMILES || candidate.CanonicalSMILES || candidate.SMILES || candidate.smiles || ""
  ).trim();
  if (!smiles) {
    return scoreSimilarityToReference(candidate, protein);
  }
  const { getRDKit } = await import("./rdkitLoader");
  const rdkit = await getRDKit();
  const mol = rdkit.get_mol(smiles);
  if (!mol) {
    return scoreSimilarityToReference(candidate, protein);
  }
  let fpText = null;
  try {
    const bytes = mol.get_morgan_fp_as_uint8array(2);
    let bits = "";
    for (let i = 0; i < bytes.length && bits.length < 2048; i++) {
      for (let bit = 7; bit >= 0; bit--) {
        bits += (bytes[i] >> bit) & 1 ? "1" : "0";
      }
    }
    fpText = bits.slice(0, 2048);
  } catch {
    fpText = null;
  }
  mol.delete();
  return scoreSimilarityToReference(candidate, protein, fpText);
}

function combinedTriageScore(heuristicScore, similarityScore, weights = { heuristic: 0.35, similarity: 0.65 }) {
  if (similarityScore == null) return heuristicScore;
  return Math.round(
    weights.heuristic * heuristicScore + weights.similarity * similarityScore
  );
}

module.exports = {
  loadBundle,
  resolveTargetKey,
  scoreSimilarityToReference,
  scoreSimilarityToReferenceAsync,
  combinedTriageScore,
  tanimotoText,
};
