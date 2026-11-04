import { getRDKit } from "../server/rdkitLoader";
import { scoreEvolvedMolecule } from "../server/evolutionScore";

/** Drug-like seeds that pass evolution hard gates (MW 180–600, heavy atoms 12–45). */
const SEEDS = [
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(C(C)C(=O)O)cc1" },
  { name: "Naproxen", smiles: "COc1ccc2cc(C(C)C(=O)O)ccc2c1" },
];

test("target-free seed scores span a usable range (not 18–22 band)", async () => {
  const RDKit = await getRDKit();
  const scores = [];
  for (const seed of SEEDS) {
    const r = await scoreEvolvedMolecule({
      smiles: seed.smiles,
      parentSmiles: seed.smiles,
      referenceSmiles: seed.smiles,
      protein: null,
      RDKit,
      operator: "seed",
    });
    expect(r.ok).toBe(true);
    const s = r.fitness?.displayScore ?? r.displayScore ?? r.score;
    expect(typeof s).toBe("number");
    scores.push(s);
    // eslint-disable-next-line no-console
    console.log(`[seed-score] ${seed.name}: ${s}`);
  }
  const spread = Math.max(...scores) - Math.min(...scores);
  expect(spread).toBeGreaterThan(8);
  for (const s of scores) {
    expect(s < 18 || s > 22).toBe(true);
  }
});
