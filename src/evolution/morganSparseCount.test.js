import { getRDKit } from "../rdkitLoader";
import { getSparseMorganCountFingerprint, sparseCountsToObject } from "../../server/evolution/morganSparseCount";

const CASES = {
  CCO: { 864662311: 1, 1535166686: 1, 2245384272: 1, 2246728737: 1, 3542456614: 1, 4018048386: 1 },
  c1ccccc1: { 98513984: 6, 2763854213: 6, 3218693969: 6 },
};

test.skip("sparse Morgan counts match RDKit Python reference (sample)", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  for (const [smi, expected] of Object.entries(CASES)) {
    const mol = RDKit.get_mol(smi);
    const got = sparseCountsToObject(getSparseMorganCountFingerprint(mol, 2));
    mol.delete();
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      // eslint-disable-next-line no-console
      console.log(smi, { got, expected });
    }
    expect(got).toEqual(expected);
  }
});
