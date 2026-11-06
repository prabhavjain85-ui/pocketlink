/**
 * Clinical Failure Autopsy -> Medicinal-Chemistry Redesign Engine
 *
 * Translates clinical trial stop reasons (Open Targets trialStopReasonCategories,
 * trialWhyStopped free text, and target organ safety liabilities) into concrete,
 * quantitative physicochemical redesign constraints for RDKit local molecular search.
 */
import { dHi, dLo, dWin } from "./evolution/evolutionDesirability.js";

export const VALID_FAILURE_MODES = new Set([
  "standard",
  "hepatotoxicity",
  "cns_sparing",
  "cardiotoxicity",
  "solubility_pk",
  "potency_rescue",
]);

export const FAILURE_MODE_SPECS = {
  standard: {
    id: "standard",
    label: "Standard Search (Balanced Drug-Likeness)",
    shortLabel: "Standard",
    clinicalTrigger: "General multiparameter optimization",
    biologicalMechanism: "Balanced oral druglikeness (QED, SA score, Lipinski/Veber windows).",
    prescriptionSummary: "Maintain MW 220–520 Da, cLogP 0.5–4.5, TPSA 20–140 Å², and zero PAINS.",
    targets: [
      { key: "logp", label: "cLogP", targetText: "0.5 – 4.5" },
      { key: "tpsa", label: "TPSA", targetText: "20 – 140 Å²" },
      { key: "mw", label: "MW", targetText: "220 – 520 Da" },
    ],
  },
  hepatotoxicity: {
    id: "hepatotoxicity",
    label: "Liver Safety (DILI / Reactive Metabolite Fix)",
    shortLabel: "Liver / DILI Fix",
    clinicalTrigger: "Stopped for hepatotoxicity, elevated transaminases (ALT/AST), or biliary toxicity",
    biologicalMechanism:
      "High lipophilicity (cLogP > 3) coupled with flat aromatic rings drives hepatic CYP450 bioactivation into reactive metabolites and mitochondrial/bile-salt export pump (BSEP) inhibition.",
    prescriptionSummary:
      "Lower cLogP ≤ 2.8, increase 3D saturation (Fsp³ ≥ 0.30), maintain TPSA ≥ 65 Å², and strip Brenk/PAINS toxicophores.",
    targets: [
      { key: "logp", label: "cLogP", targetText: "≤ 2.8 (reduce hepatic trapping)" },
      { key: "fsp3", label: "Fsp³", targetText: "≥ 0.30 (disrupt flat aryl oxidation)" },
      { key: "tpsa", label: "TPSA", targetText: "65 – 120 Å²" },
    ],
  },
  cns_sparing: {
    id: "cns_sparing",
    label: "Brain-Sparing (Peripheral Restriction / CNS Toxicity Fix)",
    shortLabel: "Brain-Sparing (BBB−)",
    clinicalTrigger: "Stopped for CNS adverse events (dizziness, seizure, sedation, neurotoxicity) in a non-CNS indication",
    biologicalMechanism:
      "Low polar surface area (TPSA < 75 Å²) and low H-bond donor count allow passive blood–brain barrier (BBB) permeation into healthy central nervous tissue.",
    prescriptionSummary:
      "Push TPSA into 90–135 Å² and HBD ≥ 2 to lock the molecule out of the brain (BOILED-Egg white) while preserving oral GI absorption.",
    targets: [
      { key: "tpsa", label: "TPSA", targetText: "90 – 135 Å² (block BBB crossing)" },
      { key: "hbd", label: "H-Bond Donors", targetText: "≥ 2 (promote peripheral restriction)" },
      { key: "logp", label: "cLogP", targetText: "0.5 – 3.0" },
    ],
  },
  cardiotoxicity: {
    id: "cardiotoxicity",
    label: "Cardiac Safety (hERG / QT Prolongation Fix)",
    shortLabel: "Cardiac / hERG Fix",
    clinicalTrigger: "Stopped for QT prolongation, arrhythmia, or cardiac safety liability",
    biologicalMechanism:
      "Lipophilic molecules (cLogP > 3.2) with basic or grease-heavy scaffolds plug the central cavity of the cardiac hERG (Kv11.1) potassium channel.",
    prescriptionSummary:
      "Shift cLogP down to 0.8–2.6, increase polar surface area (TPSA ≥ 75 Å²), and keep MW ≤ 440 Da to abolish hERG cavity binding.",
    targets: [
      { key: "logp", label: "cLogP", targetText: "0.8 – 2.6 (attenuate hERG binding)" },
      { key: "tpsa", label: "TPSA", targetText: "≥ 75 Å²" },
      { key: "mw", label: "MW", targetText: "≤ 440 Da" },
    ],
  },
  solubility_pk: {
    id: "solubility_pk",
    label: "Solubility & Exposure Rescue (PK / Bioavailability Fix)",
    shortLabel: "PK / Solubility Rescue",
    clinicalTrigger: "Stopped for poor oral exposure, GI intolerance, high dose burden, or formulation failure",
    biologicalMechanism:
      "Excessive molecular weight ('molecular obesity'), high rotatable bond count, and poor aqueous solubility limit intestinal dissolution and portal absorption.",
    prescriptionSummary:
      "Enforce compact lead-like size (MW ≤ 400 Da), cLogP ≤ 3.0, rotatable bonds ≤ 6, and Fsp³ ≥ 0.25 to rescue aqueous dissolution.",
    targets: [
      { key: "mw", label: "MW", targetText: "≤ 400 Da (reduce molecular obesity)" },
      { key: "logp", label: "cLogP", targetText: "0.5 – 3.0" },
      { key: "rotb", label: "Rotatable Bonds", targetText: "≤ 6" },
    ],
  },
  potency_rescue: {
    id: "potency_rescue",
    label: "Efficacy & Ligand Efficiency Rescue (Negative Trial Fix)",
    shortLabel: "Efficacy / LE Rescue",
    clinicalTrigger: "Stopped for lack of clinical efficacy (Negative / futility at interim analysis)",
    biologicalMechanism:
      "Sub-optimal binding efficiency per heavy atom (low Ligand Efficiency) or insufficient polar contact density fails to sustain target occupancy at tolerated doses.",
    prescriptionSummary:
      "Preserve core pharmacophore (Tanimoto ≥ 0.50), compact heavy-atom count (MW 280–430 Da), and tune TPSA (65–110 Å²) for high-efficiency polar contacts.",
    targets: [
      { key: "mw", label: "MW", targetText: "280 – 430 Da (maximize LE)" },
      { key: "tpsa", label: "TPSA", targetText: "65 – 110 Å² (polar anchor contacts)" },
      { key: "logp", label: "cLogP", targetText: "1.2 – 3.5" },
    ],
  },
};

export function normalizeFailureMode(raw) {
  const key = String(raw || "standard").trim().toLowerCase();
  return VALID_FAILURE_MODES.has(key) ? key : "standard";
}

export function getFailureModeSpec(mode) {
  return FAILURE_MODE_SPECS[normalizeFailureMode(mode)] || FAILURE_MODE_SPECS.standard;
}

/**
 * Diagnose the primary clinical failure mode from Open Targets trial stop reasons,
 * stop categories, and target organ safety annotations.
 */
export function deriveFailureRedesignProfile({
  whyStopped = [],
  stopCategories = {},
  safetyOrgans = [],
  state = "none",
  diseaseName = "",
  drugs = [],
} = {}) {
  const reasonsText = (Array.isArray(whyStopped) ? whyStopped : [])
    .map((w) => (typeof w === "string" ? w : w?.reason || ""))
    .join(" ")
    .toLowerCase();
  const organsText = (Array.isArray(safetyOrgans) ? safetyOrgans : []).join(" ").toLowerCase();
  const combined = `${reasonsText} ${organsText}`;
  const isCnsDisease = /alzheimer|parkinson|glioma|glioblastoma|epilep|schizophren|als|amyotrophic|huntington|multiple sclerosis|brain|cns/i.test(
    String(diseaseName || "")
  );

  const hasSafetyStop = Number(stopCategories?.Safety_Sideeffects || 0) > 0;
  const hasNegativeStop = Number(stopCategories?.Negative || 0) > 0;

  let mode = "standard";
  let detectedReason = "";

  if (/hepato|liver|transaminas|\balt\b|\bast\b|biliary|jaundice|dili/i.test(combined)) {
    mode = "hepatotoxicity";
    detectedReason = "Hepatic / transaminase liability detected in clinical or safety records";
  } else if (/cardiac|cardio|\bqt\b|arrhythm|herg|torsade|ventricular|myocard/i.test(combined)) {
    mode = "cardiotoxicity";
    detectedReason = "Cardiac / QT prolongation liability detected in clinical or safety records";
  } else if (!isCnsDisease && /neuro|seizure|dizz|sedat|encephal|ataxia|central nervous|tremor|confusion/i.test(combined)) {
    mode = "cns_sparing";
    detectedReason = "CNS / neurological adverse events reported in a non-CNS indication";
  } else if (/pharmacokinet|bioavailab|exposure|solubil|absorption|gastrointestin|diarrhea|vomiting|nausea/i.test(combined)) {
    mode = "solubility_pk";
    detectedReason = "PK exposure or gastrointestinal tolerability limitation reported";
  } else if (hasSafetyStop) {
    mode = "hepatotoxicity";
    detectedReason = `Safety / side-effect trial termination (${stopCategories.Safety_Sideeffects} report${
      stopCategories.Safety_Sideeffects === 1 ? "" : "s"
    })`;
  } else if (hasNegativeStop || state === "stopped_scientific") {
    mode = "potency_rescue";
    detectedReason = `Lack of clinical efficacy / interim futility (${
      stopCategories?.Negative || 1
    } negative trial report${(stopCategories?.Negative || 1) === 1 ? "" : "s"})`;
  }

  const spec = getFailureModeSpec(mode);
  const candidateDrugs = (Array.isArray(drugs) ? drugs : [])
    .filter((d) => d && d.name)
    .slice(0, 6);

  return {
    active: mode !== "standard",
    mode,
    label: spec.label,
    shortLabel: spec.shortLabel,
    detectedReason: detectedReason || spec.clinicalTrigger,
    biologicalMechanism: spec.biologicalMechanism,
    prescriptionSummary: spec.prescriptionSummary,
    targets: spec.targets,
    recommendedSeedSimilarityFloor: mode === "potency_rescue" ? 0.5 : 0.4,
    candidateDrugs,
  };
}

/**
 * Continuous [0, 1] desirability term measuring how well a molecule's properties
 * satisfy the active clinical failure remediation prescription.
 */
export function computeFailureRemediationDesirability(raw = {}, mode = "standard") {
  const m = normalizeFailureMode(mode);
  if (m === "standard") return null;

  const mw = Number(raw.mw ?? 380);
  const logp = Number(raw.logp ?? 2.5);
  const tpsa = Number(raw.tpsa ?? 75);
  const fsp3 = Number(raw.fsp3 ?? 0.25);
  const hbd = Number(raw.hbd ?? 1);
  const rotb = Number(raw.rotb ?? 5);
  const brenk = Number(raw.brenkCount ?? 0);

  if (m === "hepatotoxicity") {
    const dLogp = dLo(logp, 2.2, 3.4, 1.5);
    const dSat = dHi(fsp3, 0.15, 0.35, 1.2);
    const dPol = dWin(tpsa, 85, 55, 130);
    const dClean = brenk === 0 ? 1 : brenk === 1 ? 0.35 : 0.05;
    return Math.pow(Math.max(dLogp, 0.02) * Math.max(dSat, 0.02) * Math.max(dPol, 0.02) * dClean, 0.25);
  }

  if (m === "cns_sparing") {
    // Reward TPSA 90-135 A^2 (peripherally restricted, GI absorbed) and HBD >= 2
    const dPol = dWin(tpsa, 110, 82, 142);
    const dDonor = dHi(hbd, 1, 2.5, 1.2);
    const dLogp = dLo(logp, 2.5, 3.8, 1.3);
    return Math.pow(Math.max(dPol, 0.02) * Math.max(dDonor, 0.02) * Math.max(dLogp, 0.02), 1 / 3);
  }

  if (m === "cardiotoxicity") {
    const dLogp = dWin(logp, 1.8, 0.2, 3.0);
    const dPol = dHi(tpsa, 55, 85, 1.2);
    const dSize = dLo(mw, 410, 480, 1.2);
    return Math.pow(Math.max(dLogp, 0.02) * Math.max(dPol, 0.02) * Math.max(dSize, 0.02), 1 / 3);
  }

  if (m === "solubility_pk") {
    const dSize = dLo(mw, 370, 450, 1.4);
    const dLogp = dLo(logp, 2.4, 3.6, 1.3);
    const dRot = dLo(rotb, 5, 9, 1.2);
    const dSat = dHi(fsp3, 0.15, 0.32, 1.0);
    return Math.pow(Math.max(dSize, 0.02) * Math.max(dLogp, 0.02) * Math.max(dRot, 0.02) * Math.max(dSat, 0.02), 0.25);
  }

  if (m === "potency_rescue") {
    const dSize = dWin(mw, 355, 250, 445);
    const dPol = dWin(tpsa, 85, 55, 120);
    const dLogp = dWin(logp, 2.3, 0.8, 3.8);
    return Math.pow(Math.max(dSize, 0.02) * Math.max(dPol, 0.02) * Math.max(dLogp, 0.02), 1 / 3);
  }

  return null;
}

function fmt(val, digits = 2) {
  const n = Number(val);
  return Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

/**
 * Compare the starting seed molecule against an evolved child variant under the
 * active failure-redesign mode so the UI can show a clear Before -> After table.
 */
export function evaluateRemediationDelta(seedRow, variantRow, mode = "standard") {
  const m = normalizeFailureMode(mode);
  if (m === "standard" || !seedRow || !variantRow) return null;

  const spec = getFailureModeSpec(m);
  const checks = [];

  if (m === "hepatotoxicity") {
    const logpPass = Number(variantRow.logp) <= 2.8;
    const fsp3Pass = Number(variantRow.fsp3) >= 0.3;
    const tpsaPass = Number(variantRow.tpsa) >= 65 && Number(variantRow.tpsa) <= 125;
    checks.push(
      {
        label: "cLogP (≤ 2.8)",
        before: fmt(seedRow.logp, 2),
        after: fmt(variantRow.logp, 2),
        pass: logpPass,
        improved: Number(variantRow.logp) < Number(seedRow.logp) || logpPass,
      },
      {
        label: "Fsp³ (≥ 0.30)",
        before: fmt(seedRow.fsp3, 2),
        after: fmt(variantRow.fsp3, 2),
        pass: fsp3Pass,
        improved: Number(variantRow.fsp3) > Number(seedRow.fsp3) || fsp3Pass,
      },
      {
        label: "TPSA (65–125 Å²)",
        before: `${fmt(seedRow.tpsa, 1)} Å²`,
        after: `${fmt(variantRow.tpsa, 1)} Å²`,
        pass: tpsaPass,
        improved: tpsaPass,
      }
    );
  } else if (m === "cns_sparing") {
    const tpsaPass = Number(variantRow.tpsa) >= 90 && Number(variantRow.tpsa) <= 135;
    const hbdPass = Number(variantRow.hbd) >= 2;
    const logpPass = Number(variantRow.logp) <= 3.0;
    checks.push(
      {
        label: "TPSA (90–135 Å² BBB−)",
        before: `${fmt(seedRow.tpsa, 1)} Å²`,
        after: `${fmt(variantRow.tpsa, 1)} Å²`,
        pass: tpsaPass,
        improved: Number(variantRow.tpsa) > Number(seedRow.tpsa) || tpsaPass,
      },
      {
        label: "HBD (≥ 2)",
        before: String(seedRow.hbd ?? "0"),
        after: String(variantRow.hbd ?? "0"),
        pass: hbdPass,
        improved: Number(variantRow.hbd) > Number(seedRow.hbd) || hbdPass,
      },
      {
        label: "cLogP (≤ 3.0)",
        before: fmt(seedRow.logp, 2),
        after: fmt(variantRow.logp, 2),
        pass: logpPass,
        improved: Number(variantRow.logp) < Number(seedRow.logp) || logpPass,
      }
    );
  } else if (m === "cardiotoxicity") {
    const logpPass = Number(variantRow.logp) >= 0.5 && Number(variantRow.logp) <= 2.6;
    const tpsaPass = Number(variantRow.tpsa) >= 75;
    const mwPass = Number(variantRow.mw) <= 440;
    checks.push(
      {
        label: "cLogP (0.5–2.6 hERG-safe)",
        before: fmt(seedRow.logp, 2),
        after: fmt(variantRow.logp, 2),
        pass: logpPass,
        improved: Number(variantRow.logp) < Number(seedRow.logp) || logpPass,
      },
      {
        label: "TPSA (≥ 75 Å²)",
        before: `${fmt(seedRow.tpsa, 1)} Å²`,
        after: `${fmt(variantRow.tpsa, 1)} Å²`,
        pass: tpsaPass,
        improved: Number(variantRow.tpsa) > Number(seedRow.tpsa) || tpsaPass,
      },
      {
        label: "MW (≤ 440 Da)",
        before: `${fmt(seedRow.mw, 1)} Da`,
        after: `${fmt(variantRow.mw, 1)} Da`,
        pass: mwPass,
        improved: Number(variantRow.mw) <= Number(seedRow.mw) || mwPass,
      }
    );
  } else if (m === "solubility_pk") {
    const mwPass = Number(variantRow.mw) <= 400;
    const logpPass = Number(variantRow.logp) <= 3.0;
    const rotbPass = Number(variantRow.rotb) <= 6;
    checks.push(
      {
        label: "MW (≤ 400 Da)",
        before: `${fmt(seedRow.mw, 1)} Da`,
        after: `${fmt(variantRow.mw, 1)} Da`,
        pass: mwPass,
        improved: Number(variantRow.mw) < Number(seedRow.mw) || mwPass,
      },
      {
        label: "cLogP (≤ 3.0)",
        before: fmt(seedRow.logp, 2),
        after: fmt(variantRow.logp, 2),
        pass: logpPass,
        improved: Number(variantRow.logp) < Number(seedRow.logp) || logpPass,
      },
      {
        label: "RotB (≤ 6)",
        before: String(seedRow.rotb ?? "n/a"),
        after: String(variantRow.rotb ?? "n/a"),
        pass: rotbPass,
        improved: Number(variantRow.rotb) <= Number(seedRow.rotb) || rotbPass,
      }
    );
  } else if (m === "potency_rescue") {
    const mwPass = Number(variantRow.mw) >= 280 && Number(variantRow.mw) <= 430;
    const tpsaPass = Number(variantRow.tpsa) >= 65 && Number(variantRow.tpsa) <= 110;
    const simPass = Number(variantRow.seedSimilarity ?? 1) >= 0.5;
    checks.push(
      {
        label: "MW (280–430 Da compact LE)",
        before: `${fmt(seedRow.mw, 1)} Da`,
        after: `${fmt(variantRow.mw, 1)} Da`,
        pass: mwPass,
        improved: mwPass,
      },
      {
        label: "TPSA (65–110 Å²)",
        before: `${fmt(seedRow.tpsa, 1)} Å²`,
        after: `${fmt(variantRow.tpsa, 1)} Å²`,
        pass: tpsaPass,
        improved: tpsaPass,
      },
      {
        label: "Core Tanimoto (≥ 0.50)",
        before: "1.00",
        after: fmt(variantRow.seedSimilarity ?? 1, 2),
        pass: simPass,
        improved: simPass,
      }
    );
  }

  const passCount = checks.filter((c) => c.pass).length;
  const improvedCount = checks.filter((c) => c.improved).length;
  const status =
    passCount === checks.length
      ? "remediated"
      : passCount >= 2 || improvedCount >= 2
        ? "improved"
        : "partial";

  const statusLabel =
    status === "remediated"
      ? `All ${checks.length}/${checks.length} ${spec.shortLabel} constraints met`
      : `${passCount}/${checks.length} constraints met (${improvedCount} improved vs. seed)`;

  return {
    mode: m,
    shortLabel: spec.shortLabel,
    status,
    statusLabel,
    passCount,
    totalChecks: checks.length,
    checks,
  };
}
