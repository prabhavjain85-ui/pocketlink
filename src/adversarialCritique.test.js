const handler = require("../api/adversarial-critique");

describe("api/adversarial-critique", () => {
  const mockTarget = {
    name: "c-Abl tyrosine kinase",
    id: "2HYY",
    pdb_id: "2HYY",
    title: "Crystal structure of c-Abl kinase domain in complex with imatinib",
    resolution: "2.4 Å",
    family: "kinase",
    pocket: { status: "detected", residueCount: 14, hydrophobicity: 0.64 },
    ligand: { present: true, name: "IMATINIB", compId: "STI", mw: 493.6 },
  };

  const mockCandidate = {
    cid: "5291",
    name: "Imatinib",
    molecularWeight: 493.6,
    xlogp: 3.5,
    hbd: 2,
    hba: 7,
    rotatableBonds: 7,
    tpsa: 86.3,
    class: "tyrosine kinase inhibitor",
    indication: "Chronic myelogenous leukemia",
    score: 95,
    reasoning: [
      "Known clinical tyrosine kinase inhibitor co-crystallized with c-Abl in 2HYY.",
      "Binds inactive DFG-out conformation with high shape complementarity.",
    ],
  };

  test("compactTargetForAdversarial normalizes target fields correctly", () => {
    const compact = handler.compactTargetForAdversarial(mockTarget);
    expect(compact.pdb_id).toBe("2HYY");
    expect(compact.family).toBe("kinase");
    expect(compact.hasLigand).toBe(true);
    expect(compact.pocket.residueCount).toBe(14);
  });

  test("compactCandidateForAdversarial normalizes candidate fields correctly", () => {
    const compact = handler.compactCandidateForAdversarial(mockCandidate);
    expect(compact.compound_id).toBe("5291");
    expect(compact.name).toBe("Imatinib");
    expect(compact.score).toBe(95);
    expect(compact.molecularWeight).toBe(493.6);
  });

  test("buildAdversarialPrompt formats user and system prompt with adversarial instructions", () => {
    const compactCandidate = handler.compactCandidateForAdversarial(mockCandidate);
    const compactTarget = handler.compactTargetForAdversarial(mockTarget);
    const prompt = handler.buildAdversarialPrompt(compactCandidate, compactTarget);

    expect(prompt.system).toContain("You are a critical pharmaceutical science reviewer");
    expect(prompt.system).toContain("case_against");
    expect(prompt.user).toContain("argue the opposite case as rigorously as possible");
    expect(prompt.user).toContain("selectivity risk");
    expect(prompt.user).toContain("synthetic accessibility");
  });

  test("normalizeCritique handles valid JSON structure", () => {
    const rawAiOutput = {
      compound_id: "5291",
      case_against: {
        concerns: [
          {
            issue: "Resistance via T315I gatekeeper mutation",
            detail: "Induced DFG-out mode is abrogated by steric clash with mutated isoleucine 315.",
          },
          {
            issue: "Off-target PDGFR inhibition",
            detail: "Known cross-reactivity with PDGFR-alpha and c-Kit drives clinical fluid retention.",
          },
        ],
        overall_assessment: "Despite strong target fit, acquired resistance and multi-kinase profile remain liabilities.",
      },
    };

    const normalized = handler.normalizeCritique(rawAiOutput, "5291");
    expect(normalized).not.toBeNull();
    expect(normalized.compound_id).toBe("5291");
    expect(normalized.case_against.concerns.length).toBe(2);
    expect(normalized.case_against.concerns[0].issue).toBe("Resistance via T315I gatekeeper mutation");
    expect(normalized.case_against.overall_assessment).toContain("Despite strong target fit");
  });

  test("generateHeuristicCritique produces substantive domain concerns for kinase target", () => {
    const compactCandidate = handler.compactCandidateForAdversarial(mockCandidate);
    const compactTarget = handler.compactTargetForAdversarial(mockTarget);
    const result = handler.generateHeuristicCritique(compactCandidate, compactTarget);

    expect(result.compound_id).toBe("5291");
    expect(result.case_against.concerns.length).toBeGreaterThanOrEqual(2);
    const issues = result.case_against.concerns.map((c) => c.issue.toLowerCase());
    expect(issues.some((i) => i.includes("kinase") || i.includes("resistance") || i.includes("paralog"))).toBe(true);
    expect(result.case_against.overall_assessment).toBeTruthy();
    expect(result.source).toBe("heuristic");
  });

  test("highlights human paralogs (>65% identity) in adversarial prompt and heuristic critique", () => {
    const targetWithParalogs = {
      ...mockTarget,
      symbol: "EGFR",
      safetyProfile: "Pan-Essential Warning",
      paralogs: [
        { symbol: "ERBB2", identityPct: 82 },
        { symbol: "ERBB4", identityPct: 76 },
      ],
    };
    const compactCandidate = handler.compactCandidateForAdversarial(mockCandidate);
    const compactTarget = handler.compactTargetForAdversarial(targetWithParalogs);
    expect(compactTarget.paralogs).toEqual([
      { symbol: "ERBB2", identityPct: 82 },
      { symbol: "ERBB4", identityPct: 76 },
    ]);

    const prompt = handler.buildAdversarialPrompt(compactCandidate, compactTarget);
    expect(prompt.user).toContain("ERBB2 82%");
    expect(prompt.user).toContain("ERBB4 76%");

    const critique = handler.generateHeuristicCritique(compactCandidate, compactTarget);
    expect(critique.case_against.concerns[0].issue).toMatch(/paralog/i);
    expect(critique.case_against.concerns[0].detail).toContain("ERBB2 (82% identity)");
  });

  test("sanitizeComputeResult strips raw weights and intermediate formulas while keeping sanitized badges", () => {
    const { sanitizeComputeResult } = require("../server/compute.js");
    const sanitizedPdb = sanitizeComputeResult("searchPdbTargets", {
      results: [
        {
          id: "2HYY",
          score: 92,
          pocketClass: "Orthosteric / Catalytic",
          druggabilityTier: "High Druggability",
          conformationTag: "Inactive / DFG-out",
          pocketCenter: [1, 2, 3],
          hasMissingPocketResidues: false,
          breakdown: { resolution: 25, ligand: 20 },
          unobservedResidues: [{ auth_seq_id: 381 }],
        },
      ],
    });
    expect(sanitizedPdb.results[0].breakdown).toBeUndefined();
    expect(sanitizedPdb.results[0].unobservedResidues).toBeUndefined();
    expect(sanitizedPdb.results[0].pocketClass).toBe("Orthosteric / Catalytic");
    expect(sanitizedPdb.results[0].conformationTag).toBe("Inactive / DFG-out");

    const sanitizedDiscovery = sanitizeComputeResult("runTargetDiscovery", {
      all: [
        {
          symbol: "EGFR",
          noveltyScore: 74.2,
          tdl: "Tclin",
          safetyProfile: "Pan-Essential Warning",
          paralogs: [{ symbol: "ERBB2", identityPct: 82 }],
          noveltyComponents: { biology: 0.8 },
          datasourceScores: { eva: 0.9 },
          biologySignal: 0.8,
          essentiality: { toxicityPenalty: 15 },
        },
      ],
      novelty: [],
      established: [],
    });
    expect(sanitizedDiscovery.all[0].noveltyComponents).toBeUndefined();
    expect(sanitizedDiscovery.all[0].datasourceScores).toBeUndefined();
    expect(sanitizedDiscovery.all[0].biologySignal).toBeUndefined();
    expect(sanitizedDiscovery.all[0].essentiality).toBeUndefined();
    expect(sanitizedDiscovery.all[0].tdl).toBe("Tclin");
    expect(sanitizedDiscovery.all[0].safetyProfile).toBe("Pan-Essential Warning");
    expect(sanitizedDiscovery.all[0].paralogs).toEqual([{ symbol: "ERBB2", identityPct: 82 }]);
  });
});

