import { getRDKit } from "./rdkitLoader.js";
import { canonicalizeSmiles, generateOffspring, detectReactionSupport } from "./evolutionTransforms.js";
import { scoreEvolvedMolecule, trainSurrogateFromDocked } from "./evolutionScore.js";
import { selectSurvivorsMuPlusLambda } from "./evolution/evolutionNsga2.js";
import { murckoKeys, applyScaffoldQuota, mergeElites } from "./evolution/evolutionScaffold.js";
import { collapseMetrics, needsDiversityRescue } from "./evolution/evolutionCollapse.js";
import { mulberry32 } from "./evolution/evolutionRng.js";
import {
  selectDockingCandidates,
  dockBatchForTarget,
  ligandEfficiency,
  getCachedAffinity,
} from "./evolution/evolutionDocking.js";
import { pdbIdOf } from "./rankingCache.js";
import { morganUint8 } from "./evolution/evolutionFingerprint.js";
import { pickDiverseSurvivors } from "./evolution/evolutionDiversity.js";
import { resolveProtectedQuery } from "./evolution/evolutionProtected.js";

export const DEFAULT_EVOLUTION_SETTINGS = {
  generations: 5,
  variantsPerGeneration: 20,
  survivors: 5,
  rngSeed: 42,
  dockingBudgetPerGen: 8,
  seedSimilarityFloor: 0.4,
  independentRuns: 5,
  diversityMethod: "maxmin",
  protectedSmarts: "",
  protectedAtomIndices: [],
};

function clampInt(raw, fallback, min, max) {
  const n = Number(raw);
  const value = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, value));
}

export function clampSettings(raw = {}) {
  const generations = clampInt(raw.generations, 5, 1, 8);
  const variantsPerGeneration = clampInt(raw.variantsPerGeneration, 20, 4, 40);
  const survivors = clampInt(raw.survivors, 5, 1, 10);
  const rngSeed = clampInt(raw.rngSeed, 42, 1, 2147483646);
  const dockingBudgetPerGen = clampInt(raw.dockingBudgetPerGen, 8, 0, 24);
  const seedSimilarityFloor = Number.isFinite(Number(raw.seedSimilarityFloor))
    ? Math.max(0, Math.min(1, Number(raw.seedSimilarityFloor)))
    : 0.4;
  const independentRuns = clampInt(raw.independentRuns, 5, 1, 12);
  const diversityMethod = raw.diversityMethod === "butina" ? "butina" : "maxmin";
  const protectedSmarts = String(raw.protectedSmarts || "").trim();
  const protectedAtomIndices = Array.isArray(raw.protectedAtomIndices)
    ? raw.protectedAtomIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];
  return {
    generations,
    variantsPerGeneration,
    survivors,
    rngSeed,
    dockingBudgetPerGen,
    seedSimilarityFloor,
    independentRuns,
    diversityMethod,
    protectedSmarts,
    protectedAtomIndices,
  };
}

function objectiveVector(row, targetFree) {
  const qed = row.qed ?? 0;
  const sa = row.saScore ?? 5;
  const nov = row.novelty ?? 0;
  const alerts = (row.fitness?.desirabilities?.d_alerts ?? 1) < 0.5 ? 2 : 0;
  if (targetFree) {
    return [-qed, sa, alerts, -nov];
  }
  const le = row.le;
  if (le == null || !Number.isFinite(le)) {
    return [-qed, sa, alerts, -nov];
  }
  return [-le, -qed, sa, alerts, -nov];
}

let scoringWorker = null;

async function getScoringWorker() {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (scoringWorker) return scoringWorker;
  try {
    const { createScoringWorker } = await import("./evolution/evolutionWorkerClient.js");
    scoringWorker = createScoringWorker();
    return scoringWorker;
  } catch {
    return null;
  }
}

async function scoreBatchInWorker(variants, ctx) {
  const worker = await getScoringWorker();
  if (!worker) return null;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Scoring worker timeout")), 120000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data?.results || []);
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };
    worker.postMessage({ variants, ctx });
  });
}

async function scoreOffspring(variants, ctx) {
  try {
    const workerResults = await scoreBatchInWorker(variants, ctx);
    if (workerResults && workerResults.length) return workerResults;
  } catch {
    // fallback main thread
  }
  const RDKit = ctx.RDKit || (await getRDKit());
  const out = [];
  for (const variant of variants) {
    const scored = await scoreEvolvedMolecule({ ...variant, ...ctx, RDKit });
    out.push(scored);
  }
  return out;
}

function morganBits(RDKit, smiles) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) return [];
  try {
    const fp = morganUint8(mol);
    const bits = [];
    if (fp) for (let i = 0; i < fp.length; i += 1) if (fp[i]) bits.push(i);
    return bits;
  } finally {
    mol.delete();
  }
}

export async function runEvolutionGeneration({
  parents,
  protein,
  referenceSmiles,
  seedSmiles,
  archiveSmiles,
  populationSmiles,
  seen,
  variantsPerGeneration,
  survivors,
  generationIndex,
  rescueBoost = false,
  rngSeed = 42,
  dockingBudgetPerGen = 8,
  seedSimilarityFloor = 0.4,
  protectedQuery = null,
  diversityMethod = "maxmin",
  globalScaffoldArchive = null,
}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const RDKit = await getRDKit();
  if (!RDKit) {
    return { ok: false, error: "RDKit WASM did not load. Evolution cannot generate valid structures without it.", ms: 0 };
  }

  const rng = mulberry32((rngSeed || 42) + generationIndex * 997);
  const targetFree = !protein?.id;
  const discarded = { parseFail: 0, duplicate: 0, gated: 0 };
  const offspringLimit = rescueBoost ? Math.ceil(variantsPerGeneration * 1.5) : variantsPerGeneration;
  const produced = generateOffspring(RDKit, parents, { seen, limit: offspringLimit, bucketMap: true, rng });
  discarded.parseFail += produced.discarded.parseFail;
  discarded.duplicate += produced.discarded.duplicate;

  const popSmiles = populationSmiles || parents.map((p) => p.smiles);
  const scoreCtx = {
    protein,
    referenceSmiles,
    seedSmiles: seedSmiles || referenceSmiles,
    populationSmiles: popSmiles,
    archiveSmiles,
    RDKit,
    seedSimilarityFloor,
    protectedQuery,
  };

  const scoredRows = await scoreOffspring(produced.variants, scoreCtx);
  const pool = [];
  for (let i = 0; i < produced.variants.length; i += 1) {
    const variant = produced.variants[i];
    const scored = scoredRows[i];
    if (!scored?.ok) {
      if (scored?.gated) discarded.gated += 1;
      else discarded.parseFail += 1;
      continue;
    }
    const keys = murckoKeys(RDKit, scored.smiles);
    pool.push({
      ...variant,
      ...scored,
      generation: generationIndex,
      bucket: keys.generic,
      bucketDisplay: keys.display,
      parentScore: parents[0]?.displayScore ?? parents[0]?.score ?? null,
      delta: Number(scored.displayScore) - Number(parents[0]?.displayScore ?? parents[0]?.score ?? scored.displayScore),
      lineage: {
        parents: variant.parentIds || [variant.parentSmiles],
        operator: variant.operator || "mutation",
        label: variant.editLabel,
      },
    });
  }

  let dockingMeta = { docked: 0, unavailable: false };
  if (!targetFree && dockingBudgetPerGen > 0 && pool.length) {
    const pdb = pdbIdOf(protein);
    const dockedSet = new Set(
      [...parents, ...pool].filter((r) => r.docked || getCachedAffinity(pdb, r.smiles)?.docked).map((r) => r.smiles)
    );
    const picks = selectDockingCandidates(pool, {
      budget: dockingBudgetPerGen,
      rng,
      dockedSmiles: dockedSet,
    });
    const batch = await dockBatchForTarget(protein, picks, { concurrency: 3 });
    dockingMeta.unavailable = batch.unavailable;
    const trainRows = [];
    for (const row of batch.docked) {
      const aff = row.affinity;
      if (!aff?.ok || !Number.isFinite(aff.deltaG)) continue;
      const le = ligandEfficiency(aff.deltaG, row.heavyAtoms);
      trainRows.push({
        le,
        mw: row.mw,
        logp: row.logp,
        tpsa: row.tpsa,
        hbd: row.hbd,
        hba: row.hba,
        rotb: row.rotb,
        fsp3: row.fsp3,
        heavyAtoms: row.heavyAtoms,
        morganBits: morganBits(RDKit, row.smiles),
      });
      const rescored = await scoreEvolvedMolecule({
        smiles: row.smiles,
        parentSmiles: row.parentSmiles,
        parentSmilesB: row.parentSmilesB,
        referenceSmiles,
        seedSmiles,
        populationSmiles: popSmiles,
        archiveSmiles,
        protein,
        RDKit,
        operator: row.operator,
        editId: row.editId,
        editLabel: row.editLabel,
        affinityRow: aff,
        seedSimilarityFloor,
        protectedQuery,
      });
      const idx = pool.findIndex((p) => p.smiles === row.smiles);
      if (idx >= 0 && rescored.ok) pool[idx] = { ...pool[idx], ...rescored };
    }
    if (trainRows.length) trainSurrogateFromDocked(pdb, trainRows);
    dockingMeta.docked = trainRows.length;
  }

  const combined = [...parents, ...pool];
  const objectives = combined.map((row) => objectiveVector(row, targetFree));
  let ranked = selectSurvivorsMuPlusLambda(combined, objectives, combined.length);
  ranked = applyScaffoldQuota(ranked, Math.max(survivors * 3, survivors), 0.25);
  ranked = pickDiverseSurvivors(RDKit, ranked, survivors, {
    method: diversityMethod,
    rng,
    seedSmiles: seedSmiles || referenceSmiles,
  });
  ranked = mergeElites(ranked, parents, survivors);

  if (globalScaffoldArchive) {
    for (const row of ranked) {
      if (row.bucket) globalScaffoldArchive.add(row.bucket);
    }
  }

  const metrics = collapseMetrics({
    population: ranked,
    buckets: ranked.map((r) => r.bucket),
    seedSmiles: seedSmiles || referenceSmiles,
    RDKit,
    globalScaffoldArchive,
  });
  const rescue = needsDiversityRescue(metrics);

  const best = ranked[0]?.displayScore ?? ranked[0]?.score ?? 0;
  const avg = ranked.length ? ranked.reduce((s, r) => s + (r.displayScore || r.score || 0), 0) / ranked.length : 0;
  const meanLe = ranked.filter((r) => r.le != null).reduce((s, r) => s + r.le, 0) / Math.max(1, ranked.filter((r) => r.le != null).length);
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    ok: true,
    generation: generationIndex,
    valid: pool.length,
    discarded,
    discardedTotal: discarded.parseFail + discarded.duplicate + discarded.gated,
    reactionSupport: detectReactionSupport(RDKit),
    population: pool,
    survivors: ranked,
    metrics,
    rescue,
    dockingMeta,
    historyPoint: {
      generation: generationIndex,
      best: Number(best.toFixed(1)),
      average: Number(avg.toFixed(1)),
      meanLe: Number((meanLe || 0).toFixed(3)),
      valid: pool.length,
      discarded: discarded.parseFail + discarded.duplicate + discarded.gated,
      diversity: metrics.diversity,
      scaffolds: metrics.distinctScaffolds,
      meanSeedSimilarity: metrics.meanSeedSimilarity,
      uniqueScaffoldsArchive: metrics.uniqueScaffoldsArchive,
      painsAlerts: metrics.painsAlerts,
    },
    ms: Math.round(ended - started),
  };
}

export async function seedParent({
  smiles,
  protein,
  name,
  rngSeed = 42,
  seedSimilarityFloor = 0.4,
  protectedQuery = null,
}) {
  const RDKit = await getRDKit();
  const canon = canonicalizeSmiles(RDKit, smiles);
  if (!canon) return { ok: false, error: "Starting SMILES is not valid in RDKit." };
  const scored = await scoreEvolvedMolecule({
    smiles: canon,
    parentSmiles: canon,
    referenceSmiles: canon,
    seedSmiles: canon,
    archiveSmiles: [canon],
    protein,
    RDKit,
    operator: "seed",
    editLabel: "Starting structure",
    editId: "seed",
    seedSimilarityFloor,
    protectedQuery,
  });
  if (!scored.ok) return scored;
  const keys = murckoKeys(RDKit, canon);
  return {
    ok: true,
    parent: {
      smiles: canon,
      name: name || "Starting molecule",
      generation: 0,
      editId: "seed",
      editLabel: "Starting structure",
      parentSmiles: null,
      delta: 0,
      bucket: keys.generic,
      operator: "seed",
      lineage: { parents: [], operator: "seed", label: "Starting structure" },
      rngSeed,
      ...scored,
    },
  };
}

export { tournamentSelect } from "./evolution/evolutionNsga2.js";

export function summarizeMultiRunRepeats(runSummaries) {
  const smilesRuns = new Map();
  for (const run of runSummaries || []) {
    for (const row of run.finals || []) {
      const smi = row.smiles;
      if (!smilesRuns.has(smi)) smilesRuns.set(smi, []);
      smilesRuns.get(smi).push({
        runIndex: run.runIndex,
        score: row.displayScore ?? row.score,
        seedSimilarity: row.seedSimilarity,
      });
    }
  }
  const recurring = [...smilesRuns.entries()]
    .filter(([, hits]) => hits.length > 1)
    .map(([smiles, hits]) => ({
      smiles,
      runCount: hits.length,
      runs: hits.map((h) => h.runIndex),
      scoreMean: hits.reduce((s, h) => s + Number(h.score || 0), 0) / hits.length,
      scoreMin: Math.min(...hits.map((h) => Number(h.score || 0))),
      scoreMax: Math.max(...hits.map((h) => Number(h.score || 0))),
    }))
    .sort((a, b) => b.runCount - a.runCount);

  const scoreSpread = (runSummaries || []).map((run) => {
    const scores = (run.finals || []).map((r) => Number(r.displayScore ?? r.score ?? 0));
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const variance = scores.length
      ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length
      : 0;
    return {
      runIndex: run.runIndex,
      rngSeed: run.rngSeed,
      best: scores.length ? Math.max(...scores) : 0,
      mean,
      stdev: Math.sqrt(variance),
    };
  });

  return { recurring, scoreSpread };
}

// Scoring is CPU-bound; give the event loop a turn after each progress update so it is
// streamed to the browser immediately instead of arriving with the final result.
const yieldToEventLoop = () =>
  new Promise((resolve) => (typeof setImmediate === "function" ? setImmediate(resolve) : setTimeout(resolve, 0)));

export async function runEvolutionCampaign({
  smiles,
  name,
  protein,
  settings: rawSettings,
  onProgress = () => {},
}) {
  const cfg = clampSettings(rawSettings || {});
  const RDKit = await getRDKit();
  if (!RDKit) return { ok: false, error: "RDKit WASM did not load." };

  const protectedQuery = resolveProtectedQuery(RDKit, canonicalizeSmiles(RDKit, smiles) || smiles, {
    protectedSmarts: cfg.protectedSmarts,
    protectedAtomIndices: cfg.protectedAtomIndices,
  });
  if (!protectedQuery.ok) return { ok: false, error: protectedQuery.error || "Protected substructure invalid" };

  const runSummaries = [];
  for (let run = 0; run < cfg.independentRuns; run += 1) {
    const runSeed = cfg.rngSeed + run * 9973;
    onProgress({ phase: "seed", run, runs: cfg.independentRuns });
    await yieldToEventLoop();
    const seeded = await seedParent({
      smiles,
      protein,
      name,
      rngSeed: runSeed,
      seedSimilarityFloor: cfg.seedSimilarityFloor,
      protectedQuery,
    });
    if (!seeded.ok) return seeded;

    const seen = new Set([seeded.parent.smiles]);
    const archiveSmiles = [seeded.parent.smiles];
    const globalScaffoldArchive = new Set([seeded.parent.bucket].filter(Boolean));
    let parents = [seeded.parent];
    const history = [
      {
        generation: 0,
        best: seeded.parent.displayScore ?? seeded.parent.score,
        average: seeded.parent.displayScore ?? seeded.parent.score,
        meanSeedSimilarity: 1,
        uniqueScaffoldsArchive: globalScaffoldArchive.size,
        painsAlerts: 0,
        valid: 1,
        discarded: 0,
      },
    ];
    let rescueNext = false;

    for (let g = 1; g <= cfg.generations; g += 1) {
      onProgress({ phase: "generation", run, runs: cfg.independentRuns, generation: g });
      await yieldToEventLoop();
      const result = await runEvolutionGeneration({
        parents,
        protein,
        referenceSmiles: seeded.parent.smiles,
        seedSmiles: seeded.parent.smiles,
        populationSmiles: parents.map((p) => p.smiles),
        archiveSmiles,
        seen,
        variantsPerGeneration: cfg.variantsPerGeneration,
        survivors: cfg.survivors,
        generationIndex: g,
        rescueBoost: rescueNext,
        rngSeed: runSeed,
        dockingBudgetPerGen: protein?.id ? cfg.dockingBudgetPerGen : 0,
        seedSimilarityFloor: cfg.seedSimilarityFloor,
        protectedQuery,
        diversityMethod: cfg.diversityMethod,
        globalScaffoldArchive,
      });
      if (!result.ok) return result;
      history.push(result.historyPoint);
      for (const s of result.survivors || []) archiveSmiles.push(s.smiles);
      rescueNext = Boolean(result.rescue);
      if (!result.survivors.length) break;
      parents = result.survivors;
    }

    const finals = parents
      .slice()
      .sort(
        (a, b) =>
          (a.rank ?? 99) - (b.rank ?? 99) ||
          (b.displayScore ?? b.score ?? 0) - (a.displayScore ?? a.score ?? 0)
      );

    runSummaries.push({
      runIndex: run,
      rngSeed: runSeed,
      seed: seeded.parent,
      history,
      finals,
      protectedQuery,
    });
  }

  const repeats = summarizeMultiRunRepeats(runSummaries);
  return {
    ok: true,
    settings: cfg,
    protectedQuery,
    runs: runSummaries,
    repeats,
    primaryRun: runSummaries[0],
  };
}
