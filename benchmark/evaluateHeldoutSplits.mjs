/**
 * Held-out evaluation: random split (optimistic), cluster split (headline), hard NN cutoff.
 * Writes benchmark/heldout_split_results.json and benchmark/HELDOUT_RESULTS.md
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { bootstrapAucCi, enrichmentFactorAtFraction, rocAuc } from "./bootstrap.mjs";
import { buildSimilarityMap } from "./similarityForBench.mjs";

process.env.NODE_ENV = "test";
const require = createRequire(import.meta.url);
const { rankCandidatesLocal } = require("../src/scoreCandidates.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELDOUT = process.env.HELDOUT_BENCHMARK_PATH || join(__dirname, "heldout_benchmark_v2.json");
const SPLITS = join(__dirname, "split_sets.json");
const REF = join(__dirname, "reference_sets.json");
const OUT_JSON = process.env.HELDOUT_RESULTS_JSON || join(__dirname, "heldout_split_results.json");
const OUT_MD = process.env.HELDOUT_RESULTS_MD || join(__dirname, "HELDOUT_RESULTS.md");
const BENCHMARK_TITLE = process.env.HELDOUT_RESULTS_TITLE || "Held-out benchmark results";

const NN_CUTOFF = 0.4;

function compoundToCandidate(c, painsApi) {
  const painsRaw = c.smiles
    ? painsApi.checkPainsFast({ SMILES: c.smiles, IsomericSMILES: c.smiles })
    : null;
  const pains = painsRaw ? painsApi.compactPainsForRanking(painsRaw) : null;
  const cid = c.chembl_id || c.name || c.smiles?.slice(0, 16);
  const row = {
    cid,
    CID: cid,
    name: c.name,
    IsomericSMILES: c.smiles,
    CanonicalSMILES: c.smiles,
    MolecularWeight: c.molecularWeight,
    XLogP: c.xlogp,
    HBondDonorCount: c.hbd,
    HBondAcceptorCount: c.hba,
    RotatableBondCount: c.rotatableBonds,
    TPSA: c.tpsa,
  };
  if (pains) row.pains = pains;
  return row;
}

function rankByScore(items, scoreFn, higherIsBetter = true) {
  const scored = items.map((item) => ({ ...item, metric: scoreFn(item) }));
  scored.sort((a, b) => {
    const av = a.metric;
    const bv = b.metric;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return higherIsBetter ? bv - av : av - bv;
  });
  return scored;
}

function evalMethod(rows, scoreKey, higherIsBetter = true) {
  const ranked = rankByScore(rows, (r) => r[scoreKey], higherIsBetter);
  const labels = ranked.map((r) => r.role === "active");
  const scores = ranked.map((r) => r[scoreKey]);
  const auc = rocAuc(labels, scores);
  const ci = bootstrapAucCi(labels, scores, 800);
  const ef1 = enrichmentFactorAtFraction(labels, scores, 0.01, higherIsBetter);
  return { roc_auc: auc, roc_auc_ci_95: ci, ef_at_1pct: ef1, n: rows.length, n_actives: labels.filter(Boolean).length };
}

function filterClusterCompounds(target) {
  return target.compounds;
}

function filterCutoffCompounds(target) {
  const actives = target.compounds.filter((c) => c.role === "active");
  const keepIds = new Set(
    actives.filter((a) => (a.nn_tanimoto_to_ref ?? 1) <= NN_CUTOFF).map((a) => a.chembl_id || a.name)
  );
  const out = [];
  for (const c of target.compounds) {
    if (c.role === "active") {
      if (keepIds.has(c.chembl_id || c.name)) out.push(c);
    } else if (keepIds.has(c.matched_to)) {
      out.push(c);
    }
  }
  return out;
}

function buildRandomCompounds(target, splitBlock) {
  return splitBlock.random_compounds || [];
}

async function scoreTarget(compounds, protein, painsApi) {
  const nAct = compounds.filter((c) => c.role === "active").length;
  const nDec = compounds.filter((c) => c.role === "decoy").length;
  if (nAct < 2 || nDec < 2 || compounds.length < 4) {
    return null;
  }
  const candidates = compounds.map((c) => compoundToCandidate(c, painsApi));
  const similarityByCid = await buildSimilarityMap(compounds, protein);
  const rankedH = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
  });
  const rankedS = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
    similarityByCid,
    rankMode: "similarity",
  });
  const rankedC = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
    similarityByCid,
    rankMode: "combined",
  });
  const byCid = (ranked) => new Map(ranked.ranking.map((r) => [String(r.cid), r.score]));
  const hMap = byCid(rankedH);
  const sMap = byCid(rankedS);
  const cMap = byCid(rankedC);
  const rows = compounds.map((c) => {
    const key = String(c.chembl_id || c.name || c.smiles?.slice(0, 16));
    return {
      ...c,
      heuristic_score: hMap.get(key) ?? null,
      similarity_score: sMap.get(key) ?? null,
      combined_score: cMap.get(key) ?? null,
    };
  });
  return {
    legacy: evalMethod(rows, "heuristic_score", true),
    similarity: evalMethod(rows, "similarity_score", true),
    combined: evalMethod(rows, "combined_score", true),
    mw: evalMethod(rows, "molecularWeight", true),
    logp: evalMethod(rows, "xlogp", true),
    random: evalMethod(
      rows.map((r) => ({ ...r, random_score: Math.random() })),
      "random_score",
      true
    ),
  };
}

function meanAuc(perTarget, mode, method) {
  const vals = perTarget
    .map((t) => t.modes?.[mode]?.[method]?.roc_auc)
    .filter((v) => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function fmtMetric(m) {
  if (!m || m.roc_auc == null) return "—";
  const ci = m.roc_auc_ci_95;
  const ciStr = ci?.low != null ? ` (${ci.low.toFixed(3)}–${ci.high.toFixed(3)})` : "";
  const ef = m.ef_at_1pct != null ? m.ef_at_1pct.toFixed(2) : "—";
  return `${m.roc_auc.toFixed(3)}${ciStr}; EF@1% ${ef}`;
}

function mdTableForMode(perTarget, mode, methods) {
  let md = `| Target | Murcko overlap | NN Tanimoto (mean) | ${methods.join(" | ")} |\n`;
  md += `|---|:---:|:---:|${methods.map(() => ":---").join("|")}|\n`;
  for (const t of perTarget) {
    const murcko = t.murcko_overlap ?? 0;
    const nn = t.nn_tanimoto_distribution?.mean;
    const cells = methods.map((meth) => fmtMetric(t.modes?.[mode]?.[meth]));
    md += `| ${t.target} | ${murcko} | ${nn != null ? nn.toFixed(3) : "—"} | ${cells.join(" | ")} |\n`;
  }
  return md;
}

async function main() {
  if (!existsSync(HELDOUT)) {
    console.error("Missing heldout_benchmark_v2.json");
    process.exit(1);
  }
  const heldout = JSON.parse(readFileSync(HELDOUT, "utf8"));
  const splits = existsSync(SPLITS) ? JSON.parse(readFileSync(SPLITS, "utf8")) : { targets: {} };
  const painsApi = await import("../src/painsCheck.js");
  const benchmarkReady = heldout.sanity_overall?.benchmark_ready === true;

  const perTargetTables = [];
  const results = {
    generated_at: new Date().toISOString(),
    benchmark_ready: benchmarkReady,
    nn_cutoff: NN_CUTOFF,
    per_target: [],
    overall: {},
  };

  for (const target of heldout.targets || []) {
    const splitBlock = splits.targets?.[target.id] || {};
    const sanity = target.sanity || {};
    const baselineRow = {
      target: target.id,
      actives: target.compounds.filter((c) => c.role === "active").length,
      decoys: target.compounds.filter((c) => c.role === "decoy").length,
      decoy_ratio: sanity.decoys_per_active_mean,
      decoy_source: sanity.decoy_source,
      mw_auc: sanity.mw_roc_auc,
      logp_auc: sanity.logp_roc_auc,
      murcko_overlap: sanity.murcko_scaffold_overlap ?? 0,
    };
    perTargetTables.push(baselineRow);

    const modes = {};
    if (benchmarkReady) {
      modes.cluster = await scoreTarget(filterClusterCompounds(target), target.protein, painsApi);
      modes.cutoff = await scoreTarget(filterCutoffCompounds(target), target.protein, painsApi);
      const randomCompounds = buildRandomCompounds(target, splitBlock);
      modes.random = await scoreTarget(randomCompounds, target.protein, painsApi);
    }

    const nn = target.compounds
      .filter((c) => c.role === "active")
      .map((c) => c.nn_tanimoto_to_ref)
      .filter((x) => x != null);
    results.per_target.push({
      ...baselineRow,
      nn_tanimoto_distribution: nn.length
        ? { mean: nn.reduce((a, b) => a + b, 0) / nn.length, min: Math.min(...nn), max: Math.max(...nn) }
        : null,
      modes,
    });
  }

  let clusterWins = 0;
  if (benchmarkReady) {
    for (const mode of ["cluster", "cutoff", "random"]) {
      results.overall[mode] = {
        legacy: meanAuc(results.per_target, mode, "legacy"),
        similarity: meanAuc(results.per_target, mode, "similarity"),
        combined: meanAuc(results.per_target, mode, "combined"),
        mw: meanAuc(results.per_target, mode, "mw"),
        logp: meanAuc(results.per_target, mode, "logp"),
        random: meanAuc(results.per_target, mode, "random"),
      };
    }
    clusterWins = results.per_target.filter(
      (t) =>
        t.modes?.cluster?.combined?.roc_auc != null &&
        t.modes?.cluster?.similarity?.roc_auc != null &&
        t.modes.cluster.combined.roc_auc > t.modes.cluster.similarity.roc_auc
    ).length;
    results.combined_beats_similarity_on_cluster_split =
      clusterWins > results.per_target.length / 2;
    results.combined_beats_similarity_targets = clusterWins;
  }

  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));

  let md = `# ${BENCHMARK_TITLE}\n\n`;
  md += `Benchmark ready (MW/logP sanity): **${benchmarkReady}**\n\n`;
  md += "## Per-target decoys and baselines\n\n| Target | Actives | Decoys | Decoys/active | Source | MW AUC | logP AUC |\n|---|---:|---:|---:|---|---:|---:|\n";
  for (const r of perTargetTables) {
    md += `| ${r.target} | ${r.actives} | ${r.decoys} | ${r.decoy_ratio?.toFixed?.(2) ?? "—"} | ${r.decoy_source ?? "—"} | ${r.mw_auc?.toFixed?.(3) ?? "—"} | ${r.logp_auc?.toFixed?.(3) ?? "—"} |\n`;
  }
  if (!benchmarkReady) {
    md += "\n**Scoring methods were not evaluated** until MW and logP baselines are 0.45–0.55 per target.\n";
  } else {
    const methods = ["legacy", "similarity", "combined", "mw", "logp", "random"];
    if (process.env.HELDOUT_BENCHMARK_PATH?.includes("dude")) {
      md +=
        "\n> **DUD-E analogue bias:** property-matched decoys may inflate similarity-only methods vs true inactive distributions.\n";
    }
    md += "\n## Headline: cluster split (ROC-AUC 95% CI; EF@1%)\n\n";
    md += mdTableForMode(results.per_target, "cluster", methods);
    md += "\n### Overall (macro mean of per-target AUCs)\n\n| Method | Mean AUC |\n|---|---:|\n";
    for (const k of methods) {
      md += `| ${k} | ${results.overall.cluster?.[k]?.toFixed?.(3) ?? "—"} |\n`;
    }
    md += `\n**Combined beats similarity on cluster split:** ${clusterWins}/${results.per_target.length} targets (${
      results.combined_beats_similarity_on_cluster_split ? "yes" : "no"
    } at majority).\n`;
    md += "\n## Hard cutoff (NN Tanimoto ≤ 0.4 to reference actives)\n\n";
    md += mdTableForMode(results.per_target, "cutoff", methods);
    md += "\n## Optimistic upper bound: random split\n\n";
    md += mdTableForMode(results.per_target, "random", methods);
  }
  writeFileSync(OUT_MD, md);
  console.log(`Wrote ${OUT_JSON} and ${OUT_MD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
