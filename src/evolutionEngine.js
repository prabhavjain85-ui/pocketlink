import { getRDKit } from "./rdkitLoader";
import { generateValidatedVariants, canonicalizeSmiles } from "./evolutionTransforms";
import { scoreEvolvedMolecule } from "./evolutionScore";

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

export async function runEvolutionGeneration({
  parents,
  protein,
  referenceSmiles,
  seen,
  variantsPerGeneration,
  survivors,
  generationIndex,
}) {
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const RDKit = await getRDKit();
  if (!RDKit) {
    return {
      ok: false,
      error: "RDKit WASM did not load. Evolution cannot generate valid structures without it.",
      ms: 0,
    };
  }

  const discarded = { parseFail: 0, duplicate: 0 };
  const pool = [];
  let reactionSupport = null;

  for (const parent of parents) {
    const produced = generateValidatedVariants(RDKit, parent.smiles, {
      seen,
      limit: variantsPerGeneration,
    });
    reactionSupport = produced.reactionSupport;
    discarded.parseFail += produced.discarded.parseFail;
    discarded.duplicate += produced.discarded.duplicate;
    for (const variant of produced.variants) {
      const scored = await scoreEvolvedMolecule({
        smiles: variant.smiles,
        parentSmiles: parent.smiles,
        referenceSmiles: referenceSmiles || parent.smiles,
        protein,
        RDKit,
      });
      if (!scored.ok) {
        discarded.parseFail += 1;
        continue;
      }
      pool.push({
        ...variant,
        ...scored,
        generation: generationIndex,
        parentScore: parent.score ?? null,
        delta: Number(scored.score) - Number(parent.score ?? scored.score),
      });
    }
  }

  pool.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.smiles).localeCompare(String(b.smiles)));
  const kept = pool.slice(0, survivors);
  const best = kept[0]?.score ?? parents[0]?.score ?? 0;
  const avg = pool.length
    ? pool.reduce((sum, row) => sum + (row.score || 0), 0) / pool.length
    : parents[0]?.score ?? 0;
  const ended = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    ok: true,
    generation: generationIndex,
    valid: pool.length,
    discarded,
    discardedTotal: discarded.parseFail + discarded.duplicate,
    reactionSupport,
    population: pool,
    survivors: kept,
    historyPoint: {
      generation: generationIndex,
      best: Number(best.toFixed(1)),
      average: Number(avg.toFixed(1)),
      valid: pool.length,
      discarded: discarded.parseFail + discarded.duplicate,
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
    protein,
    RDKit,
  });
  if (!scored.ok) return scored;
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
      ...scored,
    },
  };
}
