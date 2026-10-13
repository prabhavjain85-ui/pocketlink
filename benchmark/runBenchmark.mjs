/**
 * TargetForge retrospective ranking benchmark.
 *
 * Primary metric path: rankCandidatesLocal (heuristic-v2) — the same deterministic
 * engine that supplies all numeric Staging Bench / repurposing batch scores.
 *
 * Optional supplementary ranks: empirical docking ΔG (native dockingEngine) and
 * molecular-weight baseline. ADME / organ-toxicity modules are not fused into the
 * 0–100 ranking score in production; they are documented as out-of-scope here.
 */

import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { bootstrapAucCi, enrichmentFactorAtFraction, rocAuc } from "./bootstrap.mjs";
import { buildSimilarityMap } from "./similarityForBench.mjs";

// RDKit loader only initializes in Node when NODE_ENV=test (same as Jest).
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const require = createRequire(import.meta.url);
const { rankCandidatesLocal } = require("../src/scoreCandidates.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VALIDATION_PATH = join(__dirname, "validation_set.json");
const HELDOUT_PATH = existsSync(join(__dirname, "heldout_benchmark_v2.json"))
  ? join(__dirname, "heldout_benchmark_v2.json")
  : join(__dirname, "heldout_set.json");
const REDOCK_PATH = join(__dirname, "redocking_results.json");
const RESULTS_JSON = join(__dirname, "results.json");
const DOCK_CACHE_PATH = join(__dirname, "docking_cache.json");

const DOCK_SEED_BASE = 13082026;
const DOCK_EXHAUSTIVENESS = 4;

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

function compoundToCandidate(c, painsApi) {
  const painsRaw = c.smiles
    ? painsApi.checkPainsFast({ SMILES: c.smiles, IsomericSMILES: c.smiles })
    : null;
  const pains = painsRaw ? painsApi.compactPainsForRanking(painsRaw) : null;
  const cid = c.pubchem_cid || c.chembl_id || c.name || c.smiles?.slice(0, 16);
  const row = {
    cid,
    CID: cid,
    displayName: c.name,
    name: c.name,
    IsomericSMILES: c.smiles,
    CanonicalSMILES: c.smiles,
    SMILES: c.smiles,
    MolecularWeight: c.molecularWeight,
    XLogP: c.xlogp,
    HBondDonorCount: c.hbd,
    HBondAcceptorCount: c.hba,
    RotatableBondCount: c.rotatableBonds,
    TPSA: c.tpsa,
    drugClass: c.drugClass || "",
    indication: c.indication || "",
  };
  if (pains) row.pains = pains;
  return row;
}

function rankByScore(items, scoreFn, higherIsBetter = true) {
  const scored = items.map((item) => ({
    ...item,
    metric: scoreFn(item),
  }));
  scored.sort((a, b) => {
    const av = a.metric;
    const bv = b.metric;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return higherIsBetter ? bv - av : av - bv;
  });
  return scored.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function evaluateRanking(rankedRows) {
  const labels = rankedRows.map((r) => r.role === "active");
  const n = labels.length;
  const nAct = labels.filter(Boolean).length;
  const top1Hit = rankedRows[0]?.role === "active";
  const top3Hit = rankedRows.slice(0, 3).some((r) => r.role === "active");
  const activeRanks = rankedRows.filter((r) => r.role === "active").map((r) => r.rank);
  const meanActiveRank =
    activeRanks.length ? activeRanks.reduce((a, b) => a + b, 0) / activeRanks.length : null;

  const fracTop = Math.max(1, Math.ceil(n * 0.2));
  const activesInTop = rankedRows.slice(0, fracTop).filter((r) => r.role === "active").length;
  const randomRate = nAct / n;
  const ef20 =
    randomRate > 0 ? (activesInTop / fracTop) / randomRate : null;

  const scores = rankedRows.map((r) => r.metric);
  const aucCi = bootstrapAucCi(labels, scores);
  return {
    n,
    n_actives: nAct,
    roc_auc: aucCi.auc,
    roc_auc_ci_low: aucCi.ci_low,
    roc_auc_ci_high: aucCi.ci_high,
    enrichment_factor_at_1pct: enrichmentFactorAtFraction(labels, scores, 0.01),
    top1_hit: top1Hit,
    top3_hit: top3Hit,
    mean_active_rank: meanActiveRank,
    enrichment_factor_at_20pct: ef20,
    random_expectation_top1: randomRate,
    random_expectation_top3:
      n >= 3 ? 1 - hypergeomCdf(0, n, nAct, 3) : null,
    ranking: rankedRows.map((r) => ({
      rank: r.rank,
      name: r.name,
      cid: r.pubchem_cid,
      role: r.role,
      score: r.metric,
      heuristic_score: r.heuristic_score,
      docking_delta_g: r.docking_delta_g,
    })),
  };
}

function hypergeomCdf(k, N, K, n) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += hypergeomPmf(i, N, K, n);
  }
  return sum;
}

function hypergeomPmf(k, N, K, n) {
  return (comb(K, k) * comb(N - K, n - k)) / comb(N, n);
}

function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i;
  }
  return r;
}

function aggregateMetrics(perTarget, accessor) {
  const vals = perTarget.map(accessor).filter((v) => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function aggregateBoolean(perTarget, accessor) {
  const vals = perTarget.map(accessor);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function runDockingCachePopulation() {
  const { spawnSync } = await import("child_process");
  const reactScripts = join(ROOT, "node_modules", ".bin", "react-scripts");
  const result = spawnSync(
    reactScripts,
    [
      "test",
      "--watchAll=false",
      "--runInBand",
      "--testPathPattern=benchmark/dockingBench",
    ],
    {
      cwd: ROOT,
      env: { ...process.env, RUN_DOCKING_BENCH: "1", CI: "true" },
      stdio: "inherit",
    }
  );
  if (result.status !== 0) {
    throw new Error("Docking benchmark subprocess failed (see output above).");
  }
}

function loadDockCache() {
  if (!existsSync(DOCK_CACHE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(DOCK_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function readDockingDeltaG(cache, pdbId, cid) {
  const entry = cache[`${pdbId}_${cid}`];
  if (typeof entry === "number") return entry;
  if (entry && typeof entry.delta_g === "number") return entry.delta_g;
  return null;
}

function headlineTable(overall) {
  const lines = [];
  const h = overall.heuristic_v2;
  const r = overall.random_expectation;
  const mw = overall.mw_baseline;
  const d = overall.docking_baseline;
  lines.push("| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |");
  lines.push("| --- | --- | --- | --- | --- |");
  lines.push(
    `| Mean ROC-AUC | ${fmt(h.mean_roc_auc)} | 0.50 | ${fmt(mw.mean_roc_auc)} | ${fmt(d.mean_roc_auc)} |`
  );
  lines.push(
    `| Top-1 hit rate | ${pct(h.top1_hit_rate)} | ${pct(r.top1_hit_rate)} | ${pct(mw.top1_hit_rate)} | ${pct(d.top1_hit_rate)} |`
  );
  lines.push(
    `| Top-3 hit rate | ${pct(h.top3_hit_rate)} | ${pct(r.top3_hit_rate)} | ${pct(mw.top3_hit_rate)} | ${pct(d.top3_hit_rate)} |`
  );
  lines.push(
    `| Mean active rank (↓ better) | ${fmt(h.mean_active_rank)} | ${fmt(r.mean_active_rank)} | ${fmt(mw.mean_active_rank)} | ${fmt(d.mean_active_rank)} |`
  );
  lines.push(
    `| Mean EF@20% | ${fmt(h.mean_ef20)} | 1.00 | ${fmt(mw.mean_ef20)} | ${fmt(d.mean_ef20)} |`
  );
  return lines;
}

function perTargetTable(perTarget) {
  const lines = [];
  lines.push(
    "| Target | PDB | N | Actives | ROC-AUC | Top-1 | Top-3 | Mean active rank | EF@20% | Top failure (if any) |"
  );
  lines.push("| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |");
  for (const t of perTarget) {
    const m = t.heuristic_v2;
    const fail = t.notable_failures?.[0];
    const failCell = fail
      ? `${fail.decoy_name} ranked #${fail.rank} above ${fail.active_name}`
      : "—";
    lines.push(
      `| ${t.name} | ${t.pdb_id} | ${m.n} | ${m.n_actives} | ${fmt(m.roc_auc)} | ${m.top1_hit ? "✓" : "✗"} | ${m.top3_hit ? "✓" : "✗"} | ${fmt(m.mean_active_rank)} | ${fmt(m.enrichment_factor_at_20pct)} | ${failCell} |`
    );
  }
  return lines;
}

function formatMarkdownReport(payload) {
  const lines = [];
  lines.push("# TargetForge ranking benchmark — results");
  lines.push("");
  lines.push(`Generated: ${payload.generated_at}`);
  lines.push("");
  lines.push("## In-rule (circular) — `validation_set.json`");
  lines.push("");
  lines.push(
    "Actives are drawn from the same drug-name lists encoded in `TARGET_RULES`; expect near-perfect separation."
  );
  lines.push("");
  lines.push("### Headline metrics (heuristic-v2)");
  lines.push("");
  lines.push(...headlineTable(payload.in_rule_circular.overall));
  lines.push("");
  lines.push("### Per-target summary");
  lines.push("");
  lines.push(...perTargetTable(payload.in_rule_circular.per_target));
  lines.push("");
  lines.push("## Held-out (non-circular) — `heldout_set.json`");
  lines.push("");
  lines.push(
    "Actives are real inhibitors **not** present in `TARGET_RULES` / `KINASE_INHIBITOR_RE` / `GPCR_LIGAND_RE` (see `rule_audit` in JSON). Decoys are property-matched off-target drugs also absent from those lists."
  );
  lines.push("");
  lines.push("### Headline metrics (heuristic-v2)");
  lines.push("");
  lines.push(...headlineTable(payload.held_out_non_circular.overall));
  lines.push("");
  lines.push("### Per-target summary");
  lines.push("");
  lines.push(...perTargetTable(payload.held_out_non_circular.per_target));
  lines.push("");
  if (payload.held_out_non_circular.suggested_cv_claim) {
    lines.push("### Suggested honest one-line claim (CV / site)");
    lines.push("");
    lines.push(`> ${payload.held_out_non_circular.suggested_cv_claim}`);
    lines.push("");
  }
  lines.push("## Honest limitations");
  lines.push("");
  for (const note of payload.limitations) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("## Pipeline coverage in this runner");
  lines.push("");
  for (const note of payload.pipeline_notes) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  const misrankSection = (title, failureCases) => {
    if (!failureCases?.length) return;
    lines.push(`## ${title}`);
    lines.push("");
    for (const f of failureCases.slice(0, 12)) {
      lines.push(
        `- **${f.target} (${f.pdb_id})**: ${f.decoy_name} (#${f.rank}, score ${fmt(f.decoy_score)}) ranked above ${f.active_name} (score ${fmt(f.active_score)})`
      );
    }
    lines.push("");
  };
  misrankSection("Held-out mis-ranks (heuristic-v2)", payload.held_out_non_circular.failure_cases);
  if (payload.docking_failure_cases?.length) {
    lines.push("## Notable mis-ranks (docking ΔG baseline, in-rule panel)");
    lines.push("");
    for (const f of payload.docking_failure_cases.slice(0, 8)) {
      lines.push(
        `- **${f.target} (${f.pdb_id})**: decoy **${f.decoy_name}** (ΔG ${fmt(f.decoy_score)} kcal/mol) beat active **${f.active_name}** (ΔG ${fmt(f.active_score)})`
      );
    }
    lines.push("");
  }
  lines.push("## Interpretation");
  lines.push("");
  lines.push("### In-rule (circular)");
  lines.push("");
  lines.push(payload.in_rule_circular.interpretation);
  lines.push("");
  lines.push("### Held-out (non-circular)");
  lines.push("");
  lines.push(payload.held_out_non_circular.interpretation);
  lines.push("");
  return lines.join("\n");
}

function fmt(v) {
  if (v == null || Number.isNaN(v)) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  return String(v);
}

function pct(v) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function findNotableFailures(rankedRows) {
  const failures = [];
  const bestActiveRank = rankedRows.filter((r) => r.role === "active").map((r) => r.rank);
  const minActive = bestActiveRank.length ? Math.min(...bestActiveRank) : null;
  if (minActive == null) return failures;
  for (const row of rankedRows) {
    if (row.role !== "decoy" || row.rank >= minActive) continue;
    const beaten = rankedRows.find((r) => r.role === "active" && r.rank > row.rank);
    if (beaten) {
      failures.push({
        rank: row.rank,
        decoy_name: row.name,
        decoy_cid: row.pubchem_cid,
        active_name: beaten.name,
        active_cid: beaten.pubchem_cid,
        decoy_score: row.metric,
        active_score: beaten.metric,
      });
    }
  }
  return failures.slice(0, 3);
}

function buildOverall(perTarget) {
  const meanCi = (accessor) => ({
    mean_roc_auc: aggregateMetrics(perTarget, (t) => accessor(t)?.roc_auc),
    mean_ci_low: aggregateMetrics(perTarget, (t) => accessor(t)?.roc_auc_ci_low),
    mean_ci_high: aggregateMetrics(perTarget, (t) => accessor(t)?.roc_auc_ci_high),
    mean_ef1: aggregateMetrics(perTarget, (t) => accessor(t)?.enrichment_factor_at_1pct),
    top1_hit_rate: aggregateBoolean(perTarget, (t) => accessor(t)?.top1_hit),
  });

  return {
    heuristic_v2: {
      mean_roc_auc: aggregateMetrics(perTarget, (t) => t.heuristic_v2.roc_auc),
      top1_hit_rate: aggregateBoolean(perTarget, (t) => t.heuristic_v2.top1_hit),
      top3_hit_rate: aggregateBoolean(perTarget, (t) => t.heuristic_v2.top3_hit),
      mean_active_rank: aggregateMetrics(perTarget, (t) => t.heuristic_v2.mean_active_rank),
      mean_ef20: aggregateMetrics(perTarget, (t) => t.heuristic_v2.enrichment_factor_at_20pct),
    },
    similarity_v1: meanCi((t) => t.similarity_v1),
    combined_triage_v1: meanCi((t) => t.combined_triage_v1),
    mw_baseline: {
      mean_roc_auc: aggregateMetrics(perTarget, (t) => t.mw_baseline.roc_auc),
      top1_hit_rate: aggregateBoolean(perTarget, (t) => t.mw_baseline.top1_hit),
      top3_hit_rate: aggregateBoolean(perTarget, (t) => t.mw_baseline.top3_hit),
      mean_active_rank: aggregateMetrics(perTarget, (t) => t.mw_baseline.mean_active_rank),
      mean_ef20: aggregateMetrics(perTarget, (t) => t.mw_baseline.enrichment_factor_at_20pct),
      mean_ef1: aggregateMetrics(perTarget, (t) => t.mw_baseline.enrichment_factor_at_1pct),
    },
    logp_baseline: {
      mean_roc_auc: aggregateMetrics(perTarget, (t) => t.logp_baseline.roc_auc),
      mean_ef1: aggregateMetrics(perTarget, (t) => t.logp_baseline.enrichment_factor_at_1pct),
    },
    docking_baseline: (() => {
      const withDock = perTarget.filter((t) => t.docking_baseline);
      if (!withDock.length) {
        return {
          mean_roc_auc: null,
          top1_hit_rate: null,
          top3_hit_rate: null,
          mean_active_rank: null,
          mean_ef20: null,
        };
      }
      return {
        mean_roc_auc: aggregateMetrics(withDock, (t) => t.docking_baseline.roc_auc),
        top1_hit_rate: aggregateBoolean(withDock, (t) => t.docking_baseline.top1_hit),
        top3_hit_rate: aggregateBoolean(withDock, (t) => t.docking_baseline.top3_hit),
        mean_active_rank: aggregateMetrics(withDock, (t) => t.docking_baseline.mean_active_rank),
        mean_ef20: aggregateMetrics(withDock, (t) => t.docking_baseline.enrichment_factor_at_20pct),
      };
    })(),
    random_expectation: {
      top1_hit_rate: aggregateMetrics(perTarget, (t) => t.heuristic_v2.random_expectation_top1),
      top3_hit_rate: aggregateMetrics(perTarget, (t) => t.heuristic_v2.random_expectation_top3),
      mean_active_rank: aggregateMetrics(perTarget, (t) => (t.heuristic_v2.n + 1) / 2),
    },
  };
}

function collectFailureCases(perTarget) {
  return perTarget.flatMap((t) =>
    (t.notable_failures || []).map((f) => ({ target: t.name, pdb_id: t.pdb_id, ...f }))
  );
}

function collectDockingFailureCases(perTarget) {
  return perTarget.flatMap((t) => {
    if (!t.docking_baseline?.ranking) return [];
    const ranked = t.docking_baseline.ranking;
    const failures = [];
    const bestActive = ranked.filter((r) => r.role === "active").sort((a, b) => a.rank - b.rank)[0];
    if (!bestActive) return failures;
    for (const row of ranked) {
      if (row.role === "decoy" && row.rank < bestActive.rank) {
        failures.push({
          target: t.name,
          pdb_id: t.pdb_id,
          decoy_name: row.name,
          decoy_score: row.score,
          active_name: bestActive.name,
          active_score: bestActive.score,
          rank: row.rank,
        });
      }
    }
    return failures;
  });
}

function loadRedockPassMap() {
  if (!existsSync(REDOCK_PATH)) return {};
  try {
    const data = JSON.parse(readFileSync(REDOCK_PATH, "utf8"));
    const map = {};
    for (const row of data.rows || []) {
      const pdb = String(row.pdb_id || "").toUpperCase();
      map[pdb] =
        row.pass_vina_crystal === true ||
        row.pass === true ||
        row.pass_native_crystal === true;
    }
    return map;
  } catch {
    return {};
  }
}

function scoreRowKey(c) {
  return String(c.pubchem_cid || c.chembl_id || c.name || c.smiles);
}

async function evaluatePanel(validation, painsApi, dockCache, skipDocking, panelLabel) {
  const perTarget = [];
  const redockPass = loadRedockPassMap();

  for (const target of validation.targets) {
    const protein = target.protein;
    const candidates = target.compounds.map((c) => compoundToCandidate(c, painsApi));
    const similarityByCid = await buildSimilarityMap(target.compounds, protein);

    const rankedHeuristic = rankCandidatesLocal(candidates, protein, {
      maxCandidates: candidates.length,
      minCandidates: 2,
    });
    const rankedSimilarity = rankCandidatesLocal(candidates, protein, {
      maxCandidates: candidates.length,
      minCandidates: 2,
      similarityByCid,
      rankMode: "similarity",
    });
    const rankedCombined = rankCandidatesLocal(candidates, protein, {
      maxCandidates: candidates.length,
      minCandidates: 2,
      similarityByCid,
      rankMode: "combined",
    });

    const scoreByCid = new Map(rankedHeuristic.ranking.map((r) => [String(r.cid), r.score]));
    const simByCid = new Map(rankedSimilarity.ranking.map((r) => [String(r.cid), r.score]));
    const combByCid = new Map(rankedCombined.ranking.map((r) => [String(r.cid), r.score]));

    const rows = target.compounds.map((c) => {
      const key = scoreRowKey(c);
      const heuristic_score = scoreByCid.get(key) ?? null;
      const similarity_score = simByCid.get(key) ?? null;
      const combined_score = combByCid.get(key) ?? null;
      return {
        ...c,
        pubchem_cid: c.pubchem_cid || key,
        heuristic_score,
        similarity_score,
        combined_score,
        metric: heuristic_score,
      };
    });

    const heuristicEval = evaluateRanking(
      rankByScore(rows, (r) => r.heuristic_score, true).map((r) => ({ ...r, metric: r.heuristic_score }))
    );

    const similarityEval = evaluateRanking(
      rankByScore(rows, (r) => r.similarity_score, true).map((r) => ({ ...r, metric: r.similarity_score }))
    );

    const combinedEval = evaluateRanking(
      rankByScore(rows, (r) => r.combined_score, true).map((r) => ({ ...r, metric: r.combined_score }))
    );

    const mwEval = evaluateRanking(
      rankByScore(rows, (r) => r.molecularWeight, true).map((r) => ({ ...r, metric: r.molecularWeight }))
    );

    const logpEval = evaluateRanking(
      rankByScore(rows, (r) => r.xlogp, true).map((r) => ({ ...r, metric: r.xlogp }))
    );

    let dockingEval = null;
    const pdbId = target.pdb_id.toUpperCase();
    const dockAllowed = redockPass[pdbId] === true;
    if (!skipDocking && Object.keys(dockCache).length && dockAllowed) {
      for (const row of rows) {
        row.docking_delta_g = readDockingDeltaG(dockCache, target.pdb_id, row.pubchem_cid);
      }
      const withDock = rows.filter((r) => r.docking_delta_g != null);
      if (withDock.length >= 2) {
        dockingEval = evaluateRanking(
          rankByScore(withDock, (r) => r.docking_delta_g, false).map((r) => ({
            ...r,
            metric: r.docking_delta_g,
          }))
        );
      }
    }

    const failures = findNotableFailures(
      rankByScore(rows, (r) => r.heuristic_score, true).map((r) => ({ ...r, metric: r.heuristic_score }))
    );

    perTarget.push({
      id: target.id,
      name: target.name,
      pdb_id: target.pdb_id,
      heuristic_v2: heuristicEval,
      similarity_v1: similarityEval,
      combined_triage_v1: combinedEval,
      mw_baseline: mwEval,
      logp_baseline: logpEval,
      docking_baseline: dockingEval,
      docking_redock_validated: dockAllowed,
      notable_failures: failures,
    });

    console.log(
      `[benchmark:${panelLabel}] ${target.id} (${target.pdb_id}) ROC-AUC=${fmt(heuristicEval.roc_auc)} top1=${heuristicEval.top1_hit}`
    );
  }

  const overall = buildOverall(perTarget);
  return {
    panel: panelLabel,
    dataset_file: panelLabel === "in-rule" ? "benchmark/validation_set.json" : "benchmark/heldout_set.json",
    summary: validation.summary,
    overall,
    per_target: perTarget,
    failure_cases: collectFailureCases(perTarget),
  };
}

function evaluateSanityBaselines(heldout) {
  const perTarget = (heldout.targets || []).map((t) => {
    const rows = (t.compounds || []).map((c) => ({ ...c, role: c.role }));
    const mwEval = evaluateRanking(
      rankByScore(rows, (r) => r.molecularWeight, true).map((r) => ({ ...r, metric: r.molecularWeight }))
    );
    const logpEval = evaluateRanking(
      rankByScore(rows, (r) => r.xlogp, true).map((r) => ({ ...r, metric: r.xlogp }))
    );
    return {
      id: t.id,
      name: t.name,
      pdb_id: t.pdb_id,
      sanity: t.sanity || {},
      mw_baseline: mwEval,
      logp_baseline: logpEval,
    };
  });
  return {
    panel: "held-out-sanity-only",
    benchmark_ready: false,
    sanity_overall: heldout.sanity_overall || {},
    per_target: perTarget,
  };
}

async function main() {
  const skipDocking = process.argv.includes("--skip-docking");
  const painsApi = await import("../src/painsCheck.js");
  const validation = JSON.parse(readFileSync(VALIDATION_PATH, "utf8"));
  const heldout = JSON.parse(readFileSync(HELDOUT_PATH, "utf8"));
  const benchmarkReady = heldout.sanity_overall?.benchmark_ready === true;
  if (!benchmarkReady) {
    console.warn(
      "[benchmark] Held-out panel failed MW/logP sanity (need 0.45–0.55 per target). Skipping scoring-method evaluation."
    );
  }

  let dockCache = loadDockCache();
  if (!skipDocking) {
    const allTargets = [...validation.targets, ...heldout.targets];
    const expectedKeys = allTargets.reduce((n, t) => n + t.compounds.length, 0);
    const attemptedKeys = allTargets.reduce((n, t) => {
      return (
        n +
        t.compounds.filter((c) => dockCache[`${t.pdb_id}_${c.pubchem_cid}`] != null).length
      );
    }, 0);
    if (attemptedKeys < expectedKeys) {
      console.log(
        `[benchmark] Populating docking cache via Jest (${attemptedKeys}/${expectedKeys} entries)...`
      );
      await runDockingCachePopulation();
      dockCache = loadDockCache();
    }
  }

  const inRule = await evaluatePanel(validation, painsApi, dockCache, skipDocking, "in-rule");
  const heldOut = benchmarkReady
    ? await evaluatePanel(heldout, painsApi, dockCache, skipDocking, "held-out")
    : evaluateSanityBaselines(heldout);

  const limitations = [
    "Small, hand-curated panels — not a substitute for DUD-E or large-scale virtual screens.",
    "In-rule actives mirror `TARGET_RULES` lists (circular); held-out actives are verified absent from those lists via `benchmark/auditRuleLists.mjs`.",
    "Held-out decoys are property-matched (MW, logP, HBD/HBA, rotatable bonds) but not full DUD-E decoy sets.",
    "Potency labels come from ChEMBL / literature citations in `heldout_set.json`, not re-measured in this run.",
    "Co-crystal ligand bonuses still apply when PDB titles mention rule-list drugs (e.g., erlotinib on 1M17).",
  ];

  const pipeline_notes = [
    "Scored with `rankCandidatesLocal` / `scoreOne` from `src/scoreCandidates.js` (source: heuristic-v2) — identical to local Staging Bench and repurposing batch numeric ranks.",
    "PAINS/toxicophore checks run via `checkPainsFast` on supplied SMILES (same patterns as the bench).",
    "OpenAI `/api/rank-candidates` reasoning is excluded so results stay deterministic and reproducible.",
    "RDKit WASM ADME (`admeCalculator.js`) and organ-toxicity flags are not combined into the 0–100 ranking score in production; they were not applied here.",
    skipDocking
      ? "Docking baseline skipped (`--skip-docking`). Re-run `npm run benchmark` to populate `docking_cache.json` via Jest."
      : `Native docking baseline uses \`runMolecularDocking\` (via \`src/benchmark/dockingBench.test.js\` + RDKit WASM) with searchExhaustiveness=${DOCK_EXHAUSTIVENESS} and seeded Math.random per (PDB, CID).`,
  ];

  const hIn = inRule.overall.heuristic_v2;
  const dIn = inRule.overall.docking_baseline;
  const inRuleInterpretation = `On the in-rule panel (${validation.summary.target_count} targets, ${validation.summary.active_count} actives), mean ROC-AUC ${fmt(
    hIn.mean_roc_auc
  )} and top-1 hit rate ${pct(hIn.top1_hit_rate)} confirm that \`TARGET_RULES\` lookup behaves as coded — this is a **regression/consistency** check, not evidence of generalization. Docking ΔG baseline (ROC-AUC ${fmt(
    dIn.mean_roc_auc
  )}, top-1 ${pct(dIn.top1_hit_rate)}) remains near chance and is not part of the 0–100 score.`;

  const heldOutInterpretation = benchmarkReady
    ? (() => {
        const hOut = heldOut.overall.heuristic_v2;
        const dOut = heldOut.overall.docking_baseline;
        return `On the held-out panel (${heldout.summary?.target_count ?? heldout.targets?.length} targets), mean ROC-AUC ${fmt(
          hOut.mean_roc_auc
        )} and top-1 hit rate ${pct(hOut.top1_hit_rate)} (${pct(heldOut.overall.random_expectation.top1_hit_rate)} random expectation) measure **external** behavior. Docking on redock-validated targets: ROC-AUC ${fmt(
          dOut.mean_roc_auc
        )}, top-1 ${pct(dOut.top1_hit_rate)}.`;
      })()
    : `Held-out benchmark **did not pass** property-decoy sanity (MW and logP ROC-AUC must be ~0.50 per target). Scoring methods were **not** evaluated; see per-target \`mw_baseline\` / \`logp_baseline\` in results. Rebuild with \`python3 benchmark/buildHeldoutBenchmark.py\`.`;

  const suggestedCvClaim = benchmarkReady
    ? `Target-aware ranking separates FDA-listed on-target drugs from off-target decoys for rule-covered targets (in-rule top-1 ${pct(
        hIn.top1_hit_rate
      )}); on held-out inhibitors, enrichment (ROC-AUC ${fmt(heldOut.overall.heuristic_v2.mean_roc_auc)}) should be paired with docking/assays.`
    : "Held-out method claims withheld until decoy sanity checks pass.";

  const docking_failure_cases = collectDockingFailureCases(inRule.per_target);

  const payload = {
    generated_at: new Date().toISOString(),
    in_rule_circular: { ...inRule, interpretation: inRuleInterpretation },
    held_out_non_circular: {
      ...heldOut,
      interpretation: heldOutInterpretation,
      suggested_cv_claim: suggestedCvClaim,
    },
    limitations,
    pipeline_notes,
    docking_failure_cases,
    options: { skip_docking: skipDocking, dock_exhaustiveness: DOCK_EXHAUSTIVENESS },
  };

  writeFileSync(RESULTS_JSON, JSON.stringify(payload, null, 2));
  writeFileSync(join(__dirname, "RESULTS.md"), formatMarkdownReport(payload));
  console.log(`Wrote ${RESULTS_JSON} and benchmark/RESULTS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
