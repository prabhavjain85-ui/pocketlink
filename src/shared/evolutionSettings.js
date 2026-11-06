/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const FAILURE_REDESIGN_MODES = [
  {
    id: "standard",
    label: "Standard Search (Balanced)",
    shortLabel: "Standard",
    description: "Balanced multiparameter drug-likeness (QED, SA score, Lipinski/Veber windows).",
    prescription: "MW 220–520 Da · cLogP 0.5–4.5 · TPSA 20–140 Å²",
  },
  {
    id: "hepatotoxicity",
    label: "Liver Safety (DILI / Reactive Metabolite Fix)",
    shortLabel: "Liver / DILI Fix",
    description: "Engineered for candidates stopped due to elevated transaminases (ALT/AST), biliary toxicity, or DILI.",
    prescription: "cLogP ≤ 2.8 · Fsp³ ≥ 0.30 · TPSA 65–125 Å² · zero Brenk/PAINS alerts",
  },
  {
    id: "cns_sparing",
    label: "Brain-Sparing (Peripheral Restriction / CNS Toxicity Fix)",
    shortLabel: "Brain-Sparing (BBB−)",
    description: "Engineered for non-CNS candidates stopped for dizziness, sedation, seizure, or neurotoxicity.",
    prescription: "TPSA 90–135 Å² (BOILED-Egg white, BBB−) · HBD ≥ 2 · cLogP ≤ 3.0",
  },
  {
    id: "cardiotoxicity",
    label: "Cardiac Safety (hERG / QT Prolongation Fix)",
    shortLabel: "Cardiac / hERG Fix",
    description: "Engineered for candidates stopped or flagged for QT prolongation, arrhythmia, or hERG blockade.",
    prescription: "cLogP 0.8–2.6 · TPSA ≥ 75 Å² · MW ≤ 440 Da",
  },
  {
    id: "solubility_pk",
    label: "Solubility & Exposure Rescue (PK / Bioavailability Fix)",
    shortLabel: "PK / Solubility Rescue",
    description: "Engineered for candidates stopped for poor oral absorption, GI intolerance, or 'molecular obesity'.",
    prescription: "MW ≤ 400 Da · cLogP ≤ 3.0 · Rotatable Bonds ≤ 6 · Fsp³ ≥ 0.25",
  },
  {
    id: "potency_rescue",
    label: "Efficacy & Ligand Efficiency Rescue (Negative Trial Fix)",
    shortLabel: "Efficacy / LE Rescue",
    description: "Engineered for candidates stopped for interim futility or insufficient target engagement.",
    prescription: "Compact MW 280–430 Da · TPSA 65–110 Å² · Core Tanimoto ≥ 0.50",
  },
];

const VALID_MODES = new Set(FAILURE_REDESIGN_MODES.map((m) => m.id));

export const DEFAULT_EVOLUTION_SETTINGS = {
  generations: 5,
  variantsPerGeneration: 20,
  survivors: 5,
  rngSeed: 42,
  dockingBudgetPerGen: 8,
  seedSimilarityFloor: 0.4,
  independentRuns: 5,
  diversityMethod: "maxmin",
  protectedSmarts: "",
  protectedAtomIndices: [],
};

export function clampInt(raw, fallback, min, max) {
  const n = Number(raw);
  const value = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, value));
}

export function clampSettings(raw = {}) {
  const generations = clampInt(raw.generations, 5, 1, 8);
  const variantsPerGeneration = clampInt(raw.variantsPerGeneration, 20, 4, 40);
  const survivors = clampInt(raw.survivors, 5, 1, 10);
  const rngSeed = clampInt(raw.rngSeed, 42, 1, 2147483646);
  const dockingBudgetPerGen = clampInt(raw.dockingBudgetPerGen, 8, 0, 24);
  const seedSimilarityFloor = Number.isFinite(Number(raw.seedSimilarityFloor))
    ? Math.max(0, Math.min(1, Number(raw.seedSimilarityFloor)))
    : 0.4;
  const independentRuns = clampInt(raw.independentRuns, 5, 1, 12);
  const diversityMethod = raw.diversityMethod === "butina" ? "butina" : "maxmin";
  const protectedSmarts = String(raw.protectedSmarts || "").trim();
  const protectedAtomIndices = Array.isArray(raw.protectedAtomIndices)
    ? raw.protectedAtomIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];
  const out = {
    generations,
    variantsPerGeneration,
    survivors,
    rngSeed,
    dockingBudgetPerGen,
    seedSimilarityFloor,
    independentRuns,
    diversityMethod,
    protectedSmarts,
    protectedAtomIndices,
  };
  if (raw.failureMode !== undefined) {
    const rawMode = String(raw.failureMode || "standard").trim().toLowerCase();
    out.failureMode = VALID_MODES.has(rawMode) ? rawMode : "standard";
  }
  return out;
}
