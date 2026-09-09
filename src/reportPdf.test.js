import {
  buildDockingReportMarkdown,
  buildBenchReportMarkdown,
} from "./reportExport";
import {
  normalizeScientificText,
  parseInlineSegments,
  parseMarkdownReport,
} from "./reportPdfParser";
import { renderPdfDocument } from "./reportPdf";

describe("reportPdfParser", () => {
  test("normalizeScientificText transliterates Greek and strips markdown", () => {
    expect(normalizeScientificText("**Predicted ΔG_bind:** -8.2 kcal/mol")).toBe(
      "Predicted dG_bind: -8.2 kcal/mol"
    );
    expect(normalizeScientificText("2.0 Å")).toBe("2.0 A");
    expect(normalizeScientificText("`CCO`")).toBe("CCO");
  });

  test("parseInlineSegments preserves bold segments", () => {
    const segments = parseInlineSegments("**Target:** EGFR");
    expect(segments).toEqual([
      { text: "Target:", style: "bold" },
      { text: " EGFR", style: "normal" },
    ]);
  });

  test("parseMarkdownReport extracts title, meta, disclaimer, sections, and tables", () => {
    const markdown = buildDockingReportMarkdown({
      targetTitle: "EGFR kinase domain",
      pdbId: "1M17",
      compoundName: "Erlotinib",
      smiles: "CCO",
      dockingResults: {
        target: { pocketResiduesCount: 42, boxSize: 12 },
        rankedPoses: [
          { rank: 1, deltaG: -8.2, kiFormatted: "1.2 nM", rmsd: 0, hbondCount: 3 },
          { rank: 2, deltaG: -7.5, kiFormatted: "3.4 nM", rmsd: 1.2, hbondCount: 2 },
        ],
      },
      activePose: {
        rank: 1,
        deltaG: -8.2,
        kiFormatted: "1.2 nM",
        rmsd: 0,
        hbondCount: 3,
        hydrophobicCount: 6,
        residueBreakdown: [{ resName: "MET", resSeq: 793, minDistance: 2.1, energy: -1.2, hbonds: 1 }],
      },
    });

    const report = parseMarkdownReport(markdown);

    expect(report.title).toBe("PocketLink Molecular Docking Report");
    expect(report.meta.module).toBe("Molecular Docking Simulation");
    expect(report.meta.sessionTitle).toContain("Erlotinib");
    expect(report.disclaimer).toContain("Computational assessment only");
    expect(report.sections.some((section) => section.title === "Selected Binding Mode")).toBe(true);

    const bindingSection = report.sections.find((section) => section.title === "Selected Binding Mode");
    expect(bindingSection.metrics.length).toBeGreaterThan(0);
    expect(bindingSection.metrics.some((metric) => /dG|Ki|bond/i.test(metric.label))).toBe(true);

    const residueTable = bindingSection.blocks.find((block) => block.type === "table");
    expect(residueTable?.headers).toContain("Residue");
    expect(residueTable?.rows?.[0]?.[0]).toBe("MET-793");

    const poseSection = report.sections.find((section) => section.title === "Pose Clusters");
    const poseTable = poseSection?.blocks.find((block) => block.type === "table");
    expect(poseTable?.rows?.length).toBe(2);
    expect(poseTable?.headers?.join(" ")).toMatch(/dG/i);
  });

  test("parseMarkdownReport handles bench ranking tables", () => {
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

    const report = parseMarkdownReport(markdown);
    const rankingSection = report.sections.find((section) => section.title === "Ranking Results");
    const table = rankingSection?.blocks.find((block) => block.type === "table");
    expect(table?.rows?.[0]?.[1]).toBe("Gefitinib");
  });
});

describe("reportPdf", () => {
  test("renderPdfDocument produces a multi-page PDF without throwing", () => {
    const markdown = buildDockingReportMarkdown({
      targetTitle: "EGFR kinase domain",
      pdbId: "1M17",
      compoundName: "Erlotinib",
      smiles: "CCO",
      dockingResults: {
        target: { pocketResiduesCount: 42, boxSize: 12 },
        rankedPoses: Array.from({ length: 12 }, (_, idx) => ({
          rank: idx + 1,
          deltaG: -8 + idx * 0.1,
          kiFormatted: `${idx + 1} nM`,
          rmsd: idx * 0.5,
          hbondCount: 3,
        })),
      },
      activePose: {
        rank: 1,
        deltaG: -8.2,
        kiFormatted: "1.2 nM",
        rmsd: 0,
        hbondCount: 3,
        hydrophobicCount: 6,
        residueBreakdown: Array.from({ length: 12 }, (_, idx) => ({
          resName: "MET",
          resSeq: 790 + idx,
          minDistance: 2.1,
          energy: -1.2,
          hbonds: 1,
        })),
      },
    });

    const doc = renderPdfDocument(markdown);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const output = doc.output("arraybuffer");
    expect(output.byteLength).toBeGreaterThan(1000);
  });
});
