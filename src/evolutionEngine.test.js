import { clampSettings, DEFAULT_EVOLUTION_SETTINGS } from "../server/evolutionEngine";
import { EVOLUTION_TRANSFORMS } from "../server/evolutionTransforms";
import { manifestStats } from "../server/evolution/transformManifest";
import { evolutionCacheKey } from "../server/evolutionScore";

test("default settings stay in the documented band", () => {
  expect(DEFAULT_EVOLUTION_SETTINGS).toEqual({
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
  });
  expect(clampSettings({ generations: 99, variantsPerGeneration: 1, survivors: 0 })).toEqual({
    generations: 8,
    variantsPerGeneration: 4,
    survivors: 1,
    rngSeed: 42,
    dockingBudgetPerGen: 8,
    seedSimilarityFloor: 0.4,
    independentRuns: 5,
    diversityMethod: "maxmin",
    protectedSmarts: "",
    protectedAtomIndices: [],
  });
});

test("transform catalog is curated SMARTS, not model text", () => {
  const stats = manifestStats();
  expect(stats.distinctSmarts).toBeGreaterThanOrEqual(35);
  expect(stats.total).toBe(stats.distinctSmarts);
  expect(EVOLUTION_TRANSFORMS.length).toBeGreaterThan(8);
  for (const row of EVOLUTION_TRANSFORMS) {
    expect(row.smarts).toContain(">>");
    expect(row.id).toBeTruthy();
  }
});

test("cache key is pdb + canonical smiles", () => {
  expect(evolutionCacheKey("1iep", "CCO")).toBe("1IEP_CCO");
});
