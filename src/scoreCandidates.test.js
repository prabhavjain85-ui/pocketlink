import { rankCandidatesLocal, drugLikenessChecks } from "./scoreCandidates";

const caffeine = {
  cid: "2519",
  displayName: "caffeine",
  molecularWeight: 194.19,
  xlogp: -0.1,
  hbd: 0,
  hba: 6,
  rotatableBonds: 0,
  tpsa: 58.4,
};

const imatinib = {
  cid: "5291",
  displayName: "imatinib",
  molecularWeight: 493.6,
  xlogp: 3.5,
  hbd: 2,
  hba: 7,
  rotatableBonds: 7,
  tpsa: 86.3,
};

const ibuprofen = {
  cid: "3672",
  displayName: "ibuprofen",
  molecularWeight: 206.28,
  xlogp: 3.5,
  hbd: 1,
  hba: 2,
  rotatableBonds: 4,
  tpsa: 37.3,
};

const ugly = {
  cid: "999999",
  displayName: "non-drug-like oligomer",
  molecularWeight: 920,
  xlogp: 8.4,
  hbd: 9,
  hba: 16,
  rotatableBonds: 22,
  tpsa: 210,
};

test("ranks a clearly non-drug-like molecule last", () => {
  const result = rankCandidatesLocal([ugly, caffeine, imatinib, ibuprofen, {
    cid: "2244",
    displayName: "aspirin",
    molecularWeight: 180.16,
    xlogp: 1.2,
    hbd: 1,
    hba: 4,
    rotatableBonds: 3,
    tpsa: 63.6,
  }]);

  expect(result.ranking).toHaveLength(5);
  expect(result.recommended.cid).not.toBe("999999");
  expect(result.ranking[result.ranking.length - 1].cid).toBe("999999");
  expect(result.ranking[0].score).toBeGreaterThan(result.ranking[4].score);
});

test("returns a complete ranking schema", () => {
  const result = rankCandidatesLocal([caffeine, imatinib]);
  expect(result.recommended.cid).toBeTruthy();
  expect(result.recommended.score).toBeGreaterThanOrEqual(0);
  expect(result.recommended.score).toBeLessThanOrEqual(100);
  expect(result.recommended.reason).toMatch(/caffeine|imatinib/i);
  expect(result.ranking.map((r) => r.cid).sort()).toEqual(["2519", "5291"]);
  expect(result.limitations.length).toBeGreaterThan(0);
  expect(result.source).toBe("heuristic");
});

test("requires at least two candidates", () => {
  expect(() => rankCandidatesLocal([caffeine])).toThrow(/at least 2/i);
});

test("includes the staged target in the summary when provided", () => {
  const result = rankCandidatesLocal([caffeine, ibuprofen], { id: "4KIK", title: "IKK beta" });
  expect(result.summary).toContain("4KIK");
});

test("Lipinski checks flag the oversized molecule", () => {
  const checks = drugLikenessChecks(ugly);
  expect(checks.filter((c) => !c.pass).length).toBeGreaterThanOrEqual(5);
  const caffeineChecks = drugLikenessChecks(caffeine);
  expect(caffeineChecks.every((c) => c.pass)).toBe(true);
});
