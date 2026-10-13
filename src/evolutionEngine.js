import { getRDKit } from "./rdkitLoader";
import { canonicalizeSmiles, generateOffspring, detectReactionSupport } from "./evolutionTransforms";
import { scoreEvolvedMolecule } from "./evolutionScore";
import { selectSurvivorsMuPlusLambda, tournamentSelect } from "./evolution/evolutionNsga2";
import { murckoKeys, applyScaffoldQuota } from "./evolution/evolutionScaffold";
import { collapseMetrics, needsDiversityRescue } from "./evolution/evolutionCollapse";

export const DEFAULT_EVOLUTION_SETTINGS = {
  generations: 5,
  variantsPerGeneration: 20,
  survivors: 5,
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
  return { generations, variantsPerGeneration, survivors };
}

function objectiveVector(row, targetFree) {
  const qed = row.qed ?? 0;
  const sa = row.saScore ?? 5;
  const nov = row.novelty ?? 0;
  const alerts = (row.fitness?.desirabilities?.d_alerts ?? 1) < 0.5 ? 2 : 0;
  const le = row.le ?? 0;
  if (targetFree) {
    return [-qed, sa, alerts, -nov];
  }
  return [-le, -qed, sa, alerts, -nov];
}

export async function runEvolutionGeneration({
  parents,
  protein,
  referenceSmiles,
  archiveSmiles,
  seen,
  variantsPerGeneration,
  survivors,
  generationIndex,
  rescueBoost = false,
}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const RDKit = await getRDKit();
  if (!RDKit) {
    return { ok: false, error: "RDKit WASM did not load. Evolution cannot generate valid structures without it.", ms: 0 };
  }

  const targetFree = !protein?.id;
  const discarded = { parseFail: 0, duplicate: 0, gated: 0 };
  const offspringLimit = rescueBoost ? Math.ceil(variantsPerGeneration * 1.5) : variantsPerGeneration;
  const bucketMap = true;
  const produced = generateOffspring(RDKit, parents, { seen, limit: offspringLimit, bucketMap });
  discarded.parseFail += produced.discarded.parseFail;
  discarded.duplicate += produced.discarded.duplicate;

  const pool = [];
  for (const variant of produced.variants) {
    const scored = await scoreEvolvedMolecule({
      smiles: variant.smiles,
      parentSmiles: variant.parentSmiles,
      parentSmilesB: variant.parentSmilesB,
      referenceSmiles: referenceSmiles || variant.parentSmiles,
      archiveSmiles,
      protein,
      RDKit,
      operator: variant.operator,
      editId: variant.editId,
      editLabel: variant.editLabel,
    });
    if (!scored.ok) {
      if (scored.gated) discarded.gated += 1;
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

  const combined = [...parents, ...pool];
  const objectives = combined.map((row) => objectiveVector(row, targetFree));
  let ranked = selectSurvivorsMuPlusLambda(combined, objectives, survivors);
  ranked = applyScaffoldQuota(ranked, 0.25);

  const elites = parents.slice(0, Math.min(2, parents.length));
  for (const e of elites) {
    if (!ranked.find((r) => r.smiles === e.smiles)) ranked.unshift(e);
  }
  ranked = ranked.slice(0, survivors);

  const metrics = collapseMetrics({
    population: ranked,
    buckets: ranked.map((r) => r.bucket),
    seedSmiles: referenceSmiles,
    RDKit,
  });
  const rescue = needsDiversityRescue(metrics);

  const best = ranked[0]?.displayScore ?? ranked[0]?.score ?? 0;
  const avg = ranked.length ? ranked.reduce((s, r) => s + (r.displayScore || r.score || 0), 0) / ranked.length : 0;
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
    historyPoint: {
      generation: generationIndex,
      best: Number(best.toFixed(1)),
      average: Number(avg.toFixed(1)),
      valid: pool.length,
      discarded: discarded.parseFail + discarded.duplicate + discarded.gated,
      diversity: metrics.diversity,
      scaffolds: metrics.distinctScaffolds,
    },
    ms: Math.round(ended - started),
  };
}

export async function seedParent({ smiles, protein, name }) {
  const RDKit = await getRDKit();
  const canon = canonicalizeSmiles(RDKit, smiles);
  if (!canon) return { ok: false, error: "Starting SMILES is not valid in RDKit." };
  const scored = await scoreEvolvedMolecule({
    smiles: canon,
    parentSmiles: canon,
    referenceSmiles: canon,
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
      ...scored,
    },
  };
}

export { tournamentSelect };
