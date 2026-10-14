import { loadBrenkPatterns, getLoadedBrenkPatternCount } from "./brenkAlerts";

test("Brenk catalog loads ~105 RDKit patterns", async () => {
  const patterns = await loadBrenkPatterns();
  expect(patterns.length).toBeGreaterThanOrEqual(95);
  expect(getLoadedBrenkPatternCount()).toBe(patterns.length);
});
