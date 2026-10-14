import { getRDKit } from "./rdkitLoader";
import { canonicalizeSmiles, generateOffspring, detectReactionSupport } from "./evolutionTransforms";
import { scoreEvolvedMolecule, trainSurrogateFromDocked } from "./evolutionScore";
import { selectSurvivorsMuPlusLambda } from "./evolution/evolutionNsga2";
import { murckoKeys, applyScaffoldQuota, mergeElites } from "./evolution/evolutionScaffold";
import { collapseMetrics, needsDiversityRescue } from "./evolution/evolutionCollapse";
import { mulberry32 } from "./evolution/evolutionRng";
import {
  selectDockingCandidates,
  dockBatchForTarget,
  ligandEfficiency,
  getCachedAffinity,
} from "./evolution/evolutionDocking";
import { pdbIdOf } from "./rankingCache";
import { morganUint8 } from "./evolution/evolutionFingerprint";

export const DEFAULT_EVOLUTION_SETTINGS = {
  generations: 5,
  variantsPerGeneration: 20,
  survivors: 5,
  rngSeed: 42,
  dockingBudgetPerGen: 8,
  seedSimilarityFloor: 0.3,
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
    : 0.3;
  return { generations, variantsPerGeneration, survivors, rngSeed, dockingBudgetPerGen, seedSimilarityFloor };
}

function objectiveVector(row, targetFree, seedSimilarityFloor = 0.3) {
  const qed = row.qed ?? 0;
  const sa = row.saScore ?? 5;
  const nov = row.novelty ?? 0;
  const alerts = (row.fitness?.desirabilities?.d_alerts ?? 1) < 0.5 ? 2 : 0;
  const tanSeed = row.maxTanSeed ?? 0;
  if (targetFree) {
    const seedPenalty = tanSeed < seedSimilarityFloor ? 1 : 0;
    return [-qed, sa, alerts, -nov, -tanSeed, seedPenalty];
  }
  const le = row.leMeasured ?? row.le;
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
  seedSimilarityFloor = 0.3,
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
      });
      const idx = pool.findIndex((p) => p.smiles === row.smiles);
      if (idx >= 0 && rescored.ok) pool[idx] = { ...pool[idx], ...rescored };
    }
    if (trainRows.length) trainSurrogateFromDocked(pdb, trainRows);
    dockingMeta.docked = trainRows.length;
  }

  const combined = [...parents, ...pool];
  const objectives = combined.map((row) => objectiveVector(row, targetFree, seedSimilarityFloor));
  let ranked = selectSurvivorsMuPlusLambda(combined, objectives, combined.length);
  ranked = applyScaffoldQuota(ranked, survivors, 0.25);
  const globalBest = combined.reduce(
    (best, row) => ((row.displayScore ?? row.score ?? 0) > (best?.displayScore ?? best?.score ?? -1) ? row : best),
    null
  );
  ranked = mergeElites(ranked, parents, survivors, {
    seedSmiles: seedSmiles || referenceSmiles,
    globalBestSmiles: globalBest?.smiles ? [globalBest.smiles] : [],
  });

  const metrics = collapseMetrics({
    population: ranked,
    buckets: ranked.map((r) => r.bucket),
    seedSmiles: seedSmiles || referenceSmiles,
    RDKit,
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
    },
    ms: Math.round(ended - started),
  };
}

export async function seedParent({ smiles, protein, name, rngSeed = 42 }) {
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

export { tournamentSelect } from "./evolution/evolutionNsga2";
