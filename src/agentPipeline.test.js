import {
  extractDiseaseQuery,
  getDrugCountPhrase,
  getGeneticAdjective,
  getNoveltyAdjective,
  runResearchAgent,
} from "../server/agentPipeline";
import * as openTargets from "../server/openTargets";
import * as pdbSearch from "../server/pdbSearch";
import * as repurposingScreen from "../server/repurposingScreen";
import * as adversarialService from "../server/adversarialService";

describe("agentPipeline", () => {
  describe("extractDiseaseQuery", () => {
    test("cleans natural language prompts into disease queries", () => {
      expect(
        extractDiseaseQuery("Find repurposing candidates for pancreatic cancer")
      ).toBe("pancreatic cancer");

      expect(
        extractDiseaseQuery("Identify novel targets & approved leads for glioblastoma")
      ).toBe("glioblastoma");

      expect(
        extractDiseaseQuery("Screen repurposing candidates for colorectal cancer.")
      ).toBe("colorectal cancer");

      expect(
        extractDiseaseQuery("Find targets for Alzheimer disease using targetforge")
      ).toBe("Alzheimer disease");

      expect(
        extractDiseaseQuery("pancreatic ductal adenocarcinoma")
      ).toBe("pancreatic ductal adenocarcinoma");
    });
  });

  describe("runResearchAgent end-to-end orchestration", () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test("successfully runs full 4-step pipeline with pivot when primary target lacks pocket", async () => {
      // Mock Open Targets
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0005192", name: "exocrine pancreatic carcinoma" },
      ]);

      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0005192", name: "exocrine pancreatic carcinoma" },
        totalAssociatedCount: 10899,
        novelty: [
          {
            symbol: "PALB2",
            name: "partner and localizer of BRCA2",
            noveltyScore: 81.4,
            overallScore: 0.78,
            geneticScore: 0.94,
            somaticScore: 0.6,
            drugCount: 0,
          },
          {
            symbol: "STK11",
            name: "serine/threonine kinase 11",
            noveltyScore: 77.7,
            overallScore: 0.75,
            geneticScore: 0.87,
            somaticScore: 0.72,
            drugCount: 0,
          },
        ],
        all: [],
      });

      // Mock PDB search:
      // PALB2 has 2W18 (no ligand, unclear pocket -> degraded)
      // STK11 has 9NTB (has ligand, detected pocket -> score 98)
      jest.spyOn(pdbSearch, "searchPdbTargets").mockImplementation(async (query) => {
        if (query === "PALB2") {
          return {
            query: "PALB2",
            results: [
              {
                id: "2W18",
                title: "Crystal structure of PALB2 WD40 domain",
                score: 68,
                resolution: "1.90 Å",
                method: "X-ray",
                hasLigand: false,
                pocket: "unclear",
              },
            ],
          };
        }
        if (query === "STK11") {
          return {
            query: "STK11",
            results: [
              {
                id: "9NTB",
                title: "Crystal structure of STK11 kinase complex",
                score: 98,
                resolution: "1.80 Å",
                method: "X-ray",
                hasLigand: true,
                ligand: { present: true, name: "Compound TNG260", compId: "A1B1V" },
                pocket: { available: true, residueCount: 108, sizeLabel: "large", hydrophobicityLabel: "polar" },
              },
            ],
          };
        }
        return { query, results: [] };
      });

      // Mock Repurposing Screen
      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened approved drugs against 9NTB",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: {
          name: "Imatinib",
          cid: "5291",
          score: 88,
          indication: "Leukemia & GIST",
          molecularWeight: 493.6,
          xlogp: 3.5,
          reasoning: [
            "Known kinase-inhibitor-like scaffold for this target family",
            "Good size match to the co-crystallized ligand",
            "Passes 6/6 Lipinski drug-likeness checks",
          ],
        },
        ranking: [
          {
            name: "Imatinib",
            cid: "5291",
            score: 88,
            indication: "Leukemia & GIST",
            reasoning: ["Known kinase-inhibitor"],
          },
          {
            name: "Dasatinib",
            cid: "3062316",
            score: 82,
            indication: "Leukemia",
            reasoning: ["Kinase class match"],
          },
        ],
      });

      // Mock Adversarial Critique
      jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue({
        case_against: {
          overall_assessment:
            "Repurposing Imatinib presents critical liabilities, including gatekeeper resistance mutations and extensive off-target tyrosine kinase inhibition.",
          concerns: [
            {
              issue: "Selectivity & Polypharmacology Risk",
              detail: "Multi-kinase inhibition profile risks dose-limiting hematologic toxicity.",
            },
            {
              issue: "Efflux Transporter Liability",
              detail: "Imatinib is a recognized P-gp and BCRP substrate, which may limit effective tumor penetration.",
            },
          ],
        },
        source: "Gemini 3.8 Flash",
      });

      const stepUpdates = [];
      const report = await runResearchAgent({
        goal: "Find repurposing candidates for pancreatic cancer",
        onStepUpdate: (up) => stepUpdates.push(up),
      });

      expect(report.status).toBe("completed");
      expect(report.diseaseResolved.name).toBe("exocrine pancreatic carcinoma");
      expect(report.steps[1].status).toBe("complete");
      expect(report.steps[1].data.primaryTarget.symbol).toBe("PALB2");

      // Verify the honest pivot occurred!
      expect(report.steps[2].status).toBe("complete");
      expect(report.steps[2].data.pivoted).toBe(true);
      expect(report.steps[2].data.target.symbol).toBe("STK11");
      expect(report.steps[2].data.selectedStructure.id).toBe("9NTB");
      expect(report.steps[2].narration).toContain("pivoted");

      // Verify repurposing screen
      expect(report.steps[3].status).toBe("complete");
      expect(report.steps[3].data.recommended.name).toBe("Imatinib");
      expect(report.steps[3].data.librarySize).toBe(2983);
      expect(report.steps[3].data.totalScreened).toBe(2924);
      expect(report.steps[3].narration).not.toContain("294");
      expect(report.steps[3].narration).toContain("2,983");
      expect(report.steps[3].narration).toContain("2,924");

      // Verify adversarial critique
      expect(report.steps[4].status).toBe("complete");
      expect(report.steps[4].data.critique.case_against.concerns.length).toBe(2);

      // Verify executive summary
      expect(report.executiveSummary).toBeTruthy();
      expect(report.executiveSummary.targetSymbol).toBe("STK11");
      expect(report.executiveSummary.pivotedFrom).toBe("PALB2");
      expect(report.executiveSummary.leadDrugName).toBe("Imatinib");
    });

    test("honestly halts at Step 1 when disease query cannot be resolved in Open Targets", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([]);

      const report = await runResearchAgent({
        goal: "Find repurposing candidates for xyzunknowncondition123",
      });

      expect(report.status).toBe("halted");
      expect(report.steps[1].status).toBe("dead_end");
      expect(report.haltReason).toContain("No clinical disease entity matching");
      expect(report.steps[2].status).toBe("pending");
    });

    test("honestly halts at Step 2 when both primary and backup targets lack viable PDB structures", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0001", name: "Rare disorder" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0001", name: "Rare disorder" },
        novelty: [
          { symbol: "TGT1", name: "Target 1", noveltyScore: 80, drugCount: 0 },
          { symbol: "TGT2", name: "Target 2", noveltyScore: 70, drugCount: 0 },
        ],
        all: [],
      });

      // Mock PDB search returning no structures
      jest.spyOn(pdbSearch, "searchPdbTargets").mockResolvedValue({
        results: [],
      });

      const report = await runResearchAgent({
        goal: "Investigate rare disorder",
      });

      expect(report.status).toBe("halted");
      expect(report.steps[2].status).toBe("dead_end");
      expect(report.steps[2].narration).toContain("Pipeline halted");
      expect(report.steps[3].status).toBe("pending");
    });

    test("prefers established target with drugCount >= 1 over novelty targets like RUNX1", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0005072", name: "chronic myeloid leukemia" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0005072", name: "chronic myeloid leukemia" },
        novelty: [
          { symbol: "RUNX1", name: "runt related transcription factor 1", noveltyScore: 88, drugCount: 0, overallScore: 0.4 },
        ],
        all: [
          { symbol: "ABL1", name: "ABL proto-oncogene 1", drugCount: 5, overallScore: 0.92 },
          { symbol: "RUNX1", name: "runt related transcription factor 1", noveltyScore: 88, drugCount: 0, overallScore: 0.4 },
        ],
      });

      jest.spyOn(pdbSearch, "searchPdbTargets").mockImplementation(async (query) => {
        if (query === "ABL1" || query === "2HYY") {
          return {
            results: [
              {
                id: "2HYY",
                title: "Crystal structure of ABL kinase in complex with Imatinib",
                score: 95,
                resolution: "1.90 Å",
                method: "X-ray",
                hasLigand: true,
                ligand: { present: true, name: "Imatinib", compId: "STI", formulaWeight: 493.6 },
                pocket: { available: true, residueCount: 90, sizeLabel: "standard", hydrophobicityLabel: "mixed" },
              },
            ],
          };
        }
        return { results: [] };
      });

      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened against 2HYY",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: {
          name: "Imatinib",
          cid: "5291",
          score: 92,
          indication: "CML",
          reasoning: ["On-target inhibitor"],
        },
        ranking: [{ name: "Imatinib", cid: "5291", score: 92 }],
      });

      jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue({
        case_against: { overall_assessment: "Resistance can occur through T315I mutation.", concerns: [] },
      });

      const report = await runResearchAgent({
        goal: "Screen repurposing candidates for CML",
      });

      expect(report.status).toBe("completed");
      expect(report.steps[1].data.primaryTarget.symbol).toBe("ABL1");
      expect(report.steps[2].data.selectedStructure.id).toBe("2HYY");
    });

    test("rejects 1EAO and DNA complexes and picks a structure with authentic hetero ligand", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0005072", name: "chronic myeloid leukemia" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0005072", name: "chronic myeloid leukemia" },
        novelty: [{ symbol: "RUNX1", noveltyScore: 90, drugCount: 0 }],
        all: [{ symbol: "RUNX1", noveltyScore: 90, drugCount: 0 }],
      });

      // 1EAO is returned first, followed by a valid co-crystal structure 5XYZ
      jest.spyOn(pdbSearch, "searchPdbTargets").mockResolvedValue({
        results: [
          {
            id: "1EAO",
            title: "Crystal structure of Runt domain bound to DNA",
            score: 70,
            hasLigand: true,
            ligand: { compId: "MG", name: "MAGNESIUM ION" },
            pocket: "unclear",
          },
          {
            id: "5XYZ",
            title: "RUNX1 allosteric inhibitor complex",
            score: 85,
            resolution: "2.1 Å",
            hasLigand: true,
            ligand: { compId: "INH", name: "Inhibitor AI-10-47", formulaWeight: 380.4 },
            pocket: { available: true, residueCount: 45 },
          },
        ],
      });

      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened against 5XYZ",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: { name: "DrugX", cid: "111", score: 68 },
        ranking: [{ name: "DrugX", cid: "111", score: 68 }],
      });

      jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue({
        case_against: { overall_assessment: "Assessment", concerns: [] },
      });

      const report = await runResearchAgent({
        goal: "RUNX1 inhibitors for leukemia",
      });

      expect(report.status).toBe("completed");
      expect(report.steps[2].data.selectedStructure.id).toBe("5XYZ");
      expect(report.steps[2].data.selectedStructure.id).not.toBe("1EAO");
    });

    test("does not halt on score 24-66, narrates same-family score, and continues to critique", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0001", name: "Test Disease" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0001", name: "Test Disease" },
        novelty: [{ symbol: "GENE1", drugCount: 1 }],
        all: [{ symbol: "GENE1", drugCount: 1 }],
      });

      jest.spyOn(pdbSearch, "searchPdbTargets").mockResolvedValue({
        results: [
          {
            id: "4ABC",
            title: "Structure of GENE1 with ligand",
            score: 80,
            resolution: "2.0 Å",
            hasLigand: true,
            ligand: { compId: "LIG", name: "Ligand", formulaWeight: 300 },
            pocket: { available: true, residueCount: 50 },
          },
        ],
      });

      // Top candidate score is 24 (same-family / no direct rule match)
      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened against 4ABC",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: { name: "CandidateA", cid: "999", score: 24, reasoning: ["same-family"] },
        ranking: [
          { name: "CandidateA", cid: "999", score: 24 },
          { name: "CandidateB", cid: "888", score: 22 },
        ],
      });

      jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue({
        case_against: { overall_assessment: "Weak affinity liability.", concerns: [] },
      });

      const report = await runResearchAgent({
        goal: "Test Disease research",
      });

      expect(report.status).toBe("completed");
      expect(report.steps[3].status).toBe("complete");
      expect(report.steps[3].narration).toContain("No on-target approved drug in this shortlist; best same-family score is 24");
      expect(report.steps[4].status).toBe("complete");
    });

    test("halts when ranking is empty or top score < 15", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0001", name: "Test Disease" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0001", name: "Test Disease" },
        novelty: [{ symbol: "GENE1", drugCount: 1 }],
        all: [{ symbol: "GENE1", drugCount: 1 }],
      });

      jest.spyOn(pdbSearch, "searchPdbTargets").mockResolvedValue({
        results: [
          {
            id: "4ABC",
            title: "Structure of GENE1 with ligand",
            score: 80,
            resolution: "2.0 Å",
            hasLigand: true,
            ligand: { compId: "LIG", name: "Ligand", formulaWeight: 300 },
            pocket: { available: true, residueCount: 50 },
          },
        ],
      });

      // Top candidate score is 12 (< 15)
      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened against 4ABC",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: { name: "CandidateLow", cid: "999", score: 12 },
        ranking: [{ name: "CandidateLow", cid: "999", score: 12 }],
      });

      const report = await runResearchAgent({
        goal: "Test Disease research",
      });

      expect(report.status).toBe("halted");
      expect(report.steps[3].status).toBe("dead_end");
      expect(report.haltReason).toContain("top score: 12/100");
    });

    test("halts with explicit message when Open Targets returns 0 associated targets", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0005546", name: "fibromyalgia" },
      ]);
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0005546", name: "fibromyalgia", associationCount: 0 },
        novelty: [],
        all: [],
        totalAssociatedCount: 0,
      });

      const report = await runResearchAgent({
        goal: "Find repurposing candidates for fibromyalgia",
      });

      expect(report.status).toBe("halted");
      expect(report.steps[1].status).toBe("dead_end");
      expect(report.steps[1].narration).toContain("Open Targets returned 0 associations for this disease. No primary target from OT.");
      expect(report.haltReason).toContain("Open Targets returned 0 associations for this disease. No primary target from OT.");
      expect(report.steps[2].status).toBe("pending");
    });

    test("Step 1 narration accurately reflects raw metrics and avoids false hype", async () => {
      jest.spyOn(openTargets, "searchDiseases").mockResolvedValue([
        { id: "MONDO_0005546", name: "fibromyalgia" },
      ]);
      // SLC6A4: Novelty 0.1/100, genetic 0%, 67 approved drugs
      jest.spyOn(openTargets, "runTargetDiscovery").mockResolvedValue({
        disease: { id: "MONDO_0005546", name: "fibromyalgia", associationCount: 1 },
        novelty: [],
        all: [
          {
            symbol: "SLC6A4",
            name: "solute carrier family 6 member 4",
            noveltyScore: 0.1,
            geneticScore: 0,
            somaticScore: 0,
            drugCount: 67,
            overallScore: 0.2,
          },
        ],
        totalAssociatedCount: 1,
      });

      jest.spyOn(pdbSearch, "searchPdbTargets").mockResolvedValue({
        results: [
          {
            id: "5I6X",
            title: "Crystal structure of human serotonin transporter",
            score: 92,
            hasLigand: true,
            ligand: { compId: "PAR", name: "Paroxetine", formulaWeight: 329.4 },
            pocket: { available: true, residueCount: 45 },
          },
        ],
      });

      jest.spyOn(repurposingScreen, "screenApprovedLibrary").mockResolvedValue({
        summary: "Screened approved drugs against 5I6X",
        librarySize: 2983,
        scoredCount: 2924,
        recommended: { name: "Duloxetine", cid: "60835", score: 85 },
        ranking: [{ name: "Duloxetine", cid: "60835", score: 85 }],
      });

      jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue({
        case_against: {
          overall_assessment: "Known liability assessment.",
          concerns: [],
        },
      });

      const report = await runResearchAgent({
        goal: "Find repurposing candidates for fibromyalgia",
      });

      expect(report.steps[1].status).toBe("complete");
      const narration = report.steps[1].narration;

      // Must say "low" next to 0.1/100, NOT "high"
      expect(narration).toContain("low Novelty Score of **0.1/100**");
      expect(narration).not.toContain("high Novelty Score");

      // Must say "weak / none" next to 0%, NOT "strong"
      expect(narration).toContain("weak / none genetic disease association (**0%**)");
      expect(narration).not.toContain("strong genetic disease association");

      // Must say "already has 67 approved/pipeline drugs (not underexplored)", NOT "underexplored"
      expect(narration).toContain("already has 67 approved/pipeline drugs (not underexplored)");
      expect(narration).not.toContain("underexplored opportunity");

      // Must be classified as established / already drugged, NOT novel
      expect(narration).toContain("already drugged / backup for structures");
      expect(narration).not.toContain("primary novel candidate");
    });
  });

  describe("Adjective and phrase helper functions", () => {
    test("getNoveltyAdjective maps numeric novelty correctly", () => {
      expect(getNoveltyAdjective(85)).toBe("high");
      expect(getNoveltyAdjective(50)).toBe("high");
      expect(getNoveltyAdjective(49)).toBe("moderate");
      expect(getNoveltyAdjective(20)).toBe("moderate");
      expect(getNoveltyAdjective(19.9)).toBe("low");
      expect(getNoveltyAdjective(0.1)).toBe("low");
      expect(getNoveltyAdjective(0)).toBe("low");
      expect(getNoveltyAdjective(null)).toBe("low");
    });

    test("getGeneticAdjective maps genetic association correctly", () => {
      expect(getGeneticAdjective(0.9)).toBe("strong");
      expect(getGeneticAdjective(0.4)).toBe("strong");
      expect(getGeneticAdjective(0.39)).toBe("moderate");
      expect(getGeneticAdjective(0.15)).toBe("moderate");
      expect(getGeneticAdjective(0.14)).toBe("weak / none");
      expect(getGeneticAdjective(0)).toBe("weak / none");
      expect(getGeneticAdjective(null)).toBe("weak / none");
      // Handle percentage scale 0-100 as well
      expect(getGeneticAdjective(80)).toBe("strong");
      expect(getGeneticAdjective(25)).toBe("moderate");
      expect(getGeneticAdjective(5)).toBe("weak / none");
    });

    test("getDrugCountPhrase maps approved drug counts correctly", () => {
      expect(getDrugCountPhrase(0)).toBe("no approved drugs (underexplored)");
      expect(getDrugCountPhrase(1)).toBe("few drugs");
      expect(getDrugCountPhrase(2)).toBe("few drugs");
      expect(getDrugCountPhrase(3)).toBe("already has 3 approved/pipeline drugs (not underexplored)");
      expect(getDrugCountPhrase(67)).toBe("already has 67 approved/pipeline drugs (not underexplored)");
    });
  });
});

