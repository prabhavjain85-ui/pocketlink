import {
  demoCasePassesBenchmarkSanity,
  formatDemoRedockRmsdLabel,
  demoCaseRedockPassLabel,
} from "./dockingBenchmarkPairs";

test("erlotinib demo case is not benchmark-sane on 1M17", () => {
  const row = {
    id: "erlotinib-1m17",
    drug: "Erlotinib",
    pdbId: "1M17",
    redockRmsdAngstrom: 1.01,
    benchmarkRedockRmsdAngstrom: 5.88,
    redockPass2A: false,
  };
  expect(demoCasePassesBenchmarkSanity(row)).toBe(false);
  expect(formatDemoRedockRmsdLabel(row)).toContain("inconsistent");
  expect(demoCaseRedockPassLabel(row)).toBe("Unreliable");
});

test("carazolol demo case passes benchmark sanity", () => {
  const row = {
    id: "carazolol-3p0g",
    drug: "Carazolol",
    pdbId: "3P0G",
    redockRmsdAngstrom: 2.04,
    redockPass2A: false,
  };
  expect(demoCasePassesBenchmarkSanity(row)).toBe(true);
});
