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

// RDKit loader only initializes in Node when NODE_ENV=test (same as Jest).
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const require = createRequire(import.meta.url);
const { rankCandidatesLocal } = require("../src/scoreCandidates.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VALIDATION_PATH = join(__dirname, "validation_set.json");
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
  const row = {
    cid: c.pubchem_cid,
    CID: c.pubchem_cid,
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

function rocAuc(labels, scores) {
  const pairs = labels.map((y, i) => ({ y, s: scores[i] }));
  pairs.sort((a, b) => b.s - a.s);
  let nPos = 0;
  let nNeg = 0;
  for (const p of pairs) {
    if (p.y) nPos++;
    else nNeg++;
  }
  if (!nPos || !nNeg) return null;

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let auc = 0;
  let lastScore = null;

  for (const p of pairs) {
    if (p.s !== lastScore) {
      auc += (tp + prevTp) * (fp - prevFp) / 2;
      prevTp = tp;
      prevFp = fp;
      lastScore = p.s;
    }
    if (p.y) tp++;
    else fp++;
  }
  auc += (tp + prevTp) * (fp - prevFp) / 2;
  return auc / (nPos * nNeg);
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
  return {
    n,
    n_actives: nAct,
    roc_auc: rocAuc(labels, scores),
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

function formatMarkdownReport(payload) {
  const lines = [];
  lines.push("# TargetForge ranking benchmark — results");
  lines.push("");
  lines.push(`Generated: ${payload.generated_at}`);
  lines.push("");
  lines.push("## Headline metrics (heuristic-v2 / Staging Bench engine)");
  lines.push("");
  lines.push("| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |");
  lines.push("| --- | --- | --- | --- | --- |");
  const h = payload.overall.heuristic_v2;
  const r = payload.overall.random_expectation;
  const mw = payload.overall.mw_baseline;
  const d = payload.overall.docking_baseline;
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
  lines.push("");
  lines.push("## Per-target summary");
  lines.push("");
  lines.push(
    "| Target | PDB | N | Actives | ROC-AUC | Top-1 | Top-3 | Mean active rank | EF@20% | Top failure (if any) |"
  );
  lines.push("| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |");
  for (const t of payload.per_target) {
    const m = t.heuristic_v2;
    const fail = t.notable_failures?.[0];
    const failCell = fail
      ? `${fail.decoy_name} ranked #${fail.rank} above ${fail.active_name}`
      : "—";
    lines.push(
      `| ${t.name} | ${t.pdb_id} | ${m.n} | ${m.n_actives} | ${fmt(m.roc_auc)} | ${m.top1_hit ? "✓" : "✗"} | ${m.top3_hit ? "✓" : "✗"} | ${fmt(m.mean_active_rank)} | ${fmt(m.enrichment_factor_at_20pct)} | ${failCell} |`
    );
  }
  lines.push("");
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
  if (payload.failure_cases?.length) {
    lines.push("## Notable mis-ranks (heuristic-v2)");
    lines.push("");
    for (const f of payload.failure_cases) {
      lines.push(
        `- **${f.target} (${f.pdb_id})**: ${f.decoy_name} (#${f.rank}, score ${fmt(f.decoy_score)}) ranked above ${f.active_name} (score ${fmt(f.active_score)})`
      );
    }
    lines.push("");
  }
  if (payload.docking_failure_cases?.length) {
    lines.push("## Notable mis-ranks (docking ΔG baseline)");
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
  lines.push(payload.interpretation);
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

async function main() {
  const skipDocking = process.argv.includes("--skip-docking");
  const painsApi = await import("../src/painsCheck.js");
  const validation = JSON.parse(readFileSync(VALIDATION_PATH, "utf8"));

  let dockCache = loadDockCache();
  if (!skipDocking) {
    const expectedKeys = validation.targets.reduce(
      (n, t) => n + t.compounds.length,
      0
    );
    const attemptedKeys = validation.targets.reduce((n, t) => {
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

  const perTarget = [];

  for (const target of validation.targets) {
    const protein = target.protein;
    const candidates = target.compounds.map((c) => compoundToCandidate(c, painsApi));
    const ranked = rankCandidatesLocal(candidates, protein, {
      maxCandidates: candidates.length,
      minCandidates: 2,
    });

    const scoreByCid = new Map(ranked.ranking.map((r) => [String(r.cid), r.score]));

    const rows = target.compounds.map((c) => {
      const heuristic_score = scoreByCid.get(String(c.pubchem_cid)) ?? null;
      return {
        ...c,
        heuristic_score,
        metric: heuristic_score,
      };
    });

    const heuristicEval = evaluateRanking(
      rankByScore(rows, (r) => r.heuristic_score, true).map((r) => ({ ...r, metric: r.heuristic_score }))
    );

    const mwEval = evaluateRanking(
      rankByScore(rows, (r) => r.molecularWeight, true).map((r) => ({ ...r, metric: r.molecularWeight }))
    );

    let dockingEval = null;
    if (!skipDocking && Object.keys(dockCache).length) {
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
      mw_baseline: mwEval,
      docking_baseline: dockingEval,
      notable_failures: failures,
    });

    console.log(
      `[benchmark] ${target.id} (${target.pdb_id}) ROC-AUC=${fmt(heuristicEval.roc_auc)} top1=${heuristicEval.top1_hit}`
    );
  }

  const overall = {
    heuristic_v2: {
      mean_roc_auc: aggregateMetrics(perTarget, (t) => t.heuristic_v2.roc_auc),
      top1_hit_rate: aggregateBoolean(perTarget, (t) => t.heuristic_v2.top1_hit),
      top3_hit_rate: aggregateBoolean(perTarget, (t) => t.heuristic_v2.top3_hit),
      mean_active_rank: aggregateMetrics(perTarget, (t) => t.heuristic_v2.mean_active_rank),
      mean_ef20: aggregateMetrics(perTarget, (t) => t.heuristic_v2.enrichment_factor_at_20pct),
    },
    mw_baseline: {
      mean_roc_auc: aggregateMetrics(perTarget, (t) => t.mw_baseline.roc_auc),
      top1_hit_rate: aggregateBoolean(perTarget, (t) => t.mw_baseline.top1_hit),
      top3_hit_rate: aggregateBoolean(perTarget, (t) => t.mw_baseline.top3_hit),
      mean_active_rank: aggregateMetrics(perTarget, (t) => t.mw_baseline.mean_active_rank),
      mean_ef20: aggregateMetrics(perTarget, (t) => t.mw_baseline.enrichment_factor_at_20pct),
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

  const limitations = [
    "Small, hand-curated panel (10 targets, 30 actives, 60 decoys) — not a substitute for DUD-E or large-scale virtual screens.",
    "Decoys are other approved drugs, so all compounds are drug-like; separation is harder than vs random SMILES.",
    "Decoys were not property-matched to actives (MW/logP), so some baselines may look better or worse than in matched decoy sets.",
    "On-target labels come from primary indications / pharmacology tables encoded in TargetForge rules, not from fresh IC50 measurements.",
    "Co-crystal ligand identity bonuses can inflate scores for exact reference matches (e.g., erlotinib on 1M17).",
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

  const h = overall.heuristic_v2;
  const d = overall.docking_baseline;
  const failure_cases = perTarget.flatMap((t) =>
    (t.notable_failures || []).map((f) => ({ target: t.name, pdb_id: t.pdb_id, ...f }))
  );
  const docking_failure_cases = perTarget.flatMap((t) => {
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

  const interpretation = `On this ${validation.summary.target_count}-target panel, TargetForge's deterministic target-aware heuristic (${validation.summary.active_count} labeled actives) achieved mean ROC-AUC ${fmt(
    h.mean_roc_auc
  )} with top-1 hit rate ${pct(h.top1_hit_rate)} (${pct(overall.random_expectation.top1_hit_rate)} expected by chance on these class priors). That near-perfect separation is expected: the benchmark labels are the same drug-name lists encoded in \`TARGET_RULES\`, so the test largely verifies lookup consistency rather than predictive binding. By contrast, the empirical docking baseline (mean ROC-AUC ${fmt(
    d.mean_roc_auc
  )}, top-1 ${pct(d.top1_hit_rate)}) is only slightly better than chance on this small set and is **not** wired into the 0–100 Staging Bench score. RDKit ADME and organ-toxicity modules are likewise separate. For portfolio messaging, cite the heuristic panel result as "rule-table consistency on curated actives vs approved decoys," not as prospective virtual-screening accuracy.`;

  const payload = {
    generated_at: new Date().toISOString(),
    validation_set: "benchmark/validation_set.json",
    overall,
    per_target: perTarget,
    limitations,
    pipeline_notes,
    failure_cases,
    docking_failure_cases,
    interpretation,
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
