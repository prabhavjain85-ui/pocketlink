import { extractDiseaseQuery, runResearchAgent } from "./agentPipeline";
import * as openTargets from "./openTargets";
import * as pdbSearch from "./pdbSearch";
import * as repurposingScreen from "./repurposingScreen";
import * as adversarialService from "./adversarialService";

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
        extractDiseaseQuery("Find targets for Alzheimer disease using pocketlink")
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
  });
});
