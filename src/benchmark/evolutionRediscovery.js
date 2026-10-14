import { getRDKit } from "../rdkitLoader";
import { canonicalizeSmiles } from "../evolutionTransforms";
import { maxTanimotoToSet, seedTanimoto } from "../evolution/evolutionFingerprint";
import {
  runEvolutionCampaign,
  seedParent,
  runEvolutionGeneration,
  clampSettings,
} from "../evolutionEngine";
import { clearEvolutionScoreCache } from "../evolutionScore";
import { resolveProtectedQuery } from "../evolution/evolutionProtected";
import {
  REDISCOVERY_CLUSTER_TANIMOTO,
  REDISCOVERY_HIT_TANIMOTO,
  listRediscoveryTargets,
} from "./evolutionRediscoveryPanel";
import { bootstrapEnrichmentCi } from "./bootstrapEnrichment";

export const DEFAULT_REDISCOVERY_SETTINGS = {
  generations: 4,
  variantsPerGeneration: 16,
  survivors: 4,
  rngSeed: 42,
  independentRuns: 1,
  seedSimilarityFloor: 0.4,
  dockingBudgetPerGen: 0,
  diversityMethod: "maxmin",
};

export function filterReferenceActives(RDKit, seedSmiles, trainActives, clusterTan = REDISCOVERY_CLUSTER_TANIMOTO) {
  const seed = canonicalizeSmiles(RDKit, seedSmiles);
  if (!seed) return [];
  return trainActives
    .map((row) => ({
      ...row,
      smiles: canonicalizeSmiles(RDKit, row.smiles) || row.smiles,
    }))
    .filter((row) => {
      if (!row.smiles || row.smiles === seed) return false;
      const tan = seedTanimoto(RDKit, row.smiles, seed);
      return tan <= clusterTan;
    });
}

export function countHeldOutHits(RDKit, generatedSmiles, heldOutSmiles, hitTan = REDISCOVERY_HIT_TANIMOTO) {
  const held = [...new Set(heldOutSmiles.map((s) => canonicalizeSmiles(RDKit, s) || s).filter(Boolean))];
  let uniqueHits = 0;
  const hitPairs = [];
  for (const smi of generatedSmiles) {
    const canon = canonicalizeSmiles(RDKit, smi) || smi;
    if (!canon) continue;
    const maxTan = maxTanimotoToSet(RDKit, canon, held);
    if (maxTan >= hitTan) {
      uniqueHits += 1;
      hitPairs.push({ smiles: canon, maxTanHeldOut: maxTan });
    }
  }
  return { uniqueHits, hitPairs };
}

async function runSingleSeedTrial({
  targetRow,
  seedRow,
  settings,
  selectionMode,
  ligandHypothesis = false,
  referenceActiveSmiles = [],
}) {
  const RDKit = await getRDKit();
  const cfg = clampSettings(settings);
  const seedCanon = canonicalizeSmiles(RDKit, seedRow.smiles);
  if (!seedCanon) {
    return { ok: false, error: "Invalid seed SMILES" };
  }

  const heldOut = (targetRow.test_actives || []).map((r) => r.smiles);
  const refFiltered = filterReferenceActives(RDKit, seedCanon, targetRow.train_actives || []);

  const protectedQuery = resolveProtectedQuery(RDKit, seedCanon, {});
  if (!protectedQuery.ok) return { ok: false, error: protectedQuery.error };

  const runSeed = cfg.rngSeed;
  const seeded = await seedParent({
    smiles: seedCanon,
    protein: null,
    name: seedRow.chembl_id,
    rngSeed: runSeed,
    seedSimilarityFloor: cfg.seedSimilarityFloor,
    protectedQuery,
  });
  if (!seeded.ok) return seeded;

  const seen = new Set([seeded.parent.smiles]);
  const archiveSmiles = [seeded.parent.smiles];
  const generatedUnique = new Set();
  let parents = [seeded.parent];
  const globalScaffoldArchive = new Set([seeded.parent.bucket].filter(Boolean));

  const scoreCtxExtra = ligandHypothesis
    ? { referenceActiveSmiles: refFiltered.map((r) => r.smiles) }
    : {};

  for (let g = 1; g <= cfg.generations; g += 1) {
    const result = await runEvolutionGeneration({
      parents,
      protein: null,
      referenceSmiles: seeded.parent.smiles,
      seedSmiles: seeded.parent.smiles,
      populationSmiles: parents.map((p) => p.smiles),
      archiveSmiles,
      seen,
      variantsPerGeneration: cfg.variantsPerGeneration,
      survivors: cfg.survivors,
      generationIndex: g,
      rngSeed: runSeed,
      dockingBudgetPerGen: 0,
      seedSimilarityFloor: cfg.seedSimilarityFloor,
      protectedQuery,
      diversityMethod: cfg.diversityMethod,
      globalScaffoldArchive,
      selectionMode,
      scoreCtxExtra,
    });
    if (!result.ok) return result;
    for (const row of result.population || []) {
      if (row.smiles && row.smiles !== seeded.parent.smiles) generatedUnique.add(row.smiles);
    }
    for (const s of result.survivors || []) archiveSmiles.push(s.smiles);
    if (!result.survivors?.length) break;
    parents = result.survivors;
  }

  const generatedList = [...generatedUnique];
  const { uniqueHits, hitPairs } = countHeldOutHits(RDKit, generatedList, heldOut);
  const nGenerated = generatedList.length;
  const hitRate = nGenerated ? uniqueHits / nGenerated : 0;

  clearEvolutionScoreCache();

  return {
    ok: true,
    targetId: targetRow.target_id,
    seedChemblId: seedRow.chembl_id,
    seedSmiles: seedCanon,
    nReferenceActives: refFiltered.length,
    nHeldOutActives: heldOut.length,
    nGenerated,
    uniqueHits,
    hitRate,
    hitPairs,
    selectionMode,
    ligandHypothesis,
  };
}

/**
 * Run evolution vs random-null rediscovery benchmark across train seeds.
 * @param {{ settings?: object, smoke?: boolean, ligandHypothesis?: boolean }} opts
 */
export async function runRediscoveryBenchmark(opts = {}) {
  const smoke = Boolean(opts.smoke);
  const settings = {
    ...DEFAULT_REDISCOVERY_SETTINGS,
    ...(opts.settings || {}),
  };
  if (smoke) {
    settings.generations = 2;
    settings.variantsPerGeneration = 10;
    settings.survivors = 3;
  }

  const targets = listRediscoveryTargets(6);
  if (!targets.length) {
    return {
      ok: false,
      error: "No targets with sufficient held-out actives in fixture.",
      thresholds: {
        clusterExclude: REDISCOVERY_CLUSTER_TANIMOTO,
        heldOutHit: REDISCOVERY_HIT_TANIMOTO,
      },
    };
  }

  const evolutionTrials = [];
  const nullTrials = [];

  for (const targetRow of targets) {
    const seeds = smoke ? [targetRow.train_actives[0]] : targetRow.train_actives;
    for (let i = 0; i < seeds.length; i += 1) {
      const seedRow = seeds[i];
      const seedOffset = settings.rngSeed + i * 131;
      const evo = await runSingleSeedTrial({
        targetRow,
        seedRow,
        settings: { ...settings, rngSeed: seedOffset },
        selectionMode: "nsga",
        ligandHypothesis: Boolean(opts.ligandHypothesis),
      });
      const nul = await runSingleSeedTrial({
        targetRow,
        seedRow,
        settings: { ...settings, rngSeed: seedOffset },
        selectionMode: "random",
        ligandHypothesis: Boolean(opts.ligandHypothesis),
      });
      if (evo.ok) evolutionTrials.push(evo);
      if (nul.ok) nullTrials.push(nul);
    }
  }

  const paired = [];
  const nullByKey = new Map(nullTrials.map((t) => [`${t.targetId}:${t.seedChemblId}`, t]));
  for (const evo of evolutionTrials) {
    const nul = nullByKey.get(`${evo.targetId}:${evo.seedChemblId}`);
    if (!nul) continue;
    paired.push({
      targetId: evo.targetId,
      seedChemblId: evo.seedChemblId,
      hitRateEvolution: evo.hitRate,
      hitRateNull: nul.hitRate,
      uniqueHitsEvolution: evo.uniqueHits,
      uniqueHitsNull: nul.uniqueHits,
      nGeneratedEvolution: evo.nGenerated,
      nGeneratedNull: nul.nGenerated,
    });
  }

  const summary = bootstrapEnrichmentCi(
    paired.map((p) => ({ hitRateEvolution: p.hitRateEvolution, hitRateNull: p.hitRateNull })),
    { nBoot: 2000, seed: settings.rngSeed }
  );

  const byTarget = {};
  for (const p of paired) {
    if (!byTarget[p.targetId]) byTarget[p.targetId] = [];
    byTarget[p.targetId].push(p);
  }
  const perTarget = Object.entries(byTarget).map(([targetId, rows]) => {
    const s = bootstrapEnrichmentCi(
      rows.map((r) => ({ hitRateEvolution: r.hitRateEvolution, hitRateNull: r.hitRateNull })),
      { nBoot: 2000, seed: settings.rngSeed + targetId.length }
    );
    return { targetId, nSeeds: rows.length, ...s };
  });

  return {
    ok: true,
    settings,
    smoke,
    ligandHypothesis: Boolean(opts.ligandHypothesis),
    thresholds: {
      clusterExcludeTanimoto: REDISCOVERY_CLUSTER_TANIMOTO,
      heldOutHitTanimoto: REDISCOVERY_HIT_TANIMOTO,
    },
    targets: targets.map((t) => ({
      target_id: t.target_id,
      n_train_seeds: smoke ? 1 : (t.train_actives || []).length,
      n_test_actives: (t.test_actives || []).length,
    })),
    pairedTrials: paired,
    summary,
    perTarget,
  };
}

/** Convenience: run campaign API for a single ChEMBL seed (used in docs/tests). */
export async function runRediscoveryEvolutionCampaign(seedSmiles, settings) {
  return runEvolutionCampaign({
    smiles: seedSmiles,
    protein: null,
    settings: { ...DEFAULT_REDISCOVERY_SETTINGS, ...settings, dockingBudgetPerGen: 0 },
  });
}
