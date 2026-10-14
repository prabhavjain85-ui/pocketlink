import { bootstrapEnrichmentCi } from "./bootstrapEnrichment";
import { REDISCOVERY_CLUSTER_TANIMOTO } from "./evolutionRediscoveryPanel";
import { getRDKit } from "../rdkitLoader";
import { filterReferenceActives } from "./evolutionRediscovery";

test("bootstrap enrichment CI on synthetic trials", () => {
  const trials = [
    { hitRateEvolution: 0.2, hitRateNull: 0.1 },
    { hitRateEvolution: 0.1, hitRateNull: 0.15 },
    { hitRateEvolution: 0.05, hitRateNull: 0.05 },
  ];
  const s = bootstrapEnrichmentCi(trials, { nBoot: 500, seed: 1 });
  expect(s.nTrials).toBe(3);
  expect(s.meanEnrichment).toBeCloseTo(0.016666, 2);
  expect(s.ci95[0]).toBeLessThanOrEqual(s.meanEnrichment);
  expect(s.ci95[1]).toBeGreaterThanOrEqual(s.meanEnrichment);
});

test("cluster filter removes near-duplicate train actives", async () => {
  const RDKit = await getRDKit();
  const seed = "CCO";
  const train = [
    { chembl_id: "A", smiles: "CCO" },
    { chembl_id: "B", smiles: "CCO" },
    { chembl_id: "C", smiles: "c1ccccc1" },
  ];
  const refs = filterReferenceActives(RDKit, seed, train, REDISCOVERY_CLUSTER_TANIMOTO);
  expect(refs.map((r) => r.chembl_id)).toEqual(["C"]);
});
