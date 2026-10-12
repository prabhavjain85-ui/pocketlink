const { rankCandidatesLocal } = require("../scoreCandidates");

test("strictSimilarity throws when similarityByCid is missing", () => {
  expect(() =>
    rankCandidatesLocal(
      [
        { cid: "a", IsomericSMILES: "CCO", MolecularWeight: 46 },
        { cid: "b", IsomericSMILES: "CCC", MolecularWeight: 44 },
      ],
      { pdb_id: "4A5S", id: "4A5S" },
      {
        rankMode: "similarity",
        strictSimilarity: true,
        minCandidates: 2,
        maxCandidates: 10,
      }
    )
  ).toThrow(/similarityByCid/);
});

test("strictSimilarity throws when similarity score is null for a candidate", () => {
  const similarityByCid = new Map([
    ["a", { similarityScore: null }],
    ["b", { similarityScore: 55 }],
  ]);
  expect(() =>
    rankCandidatesLocal(
      [
        { cid: "a", IsomericSMILES: "CCO", MolecularWeight: 46 },
        { cid: "b", IsomericSMILES: "CCC", MolecularWeight: 44 },
      ],
      { pdb_id: "4A5S", id: "4A5S" },
      {
        rankMode: "similarity",
        strictSimilarity: true,
        similarityByCid,
        minCandidates: 2,
        maxCandidates: 10,
      }
    )
  ).toThrow(/missing similarityScore/);
});

test("buildSimilarityMap throws when reference actives are empty (requireReference)", () => {
  const { execFileSync } = require("child_process");
  const path = require("path");
  const script = `
    import { buildSimilarityMap } from './benchmark/similarityForBench.mjs';
    try {
      await buildSimilarityMap(
        [{ smiles: 'CCO', chembl_id: 'x' }],
        { pdb_id: '4A5S', id: '4A5S' },
        { referenceActives: [], requireReference: true }
      );
      process.exit(2);
    } catch (e) {
      console.log(e.message);
      process.exit(0);
    }
  `;
  const out = execFileSync("node", ["--input-type=module", "-e", script], {
    cwd: path.join(__dirname, "../.."),
    encoding: "utf8",
  });
  expect(out).toMatch(/non-empty reference actives/);
});
