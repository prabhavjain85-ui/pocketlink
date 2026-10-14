import { mergeElites } from "./evolutionScaffold";

function row(smiles, rank, score) {
  return { smiles, rank, crowding: 0, displayScore: score };
}

test("mergeElites never replaces a better survivor with a worse parent", () => {
  const survivors = [
    row("best-offspring", 1, 90),
    row("mid-offspring", 2, 80),
    row("weak-offspring", 3, 70),
  ];
  const parents = [row("seed", 4, 50), row("parent2", 5, 45)];
  const merged = mergeElites(survivors, parents, 3, {
    seedSmiles: "seed",
    globalBestSmiles: ["best-offspring"],
  });
  expect(merged.map((r) => r.smiles)).toContain("seed");
  expect(merged.map((r) => r.smiles)).toContain("best-offspring");
  expect(merged.find((r) => r.smiles === "weak-offspring")).toBeFalsy();
  expect(merged.length).toBe(3);
});
