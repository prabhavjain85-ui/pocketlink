/**
 * Map a staged target to historical ClinicalTrials.gov phase transition rates
 * and trial completion rates.
 * Pure module — reads committed artifact, no live network calls.
 */

import { nodeRequire } from "./nodeRequire.js";
import { TARGET_RULES, resolveTargetRule, targetFamily } from "./scoreCandidates.js";

const ratesArtifact = nodeRequire()("./data/trialSuccessRates.json");

export const SCHEMA_VERSION = 2;
export const MIN_SAMPLE_SIZE = 30;
export const CENSOR_YEARS = 3;
export const REPORT_PHASES = ["PHASE1", "PHASE2", "PHASE3"];
export const COMPLETION_PHASES = ["PHASE1", "PHASE2", "PHASE3", "COMBINED"];

export const LIMITATION_NOTE =
  "Phase transition rate measures the fraction of on-target drugs in this class that advanced to a subsequent clinical phase (drugs whose most recent trial in that phase started within 3 years without advancing are right-censored); Phase 3 → approval cannot be measured from ClinicalTrials.gov. Trial completion rate is a secondary operational metric measuring COMPLETED / (COMPLETED + TERMINATED + WITHDRAWN + SUSPENDED) — finishing a trial without early termination does not imply meeting efficacy endpoints or regulatory approval.";

/** TARGET_RULES id → trialSuccessRates.json category key */
export const RULE_TO_CATEGORY = {
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
export const FAMILY_TO_CATEGORY = {
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

export const CATEGORY_SPECS = [
  { key: "kinase_inhibitor", label: "Kinase inhibitors", ruleFamily: "kinase", defaultDiseaseArea: "both" },
  { key: "kinase_broad", label: "Tyrosine kinase inhibitors (broad)", ruleFamily: "kinase", defaultDiseaseArea: "both" },
  { key: "egfr", label: "EGFR inhibitors", ruleId: "egfr", defaultDiseaseArea: "oncology" },
  { key: "her2", label: "HER2 / ERBB2 inhibitors", ruleId: "her2", defaultDiseaseArea: "oncology" },
  { key: "abl", label: "ABL / BCR-ABL inhibitors", ruleId: "abl", defaultDiseaseArea: "oncology" },
  { key: "braf", label: "BRAF inhibitors", ruleId: "braf", defaultDiseaseArea: "oncology" },
  { key: "gpcr", label: "GPCR-targeted drugs", ruleFamily: "gpcr", defaultDiseaseArea: "non_oncology" },
  { key: "beta2_adrenergic", label: "Beta-2 adrenergic drugs", ruleId: "beta2", defaultDiseaseArea: "non_oncology" },
  { key: "protease_inhibitor", label: "Protease inhibitors", ruleFamily: "protease", defaultDiseaseArea: "non_oncology" },
  { key: "hiv_protease", label: "HIV protease inhibitors", ruleId: "hiv_protease", defaultDiseaseArea: "non_oncology" },
  { key: "hdac_inhibitor", label: "HDAC inhibitors", ruleId: "hdac", defaultDiseaseArea: "oncology" },
  { key: "pde5_inhibitor", label: "PDE5 inhibitors", ruleId: "pde5", defaultDiseaseArea: "non_oncology" },
  { key: "cox_inhibitor", label: "COX / NSAID drugs", ruleId: "cox", defaultDiseaseArea: "non_oncology" },
  { key: "statin", label: "HMG-CoA reductase inhibitors (statins)", ruleId: "hmgcr", defaultDiseaseArea: "non_oncology" },
  { key: "dpp4_inhibitor", label: "DPP-4 inhibitors", ruleId: "dpp4", defaultDiseaseArea: "non_oncology" },
  { key: "estrogen_receptor", label: "Estrogen receptor modulators", ruleId: "er", defaultDiseaseArea: "both" },
];

const SALT_AND_FORMULATION_RE = new RegExp(
  "\\b(" +
    [
      "hydrochloride",
      "dihydrochloride",
      "hcl",
      "mesylate",
      "mesilate",
      "dimethanesulfonate",
      "methanesulfonate",
      "tosylate",
      "besylate",
      "besilate",
      "maleate",
      "fumarate",
      "hemifumarate",
      "succinate",
      "tartrate",
      "bitartrate",
      "citrate",
      "phosphate",
      "diphosphate",
      "sulfate",
      "sulphate",
      "bisulfate",
      "acetate",
      "sodium",
      "disodium",
      "potassium",
      "dipotassium",
      "calcium",
      "magnesium",
      "zinc",
      "tromethamine",
      "meglumine",
      "xinafoate",
      "pamoate",
      "embonate",
      "benzoate",
      "salicylate",
      "propionate",
      "valerate",
      "butyrate",
      "lactate",
      "gluconate",
      "malate",
      "bromide",
      "hydrobromide",
      "chloride",
      "iodide",
      "nitrate",
      "esylate",
      "edisylate",
      "camsylate",
      "hydrate",
      "monohydrate",
      "dihydrate",
      "trihydrate",
      "hemihydrate",
      "sesquihydrate",
      "anhydrous",
      "solvate",
    ].join("|") +
    ")\\b",
  "gi"
);

export const WHY_STOPPED_RULES = {
  negatedSafetyOrEfficacy:
    /\b(?:no|not|without|unrelated\s+to|other\s+than|free\s+of|absence\s+of)\s+(?:any\s+|new\s+|significant\s+)?(?:safety|toxicit\w*|adverse\s+event\w*|efficacy|futilit\w*)\s*(?:concern\w*|issue\w*|signal\w*|problem\w*|reason\w*)?/gi,
  safety:
    /\b(toxicit\w*|adverse\s+event\w*|side\s+effect\w*|safety|unsafe|dlt\b|dose[- ]limiting|fatal\w*|death\w*|mortality|morbidit\w*|intolerab\w*|tolerabilit\w*|severe\s+ae\b|serious\s+ae\b|\bsae\b|hepatotox\w*|cardiotox\w*|nephrotox\w*|neurotox\w*|myelosuppress\w*|organ\s+failure|harm)\b/i,
  efficacy:
    /\b(futilit\w*|ineffectiv\w*|lack\s+of\s+(?:clinical\s+)?(?:efficacy|activity|benefit|response)|no\s+(?:clinical\s+)?(?:efficacy|activity|benefit|objective\s+response|response)|insufficient\s+(?:efficacy|activity|response)|failed\s+to\s+(?:meet|achieve|demonstrate|reach|show)|did\s+not\s+(?:meet|achieve|demonstrate|reach|show)|missed\s+.*endpoint|negative\s+.*(?:interim|result|study|trial|outcome)|sub-?optimal\s+(?:efficacy|activity|response)|inferior\w*|endpoint\s+not\s+met|primary\s+outcome\s+not\s+met)\b/i,
  operational:
    /\b(accrual|enrol+ment|recruit\w*|funding|financial|budget\w*|sponsor\w*|business|strategic|priorit\w*|administrative|logistical|supply|drug\s+availability|shortage|manufacturing|covid[- ]?19|pandemic|sars-cov-2|staff\w*|investigator|pi\s+(?:left|relocated|departed|retired)|site\s+closure|relocat\w*|left\s+institution|regulatory\s+delay|contract\w*|reorganiz\w*|portfolio|commercial|competing\s+(?:trial|study)|slow|low\s+accrual|poor\s+accrual|insufficient\s+accrual|feasibilit\w*|terminate\w*\s+by\s+sponsor|withdrawn\s+by\s+sponsor|company\s+decision|corporate\s+decision|change\s+in\s+standard\s+of\s+care)\b/i,
};

export const ONCOLOGY_CONDITION_RE =
  /\b(cancer\w*|carcinom\w*|tumor\w*|tumour\w*|leukemi\w*|leukaemi\w*|lymphom\w*|neoplasm\w*|melanom\w*|sarcom\w*|myelom\w*|oncolog\w*|glioblastom\w*|gliom\w*|mesotheliom\w*|neuroblastom\w*|adenocarcinom\w*|metasta\w*|malignan\w*|seminom\w*|teratom\w*|hepatom\w*|astrocytom\w*|medulloblastom\w*|retinoblastom\w*|cholangiocarcinom\w*|pheochromocytom\w*|myelodysplas\w*|myeloproliferat\w*)\b/i;

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Return the canonical list of on-target drugs for a category key, rule id,
 * rule object, or explicit array of drug names.
 */
export function getCategoryDrugList(categoryOrRule) {
  if (!categoryOrRule) return [];
  if (Array.isArray(categoryOrRule)) {
    return Array.from(
      new Set(
        categoryOrRule
          .map((d) => String(d || "").trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }
  if (typeof categoryOrRule === "object" && Array.isArray(categoryOrRule.onTargetDrugs)) {
    return getCategoryDrugList(categoryOrRule.onTargetDrugs);
  }

  const key = String(categoryOrRule).trim().toLowerCase();
  const spec = CATEGORY_SPECS.find((s) => s.key === key);
  if (spec) {
    if (spec.ruleId) {
      const rule = TARGET_RULES.find((r) => r.id === spec.ruleId);
      return getCategoryDrugList(rule?.onTargetDrugs || []);
    }
    if (spec.ruleFamily) {
      const union = [];
      for (const rule of TARGET_RULES) {
        if (rule.family === spec.ruleFamily && Array.isArray(rule.onTargetDrugs)) {
          union.push(...rule.onTargetDrugs);
        }
      }
      return getCategoryDrugList(union);
    }
  }

  const directRule = TARGET_RULES.find((r) => r.id === key);
  if (directRule) {
    return getCategoryDrugList(directRule.onTargetDrugs || []);
  }

  const mappedKey = RULE_TO_CATEGORY[key];
  if (mappedKey && mappedKey !== key) {
    return getCategoryDrugList(mappedKey);
  }

  const fromArtifact = ratesArtifact.categories?.[key]?.drugs;
  if (Array.isArray(fromArtifact)) {
    return getCategoryDrugList(fromArtifact);
  }

  return [];
}

/**
 * Strip pharmaceutical salt forms, hydration suffixes, and dosage tokens.
 */
export function stripDrugSalts(rawName) {
  if (!rawName) return "";
  return String(rawName)
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|ug|g|ml|%|iu)\b/gi, " ")
    .replace(SALT_AND_FORMULATION_RE, " ")
    .replace(/[,;()[\]/+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStudyInterventionStrings(studyOrInterventions) {
  if (!studyOrInterventions) return [];
  if (typeof studyOrInterventions === "string") {
    return [studyOrInterventions];
  }
  if (Array.isArray(studyOrInterventions)) {
    const out = [];
    for (const item of studyOrInterventions) {
      if (typeof item === "string") {
        out.push(item);
      } else if (item && typeof item === "object") {
        const type = String(item.type || "").toUpperCase();
        if (
          type &&
          type !== "DRUG" &&
          type !== "BIOLOGICAL" &&
          type !== "COMBINATION_PRODUCT"
        ) {
          continue;
        }
        if (item.name) out.push(String(item.name));
        if (Array.isArray(item.otherNames)) {
          for (const alias of item.otherNames) {
            if (alias) out.push(String(alias));
          }
        }
      }
    }
    return out;
  }
  if (typeof studyOrInterventions === "object") {
    const list =
      studyOrInterventions?.protocolSection?.armsInterventionsModule?.interventions ??
      studyOrInterventions?.interventions ??
      (studyOrInterventions?.intervention ? [studyOrInterventions.intervention] : []);
    return extractStudyInterventionStrings(list);
  }
  return [];
}

/**
 * Return the list of canonical drugs from `categoryOrDrugList` matched by a
 * study's listed interventions (case-insensitive, ignoring salt forms).
 */
export function matchInterventionToDrugs(studyOrInterventions, categoryOrDrugList) {
  const drugs = getCategoryDrugList(categoryOrDrugList);
  if (!drugs.length) return [];

  const rawStrings = extractStudyInterventionStrings(studyOrInterventions);
  if (!rawStrings.length) return [];

  const cleanedInterventions = rawStrings
    .map((s) => ({
      raw: String(s).toLowerCase().trim(),
      clean: stripDrugSalts(s),
    }))
    .filter((entry) => entry.clean.length > 0);

  if (!cleanedInterventions.length) return [];

  const matched = [];
  for (const drug of drugs) {
    const cleanDrug = stripDrugSalts(drug) || drug.toLowerCase().trim();
    if (!cleanDrug) continue;
    const boundaryRe = new RegExp(`(^|[^a-z0-9])${escapeRegExp(cleanDrug)}([^a-z0-9]|$)`, "i");
    const hit = cleanedInterventions.some(
      (intr) =>
        intr.clean === cleanDrug ||
        boundaryRe.test(intr.clean) ||
        boundaryRe.test(intr.raw)
    );
    if (hit) {
      matched.push(drug);
    }
  }
  return matched;
}

/**
 * Check whether a trial (or intervention list/string) matches at least one
 * canonical drug in the given category or drug list.
 */
export function matchesCategoryIntervention(studyOrInterventions, categoryOrDrugList) {
  return matchInterventionToDrugs(studyOrInterventions, categoryOrDrugList).length > 0;
}

/**
 * Classify a ClinicalTrials.gov `whyStopped` text into:
 * "efficacy" | "safety" | "operational" | "unknown".
 */
export function classifyWhyStopped(whyStoppedText) {
  if (!whyStoppedText || typeof whyStoppedText !== "string") {
    return "unknown";
  }
  const trimmed = whyStoppedText.trim();
  if (!trimmed) return "unknown";

  const sanitized = trimmed.replace(WHY_STOPPED_RULES.negatedSafetyOrEfficacy, " ");

  if (WHY_STOPPED_RULES.safety.test(sanitized)) {
    return "safety";
  }
  if (WHY_STOPPED_RULES.efficacy.test(sanitized)) {
    return "efficacy";
  }
  if (WHY_STOPPED_RULES.operational.test(sanitized)) {
    return "operational";
  }
  return "unknown";
}

/**
 * Compute a 95% Wilson score confidence interval for binomial proportion k / n.
 */
export function wilsonInterval(numerator, denominator, z = 1.959963984540054) {
  const k = Number(numerator);
  const n = Number(denominator);
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) {
    return null;
  }
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const low = round3(Math.max(0, center - halfWidth));
  const high = round3(Math.min(1, center + halfWidth));

  const result = { low, high };
  Object.defineProperties(result, {
    lower: { value: low, enumerable: false },
    upper: { value: high, enumerable: false },
    0: { value: low, enumerable: false },
    1: { value: high, enumerable: false },
    length: { value: 2, enumerable: false },
    [Symbol.iterator]: {
      value: function* () {
        yield low;
        yield high;
      },
      enumerable: false,
    },
  });
  return result;
}

/**
 * Classify a study into "oncology" or "non_oncology" based on its conditions
 * and keywords.
 */
export function classifyDiseaseArea(study) {
  const proto = study?.protocolSection || {};
  const conditions = proto.conditionsModule?.conditions || study?.conditions || [];
  const keywords = proto.conditionsModule?.keywords || study?.keywords || [];
  const title =
    proto.identificationModule?.briefTitle ||
    proto.identificationModule?.officialTitle ||
    study?.title ||
    "";
  const text = [...(Array.isArray(conditions) ? conditions : [conditions]), ...(Array.isArray(keywords) ? keywords : [keywords]), title].join(" ");
  return ONCOLOGY_CONDITION_RE.test(text) ? "oncology" : "non_oncology";
}

function parseStudyDate(study) {
  const proto = study?.protocolSection || {};
  const raw =
    study?.startDate ??
    study?.date ??
    proto.statusModule?.startDateStruct?.date ??
    proto.statusModule?.studyFirstPostDateStruct?.date ??
    proto.statusModule?.studyFirstSubmitDate ??
    null;
  if (!raw) return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  const str = String(raw).trim();
  if (/^\d{4}$/.test(str)) {
    return new Date(`${str}-01-01T00:00:00Z`);
  }
  if (/^\d{4}-\d{2}$/.test(str)) {
    return new Date(`${str}-01T00:00:00Z`);
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractNumericPhases(study) {
  const proto = study?.protocolSection || {};
  const rawPhases =
    proto.designModule?.phases ??
    study?.phases ??
    (study?.phase !== undefined && study?.phase !== null ? [study.phase] : []);
  const list = Array.isArray(rawPhases) ? rawPhases : [rawPhases];
  const nums = new Set();
  for (const p of list) {
    const token = String(p || "").toUpperCase().trim();
    if (token === "EARLY_PHASE1" || token === "PHASE1" || token === "1" || token === "PHASE 1") {
      nums.add(1);
    } else if (token === "PHASE2" || token === "2" || token === "PHASE 2") {
      nums.add(2);
    } else if (token === "PHASE3" || token === "3" || token === "PHASE 3") {
      nums.add(3);
    } else if (token === "PHASE4" || token === "4" || token === "PHASE 4") {
      nums.add(4);
    } else if (token === "PHASE1/PHASE2" || token === "PHASE 1/PHASE 2") {
      nums.add(1);
      nums.add(2);
    } else if (token === "PHASE2/PHASE3" || token === "PHASE 2/PHASE 3") {
      nums.add(2);
      nums.add(3);
    }
  }
  return Array.from(nums).sort((a, b) => a - b);
}

/**
 * Compute drug-level Phase 1 → 2+ and Phase 2 → 3+ transition rates with
 * 3-year right-censoring, and mark Phase 3 → approval as unavailable.
 */
export function computePhaseTransitions(studies, categoryOrDrugList = null, options = {}) {
  const minSampleSize = options.minSampleSize ?? MIN_SAMPLE_SIZE;
  const censorYears = options.censorYears ?? CENSOR_YEARS;
  const refDate = options.referenceDate || options.generatedAt ? new Date(options.referenceDate || options.generatedAt) : new Date();
  const cutoffMs = refDate.getTime() - censorYears * 365.25 * 24 * 60 * 60 * 1000;

  // Map drug -> { phases: Set<number>, phaseLatestStartMs: Map<number, number> }
  const byDrug = new Map();

  const ensureDrug = (drugName) => {
    const key = String(drugName || "").trim().toLowerCase();
    if (!key) return null;
    if (!byDrug.has(key)) {
      byDrug.set(key, {
        drug: key,
        phases: new Set(),
        phaseLatestStartMs: new Map(),
      });
    }
    return byDrug.get(key);
  };

  for (const study of Array.isArray(studies) ? studies : []) {
    let matchedDrugs = [];
    if (study?.drug) {
      matchedDrugs = [String(study.drug).trim().toLowerCase()];
    } else if (categoryOrDrugList) {
      matchedDrugs = matchInterventionToDrugs(study, categoryOrDrugList);
    } else {
      matchedDrugs = extractStudyInterventionStrings(study)
        .map((s) => stripDrugSalts(s))
        .filter(Boolean);
    }
    if (!matchedDrugs.length) continue;

    const phaseNums = extractNumericPhases(study);
    if (!phaseNums.length) continue;

    const startDate = parseStudyDate(study);
    const startMs = startDate ? startDate.getTime() : null;

    for (const drug of matchedDrugs) {
      const rec = ensureDrug(drug);
      if (!rec) continue;
      for (const pNum of phaseNums) {
        rec.phases.add(pNum);
        if (startMs !== null) {
          const prev = rec.phaseLatestStartMs.get(pNum);
          if (prev === undefined || startMs > prev) {
            rec.phaseLatestStartMs.set(pNum, startMs);
          }
        }
      }
    }
  }

  const buildPhaseTransition = (phaseNumber) => {
    let numerator = 0;
    let denominator = 0;
    let censored = 0;
    const advancedDrugs = [];
    const notAdvancedDrugs = [];
    const censoredDrugs = [];

    for (const rec of byDrug.values()) {
      if (!rec.phases.has(phaseNumber)) continue;

      let advanced = false;
      for (const p of rec.phases) {
        if (p > phaseNumber) {
          advanced = true;
          break;
        }
      }

      if (advanced) {
        numerator += 1;
        denominator += 1;
        advancedDrugs.push(rec.drug);
      } else {
        const latestStartMs = rec.phaseLatestStartMs.get(phaseNumber);
        if (latestStartMs !== undefined && latestStartMs > cutoffMs) {
          censored += 1;
          censoredDrugs.push(rec.drug);
        } else {
          denominator += 1;
          notAdvancedDrugs.push(rec.drug);
        }
      }
    }

    const rate = denominator > 0 ? round3(numerator / denominator) : null;
    const ci = denominator > 0 ? wilsonInterval(numerator, denominator) : null;
    const reliable = denominator >= minSampleSize;

    return {
      available: true,
      unit: "drugs",
      numerator,
      denominator,
      n: denominator,
      censored,
      rate,
      ci,
      reliable,
      minSampleSize,
      advancedDrugs,
      notAdvancedDrugs,
      censoredDrugs,
    };
  };

  return {
    PHASE1: buildPhaseTransition(1),
    PHASE2: buildPhaseTransition(2),
    PHASE3: {
      available: false,
      unit: "drugs",
      numerator: null,
      denominator: null,
      n: 0,
      censored: 0,
      rate: null,
      ci: null,
      reliable: false,
      minSampleSize,
      note: "Phase 3 → regulatory approval cannot be measured from ClinicalTrials.gov.",
    },
  };
}

const DENOMINATOR_STATUSES = new Set([
  "COMPLETED",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
]);

function createEmptyCompletionBucket(minSampleSize = MIN_SAMPLE_SIZE) {
  return {
    unit: "trials",
    completed: 0,
    terminated: 0,
    withdrawn: 0,
    suspended: 0,
    unknownStatus: 0,
    earlyPhase1: 0,
    phase1_2: 0,
    phase2_3: 0,
    numerator: 0,
    denominator: 0,
    n: 0,
    rate: null,
    ci: null,
    reliable: false,
    minSampleSize,
    whyStopped: {
      efficacy: 0,
      safety: 0,
      operational: 0,
      unknown: 0,
    },
    excludingOperational: {
      numerator: 0,
      denominator: 0,
      n: 0,
      rate: null,
      ci: null,
      reliable: false,
    },
    sensitivityIncludeUnknown: {
      numerator: 0,
      denominator: 0,
      n: 0,
      rate: null,
      ci: null,
      reliable: false,
    },
  };
}

function classifyStudyCompletionBucket(study) {
  const proto = study?.protocolSection || {};
  const rawPhases =
    proto.designModule?.phases ??
    study?.phases ??
    (study?.phase ? [study.phase] : []);
  const list = (Array.isArray(rawPhases) ? rawPhases : [rawPhases]).map((p) =>
    String(p || "").toUpperCase().trim()
  );

  const hasEarly1 = list.includes("EARLY_PHASE1");
  const has1 = hasEarly1 || list.includes("PHASE1") || list.includes("PHASE1/PHASE2");
  const has2 = list.includes("PHASE2") || list.includes("PHASE1/PHASE2") || list.includes("PHASE2/PHASE3");
  const has3 = list.includes("PHASE3") || list.includes("PHASE2/PHASE3");

  const distinctCount = (has1 ? 1 : 0) + (has2 ? 1 : 0) + (has3 ? 1 : 0);
  if (distinctCount > 1) {
    return {
      bucketKey: "COMBINED",
      isEarlyPhase1: hasEarly1,
      isPhase1_2: has1 && has2,
      isPhase2_3: has2 && has3,
    };
  }
  if (has1) return { bucketKey: "PHASE1", isEarlyPhase1: hasEarly1, isPhase1_2: false, isPhase2_3: false };
  if (has2) return { bucketKey: "PHASE2", isEarlyPhase1: false, isPhase1_2: false, isPhase2_3: false };
  if (has3) return { bucketKey: "PHASE3", isEarlyPhase1: false, isPhase1_2: false, isPhase2_3: false };
  return null;
}

function finalizeCompletionBucket(bucket, minSampleSize = MIN_SAMPLE_SIZE) {
  bucket.numerator = bucket.completed;
  bucket.denominator = bucket.n;
  bucket.minSampleSize = minSampleSize;
  bucket.reliable = bucket.n >= minSampleSize;
  bucket.rate = bucket.n > 0 ? round3(bucket.completed / bucket.n) : null;
  bucket.ci = bucket.n > 0 ? wilsonInterval(bucket.completed, bucket.n) : null;

  const exclDenom = Math.max(0, bucket.n - (bucket.whyStopped?.operational || 0));
  bucket.excludingOperational = {
    numerator: bucket.completed,
    denominator: exclDenom,
    n: exclDenom,
    rate: exclDenom > 0 ? round3(bucket.completed / exclDenom) : null,
    ci: exclDenom > 0 ? wilsonInterval(bucket.completed, exclDenom) : null,
    reliable: exclDenom >= minSampleSize,
  };

  const sensDenom = bucket.n + (bucket.unknownStatus || 0);
  bucket.sensitivityIncludeUnknown = {
    numerator: bucket.completed,
    denominator: sensDenom,
    n: sensDenom,
    rate: sensDenom > 0 ? round3(bucket.completed / sensDenom) : null,
    ci: sensDenom > 0 ? wilsonInterval(bucket.completed, sensDenom) : null,
    reliable: sensDenom >= minSampleSize,
  };

  return bucket;
}

/**
 * Compute per-phase trial completion rates, whyStopped breakdown,
 * excluding-operational completion rate, UNKNOWN sensitivity rate, and
 * separate combined-phase bucket.
 */
export function computeCompletionStats(studies, options = {}) {
  const minSampleSize = options.minSampleSize ?? MIN_SAMPLE_SIZE;
  const buckets = {
    PHASE1: createEmptyCompletionBucket(minSampleSize),
    PHASE2: createEmptyCompletionBucket(minSampleSize),
    PHASE3: createEmptyCompletionBucket(minSampleSize),
    COMBINED: createEmptyCompletionBucket(minSampleSize),
  };

  for (const study of Array.isArray(studies) ? studies : []) {
    const phaseInfo = classifyStudyCompletionBucket(study);
    if (!phaseInfo) continue;

    const proto = study?.protocolSection || {};
    const status = String(proto.statusModule?.overallStatus ?? study?.overallStatus ?? study?.status ?? "").toUpperCase();
    const bucket = buckets[phaseInfo.bucketKey];

    if (status === "UNKNOWN") {
      bucket.unknownStatus += 1;
      continue;
    }

    if (!DENOMINATOR_STATUSES.has(status)) continue;

    bucket.n += 1;
    if (phaseInfo.isEarlyPhase1) bucket.earlyPhase1 += 1;
    if (phaseInfo.isPhase1_2) bucket.phase1_2 += 1;
    if (phaseInfo.isPhase2_3) bucket.phase2_3 += 1;

    if (status === "COMPLETED") {
      bucket.completed += 1;
    } else {
      if (status === "TERMINATED") bucket.terminated += 1;
      else if (status === "WITHDRAWN") bucket.withdrawn += 1;
      else if (status === "SUSPENDED") bucket.suspended += 1;

      const whyText = proto.statusModule?.whyStopped ?? study?.whyStopped ?? "";
      const stopClass = classifyWhyStopped(whyText);
      bucket.whyStopped[stopClass] = (bucket.whyStopped[stopClass] || 0) + 1;
    }
  }

  for (const phase of COMPLETION_PHASES) {
    finalizeCompletionBucket(buckets[phase], minSampleSize);
  }

  return buckets;
}

/**
 * Build full category stats (overall + oncology / non_oncology splits) from raw
 * fetched studies.
 */
export function summarizeCategoryStudies(studies, categoryOrDrugList, options = {}) {
  const drugs = getCategoryDrugList(categoryOrDrugList);
  const fetchedList = Array.isArray(studies) ? studies : [];
  const keptStudies = [];
  let discardedCount = 0;

  for (const study of fetchedList) {
    if (matchesCategoryIntervention(study, drugs)) {
      keptStudies.push(study);
    } else {
      discardedCount += 1;
    }
  }

  const oncologyStudies = [];
  const nonOncologyStudies = [];
  for (const study of keptStudies) {
    if (classifyDiseaseArea(study) === "oncology") {
      oncologyStudies.push(study);
    } else {
      nonOncologyStudies.push(study);
    }
  }

  const transitions = computePhaseTransitions(keptStudies, drugs, options);
  const completion = computeCompletionStats(keptStudies, options);

  return {
    drugs,
    fetched: fetchedList.length,
    kept: keptStudies.length,
    discarded: discardedCount,
    transitions,
    completion,
    phases: {
      PHASE1: completion.PHASE1,
      PHASE2: completion.PHASE2,
      PHASE3: completion.PHASE3,
    },
    byDiseaseArea: {
      oncology: {
        label: "Oncology",
        trials: oncologyStudies.length,
        transitions: computePhaseTransitions(oncologyStudies, drugs, options),
        completion: computeCompletionStats(oncologyStudies, options),
      },
      non_oncology: {
        label: "Non-oncology",
        trials: nonOncologyStudies.length,
        transitions: computePhaseTransitions(nonOncologyStudies, drugs, options),
        completion: computeCompletionStats(nonOncologyStudies, options),
      },
    },
  };
}

function categoryExists(key) {
  return Boolean(ratesArtifact.categories?.[key]);
}

function normalizeTransitionEntry(raw, phaseKey, minSampleSize = MIN_SAMPLE_SIZE) {
  if (phaseKey === "PHASE3" || raw?.available === false) {
    return {
      available: false,
      unit: "drugs",
      numerator: null,
      denominator: null,
      n: 0,
      censored: 0,
      rate: null,
      ci: null,
      reliable: false,
      minSampleSize,
      note: raw?.note || "Phase 3 → regulatory approval cannot be measured from ClinicalTrials.gov.",
    };
  }
  if (!raw) {
    return {
      available: true,
      unit: "drugs",
      numerator: 0,
      denominator: 0,
      n: 0,
      censored: 0,
      rate: null,
      ci: null,
      reliable: false,
      minSampleSize,
    };
  }
  const denominator = raw.denominator ?? raw.n ?? 0;
  const numerator = raw.numerator ?? 0;
  const reliable = denominator >= minSampleSize;
  const rate = denominator > 0 ? (raw.rate ?? round3(numerator / denominator)) : null;
  const ci = denominator > 0 ? wilsonInterval(numerator, denominator) : null;
  return {
    available: true,
    unit: "drugs",
    numerator,
    denominator,
    n: denominator,
    censored: raw.censored ?? 0,
    rate,
    ci,
    reliable,
    minSampleSize,
    advancedDrugs: raw.advancedDrugs || [],
    notAdvancedDrugs: raw.notAdvancedDrugs || [],
    censoredDrugs: raw.censoredDrugs || [],
  };
}

function normalizeCompletionEntry(raw, minSampleSize = MIN_SAMPLE_SIZE) {
  if (!raw) {
    return createEmptyCompletionBucket(minSampleSize);
  }
  const n = raw.n ?? raw.denominator ?? 0;
  const completed = raw.completed ?? raw.numerator ?? 0;
  const whyStopped = {
    efficacy: raw.whyStopped?.efficacy ?? 0,
    safety: raw.whyStopped?.safety ?? 0,
    operational: raw.whyStopped?.operational ?? 0,
    unknown: raw.whyStopped?.unknown ?? 0,
  };
  const unknownStatus = raw.unknownStatus ?? 0;
  const exclDenom = raw.excludingOperational?.denominator ?? Math.max(0, n - whyStopped.operational);
  const sensDenom = raw.sensitivityIncludeUnknown?.denominator ?? n + unknownStatus;

  return {
    unit: "trials",
    completed,
    terminated: raw.terminated ?? 0,
    withdrawn: raw.withdrawn ?? 0,
    suspended: raw.suspended ?? 0,
    unknownStatus,
    earlyPhase1: raw.earlyPhase1 ?? 0,
    phase1_2: raw.phase1_2 ?? 0,
    phase2_3: raw.phase2_3 ?? 0,
    numerator: completed,
    denominator: n,
    n,
    rate: n > 0 ? (raw.rate ?? round3(completed / n)) : null,
    ci: n > 0 ? wilsonInterval(completed, n) : null,
    reliable: n >= minSampleSize,
    minSampleSize,
    whyStopped,
    excludingOperational: {
      numerator: completed,
      denominator: exclDenom,
      n: exclDenom,
      rate: exclDenom > 0 ? round3(completed / exclDenom) : null,
      ci: exclDenom > 0 ? wilsonInterval(completed, exclDenom) : null,
      reliable: exclDenom >= minSampleSize,
    },
    sensitivityIncludeUnknown: {
      numerator: completed,
      denominator: sensDenom,
      n: sensDenom,
      rate: sensDenom > 0 ? round3(completed / sensDenom) : null,
      ci: sensDenom > 0 ? wilsonInterval(completed, sensDenom) : null,
      reliable: sensDenom >= minSampleSize,
    },
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
 * Determine whether the target context clearly points to oncology, non_oncology,
 * or both.
 */
export function resolveTargetDiseaseArea(target, resolvedCategory, hints = {}) {
  if (hints.diseaseArea === "oncology" || hints.diseaseArea === "non_oncology" || hints.diseaseArea === "both") {
    return hints.diseaseArea;
  }
  const text = [
    target?.name,
    target?.queryName,
    target?.title,
    target?.disease,
    target?.indication,
    hints?.disease,
  ]
    .filter(Boolean)
    .join(" ");

  if (text && ONCOLOGY_CONDITION_RE.test(text)) {
    return "oncology";
  }

  const spec = CATEGORY_SPECS.find((s) => s.key === resolvedCategory?.categoryKey);
  if (spec?.defaultDiseaseArea) {
    return spec.defaultDiseaseArea;
  }
  return "both";
}

function normalizeSplit(rawSplit, minSampleSize = MIN_SAMPLE_SIZE) {
  if (!rawSplit) return null;
  const transitions = {};
  for (const phase of REPORT_PHASES) {
    transitions[phase] = normalizeTransitionEntry(rawSplit.transitions?.[phase], phase, minSampleSize);
  }
  const completion = {};
  for (const phase of COMPLETION_PHASES) {
    completion[phase] = normalizeCompletionEntry(rawSplit.completion?.[phase], minSampleSize);
  }
  return {
    label: rawSplit.label || "",
    trials: rawSplit.trials ?? 0,
    transitions,
    completion,
  };
}

/**
 * Return historical phase transition and trial completion context for Ph1–Ph3.
 */
export function getTrialSuccessContext(target, hints = {}) {
  const resolved = resolveTrialSuccessCategory(target, hints);
  const minSampleSize = MIN_SAMPLE_SIZE;

  if (!resolved.categoryKey) {
    return {
      available: false,
      schemaVersion: ratesArtifact.schemaVersion ?? SCHEMA_VERSION,
      categoryKey: null,
      categoryLabel: null,
      matchType: resolved.matchType,
      drugs: [],
      fetched: 0,
      kept: 0,
      discarded: 0,
      transitions: {},
      completion: {},
      phases: {},
      byDiseaseArea: null,
      selectedDiseaseArea: null,
      limitationNote: LIMITATION_NOTE,
      source: ratesArtifact.source,
      generatedAt: ratesArtifact.generatedAt,
      minSampleSize,
    };
  }

  const cat = ratesArtifact.categories[resolved.categoryKey];
  const drugs = Array.isArray(cat.drugs) && cat.drugs.length ? cat.drugs : getCategoryDrugList(resolved.categoryKey);
  const transitions = {};
  for (const phase of REPORT_PHASES) {
    transitions[phase] = normalizeTransitionEntry(cat.transitions?.[phase], phase, minSampleSize);
  }

  const completionSource = cat.completion || cat.phases || {};
  const completion = {};
  for (const phase of COMPLETION_PHASES) {
    completion[phase] = normalizeCompletionEntry(completionSource[phase], minSampleSize);
  }

  const phases = {};
  for (const phase of REPORT_PHASES) {
    phases[phase] = completion[phase];
  }

  const selectedDiseaseArea = resolveTargetDiseaseArea(target, resolved, hints);
  const byDiseaseArea = cat.byDiseaseArea
    ? {
        oncology: normalizeSplit(cat.byDiseaseArea.oncology, minSampleSize),
        non_oncology: normalizeSplit(cat.byDiseaseArea.non_oncology, minSampleSize),
      }
    : null;

  return {
    available: true,
    schemaVersion: ratesArtifact.schemaVersion ?? SCHEMA_VERSION,
    categoryKey: resolved.categoryKey,
    categoryLabel: cat.label,
    query: cat.query || drugs.join(" OR "),
    drugs,
    fetched: cat.fetched ?? 0,
    kept: cat.kept ?? cat.fetched ?? 0,
    discarded: cat.discarded ?? Math.max(0, (cat.fetched ?? 0) - (cat.kept ?? cat.fetched ?? 0)),
    matchType: resolved.matchType,
    ruleId: resolved.ruleId || null,
    family: resolved.family || null,
    transitions,
    completion,
    phases,
    selectedDiseaseArea,
    byDiseaseArea,
    limitationNote: LIMITATION_NOTE,
    source: ratesArtifact.source,
    generatedAt: ratesArtifact.generatedAt,
    metric: ratesArtifact.metric || "phase_transition_and_trial_completion",
    definition: ratesArtifact.definition,
    minSampleSize,
  };
}

export function formatPhaseRate(phaseData) {
  if (!phaseData || phaseData.available === false) return null;
  const n = phaseData.n ?? phaseData.denominator ?? 0;
  const minN = phaseData.minSampleSize ?? MIN_SAMPLE_SIZE;
  if (!phaseData.reliable || n < minN) return null;
  return Math.round((phaseData.rate ?? 0) * 1000) / 10;
}

export function formatConfidenceInterval(ci) {
  if (!ci || typeof ci.low !== "number" || typeof ci.high !== "number") return null;
  const lowPct = (Math.round(ci.low * 1000) / 10).toFixed(1).replace(/\.0$/, "");
  const highPct = (Math.round(ci.high * 1000) / 10).toFixed(1).replace(/\.0$/, "");
  return `95% CI ${lowPct}–${highPct}%`;
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
 * User-facing rate + sample + 95% CI text for one phase row/cell.
 * Unreliable phases (n < 30 or reliable === false) never show a percentage.
 */
export function formatPhaseDisplay(phaseData) {
  if (phaseData?.available === false) {
    return {
      kind: "unavailable",
      rateText: "Unavailable",
      ciText: null,
      detailText: phaseData.note || "not measurable from CT.gov",
    };
  }
  const n = phaseData?.n ?? phaseData?.denominator ?? 0;
  if (!phaseData || n === 0) {
    return {
      kind: "empty",
      rateText: "—",
      ciText: null,
      detailText: phaseData?.unit === "drugs" ? "no drugs in sample" : "no trials in sample",
    };
  }
  const minN = phaseData.minSampleSize ?? MIN_SAMPLE_SIZE;
  if (!phaseData.reliable || n < minN) {
    return {
      kind: "insufficient",
      rateText: `Insufficient sample (n=${n})`,
      ciText: null,
      detailText: null,
    };
  }
  const pct = formatPhaseRate(phaseData);
  const ciText = formatConfidenceInterval(phaseData.ci);
  return {
    kind: "rate",
    rateText: `${pct}%`,
    ciText,
    detailText: ciText ? `${ciText} · n=${n}` : `n=${n}`,
  };
}

export { ratesArtifact as trialSuccessRatesArtifact };
