import { runRediscoveryBenchmark } from "./evolutionRediscovery";

jest.setTimeout(600000);

const smoke = process.env.REDISCOVERY_FULL !== "1";

test("ChEMBL held-out rediscovery vs random-null baseline", async () => {
  const baseline = await runRediscoveryBenchmark({ smoke });
  expect(baseline.ok).toBe(true);
  expect(baseline.summary.nTrials).toBeGreaterThan(0);
  // eslint-disable-next-line no-console
  console.log("REDISCOVERY_BENCHMARK", JSON.stringify(baseline, null, 2));
  expect(baseline.thresholds.heldOutHitTanimoto).toBe(0.55);
});

const runLigand = process.env.REDISCOVERY_LIGAND === "1";
(runLigand ? test : test.skip)(
  "optional ligand-based hypothesis term (compare enrichment)",
  async () => {
    const smokeLig = process.env.REDISCOVERY_FULL !== "1";
    const baseline = await runRediscoveryBenchmark({ smoke: smokeLig, ligandHypothesis: false });
    const withLigand = await runRediscoveryBenchmark({ smoke: smokeLig, ligandHypothesis: true });
    const ligandHelps =
      withLigand.summary.meanEnrichment != null &&
      baseline.summary.meanEnrichment != null &&
      withLigand.summary.meanEnrichment > baseline.summary.meanEnrichment &&
      (withLigand.summary.ci95?.[0] ?? -Infinity) > 0;
    // eslint-disable-next-line no-console
    console.log(
      "REDISCOVERY_LIGAND_DECISION",
      JSON.stringify({ ligandHelps, baseline: baseline.summary, withLigand: withLigand.summary })
    );
    expect(withLigand.ok).toBe(true);
  }
);
