import { clampSettings, DEFAULT_EVOLUTION_SETTINGS } from "./evolutionEngine";
import { EVOLUTION_TRANSFORMS, evolutionTransformStats } from "./evolutionTransforms";
import { manifestStats } from "./evolution/transformManifest";
import { evolutionCacheKey } from "./evolutionScore";

test("default settings stay in the documented band", () => {
  expect(DEFAULT_EVOLUTION_SETTINGS).toEqual({
    generations: 5,
    variantsPerGeneration: 20,
    survivors: 5,
    rngSeed: 42,
    dockingBudgetPerGen: 8,
    seedSimilarityFloor: 0.3,
  });
  expect(clampSettings({ generations: 99, variantsPerGeneration: 1, survivors: 0 })).toEqual({
    generations: 8,
    variantsPerGeneration: 4,
    survivors: 1,
    rngSeed: 42,
    dockingBudgetPerGen: 8,
    seedSimilarityFloor: 0.3,
  });
});

test("transform catalog is curated SMARTS, not model text", () => {
  const stats = manifestStats();
  expect(stats.distinctSmarts).toBeGreaterThanOrEqual(35);
  expect(stats.total).toBe(stats.distinctSmarts);
  const joined = evolutionTransformStats();
  expect(joined.distinctSmarts).toBe(joined.total);
  expect(EVOLUTION_TRANSFORMS.length).toBeGreaterThan(8);
  for (const row of EVOLUTION_TRANSFORMS) {
    expect(row.smarts).toContain(">>");
    expect(row.id).toBeTruthy();
  }
});

test("cache key is pdb + canonical smiles", () => {
  expect(evolutionCacheKey("1iep", "CCO")).toBe("1IEP_CCO");
});
