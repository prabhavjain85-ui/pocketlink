/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

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

export function clampInt(raw, fallback, min, max) {
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
