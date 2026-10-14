import { getRDKit } from "../rdkitLoader";
import { scoreEvolutionBatch } from "../evolutionScore";

test("batch scoring path matches worker loop", async () => {
  const RDKit = await getRDKit();
  const variants = [
    {
      smiles: "CC(=O)Oc1ccccc1C(=O)O",
      parentSmiles: "CC(=O)Oc1ccccc1C(=O)O",
      operator: "mutation",
    },
  ];
  const results = await scoreEvolutionBatch(variants, {
    protein: null,
    seedSmiles: variants[0].smiles,
    referenceSmiles: variants[0].smiles,
    RDKit,
  });
  expect(results).toHaveLength(1);
  expect(results[0].ok).toBe(true);
  expect(results[0].qed).toBeGreaterThan(0);
});
