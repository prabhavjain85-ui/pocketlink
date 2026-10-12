/**
 * Held-out evaluation: random split (optimistic), cluster split (headline), hard NN cutoff.
 * Writes benchmark/heldout_split_results.json and benchmark/HELDOUT_RESULTS.md
 */
import { createRequire } from "module";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { bootstrapAucCi, enrichmentFactorAtFraction, rocAuc } from "./bootstrap.mjs";
import { pairedStratifiedBootstrap } from "./pairedBootstrap.mjs";
import { buildSimilarityMap, scoreRowKey } from "./similarityForBench.mjs";

process.env.NODE_ENV = "test";
const require = createRequire(import.meta.url);
const { rankCandidatesLocal, scoreOne } = require("../src/scoreCandidates.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELDOUT = process.env.HELDOUT_BENCHMARK_PATH || join(__dirname, "heldout_benchmark_v2.json");
const SPLITS = join(__dirname, "split_sets.json");
const REF = join(__dirname, "reference_sets.json");
const OUT_JSON = process.env.HELDOUT_RESULTS_JSON || join(__dirname, "heldout_split_results.json");
const OUT_MD = process.env.HELDOUT_RESULTS_MD || join(__dirname, "HELDOUT_RESULTS.md");
const BENCHMARK_TITLE = process.env.HELDOUT_RESULTS_TITLE || "Held-out benchmark results";
const RF_SPLITS = process.env.DUDE_RF_SPLITS_JSON || join(__dirname, "dude_rf_split_results.json");
const DUDE_BENCH = join(__dirname, "dude_benchmark.json");
const DUDE_DIAG = join(__dirname, "dude_diagnostic.json");
const WHAT_BENCHMARK_MD = join(__dirname, "WHAT_THIS_BENCHMARK_CAN_SHOW.md");

const NN_CUTOFF = 0.4;
const PAIRED_BOOT_N = 1000;
const PAIRED_BOOT_SEED = 42;

function isDudeBenchmarkRun() {
  return (process.env.HELDOUT_BENCHMARK_PATH || "").includes("dude");
}

function rfScoresMapForMode(rfRow, mode = "cluster") {
  const block = rfRow?.modes?.[mode]?.rf_morgan?.per_compound_scores;
  if (!block) return null;
  const map = new Map();
  for (const row of block) {
    const key = String(row.chembl_id || row.name || row.smiles);
    map.set(key, row.rf_score);
  }
  return map;
}

function pairedEvalFromRows(rows, rfByKey, includeDruglikeness = true) {
  const labels = rows.map((r) => r.role === "active");
  const legacy = rows.map((r) => r.heuristic_score);
  const similarity = rows.map((r) => r.similarity_score);
  const combined = rows.map((r) => r.combined_score);
  const rf = rows.map((r) => {
    const v = rfByKey.get(scoreRowKey(r));
    if (v == null) {
      throw new Error(`paired eval: missing Morgan RF score for ${scoreRowKey(r)}`);
    }
    return v;
  });
  const scoreByMethod = { legacy, similarity, combined, rf };
  if (includeDruglikeness) {
    scoreByMethod.druglikeness = rows.map((r) => r.druglikeness_score);
  }
  return pairedStratifiedBootstrap(labels, scoreByMethod, {
    nBoot: PAIRED_BOOT_N,
    seed: PAIRED_BOOT_SEED,
  });
}

function loadDudeDiagnostic() {
  if (!existsSync(DUDE_DIAG)) return null;
  return JSON.parse(readFileSync(DUDE_DIAG, "utf8"));
}

function formatQuartileRow(target, setName, q) {
  if (!q || q.n === 0) return `| ${target} | ${setName} | — | — | — | — | — | 0 |\n`;
  return `| ${target} | ${setName} | ${q.min?.toFixed(4)} | ${q.q1?.toFixed(4)} | ${q.median?.toFixed(4)} | ${q.q3?.toFixed(4)} | ${q.max?.toFixed(4)} | ${q.n} |\n`;
}

function dpp4ScoreDirectionSample(rows) {
  const act = rows.filter((r) => r.role === "active").slice(0, 5);
  const dec = rows.filter((r) => r.role === "decoy").slice(0, 5);
  const pick = (r) => ({
    id: scoreRowKey(r),
    smiles: r.smiles,
    label: r.role === "active" ? 1 : 0,
    legacy: r.heuristic_score,
    similarity: r.similarity_score,
    combined: r.combined_score,
    rf: r.rf_score,
    druglikeness: r.druglikeness_score,
  });
  return { actives: act.map(pick), decoys: dec.map(pick) };
}

function loadRfByTarget() {
  if (!existsSync(RF_SPLITS)) return {};
  const data = JSON.parse(readFileSync(RF_SPLITS, "utf8"));
  const map = {};
  for (const row of data.per_target || []) {
    map[row.id] = row;
  }
  return map;
}

function loadDudeMeta() {
  if (!existsSync(DUDE_BENCH)) {
    return { inchiRemoved: {}, referenceActives: {}, trainCounts: {}, dedup: {}, refActivesKept: {} };
  }
  const data = JSON.parse(readFileSync(DUDE_BENCH, "utf8"));
  const inchiRemoved = {};
  const referenceActives = {};
  const trainCounts = {};
  const dedup = {};
  for (const t of data.targets || []) {
    inchiRemoved[t.id] = t.inchikey_removed_from_test ?? 0;
    referenceActives[t.id] = t.reference_actives || [];
    trainCounts[t.id] = {
      actives: t.n_train_actives ?? 0,
      decoys: t.n_train_decoys ?? 0,
    };
    dedup[t.id] = t.canonical_smiles_dedup || null;
  }
  const refActivesKept = {};
  for (const t of data.targets || []) {
    refActivesKept[t.id] = t.n_ref_actives ?? (t.reference_actives || []).length;
  }
  return { inchiRemoved, referenceActives, trainCounts, dedup, refActivesKept };
}

function rfMetric(rfRow, mode) {
  const m = rfRow?.modes?.[mode]?.rf_morgan;
  if (!m || m.roc_auc == null) return null;
  const ci = m.roc_auc_ci_95;
  return {
    roc_auc: m.roc_auc,
    roc_auc_ci_95: ci ? { low: ci.low, high: ci.high } : null,
    ef_at_1pct: m.ef_at_1pct,
    n: m.n_test,
    n_actives: m.n_test_actives,
  };
}

function compoundToCandidate(c, painsApi) {
  const painsRaw = c.smiles
    ? painsApi.checkPainsFast({ SMILES: c.smiles, IsomericSMILES: c.smiles })
    : null;
  const pains = painsRaw ? painsApi.compactPainsForRanking(painsRaw) : null;
  const cid = scoreRowKey(c);
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
  if (target.random_compounds?.length) return target.random_compounds;
  return splitBlock.random_compounds || [];
}

async function scoreTarget(compounds, protein, painsApi, options = {}) {
  const nAct = compounds.filter((c) => c.role === "active").length;
  const nDec = compounds.filter((c) => c.role === "decoy").length;
  if (nAct < 2 || nDec < 2 || compounds.length < 4) {
    return null;
  }
  const strict = options.strictSimilarity === true;
  const candidates = compounds.map((c) => compoundToCandidate(c, painsApi));
  const similarityByCid = await buildSimilarityMap(compounds, protein, {
    referenceActives: options.referenceActives,
    requireReference: strict,
  });
  const rankedH = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
  });
  const rankedS = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
    similarityByCid,
    rankMode: "similarity",
    strictSimilarity: strict,
  });
  const rankedC = rankCandidatesLocal(candidates, protein, {
    maxCandidates: candidates.length,
    minCandidates: 2,
    similarityByCid,
    rankMode: "combined",
    strictSimilarity: strict,
  });
  const byCid = (ranked) => new Map(ranked.ranking.map((r) => [String(r.cid), r.score]));
  const hMap = byCid(rankedH);
  const sMap = byCid(rankedS);
  const cMap = byCid(rankedC);
  const rows = compounds.map((c) => {
    const key = scoreRowKey(c);
    const cand = compoundToCandidate(c, painsApi);
    const dl = scoreOne(cand, null);
    const rfScore = options.rfScoresByKey?.get(key) ?? null;
    return {
      ...c,
      heuristic_score: hMap.get(key) ?? null,
      similarity_score: sMap.get(key) ?? null,
      combined_score: cMap.get(key) ?? null,
      druglikeness_score: dl?.score ?? null,
      rf_score: rfScore,
    };
  });
  const out = {
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
    _scored_rows: rows,
  };
  if (options.rfScoresByKey) {
    out.paired_bootstrap = pairedEvalFromRows(rows, options.rfScoresByKey, options.includeDruglikeness !== false);
  }
  return out;
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
  const rfByTarget = loadRfByTarget();
  const dudeMeta = loadDudeMeta();
  const inchiRemoved = dudeMeta.inchiRemoved;

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
      const dudeRun = isDudeBenchmarkRun();
      const scoreOpts = {
        referenceActives: dudeMeta.referenceActives[target.id],
        strictSimilarity: dudeRun,
      };
      const rfRow = rfByTarget[target.id];
      const rfKeyMapCluster = rfRow ? rfScoresMapForMode(rfRow, "cluster") : null;
      const rfKeyMapRandom = rfRow ? rfScoresMapForMode(rfRow, "random") : null;
      if (dudeRun && !rfKeyMapCluster) {
        throw new Error(`DUD-E eval: missing Morgan RF per_compound_scores for ${target.id}`);
      }
      modes.cluster = await scoreTarget(filterClusterCompounds(target), target.protein, painsApi, {
        ...scoreOpts,
        rfScoresByKey: dudeRun ? rfKeyMapCluster : null,
      });
      modes.cutoff = await scoreTarget(filterCutoffCompounds(target), target.protein, painsApi, scoreOpts);
      const randomCompounds = buildRandomCompounds(target, splitBlock);
      if (dudeRun && randomCompounds.length && !rfKeyMapRandom) {
        throw new Error(`DUD-E eval: missing random-split Morgan RF scores for ${target.id}`);
      }
      modes.random = await scoreTarget(randomCompounds, target.protein, painsApi, {
        ...scoreOpts,
        rfScoresByKey: dudeRun && randomCompounds.length ? rfKeyMapRandom : null,
      });
      if (rfRow && modes.cluster) {
        const pb = modes.cluster.paired_bootstrap;
        if (pb?.methodCi?.rf) {
          modes.cluster.rf = {
            roc_auc: pb.methodCi.rf.roc_auc,
            roc_auc_ci_95: { low: pb.methodCi.rf.ci_low, high: pb.methodCi.rf.ci_high },
            ef_at_1pct: pb.methodCi.rf.ef_at_1pct,
            n: modes.cluster.legacy?.n,
            n_actives: modes.cluster.legacy?.n_actives,
            paired_bootstrap: true,
          };
        } else {
          modes.cluster.rf = rfMetric(rfRow, "cluster");
        }
      }
      if (rfRow && modes.cutoff) modes.cutoff.rf = rfMetric(rfRow, "cutoff");
      if (rfRow && modes.random?.paired_bootstrap?.methodCi?.rf) {
        const pbR = modes.random.paired_bootstrap;
        modes.random.rf = {
          roc_auc: pbR.methodCi.rf.roc_auc,
          roc_auc_ci_95: { low: pbR.methodCi.rf.ci_low, high: pbR.methodCi.rf.ci_high },
          ef_at_1pct: pbR.methodCi.rf.ef_at_1pct,
          n: modes.random.legacy?.n,
          n_actives: modes.random.legacy?.n_actives,
          paired_bootstrap: true,
        };
      } else if (rfRow && modes.random) {
        modes.random.rf = rfMetric(rfRow, "random");
      }
      if (modes.cluster?.paired_bootstrap) {
        modes.cluster.paired_bootstrap_diffs = modes.cluster.paired_bootstrap.diffs;
      }
      if (modes.random?.paired_bootstrap) {
        modes.random.paired_bootstrap_diffs = modes.random.paired_bootstrap.diffs;
      }
      if (dudeRun && target.id === "dpp4" && modes.cluster?._scored_rows) {
        results.dpp4_score_direction = dpp4ScoreDirectionSample(modes.cluster._scored_rows);
        results.auc_direction_verdict = {
          higher_score_more_likely_active: true,
          label_active_is_one: true,
          implementation: "bootstrap.mjs rocAuc sorts by descending score; labels true=active",
        };
        console.log("\n[DPP4 score direction sample]");
        console.log(JSON.stringify(results.dpp4_score_direction, null, 2));
        console.log("[AUC direction verdict]", results.auc_direction_verdict);
      }
      delete modes.cluster?._scored_rows;
    }

    const nn = target.compounds
      .filter((c) => c.role === "active")
      .map((c) => c.nn_tanimoto_to_ref)
      .filter((x) => x != null);
    const trainCounts = dudeMeta.trainCounts[target.id] || {
      actives: sanity.n_ref_actives,
      decoys: null,
    };
    const testAct = target.compounds.filter((c) => c.role === "active").length;
    const testDec = target.compounds.filter((c) => c.role === "decoy").length;
    results.per_target.push({
      ...baselineRow,
      train_actives: trainCounts.actives,
      train_decoys: trainCounts.decoys,
      test_actives: testAct,
      test_decoys: testDec,
      reference_actives_kept: dudeMeta.refActivesKept?.[target.id] ?? null,
      paired_bootstrap_cluster: modes.cluster?.paired_bootstrap ?? null,
      paired_bootstrap_random: modes.random?.paired_bootstrap ?? null,
      canonical_smiles_dedup: dudeMeta.dedup[target.id] ?? null,
      inchikey_removed_from_test: inchiRemoved[target.id] ?? sanity.inchikey_removed_from_test ?? 0,
      nn_tanimoto_distribution: nn.length
        ? { mean: nn.reduce((a, b) => a + b, 0) / nn.length, min: Math.min(...nn), max: Math.max(...nn) }
        : null,
      rf_leakage_audit: rfByTarget[target.id]?.leakage_audit ?? null,
      rf_descriptor_sanity: {
        cluster: rfByTarget[target.id]?.modes?.cluster?.rf_descriptors ?? null,
        cutoff: rfByTarget[target.id]?.modes?.cutoff?.rf_descriptors ?? null,
      },
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
        rf: meanAuc(results.per_target, mode, "rf"),
      };
    }
    const legacyBeatsRf = results.per_target.filter(
      (t) =>
        t.modes?.cluster?.legacy?.roc_auc != null &&
        t.modes?.cluster?.rf?.roc_auc != null &&
        t.modes.cluster.legacy.roc_auc > t.modes.cluster.rf.roc_auc
    ).length;
    results.legacy_beats_rf_on_cluster = legacyBeatsRf > results.per_target.length / 2;
    results.legacy_beats_rf_targets = legacyBeatsRf;
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
    const methods = ["legacy", "similarity", "combined", "rf", "mw", "logp", "random"];
    if (isDudeBenchmarkRun()) {
      md +=
        "\n> **DUD-E analogue bias:** property-matched decoys may inflate similarity-only methods vs true inactive distributions.\n";
      md +=
        "\n> **Decoy assignment (eval):** independent nearest-50 per test active from the DUD-E decoy pool (repeats allowed across actives). See `DUDE_RESULTS.md`.\n";
      md += `\n> **Paired bootstrap:** ${PAIRED_BOOT_N} stratified resamples (actives and decoys separately), seed **${PAIRED_BOOT_SEED}**; same indices for legacy, similarity, combined, and Morgan RF.\n`;
      md += "\n## Cluster split — compound counts (after canonical dedup)\n\n";
      md +=
        "| Target | Reference actives kept | Test actives | Test decoys |\n|---|---:|---:|---:|\n";
      for (const t of results.per_target) {
        md += `| ${t.target} | ${t.reference_actives_kept ?? "—"} | ${t.test_actives ?? "—"} | ${t.test_decoys ?? "—"} |\n`;
      }
      md += "\n## Cluster split — methods (paired bootstrap 95% CIs)\n\n";
      md += "| Target | Method | AUC | 95% CI | EF@1% |\n|---|---|---:|---|---:|\n";
      for (const t of results.per_target) {
        const pb = t.paired_bootstrap_cluster?.methodCi;
        if (!pb) continue;
        for (const meth of ["legacy", "similarity", "combined", "rf"]) {
          const m = pb[meth];
          if (!m) continue;
          const ci =
            m.ci_low != null && m.ci_high != null
              ? `[${m.ci_low.toFixed(4)}, ${m.ci_high.toFixed(4)}]`
              : "—";
          const ef = m.ef_at_1pct != null ? m.ef_at_1pct.toFixed(2) : "—";
          const label = meth === "rf" ? "morgan_rf" : meth;
          md += `| ${t.target} | ${label} | ${m.roc_auc?.toFixed(4) ?? "—"} | ${ci} | ${ef} |\n`;
        }
      }
      md += "\n## Cluster split — paired AUC differences (95% CI; significant if CI excludes 0)\n\n";
      md +=
        "| Target | Comparison | Mean ΔAUC | 95% CI | Significant |\n|---|---|---:|---|:---:|\n";
      const diffLabels = {
        similarity_minus_legacy: "similarity − legacy",
        combined_minus_similarity: "combined − similarity",
        legacy_minus_rf: "legacy − morgan_rf",
        similarity_minus_rf: "similarity − morgan_rf",
        combined_minus_rf: "combined − morgan_rf",
      };
      for (const t of results.per_target) {
        const diffs = t.paired_bootstrap_cluster?.diffs;
        if (!diffs) continue;
        for (const [key, label] of Object.entries(diffLabels)) {
          const d = diffs[key];
          if (!d) continue;
          const ci =
            d.ci_low != null && d.ci_high != null
              ? `[${d.ci_low.toFixed(4)}, ${d.ci_high.toFixed(4)}]`
              : "—";
          md += `| ${t.target} | ${label} | ${d.mean_diff?.toFixed(4) ?? "—"} | ${ci} | ${d.significant ? "yes" : "no"} |\n`;
        }
      }
      md += "\n## Cluster split — drug-likeness-only baseline (scoreOne with protein=null)\n\n";
      md += "| Target | AUC | 95% CI | EF@1% |\n|---|---:|---|---:|\n";
      for (const t of results.per_target) {
        const m = t.paired_bootstrap_cluster?.methodCi?.druglikeness;
        if (!m) continue;
        const ci =
          m.ci_low != null && m.ci_high != null
            ? `[${m.ci_low.toFixed(4)}, ${m.ci_high.toFixed(4)}]`
            : "—";
        const ef = m.ef_at_1pct != null ? m.ef_at_1pct.toFixed(2) : "—";
        md += `| ${t.target} | ${m.roc_auc?.toFixed(4) ?? "—"} | ${ci} | ${ef} |\n`;
      }
      md += "\n## Cluster split — drug-likeness paired ΔAUC vs other methods\n\n";
      md +=
        "| Target | Comparison | Mean ΔAUC | 95% CI | Significant |\n|---|---|---:|---|:---:|\n";
      const dlLabels = {
        druglikeness_minus_legacy: "druglikeness − legacy",
        druglikeness_minus_similarity: "druglikeness − similarity",
        druglikeness_minus_combined: "druglikeness − combined",
        druglikeness_minus_rf: "druglikeness − morgan_rf",
      };
      for (const t of results.per_target) {
        const diffs = t.paired_bootstrap_cluster?.diffs;
        if (!diffs) continue;
        for (const [key, label] of Object.entries(dlLabels)) {
          const d = diffs[key];
          if (!d) continue;
          const ci =
            d.ci_low != null && d.ci_high != null
              ? `[${d.ci_low.toFixed(4)}, ${d.ci_high.toFixed(4)}]`
              : "—";
          md += `| ${t.target} | ${label} | ${d.mean_diff?.toFixed(4) ?? "—"} | ${ci} | ${d.significant ? "yes" : "no"} |\n`;
        }
      }
      if (results.dpp4_score_direction) {
        md += "\n## DPP4 score direction sample (cluster test set)\n\n";
        md += `Verdict: higher score ⇒ more likely active (**${results.auc_direction_verdict?.higher_score_more_likely_active}**); benchmark label active = **${results.auc_direction_verdict?.label_active_is_one ? "1" : "0"}** (${results.auc_direction_verdict?.implementation}).\n\n`;
        md += "| ID | SMILES | label | legacy | similarity | combined | morgan_rf |\n|---|---|---:|---:|---:|---:|---:|\n";
        for (const row of [...results.dpp4_score_direction.actives, ...results.dpp4_score_direction.decoys]) {
          md += `| ${row.id} | ${row.smiles} | ${row.label} | ${row.legacy?.toFixed?.(2) ?? row.legacy} | ${row.similarity?.toFixed?.(2) ?? row.similarity} | ${row.combined?.toFixed?.(2) ?? row.combined} | ${row.rf?.toFixed?.(4) ?? row.rf} |\n`;
        }
      }
      const diag = loadDudeDiagnostic();
      if (diag?.per_target) {
        md += "\n## Max Morgan Tanimoto to reference actives (quartiles)\n\n";
        md +=
          "| Target | Set | min | Q1 | median | Q3 | max | n |\n|---|---|---:|---:|---:|---:|---:|---:|\n";
        for (const tid of ["dpp4", "adrb2", "jak2"]) {
          const block = diag.per_target[tid]?.max_tanimoto_to_reference;
          if (!block) continue;
          for (const [setName, q] of [
            ["test_actives", block.test_actives],
            ["test_decoys", block.test_decoys],
            ["reference_actives_loo", block.reference_actives_loo],
          ]) {
            md += formatQuartileRow(tid, setName, q);
          }
        }
        const dpp4Clusters = diag.per_target.dpp4?.cluster_active_groups || [];
        if (dpp4Clusters.length) {
          md += "\n## DPP4 active clusters (Butina Tanimoto 0.4; Murcko-disjoint test assignment)\n\n";
          md += "| cluster_id | size | partition |\n|---:|---:|---|\n";
          for (const cl of dpp4Clusters) {
            md += `| ${cl.cluster_id} | ${cl.size} | ${cl.partition} |\n`;
          }
        }
      }
      md += "\n## Random split — methods (paired bootstrap 95% CIs; optimistic upper bound)\n\n";
      md += "| Target | Method | AUC | 95% CI | EF@1% |\n|---|---|---:|---|---:|\n";
      for (const t of results.per_target) {
        const pb = t.paired_bootstrap_random?.methodCi;
        if (!pb) continue;
        for (const meth of ["legacy", "similarity", "combined", "rf", "druglikeness"]) {
          const m = pb[meth];
          if (!m) continue;
          const ci =
            m.ci_low != null && m.ci_high != null
              ? `[${m.ci_low.toFixed(4)}, ${m.ci_high.toFixed(4)}]`
              : "—";
          const ef = m.ef_at_1pct != null ? m.ef_at_1pct.toFixed(2) : "—";
          const label = meth === "rf" ? "morgan_rf" : meth;
          md += `| ${t.target} | ${label} | ${m.roc_auc?.toFixed(4) ?? "—"} | ${ci} | ${ef} |\n`;
        }
      }
      if (existsSync(WHAT_BENCHMARK_MD)) {
        md += `\n---\n\n${readFileSync(WHAT_BENCHMARK_MD, "utf8")}\n`;
      }
    }
    md += "\n## Canonical SMILES deduplication (test wins over reference/train)\n\n";
    md +=
      "| Target | Test actives removed | Test decoys removed | Train actives removed | Train decoys removed | Reference actives removed | Train∩test removed |\n|---|---:|---:|---:|---:|---:|---:|\n";
    for (const t of results.per_target) {
      const d = t.canonical_smiles_dedup || {};
      md += `| ${t.target} | ${d.test_actives_removed ?? 0} | ${d.test_decoys_removed ?? 0} | ${d.train_actives_removed ?? 0} | ${d.train_decoys_removed ?? 0} | ${d.reference_actives_removed ?? 0} | ${d.train_removed_overlap_test ?? 0} |\n`;
    }
    md += "\n## Leakage / split metadata\n\n";
    md +=
      "| Target | InChIKey removed (test) | NN Tanimoto mean (test actives) | NN min | NN max |\n|---|---:|---:|---:|---:|\n";
    for (const t of results.per_target) {
      const nn = t.nn_tanimoto_distribution;
      md += `| ${t.target} | ${t.inchikey_removed_from_test ?? 0} | ${nn?.mean?.toFixed?.(3) ?? "—"} | ${nn?.min?.toFixed?.(3) ?? "—"} | ${nn?.max?.toFixed?.(3) ?? "—"} |\n`;
    }
    md += "\n## Cluster split (headline): train/test sizes and ROC-AUC\n\n";
    md +=
      "| Target | Train actives | Train decoys | Test actives | Test decoys | Legacy AUC (95% CI) | Similarity | Combined | Morgan RF | Legacy>RF | Combined>Sim |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|\n";
    for (const t of results.per_target) {
      const cl = t.modes?.cluster || {};
      const leg = cl.legacy;
      const sim = cl.similarity;
      const comb = cl.combined;
      const rf = cl.rf;
      const legCi =
        leg?.roc_auc_ci_95?.low != null
          ? `${leg.roc_auc?.toFixed(3)} (${leg.roc_auc_ci_95.low.toFixed(3)}–${leg.roc_auc_ci_95.high.toFixed(3)})`
          : leg?.roc_auc?.toFixed(3) ?? "—";
      const rfCi =
        rf?.roc_auc_ci_95?.low != null
          ? `${rf.roc_auc?.toFixed(3)} (${rf.roc_auc_ci_95.low.toFixed(3)}–${rf.roc_auc_ci_95.high.toFixed(3)})`
          : rf?.roc_auc?.toFixed(3) ?? "—";
      const legBeatsRf =
        leg?.roc_auc != null && rf?.roc_auc != null ? leg.roc_auc > rf.roc_auc : null;
      const combBeatsSim =
        comb?.roc_auc != null && sim?.roc_auc != null ? comb.roc_auc > sim.roc_auc : null;
      md += `| ${t.target} | ${t.train_actives ?? "—"} | ${t.train_decoys ?? "—"} | ${t.test_actives ?? "—"} | ${t.test_decoys ?? "—"} | ${legCi} | ${sim?.roc_auc?.toFixed(3) ?? "—"} | ${comb?.roc_auc?.toFixed(3) ?? "—"} | ${rfCi} | ${legBeatsRf === null ? "—" : legBeatsRf ? "yes" : "no"} | ${combBeatsSim === null ? "—" : combBeatsSim ? "yes" : "no"} |\n`;
    }
    md += "\n> **Scoring paths:** legacy = `rankCandidatesLocal` → `scoreOne` (heuristic-v2, no `rankMode`); similarity = same with `rankMode:\"similarity\"` + Morgan Tanimoto vs reference actives; combined = `combinedTriageScore` (0.35/0.65). See `src/scoreCandidates.js` and `benchmark/similarityForBench.mjs`.\n";
    md += "\n## Headline: cluster split (Murcko overlap 0; ROC-AUC 95% CI; EF@1%)\n\n";
    md += mdTableForMode(results.per_target, "cluster", methods);
    md += "\n### Overall (macro mean of per-target AUCs)\n\n| Method | Mean AUC |\n|---|---:|\n";
    for (const k of methods) {
      md += `| ${k} | ${results.overall.cluster?.[k]?.toFixed?.(3) ?? "—"} |\n`;
    }
    md += `\n**Combined beats similarity on cluster split:** ${clusterWins}/${results.per_target.length} targets (${
      results.combined_beats_similarity_on_cluster_split ? "yes" : "no"
    } at majority).\n`;
    md += `\n**Legacy (heuristic) beats RF on cluster split:** ${results.legacy_beats_rf_targets}/${results.per_target.length} targets (${
      results.legacy_beats_rf_on_cluster ? "yes" : "no"
    } at majority).\n`;
    md += "\n### RF sanity (Morgan RF train=ref actives+decoys; test=cluster/cutoff sets)\n\n";
    md +=
      "| Target | Train/test SMILES overlap | Test actives in train | Descriptor-RF AUC (cluster) | Morgan RF AUC (cluster) |\n|---|---:|---:|---:|---:|\n";
    for (const t of results.per_target) {
      const aud = t.rf_leakage_audit || {};
      const desc = t.rf_descriptor_sanity?.cluster?.roc_auc;
      const morg = t.modes?.cluster?.rf?.roc_auc;
      md += `| ${t.target} | ${aud.smiles_overlap_train_test ?? "—"} | ${aud.test_actives_in_train ?? "—"} | ${desc?.toFixed?.(3) ?? "—"} | ${morg?.toFixed?.(3) ?? "—"} |\n`;
    }
    md += "\n## Hard cutoff (NN Tanimoto ≤ 0.4 to any reference active)\n\n";
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
