import {
  computeFailureRemediationDesirability,
  deriveFailureRedesignProfile,
  evaluateRemediationDelta,
  normalizeFailureMode,
} from "../server/failureRedesign";
import { desirabilityBundle } from "../server/evolution/evolutionDesirability";

describe("Clinical Failure Autopsy -> Molecule Redesign Engine", () => {
  test("diagnoses hepatotoxicity from stop reasons or liver safety flags", () => {
    const profile = deriveFailureRedesignProfile({
      whyStopped: [{ reason: "Dose-limiting grade 3 ALT/AST transaminase elevation and hepatotoxicity", year: 2021 }],
      stopCategories: { Safety_Sideeffects: 1 },
      drugs: [{ id: "CHEMBL1", name: "Tivantinib" }],
    });
    expect(profile.active).toBe(true);
    expect(profile.mode).toBe("hepatotoxicity");
    expect(profile.candidateDrugs[0].name).toBe("Tivantinib");
    expect(profile.prescriptionSummary).toMatch(/cLogP ≤ 2.8/i);
  });

  test("diagnoses peripheral restriction (cns_sparing) when neurotoxicity occurs in non-CNS disease", () => {
    const profile = deriveFailureRedesignProfile({
      whyStopped: [{ reason: "Terminated due to severe dizziness, sedation, and central nervous system adverse events" }],
      stopCategories: { Safety_Sideeffects: 1 },
      diseaseName: "pancreatic neoplasm",
    });
    expect(profile.active).toBe(true);
    expect(profile.mode).toBe("cns_sparing");
    expect(profile.prescriptionSummary).toMatch(/90–135 Å²/i);
  });

  test("diagnoses cardiotoxicity from QT prolongation or hERG flags", () => {
    const profile = deriveFailureRedesignProfile({
      whyStopped: [{ reason: "QTc prolongation and ventricular arrhythmia risk" }],
      stopCategories: { Safety_Sideeffects: 1 },
    });
    expect(profile.active).toBe(true);
    expect(profile.mode).toBe("cardiotoxicity");
  });

  test("diagnoses potency_rescue when trials stopped for Negative efficacy without toxicity", () => {
    const profile = deriveFailureRedesignProfile({
      whyStopped: [{ reason: "Lack of efficacy at interim futility analysis" }],
      stopCategories: { Negative: 2 },
      state: "stopped_scientific",
    });
    expect(profile.active).toBe(true);
    expect(profile.mode).toBe("potency_rescue");
    expect(profile.recommendedSeedSimilarityFloor).toBe(0.5);
  });

  test("computeFailureRemediationDesirability rewards molecules that fix the clinical liability", () => {
    // Brain-penetrant seed (TPSA 48, HBD 0, LogP 3.9) vs peripherally restricted variant (TPSA 108, HBD 2, LogP 2.1)
    const cnsPenetrant = computeFailureRemediationDesirability(
      { mw: 390, logp: 3.9, tpsa: 48, hbd: 0, fsp3: 0.2 },
      "cns_sparing"
    );
    const peripherallyRestricted = computeFailureRemediationDesirability(
      { mw: 395, logp: 2.1, tpsa: 108, hbd: 2, fsp3: 0.3 },
      "cns_sparing"
    );
    expect(peripherallyRestricted).toBeGreaterThan(0.8);
    expect(peripherallyRestricted).toBeGreaterThan(cnsPenetrant * 2);

    // Grease-heavy hepatotoxic seed vs high-Fsp3 low-LogP variant
    const diliProne = computeFailureRemediationDesirability(
      { mw: 450, logp: 4.4, tpsa: 52, fsp3: 0.08, brenkCount: 1 },
      "hepatotoxicity"
    );
    const liverSafe = computeFailureRemediationDesirability(
      { mw: 380, logp: 2.0, tpsa: 84, fsp3: 0.38, brenkCount: 0 },
      "hepatotoxicity"
    );
    expect(liverSafe).toBeGreaterThan(0.85);
    expect(liverSafe).toBeGreaterThan(diliProne * 2);
  });

  test("evaluateRemediationDelta computes Before -> After checks accurately", () => {
    const seed = { mw: 440, logp: 3.9, tpsa: 54, fsp3: 0.14, hbd: 1, rotb: 7 };
    const evolved = { mw: 390, logp: 2.3, tpsa: 88, fsp3: 0.34, hbd: 2, rotb: 5 };
    const delta = evaluateRemediationDelta(seed, evolved, "hepatotoxicity");
    expect(delta.status).toBe("remediated");
    expect(delta.passCount).toBe(3);
    expect(delta.checks).toHaveLength(3);
    expect(delta.checks[0].before).toBe("3.90");
    expect(delta.checks[0].after).toBe("2.30");
    expect(delta.checks[0].pass).toBe(true);
  });

  test("desirabilityBundle folds d_remediation into composite score when failureMode is active", () => {
    const raw = {
      qed: 0.72,
      sa: 2.8,
      novelty: 0.3,
      mw: 380,
      logp: 2.1,
      tpsa: 106,
      fsp3: 0.32,
      painsCount: 0,
      brenkCount: 0,
    };
    const dRem = computeFailureRemediationDesirability({ ...raw, hbd: 2 }, "cns_sparing");
    const bundle = desirabilityBundle(raw, {
      targetFree: true,
      failureMode: normalizeFailureMode("cns_sparing"),
      dRemediation: dRem,
    });
    expect(bundle.failureMode).toBe("cns_sparing");
    expect(bundle.desirabilities.d_remediation).toBeCloseTo(dRem, 4);
    expect(bundle.terms.some((t) => t.key === "d_remediation")).toBe(true);
  });
});
