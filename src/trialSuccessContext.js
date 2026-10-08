/**
 * Map a staged target to historical ClinicalTrials.gov completion base rates.
 * Pure function — reads committed artifact, no live API calls.
 */

import ratesArtifact from "./data/trialSuccessRates.json";
import { resolveTargetRule, targetFamily } from "./scoreCandidates";

export const LIMITATION_NOTE =
  "Historical trial completion rate for similar past interventional drug trials in this class and phase — not a prediction that this specific compound will succeed in clinic. CT.gov \"Completed\" means the trial finished without early termination; it does not imply efficacy or FDA approval.";

const MIN_SAMPLE_SIZE = ratesArtifact.minSampleSize ?? 10;
const REPORT_PHASES = ["PHASE1", "PHASE2", "PHASE3"];

/** TARGET_RULES id → trialSuccessRates.json category key */
const RULE_TO_CATEGORY = {
  egfr: "egfr",
  her2: "her2",
  abl: "abl",
  braf: "braf",
  beta2: "beta2_adrenergic",
  cox: "cox_inhibitor",
  hmgcr: "statin",
  dpp4: "dpp4_inhibitor",
  hiv_protease: "hiv_protease",
  sars_mpro: "protease_inhibitor",
  pde5: "pde5_inhibitor",
  hdac: "hdac_inhibitor",
  er: "estrogen_receptor",
};

/** Broad family fallback when no specific rule matches */
const FAMILY_TO_CATEGORY = {
  kinase: "kinase_inhibitor",
  gpcr: "gpcr",
  protease: "protease_inhibitor",
  cox: "cox_inhibitor",
  hmg: "statin",
  dpp4: "dpp4_inhibitor",
  pde5: "pde5_inhibitor",
  hdac: "hdac_inhibitor",
  nuclear: "estrogen_receptor",
};

const KINASE_BROAD_FALLBACK = "kinase_broad";

function categoryExists(key) {
  return Boolean(ratesArtifact.categories?.[key]);
}

function normalizePhaseEntry(raw) {
  if (!raw) {
    return { completed: 0, terminated: 0, withdrawn: 0, suspended: 0, n: 0, rate: null, reliable: false };
  }
  const n = raw.n ?? 0;
  const reliable = raw.reliable ?? n >= MIN_SAMPLE_SIZE;
  return {
    completed: raw.completed ?? 0,
    terminated: raw.terminated ?? 0,
    withdrawn: raw.withdrawn ?? 0,
    suspended: raw.suspended ?? 0,
    n,
    rate: raw.rate ?? (n > 0 ? raw.completed / n : null),
    reliable,
  };
}

/**
 * Resolve the best category key for a target context object.
 * Prefers specific gene/target rules over broad family buckets.
 */
export function resolveTrialSuccessCategory(target, hints = {}) {
  const protein = target || null;
  const rule = resolveTargetRule(protein);
  if (rule?.id && RULE_TO_CATEGORY[rule.id]) {
    const key = RULE_TO_CATEGORY[rule.id];
    if (categoryExists(key)) {
      return { categoryKey: key, matchType: "target_rule", ruleId: rule.id };
    }
  }

  const family = rule?.family || targetFamily(protein);
  if (family && FAMILY_TO_CATEGORY[family]) {
    const key = FAMILY_TO_CATEGORY[family];
    if (categoryExists(key)) {
      return { categoryKey: key, matchType: "family", family };
    }
  }

  if (hints.compoundClass) {
    const hint = String(hints.compoundClass).toLowerCase();
    if (hint.includes("kinase") && categoryExists("kinase_inhibitor")) {
      return { categoryKey: "kinase_inhibitor", matchType: "compound_hint" };
    }
    if (hint.includes("gpcr") && categoryExists("gpcr")) {
      return { categoryKey: "gpcr", matchType: "compound_hint" };
    }
  }

  if (family === "kinase" && categoryExists(KINASE_BROAD_FALLBACK)) {
    return { categoryKey: KINASE_BROAD_FALLBACK, matchType: "kinase_broad_fallback", family };
  }

  return { categoryKey: null, matchType: "none" };
}

/**
 * Return historical trial completion context for Ph1–Ph3.
 */
export function getTrialSuccessContext(target, hints = {}) {
  const resolved = resolveTrialSuccessCategory(target, hints);
  if (!resolved.categoryKey) {
    return {
      available: false,
      categoryKey: null,
      categoryLabel: null,
      matchType: resolved.matchType,
      phases: {},
      limitationNote: LIMITATION_NOTE,
      source: ratesArtifact.source,
      generatedAt: ratesArtifact.generatedAt,
    };
  }

  const cat = ratesArtifact.categories[resolved.categoryKey];
  const phases = {};
  for (const phase of REPORT_PHASES) {
    phases[phase] = normalizePhaseEntry(cat.phases?.[phase]);
  }

  return {
    available: true,
    categoryKey: resolved.categoryKey,
    categoryLabel: cat.label,
    query: cat.query,
    matchType: resolved.matchType,
    ruleId: resolved.ruleId || null,
    family: resolved.family || null,
    phases,
    limitationNote: LIMITATION_NOTE,
    source: ratesArtifact.source,
    generatedAt: ratesArtifact.generatedAt,
    metric: ratesArtifact.metric,
    definition: ratesArtifact.definition,
    minSampleSize: MIN_SAMPLE_SIZE,
  };
}

export function formatPhaseRate(phaseData) {
  if (!phaseData || !phaseData.reliable) return null;
  return Math.round((phaseData.rate ?? 0) * 1000) / 10;
}

/** Plain-language label for how the CT.gov category was chosen. */
export function describeTrialSuccessMatch(context) {
  if (!context?.available) return null;
  switch (context.matchType) {
    case "target_rule":
      if (context.ruleId) {
        const label = String(context.ruleId).replace(/_/g, " ").toUpperCase();
        return `Specific target rule (${label})`;
      }
      return "Specific target rule";
    case "family":
      if (context.family) {
        return `Target family bucket (${context.family})`;
      }
      return "Target family bucket";
    case "compound_hint":
      return "Compound class hint";
    case "kinase_broad_fallback":
      return "Broad kinase bucket (fallback when no specific rule matches)";
    default:
      return null;
  }
}

/**
 * User-facing rate + sample text for one phase row/cell.
 * Unreliable phases never show a percentage.
 */
export function formatPhaseDisplay(phaseData) {
  if (!phaseData || phaseData.n === 0) {
    return { kind: "empty", rateText: "—", detailText: "no trials in sample" };
  }
  if (!phaseData.reliable) {
    return {
      kind: "insufficient",
      rateText: `Insufficient sample (n=${phaseData.n})`,
      detailText: null,
    };
  }
  const pct = formatPhaseRate(phaseData);
  return {
    kind: "rate",
    rateText: `${pct}%`,
    detailText: `n=${phaseData.n}`,
  };
}

export { ratesArtifact as trialSuccessRatesArtifact };
