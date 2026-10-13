/**
 * Subset of benchmark/docking/results/pair_sanity_checks.json for demo + UI warnings.
 * Key: lowercase drug_id from the 25-drug panel.
 */
export const DOCKING_BENCHMARK_PAIR_SANITY = {
  imatinib: { reliable: true, pdbId: "1IEP", benchmarkRmsdAngstrom: 0.3 },
  gefitinib: { reliable: true, pdbId: "4I23", benchmarkRmsdAngstrom: 0.56 },
  erlotinib: {
    reliable: false,
    pdbId: "1M17",
    benchmarkRmsdAngstrom: 5.88,
    issues: ["redock_rmsd_above_2A:5.88"],
  },
  lapatinib: { reliable: true, pdbId: "3PP0", benchmarkRmsdAngstrom: 0.52 },
  ruxolitinib: { reliable: true, pdbId: "4IVB", benchmarkRmsdAngstrom: 0.26 },
  carazolol: { reliable: true, pdbId: "3P0G", benchmarkRmsdAngstrom: 1.49 },
};

/** @param {{ drug?: string, pdbId?: string }} caseRow */
export function drugIdFromDemoCase(caseRow) {
  const id = (caseRow?.id || "").split("-")[0];
  if (id) return id.toLowerCase();
  return (caseRow?.drug || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getBenchmarkSanityForDemoCase(caseRow) {
  const drugId = drugIdFromDemoCase(caseRow);
  const row = DOCKING_BENCHMARK_PAIR_SANITY[drugId];
  if (!row) return null;
  const pdbMatch =
    !caseRow?.pdbId || !row.pdbId || caseRow.pdbId.toUpperCase() === row.pdbId.toUpperCase();
  return { drugId, ...row, pdbMatch };
}

export function demoCasePassesBenchmarkSanity(caseRow) {
  const sanity = getBenchmarkSanityForDemoCase(caseRow);
  if (!sanity) return true;
  if (!sanity.pdbMatch) return true;
  return sanity.reliable;
}

export function formatDemoRedockRmsdLabel(caseRow) {
  const sanity = getBenchmarkSanityForDemoCase(caseRow);
  const demoRmsd = caseRow?.redockRmsdAngstrom;
  if (!sanity || !sanity.pdbMatch) {
    return demoRmsd != null ? String(demoRmsd) : "—";
  }
  if (sanity.reliable) {
    return demoRmsd != null ? String(demoRmsd) : "—";
  }
  const bench = sanity.benchmarkRmsdAngstrom;
  if (demoRmsd != null && bench != null && Math.abs(demoRmsd - bench) > 0.5) {
    return `demo ${demoRmsd} / bench ${bench} (inconsistent)`;
  }
  if (bench != null) return `bench ${bench} (unreliable pair)`;
  return "unreliable";
}

export function demoCaseRedockPassLabel(caseRow) {
  const sanity = getBenchmarkSanityForDemoCase(caseRow);
  if (caseRow?.comingSoon) return "Coming soon";
  if (sanity?.pdbMatch && !sanity.reliable) return "Unreliable";
  if (caseRow?.redockPass2A === true) return "Pass";
  if (caseRow?.redockPass2A === false) return "Fail";
  return "—";
}
