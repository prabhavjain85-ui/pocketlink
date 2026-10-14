import { getRDKit } from "../rdkitLoader";
import { calculateSaScore, normalizeMolForSa, preloadSaAssets } from "./saScorer";

test("SA score is unchanged after explicit hydrogens are stripped", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  await preloadSaAssets();
  const heavy = "CC(=O)Nc1ccc(O)cc1";
  const plain = await calculateSaScore(RDKit, heavy);
  expect(plain.ok).toBe(true);

  const withHs = RDKit.get_mol(heavy);
  withHs.add_hs();
  const explicit = await calculateSaScore(RDKit, withHs);
  withHs.delete();

  expect(explicit.ok).toBe(true);
  expect(explicit.saScore).toBe(plain.saScore);

  const norm = normalizeMolForSa(RDKit, heavy);
  expect(norm).toBeTruthy();
  const fromNorm = await calculateSaScore(RDKit, norm);
  norm.delete();
  expect(fromNorm.saScore).toBe(plain.saScore);
});
