import {
  deriveState,
  isScientificStop,
  matchesDisease,
  summarizeReports,
  topStage,
  SCIENTIFIC_STOP_CATEGORIES,
  fetchTargetClinicalActivity,
  __testing,
} from "../server/clinicalActivity";
import * as openTargets from "../server/openTargets";

const report = (status, categories = [], why = null, year = 2021) => ({
  trialOverallStatus: status,
  trialStopReasonCategories: categories,
  trialWhyStopped: why,
  year,
});

describe("stop reason classification", () => {
  test("only efficacy and safety count as scientific setbacks", () => {
    expect(isScientificStop(["Negative"])).toBe(true);
    expect(isScientificStop(["Safety_Sideeffects"])).toBe(true);
    // The measured majority: 730 enrollment and 527 business stops against 189 negative.
    expect(isScientificStop(["Insufficient_Enrollment"])).toBe(false);
    expect(isScientificStop(["Business_Administrative"])).toBe(false);
    expect(isScientificStop(["Logistics_Resources", "Covid19"])).toBe(false);
    expect(isScientificStop([])).toBe(false);
    expect(isScientificStop(undefined)).toBe(false);
  });

  test("a mixed category list counts as scientific if any reason is", () => {
    expect(isScientificStop(["Insufficient_Enrollment", "Negative"])).toBe(true);
    expect(SCIENTIFIC_STOP_CATEGORIES.size).toBe(2);
  });

  test("summarize splits scientific from non-scientific stops", () => {
    const summary = summarizeReports([
      {
        clinicalReports: [
          report("RECRUITING"),
          report("ACTIVE_NOT_RECRUITING"),
          report("COMPLETED"),
          report("TERMINATED", ["Negative"], "Futility at interim analysis", 2020),
          report("TERMINATED", ["Insufficient_Enrollment"], "slow accrual", 2019),
          report("WITHDRAWN", ["Business_Administrative"], "sponsor priorities", 2022),
        ],
      },
    ]);
    expect(summary.ongoing).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.stoppedScientific).toBe(1);
    expect(summary.stoppedOther).toBe(2);
    expect(summary.stopCategories.Negative).toBe(1);
    expect(summary.whyStopped[0].reason).toMatch(/futility/i);
    expect(summary.latestYear).toBe(2022);
  });
});

describe("disease scoping", () => {
  // Measured: TUBA4A lists 85 candidates globally, of which 1 is for ALS.
  const candidate = {
    diseases: [
      { diseaseFromSource: "Breast cancer", disease: { id: "MONDO_0007254", name: "breast carcinoma" } },
      { diseaseFromSource: "ALS", disease: { id: "MONDO_0004976", name: "amyotrophic lateral sclerosis" } },
    ],
  };

  test("matches on ontology id", () => {
    expect(matchesDisease(candidate, "MONDO_0004976", "")).toBe(true);
    expect(matchesDisease(candidate, "MONDO_9999999", "")).toBe(false);
  });

  test("falls back to the disease name when no id is supplied", () => {
    expect(matchesDisease(candidate, "", "amyotrophic lateral sclerosis")).toBe(true);
    expect(matchesDisease(candidate, "", "pancreatic neoplasm")).toBe(false);
  });

  test("a candidate with no disease list never matches", () => {
    expect(matchesDisease({ diseases: [] }, "MONDO_0004976", "ALS")).toBe(false);
  });
});

describe("state derivation", () => {
  test("no candidates for this disease is its own state", () => {
    expect(deriveState({ candidates: 0 })).toBe("none");
  });

  test("ongoing takes priority, then scientific stops", () => {
    expect(deriveState({ candidates: 2, ongoing: 1, stoppedScientific: 3 })).toBe("ongoing");
    expect(deriveState({ candidates: 2, ongoing: 0, stoppedScientific: 1, completed: 5 })).toBe("stopped_scientific");
    expect(deriveState({ candidates: 2, ongoing: 0, stoppedScientific: 0, completed: 2 })).toBe("completed");
    expect(deriveState({ candidates: 1, ongoing: 0, stoppedScientific: 0, completed: 0, stoppedOther: 4 })).toBe("stopped_other");
  });

  test("highest stage wins", () => {
    expect(topStage([{ maxClinicalStage: "PHASE_1" }, { maxClinicalStage: "PHASE_3" }])).toBe("PHASE_3");
    expect(topStage([{ maxClinicalStage: "APPROVAL" }, { maxClinicalStage: "PHASE_3" }])).toBe("APPROVAL");
    expect(topStage([])).toBeNull();
  });
});

describe("fetchTargetClinicalActivity", () => {
  beforeEach(() => __testing.cache.clear());
  afterEach(() => jest.restoreAllMocks());

  const payload = {
    target: {
      approvedSymbol: "TUBA4A",
      drugAndClinicalCandidates: {
        count: 2,
        rows: [
          {
            maxClinicalStage: "APPROVAL",
            drug: { id: "CHEMBL1", name: "SomeOncologyDrug" },
            diseases: [{ disease: { id: "MONDO_0007254", name: "breast carcinoma" } }],
            clinicalReports: [report("COMPLETED"), report("TERMINATED", ["Negative"], "futility")],
          },
          {
            maxClinicalStage: "PHASE_2",
            drug: { id: "CHEMBL2", name: "AlsCandidate" },
            diseases: [{ disease: { id: "MONDO_0004976", name: "amyotrophic lateral sclerosis" } }],
            clinicalReports: [report("RECRUITING")],
          },
        ],
      },
    },
  };

  test("scopes counts to the queried disease and keeps the global figure separate", async () => {
    jest.spyOn(openTargets, "otGraphql").mockResolvedValue(payload);
    const out = await fetchTargetClinicalActivity("ENSG_TEST", {
      diseaseId: "MONDO_0004976",
      diseaseName: "amyotrophic lateral sclerosis",
    });

    expect(out.available).toBe(true);
    expect(out.state).toBe("ongoing");
    // One of the two candidates is for this disease; the oncology one is not.
    expect(out.forThisDisease.candidates).toBe(1);
    expect(out.forThisDisease.ongoing).toBe(1);
    expect(out.forThisDisease.stoppedScientific).toBe(0);
    expect(out.forThisDisease.drugs[0].name).toBe("AlsCandidate");
    // The global view still reports both, clearly separated.
    expect(out.anyIndication.candidates).toBe(2);
    expect(out.anyIndication.stoppedScientific).toBe(1);
  });

  test("reports 'none' when nothing targets this disease, without hiding global history", async () => {
    jest.spyOn(openTargets, "otGraphql").mockResolvedValue(payload);
    const out = await fetchTargetClinicalActivity("ENSG_TEST", {
      diseaseId: "MONDO_0021040",
      diseaseName: "pancreatic neoplasm",
    });
    expect(out.state).toBe("none");
    expect(out.forThisDisease.candidates).toBe(0);
    expect(out.anyIndication.candidates).toBe(2);
  });

  test("degrades to unavailable rather than throwing when Open Targets fails", async () => {
    jest.spyOn(openTargets, "otGraphql").mockRejectedValue(new Error("network down"));
    const out = await fetchTargetClinicalActivity("ENSG_TEST", { diseaseId: "MONDO_1" });
    expect(out.available).toBe(false);
    expect(out.reason).toMatch(/could not be reached/i);
  });

  test("requires an Ensembl id and does not call the API without one", async () => {
    const spy = jest.spyOn(openTargets, "otGraphql");
    const out = await fetchTargetClinicalActivity("");
    expect(out.available).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  test("caches per target and disease", async () => {
    const spy = jest.spyOn(openTargets, "otGraphql").mockResolvedValue(payload);
    const args = { diseaseId: "MONDO_0004976", diseaseName: "als" };
    await fetchTargetClinicalActivity("ENSG_TEST", args);
    await fetchTargetClinicalActivity("ENSG_TEST", args);
    expect(spy).toHaveBeenCalledTimes(1);
    await fetchTargetClinicalActivity("ENSG_TEST", { diseaseId: "MONDO_0021040" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
