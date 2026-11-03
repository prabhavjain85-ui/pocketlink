import {
  getTrialSuccessContext,
  resolveTrialSuccessCategory,
  formatPhaseRate,
  formatPhaseDisplay,
  describeTrialSuccessMatch,
  matchesCategoryIntervention,
  matchInterventionToDrugs,
  classifyWhyStopped,
  wilsonInterval,
  computePhaseTransitions,
  computeCompletionStats,
  classifyDiseaseArea,
  LIMITATION_NOTE,
  MIN_SAMPLE_SIZE,
} from "../server/trialSuccessContext";
import {
  formatPhaseDisplay as uiFormatPhaseDisplay,
  formatPhaseRate as uiFormatPhaseRate,
} from "./shared/trialSuccessDisplay";

const egfrProtein = {
  id: "1M17",
  gene: "EGFR",
  name: "EGFR kinase",
  queryName: "EGFR",
  title: "Epidermal growth factor receptor",
};

const ablProtein = {
  id: "1IEP",
  gene: "ABL1",
  name: "ABL kinase",
  queryName: "ABL",
};

const gpcrProtein = {
  id: "3SN6",
  gene: "ADRB2",
  name: "Beta-2 adrenergic receptor",
  queryName: "ADRB2",
};

const unknownProtein = {
  id: "XXXX",
  name: "Uncharacterized protein",
};

test("resolves EGFR to egfr category (specific over broad kinase)", () => {
  const resolved = resolveTrialSuccessCategory(egfrProtein);
  expect(resolved.categoryKey).toBe("egfr");
  expect(resolved.matchType).toBe("target_rule");
});

test("resolves ABL to abl category", () => {
  const resolved = resolveTrialSuccessCategory(ablProtein);
  expect(resolved.categoryKey).toBe("abl");
});

test("resolves GPCR target to beta2_adrenergic rule bucket", () => {
  const resolved = resolveTrialSuccessCategory(gpcrProtein);
  expect(resolved.categoryKey).toBe("beta2_adrenergic");
});

test("returns unavailable context for unrecognized targets", () => {
  const ctx = getTrialSuccessContext(unknownProtein);
  expect(ctx.available).toBe(false);
  expect(ctx.limitationNote).toBe(LIMITATION_NOTE);
});

test("returns phase completion and transition data with reliability flags for EGFR", () => {
  const ctx = getTrialSuccessContext(egfrProtein);
  expect(ctx.available).toBe(true);
  expect(ctx.categoryLabel).toMatch(/EGFR/i);
  expect(ctx.phases.PHASE2).toBeDefined();
  expect(typeof ctx.phases.PHASE2.n).toBe("number");
  expect(ctx.phases.PHASE2.n).toBeGreaterThanOrEqual(MIN_SAMPLE_SIZE);
  expect(ctx.phases.PHASE2.reliable).toBe(true);
  expect(ctx.phases.PHASE2.rate).toBeGreaterThan(0);
  expect(ctx.phases.PHASE2.ci).toBeDefined();
  expect(formatPhaseRate(ctx.phases.PHASE2)).toBeGreaterThan(0);
  expect(ctx.transitions.PHASE3.available).toBe(false);
});

test("kinase inhibitor category has n>=30 for at least one completion phase", () => {
  const ctx = getTrialSuccessContext({ gene: "JAK2", name: "JAK2 kinase", queryName: "JAK2" });
  expect(ctx.available).toBe(true);
  const reliablePhases = Object.values(ctx.phases).filter((p) => p.reliable);
  expect(reliablePhases.length).toBeGreaterThan(0);
});

test("intervention check rejects off-target amlodipine for estrogen_receptor and accepts erlotinib hydrochloride for egfr", () => {
  const amlodipineTrial = {
    protocolSection: {
      armsInterventionsModule: {
        interventions: [{ type: "DRUG", name: "amlodipine" }],
      },
    },
  };
  const erlotinibSaltTrial = {
    protocolSection: {
      armsInterventionsModule: {
        interventions: [{ type: "DRUG", name: "erlotinib hydrochloride" }],
      },
    },
  };
  const imatinibMesylateTrial = {
    protocolSection: {
      armsInterventionsModule: {
        interventions: [{ type: "DRUG", name: "Imatinib Mesylate 400 mg" }],
      },
    },
  };

  expect(matchesCategoryIntervention(amlodipineTrial, "estrogen_receptor")).toBe(false);
  expect(matchesCategoryIntervention("amlodipine", "estrogen_receptor")).toBe(false);

  expect(matchesCategoryIntervention(erlotinibSaltTrial, "egfr")).toBe(true);
  expect(matchInterventionToDrugs("erlotinib hydrochloride", "egfr")).toEqual(["erlotinib"]);
  expect(matchInterventionToDrugs(imatinibMesylateTrial, "abl")).toEqual(["imatinib"]);
});

test("phase transition: drug with Phase 2 and Phase 3 advances, only Phase 2 does not, and recent-only Phase 2 (<3y) is censored", () => {
  const referenceDate = "2026-11-01T00:00:00Z";
  const mockStudies = [
    // Drug A: has Phase 2 and Phase 3 trials -> advances
    {
      drug: "drug_advances",
      phases: ["PHASE2"],
      startDate: "2019-03-01",
    },
    {
      drug: "drug_advances",
      phases: ["PHASE3"],
      startDate: "2022-06-15",
    },
    // Drug B: has only Phase 2 started > 3 years ago -> does not advance
    {
      drug: "drug_stalled",
      phases: ["PHASE2"],
      startDate: "2020-05-10",
    },
    // Drug C: has only Phase 2 started within 3 years -> censored (excluded from denominator)
    {
      drug: "drug_recent",
      phases: ["PHASE2"],
      startDate: "2025-04-01",
    },
  ];

  const transitions = computePhaseTransitions(
    mockStudies,
    ["drug_advances", "drug_stalled", "drug_recent"],
    { referenceDate, censorYears: 3 }
  );

  expect(transitions.PHASE2.numerator).toBe(1);
  expect(transitions.PHASE2.denominator).toBe(2);
  expect(transitions.PHASE2.censored).toBe(1);
  expect(transitions.PHASE2.rate).toBe(0.5);
  expect(transitions.PHASE2.advancedDrugs).toEqual(["drug_advances"]);
  expect(transitions.PHASE2.notAdvancedDrugs).toEqual(["drug_stalled"]);
  expect(transitions.PHASE2.censoredDrugs).toEqual(["drug_recent"]);
  expect(transitions.PHASE3.available).toBe(false);
  expect(transitions.PHASE3.rate).toBeNull();
});

test("classifyWhyStopped classifies operational, efficacy, and safety stop reasons", () => {
  expect(classifyWhyStopped("slow accrual")).toBe("operational");
  expect(classifyWhyStopped("Low enrollment and sponsor funding ended")).toBe("operational");
  expect(classifyWhyStopped("futility at interim analysis")).toBe("efficacy");
  expect(classifyWhyStopped("Lack of clinical efficacy at primary endpoint")).toBe("efficacy");
  expect(classifyWhyStopped("unacceptable toxicity")).toBe("safety");
  expect(classifyWhyStopped("Dose-limiting adverse events")).toBe("safety");
  expect(classifyWhyStopped("")).toBe("unknown");
  expect(classifyWhyStopped(null)).toBe("unknown");
});

test("wilsonInterval computes expected 95% confidence bounds for 10/14", () => {
  const ci = wilsonInterval(10, 14);
  expect(ci).not.toBeNull();
  // 10/14 = 71.4%, 95% Wilson interval is ~0.454 to ~0.883
  expect(ci.low).toBeCloseTo(0.454, 2);
  expect(ci.high).toBeCloseTo(0.883, 2);
  expect(wilsonInterval(0, 0)).toBeNull();
});

test("completion stats separate combined phases, count EARLY_PHASE1, and compute operational & UNKNOWN sensitivity rates", () => {
  const studies = [
    { phases: ["EARLY_PHASE1"], status: "COMPLETED" },
    { phases: ["PHASE1"], status: "COMPLETED" },
    { phases: ["PHASE1"], status: "TERMINATED", whyStopped: "slow accrual" },
    { phases: ["PHASE1"], status: "TERMINATED", whyStopped: "unacceptable toxicity" },
    { phases: ["PHASE1"], status: "UNKNOWN" },
    { phases: ["PHASE1", "PHASE2"], status: "COMPLETED" },
    { phases: ["PHASE2", "PHASE3"], status: "TERMINATED", whyStopped: "futility at interim analysis" },
  ];

  const stats = computeCompletionStats(studies);

  // Combined trials are in COMBINED, not counted in PHASE1 or PHASE2
  expect(stats.PHASE1.n).toBe(4);
  expect(stats.PHASE1.earlyPhase1).toBe(1);
  expect(stats.PHASE1.completed).toBe(2);
  expect(stats.PHASE1.whyStopped.operational).toBe(1);
  expect(stats.PHASE1.whyStopped.safety).toBe(1);
  expect(stats.PHASE1.excludingOperational.numerator).toBe(2);
  expect(stats.PHASE1.excludingOperational.denominator).toBe(3);
  expect(stats.PHASE1.unknownStatus).toBe(1);
  expect(stats.PHASE1.sensitivityIncludeUnknown.numerator).toBe(2);
  expect(stats.PHASE1.sensitivityIncludeUnknown.denominator).toBe(5);

  expect(stats.COMBINED.n).toBe(2);
  expect(stats.COMBINED.phase1_2).toBe(1);
  expect(stats.COMBINED.phase2_3).toBe(1);
  expect(stats.COMBINED.whyStopped.efficacy).toBe(1);
});

test("classifyDiseaseArea separates oncology from non-oncology trial conditions", () => {
  expect(classifyDiseaseArea({ conditions: ["Non-Small Cell Lung Carcinoma"] })).toBe("oncology");
  expect(classifyDiseaseArea({ conditions: ["Chronic Myeloid Leukemia"] })).toBe("oncology");
  expect(classifyDiseaseArea({ conditions: ["Postmenopausal Osteoporosis"] })).toBe("non_oncology");
});

test("below-threshold samples (n < 30) never produce a percentage in formatPhaseRate or formatPhaseDisplay", () => {
  expect(formatPhaseRate({ n: 3, rate: 0.5, reliable: false })).toBeNull();
  expect(formatPhaseRate({ n: 29, rate: 0.8, reliable: true })).toBeNull();
  expect(uiFormatPhaseRate({ n: 14, rate: 0.714, reliable: true })).toBeNull();
  expect(formatPhaseRate({ n: 50, rate: 0.678, reliable: true })).toBe(67.8);

  for (const n of [1, 4, 10, 14, 29]) {
    const serverDisplay = formatPhaseDisplay({ n, rate: 0.9, reliable: false });
    expect(serverDisplay.kind).toBe("insufficient");
    expect(serverDisplay.rateText).toBe(`Insufficient sample (n=${n})`);
    expect(serverDisplay.rateText).not.toMatch(/%/);

    const uiDisplay = uiFormatPhaseDisplay({ n, rate: 0.75, reliable: true });
    expect(uiDisplay.kind).toBe("insufficient");
    expect(uiDisplay.rateText).toBe(`Insufficient sample (n=${n})`);
    expect(uiDisplay.rateText).not.toMatch(/%/);
  }
});

test("formatPhaseDisplay shows rate, CI, and n for reliable phases (n >= 30)", () => {
  const displayNoCi = formatPhaseDisplay({ n: 120, rate: 0.648, reliable: true });
  expect(displayNoCi.kind).toBe("rate");
  expect(displayNoCi.rateText).toBe("64.8%");
  expect(displayNoCi.detailText).toBe("n=120");

  const displayWithCi = uiFormatPhaseDisplay({
    n: 120,
    rate: 0.65,
    reliable: true,
    ci: { low: 0.561, high: 0.729 },
  });
  expect(displayWithCi.kind).toBe("rate");
  expect(displayWithCi.rateText).toBe("65%");
  expect(displayWithCi.ciText).toBe("95% CI 56.1–72.9%");
  expect(displayWithCi.detailText).toMatch(/95% CI 56\.1–72\.9%/);
  expect(displayWithCi.detailText).toMatch(/n=120/);
});

test("describeTrialSuccessMatch explains EGFR target rule match", () => {
  const ctx = getTrialSuccessContext(egfrProtein);
  expect(describeTrialSuccessMatch(ctx)).toMatch(/target rule/i);
  expect(describeTrialSuccessMatch(ctx)).toMatch(/EGFR/i);
});

test("LIMITATION_NOTE does not call completion rate a success rate", () => {
  expect(LIMITATION_NOTE.toLowerCase()).not.toMatch(/\bsuccess\b/);
  expect(LIMITATION_NOTE).toMatch(/Phase transition rate/);
  expect(LIMITATION_NOTE).toMatch(/Trial completion rate/);
});
