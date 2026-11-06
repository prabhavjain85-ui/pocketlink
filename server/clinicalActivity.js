/**
 * Clinical activity for a target: has anyone taken this into the clinic, and
 * if a programme stopped, did it stop for a scientific reason?
 *
 * Two measured facts shape this design:
 *
 * 1. Coverage is low by construction. Across the top 25 discovered targets,
 *    28% (pancreatic) and 16% (ALS) had any clinical candidate at all, because
 *    the novelty score deliberately selects for targets nobody has drugged. A
 *    signal absent from roughly 75% of rows cannot be a ranking weight without
 *    distorting it, so this is reported alongside the score, never folded in.
 *
 * 2. Most stopped trials did not fail scientifically. Recorded stop reasons
 *    across pancreatic targets: Insufficient_Enrollment 730 and
 *    Business_Administrative 527, against Negative 189. Treating every stop as
 *    evidence against a target would be wrong most of the time, so only the
 *    scientific categories count as setbacks.
 *
 * Open Targets supplies trialStopReasonCategories already categorised, so the
 * classification here filters their labels rather than parsing free text.
 */
import { otGraphql } from "./openTargets.js";
import { deriveFailureRedesignProfile } from "./failureRedesign.js";

export const CLINICAL_ACTIVITY_QUERY = `
query TargetClinicalActivity($ensemblId: String!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    drugAndClinicalCandidates {
      count
      rows {
        maxClinicalStage
        drug { id name }
        diseases { diseaseFromSource disease { id name } }
        clinicalReports {
          trialPhase
          trialOverallStatus
          trialWhyStopped
          trialStopReasonCategories
          year
        }
      }
    }
  }
}
`;

/** Stop reasons that say something about the target or the molecule. */
export const SCIENTIFIC_STOP_CATEGORIES = new Set(["Negative", "Safety_Sideeffects"]);

/** Everything else: money, recruitment, logistics, sponsor priorities. */
export function isScientificStop(categories) {
  return (categories || []).some((c) => SCIENTIFIC_STOP_CATEGORIES.has(String(c)));
}

const ONGOING_STATUS = /recruiting|active|not[_ ]yet|enrolling|available/i;
const COMPLETED_STATUS = /completed/i;
const STOPPED_STATUS = /terminated|withdrawn|suspended|no[_ ]longer/i;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED = 400;
const cache = new Map();

function cacheGet(key) {
  const row = cache.get(key);
  if (!row) return undefined;
  if (Date.now() > row.expires) {
    cache.delete(key);
    return undefined;
  }
  return row.value;
}

function cacheSet(key, value) {
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Does this candidate list the disease under study?
 *
 * Ontology id first: candidate counts are global, so TUBA4A reports 85
 * candidates under ALS of which only one is actually for ALS. Name matching
 * alone was not reliable enough to carry that distinction.
 */
export function matchesDisease(candidate, diseaseId, diseaseName) {
  const rows = candidate?.diseases || [];
  if (!rows.length) return false;
  const wantId = String(diseaseId || "").trim().toUpperCase();
  if (wantId && rows.some((d) => String(d?.disease?.id || "").toUpperCase() === wantId)) return true;
  const wantName = String(diseaseName || "").trim().toLowerCase();
  if (!wantName) return false;
  return rows.some((d) => {
    const n = String(d?.disease?.name || d?.diseaseFromSource || "").toLowerCase();
    return Boolean(n) && (n === wantName || n.includes(wantName) || wantName.includes(n));
  });
}

export function summarizeReports(candidates) {
  let ongoing = 0;
  let completed = 0;
  let stoppedScientific = 0;
  let stoppedOther = 0;
  const stopCategories = {};
  const whyStopped = [];
  let latestYear = null;

  for (const candidate of candidates) {
    for (const report of candidate?.clinicalReports || []) {
      const status = String(report?.trialOverallStatus || "");
      const year = Number(report?.year);
      if (Number.isFinite(year) && (latestYear === null || year > latestYear)) latestYear = year;

      if (ONGOING_STATUS.test(status)) {
        ongoing += 1;
      } else if (COMPLETED_STATUS.test(status)) {
        completed += 1;
      } else if (STOPPED_STATUS.test(status) || report?.trialWhyStopped) {
        const cats = report?.trialStopReasonCategories || [];
        for (const c of cats) stopCategories[c] = (stopCategories[c] || 0) + 1;
        if (isScientificStop(cats)) {
          stoppedScientific += 1;
          if (report.trialWhyStopped && whyStopped.length < 5) {
            whyStopped.push({
              reason: String(report.trialWhyStopped).slice(0, 220),
              year: Number.isFinite(year) ? year : null,
            });
          }
        } else {
          stoppedOther += 1;
        }
      }
    }
  }
  return { ongoing, completed, stoppedScientific, stoppedOther, stopCategories, whyStopped, latestYear };
}

const STAGE_ORDER = [
  "UNKNOWN",
  "WITHDRAWAL",
  "PHASE_1",
  "PHASE_1_2",
  "PHASE_2",
  "PHASE_2_3",
  "PHASE_3",
  "PHASE_4",
  "APPROVAL",
];

export function topStage(candidates) {
  let best = null;
  let bestIdx = -1;
  for (const c of candidates) {
    const stage = String(c?.maxClinicalStage || "");
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx > bestIdx) {
      bestIdx = idx;
      best = stage || null;
    }
  }
  return best;
}

/**
 * One of six states, in priority order. "none" is the common case and is
 * informative: nobody has taken this target into the clinic for this disease.
 */
export function deriveState({ candidates, ongoing, stoppedScientific, completed, stoppedOther } = {}) {
  if (!candidates) return "none";
  if (ongoing > 0) return "ongoing";
  if (stoppedScientific > 0) return "stopped_scientific";
  if (completed > 0) return "completed";
  if (stoppedOther > 0) return "stopped_other";
  return "registered";
}

export const STATE_LABELS = {
  none: "No clinical programme for this disease",
  ongoing: "Trials ongoing",
  stopped_scientific: "Stopped: efficacy or safety",
  stopped_other: "Stopped: non-scientific reason",
  completed: "Trials completed",
  registered: "Registered, no trial detail",
};

function emptyResult(ensemblId, reason) {
  return {
    available: false,
    reason,
    ensemblId,
    symbol: "",
    state: "none",
    stateLabel: STATE_LABELS.none,
    forThisDisease: null,
    anyIndication: null,
  };
}

/**
 * @param {string} ensemblId
 * @param {{diseaseId?: string, diseaseName?: string, signal?: AbortSignal}} options
 */
export async function fetchTargetClinicalActivity(ensemblId, options = {}) {
  const id = String(ensemblId || "").trim();
  if (!id) return emptyResult(id, "No Ensembl gene id supplied.");

  const { diseaseId = "", diseaseName = "", signal } = options;
  const cacheKey = `${id}|${diseaseId}|${diseaseName}`.toLowerCase();
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;

  let data;
  try {
    data = await otGraphql(CLINICAL_ACTIVITY_QUERY, { ensemblId: id }, { signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return emptyResult(id, "Open Targets could not be reached for clinical activity.");
  }

  const target = data?.target;
  const all = target?.drugAndClinicalCandidates?.rows || [];
  const scoped = all.filter((c) => matchesDisease(c, diseaseId, diseaseName));

  const forThisDisease = {
    candidates: scoped.length,
    maxStage: topStage(scoped),
    drugs: scoped
      .map((c) => ({ id: c?.drug?.id || "", name: c?.drug?.name || "", stage: c?.maxClinicalStage || null }))
      .filter((d) => d.name)
      .slice(0, 8),
    ...summarizeReports(scoped),
  };

  const anyIndication = {
    candidates: all.length,
    maxStage: topStage(all),
    drugs: all
      .map((c) => ({ id: c?.drug?.id || "", name: c?.drug?.name || "", stage: c?.maxClinicalStage || null }))
      .filter((d) => d.name)
      .slice(0, 8),
    ...summarizeReports(all),
  };

  const state = deriveState(forThisDisease);
  const redesignSource =
    forThisDisease.stoppedScientific > 0 || forThisDisease.candidates > 0
      ? forThisDisease
      : anyIndication;
  const redesignPrescription = deriveFailureRedesignProfile({
    whyStopped: redesignSource.whyStopped || [],
    stopCategories: redesignSource.stopCategories || {},
    safetyOrgans: options.safetyOrgans || [],
    state: forThisDisease.stoppedScientific > 0 ? state : deriveState(anyIndication),
    diseaseName,
    drugs: forThisDisease.drugs?.length ? forThisDisease.drugs : anyIndication.drugs || [],
  });

  const result = {
    available: true,
    reason: "",
    ensemblId: id,
    symbol: target?.approvedSymbol || "",
    diseaseId: diseaseId || null,
    diseaseName: diseaseName || null,
    state,
    stateLabel: STATE_LABELS[state],
    forThisDisease,
    anyIndication,
    redesignPrescription,
    note:
      "Open Targets candidate counts are global across indications; the first block is filtered to the disease you searched. Stop reason categories come from Open Targets.",
  };
  cacheSet(cacheKey, result);
  return result;
}

export const __testing = { cache };
