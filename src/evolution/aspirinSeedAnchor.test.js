import { getRDKit } from "../rdkitLoader";
import { runEvolutionGeneration, seedParent } from "../evolutionEngine";

const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";
const SALICYLATE_SMARTS = "O=C(O)c1ccccc1O";

test("target-free aspirin evolution keeps salicylate-related survivors", async () => {
  const RDKit = await getRDKit();
  const seeded = await seedParent({ smiles: ASPIRIN, protein: null, name: "Aspirin", rngSeed: 7 });
  expect(seeded.ok).toBe(true);
  const seen = new Set([seeded.parent.smiles]);
  let parents = [seeded.parent];
  for (let g = 1; g <= 3; g += 1) {
    const result = await runEvolutionGeneration({
      parents,
      protein: null,
      referenceSmiles: ASPIRIN,
      seedSmiles: ASPIRIN,
      archiveSmiles: [ASPIRIN],
      populationSmiles: parents.map((p) => p.smiles),
      seen,
      variantsPerGeneration: 16,
      survivors: 5,
      generationIndex: g,
      rngSeed: 7,
      dockingBudgetPerGen: 0,
      seedSimilarityFloor: 0.3,
    });
    expect(result.ok).toBe(true);
    parents = result.survivors;
  }

  const q = RDKit.get_qmol(SALICYLATE_SMARTS);
  const related = parents.filter((p) => {
    const mol = RDKit.get_mol(p.smiles);
    if (!mol) return false;
    try {
      const m = mol.get_substruct_match(q);
      return Boolean(m && (typeof m !== "object" || Object.keys(m).length));
    } finally {
      mol.delete();
    }
  });
  q.delete();

  // eslint-disable-next-line no-console
  console.log(
    "[aspirin-survivors]",
    parents.map((p) => ({ smiles: p.smiles, tan: p.maxTanSeed, score: p.displayScore }))
  );

  expect(parents.some((p) => (p.maxTanSeed ?? 0) >= 0.3)).toBe(true);
  expect(related.length).toBeGreaterThan(0);
});
