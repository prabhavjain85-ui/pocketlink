import { getRDKit } from "../rdkitLoader";
import { maxMinPick } from "../../server/evolution/evolutionDiversity";

test("maxMin pick returns diverse smiles", async () => {
  const RDKit = await getRDKit();
  const candidates = [
    { smiles: "c1ccccc1" },
    { smiles: "c1ccccc1O" },
    { smiles: "C1CCCCC1" },
    { smiles: "CC(=O)O" },
  ];
  const picked = maxMinPick(RDKit, candidates, 2, { rng: () => 0.1 });
  expect(picked.length).toBe(2);
  expect(new Set(picked.map((p) => p.smiles)).size).toBe(2);
});
