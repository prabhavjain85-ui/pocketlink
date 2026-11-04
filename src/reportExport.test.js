import {
  buildBenchReportMarkdown,
  buildDockingReportMarkdown,
  buildHistoryEntryReportMarkdown,
  buildRepurposingReportMarkdown,
  buildTargetDiscoveryReportMarkdown,
  sanitizeReportFilename,
} from "./reportExport";

describe("reportExport", () => {
  test("sanitizeReportFilename removes unsafe characters", () => {
    expect(sanitizeReportFilename("Agent Report: EGFR/2026")).toBe("Agent-Report-EGFR-2026");
  });

  test("buildBenchReportMarkdown includes ranking and disclaimers", () => {
    const markdown = buildBenchReportMarkdown({
      protein: { id: "1M17", targetSelectionScore: 88, gene: "EGFR" },
      candidates: [{ CID: 123 }],
      aiResult: {
        recommended: { cid: 123, score: 72, reason: "Strong pocket fit" },
        ranking: [{ cid: 123, name: "Gefitinib", score: 72, reasoning: ["On-target chemotype"] }],
        summary: "Best fit for EGFR.",
        limitations: ["No docking performed."],
        source: "heuristic-v2",
      },
    });

    expect(markdown).toContain("# PocketLink Staging Bench Report");
    expect(markdown).toContain("Gefitinib");
    expect(markdown).toContain("72/100");
    expect(markdown).toContain("knowledge-based triage score");
  });

  test("buildDockingReportMarkdown includes pose metrics and residues", () => {
    const markdown = buildDockingReportMarkdown({
      targetTitle: "EGFR kinase domain",
      pdbId: "1M17",
      compoundName: "Erlotinib",
      smiles: "CCOC1=CC2=C(C=C1)C(=NC=N2)NC3=CC=CC=C3",
      dockingResults: {
        target: { pocketResiduesCount: 42, boxSize: 12 },
        rankedPoses: [{ rank: 1, deltaG: -8.2, kiFormatted: "1.2 nM", rmsd: 0, hbondCount: 3 }],
      },
      activePose: {
        rank: 1,
        deltaG: -8.2,
        kiFormatted: "1.2 nM",
        rmsd: 0,
        hbondCount: 3,
        hydrophobicCount: 6,
        components: { vdw: -4.1, hbond: -2.0, electrostatic: -1.5, desolvation: -0.8, torsional: 0.2 },
        residueBreakdown: [{ resName: "MET", resSeq: 793, minDistance: 2.1, energy: -1.2, hbonds: 1 }],
      },
    });

    expect(markdown).toContain("Molecular Docking Report");
    expect(markdown).toContain("-8.2");
    expect(markdown).toContain("MET-793");
  });

  test("buildRepurposingReportMarkdown lists top candidates", () => {
    const markdown = buildRepurposingReportMarkdown({
      result: {
        target: { name: "EGFR", pdb_id: "1M17" },
        librarySize: 2983,
        scoredCount: 450,
        recommended: { name: "Erlotinib", cid: 176870, score: 78 },
        ranking: [{ name: "Erlotinib", cid: 176870, score: 78, indication: "NSCLC", reasoning: ["On-target"] }],
        summary: "Screened approved library against EGFR.",
        source: "heuristic-v2",
      },
    });

    expect(markdown).toContain("Drug Repurposing Screen Report");
    expect(markdown).toContain("Erlotinib");
  });

  test("buildTargetDiscoveryReportMarkdown includes resolved disease and targets", () => {
    const markdown = buildTargetDiscoveryReportMarkdown({
      query: "pancreatic cancer",
      view: "novelty",
      result: {
        disease: { id: "EFO_0002618", name: "pancreatic carcinoma", associationCount: 1200 },
        fetchedCount: 50,
        novelty: [{ symbol: "KRAS", noveltyScore: 62.4, geneticScore: 0.44, drugCount: 1, explanation: "Strong genetics, few drugs." }],
        established: [],
      },
    });

    expect(markdown).toContain("Target Discovery Report");
    expect(markdown).toContain("KRAS");
    expect(markdown).toContain("pancreatic carcinoma");
  });

  test("buildHistoryEntryReportMarkdown dispatches by session type", () => {
    const markdown = buildHistoryEntryReportMarkdown({
      type: "staging-bench",
      title: "Bench session",
      timestamp: Date.UTC(2026, 0, 15),
      snapshot: {
        protein: { id: "1M17" },
        candidates: [],
        aiResult: {
          ranking: [{ cid: 1, name: "Drug A", score: 60 }],
          summary: "Summary",
          limitations: [],
          source: "heuristic-v2",
        },
      },
    });

    expect(markdown).toContain("Staging Bench Report");
  });
});
