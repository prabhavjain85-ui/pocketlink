import { runEvolutionCampaign } from "../../server/evolutionEngine";

jest.setTimeout(180000);

test("seeded imatinib campaign reports generation metrics", async () => {
  const IMATINIB =
    "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";
  const result = await runEvolutionCampaign({
    smiles: IMATINIB,
    name: "Imatinib",
    protein: null,
    settings: {
      generations: 3,
      variantsPerGeneration: 12,
      survivors: 4,
      rngSeed: 42,
      independentRuns: 1,
      seedSimilarityFloor: 0.4,
      dockingBudgetPerGen: 0,
    },
  });
  expect(result.ok).toBe(true);
  const history = result.primaryRun.history;
  expect(history.length).toBeGreaterThan(1);
  for (const row of history) {
    expect(row.meanSeedSimilarity).toBeGreaterThanOrEqual(0);
    expect(row.uniqueScaffoldsArchive).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(row.painsAlerts)).toBe(true);
  }
  // eslint-disable-next-line no-console
  console.log(
    "GENERATION_METRICS",
    JSON.stringify(
      history.map((h) => ({
        generation: h.generation,
        meanSeedSimilarity: h.meanSeedSimilarity,
        uniqueScaffoldsArchive: h.uniqueScaffoldsArchive,
        painsAlerts: h.painsAlerts,
        best: h.best,
      }))
    )
  );
});
