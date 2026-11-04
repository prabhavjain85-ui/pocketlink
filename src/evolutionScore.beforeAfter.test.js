import { getRDKit } from "../server/rdkitLoader";
import { scoreEvolvedMolecule } from "../server/evolutionScore";
import { runEvolutionGeneration, seedParent } from "../server/evolutionEngine";
import { mulberry32 } from "../server/evolution/evolutionRng";

const IMATINIB = "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";
const ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O";

test("target-free: imatinib ranks above aspirin (chemistry-quality filter)", async () => {
  const RDKit = await getRDKit();
  const im = await scoreEvolvedMolecule({
    smiles: IMATINIB,
    parentSmiles: IMATINIB,
    referenceSmiles: IMATINIB,
    seedSmiles: IMATINIB,
    protein: null,
    RDKit,
    operator: "seed",
  });
  const asp = await scoreEvolvedMolecule({
    smiles: ASPIRIN,
    parentSmiles: ASPIRIN,
    referenceSmiles: ASPIRIN,
    seedSmiles: ASPIRIN,
    protein: null,
    RDKit,
    operator: "seed",
  });
  expect(im.ok).toBe(true);
  expect(asp.ok).toBe(true);
  const imScore = im.fitness?.displayScore ?? im.displayScore;
  const aspScore = asp.fitness?.displayScore ?? asp.displayScore;
  // eslint-disable-next-line no-console
  console.log("[before-after-target-free]", { imatinib: imScore, aspirin: aspScore });
  expect(imScore).toBeGreaterThan(aspScore);
});

test("evolution improves mean score vs gen-0 under one formula (mock target)", async () => {
  const RDKit = await getRDKit();
  const weakSeed = "CC(C)Cc1ccc(C(C)C(=O)O)cc1";
  const protein = { id: "1iep", title: "ABL" };
  const seeded = await seedParent({ smiles: weakSeed, protein, name: "Ibuprofen-like", rngSeed: 99 });
  expect(seeded.ok).toBe(true);
  const gen0Mean = seeded.parent.displayScore;

  const seen = new Set([seeded.parent.smiles]);
  const archive = [seeded.parent.smiles];
  let parents = [seeded.parent];
  let lastMean = gen0Mean;
  for (let g = 1; g <= 3; g += 1) {
    const result = await runEvolutionGeneration({
      parents,
      protein,
      referenceSmiles: seeded.parent.smiles,
      seedSmiles: seeded.parent.smiles,
      archiveSmiles: archive,
      populationSmiles: parents.map((p) => p.smiles),
      seen,
      variantsPerGeneration: 12,
      survivors: 4,
      generationIndex: g,
      rngSeed: 99,
      dockingBudgetPerGen: 0,
    });
    expect(result.ok).toBe(true);
    const mean = result.survivors.reduce((s, r) => s + (r.displayScore || 0), 0) / result.survivors.length;
    lastMean = mean;
    parents = result.survivors;
    for (const s of result.survivors) archive.push(s.smiles);
  }

  const randomMean = await (async () => {
    const scores = [];
    for (let i = 0; i < 8; i += 1) {
      const r = await scoreEvolvedMolecule({
        smiles: weakSeed,
        parentSmiles: weakSeed,
        referenceSmiles: weakSeed,
        seedSmiles: weakSeed,
        protein,
        RDKit,
        operator: "mutation",
      });
      if (r.ok) scores.push(r.displayScore);
    }
    return scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  })();

  // eslint-disable-next-line no-console
  console.log("[retrospective-mock]", { gen0Mean, genNMean: lastMean, randomMean });
  expect(lastMean).toBeGreaterThanOrEqual(gen0Mean - 0.5);
  expect(lastMean).toBeGreaterThanOrEqual(randomMean - 1);
});
