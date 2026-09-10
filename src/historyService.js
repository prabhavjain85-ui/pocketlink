/**
 * PocketLink Persistent Search History Service.
 * Manages client-side persistence for searches, shortlists, and screenings in localStorage.
 * Capped at 50 entries to safeguard storage quotas (~5-10MB browser limit).
 */

export const HISTORY_STORAGE_KEY = "pocketlink_search_history_v1";
export const MAX_HISTORY_ENTRIES = 50;
export const SNAPSHOT_RANKING_LIMIT = 10;
export const SNAPSHOT_ARRAY_LIMIT = 10;

export const ACTIVE_STATE_KEYS = {
  BENCH: "pocketlink_active_bench_v1",
  TARGET_DISCOVERY: "pocketlink_active_discovery_v1",
  REPURPOSING: "pocketlink_active_repurpose_v1",
  AGENT: "pocketlink_active_agent_v1",
};

const MAX_STRING_LENGTH = 2000;
const MAX_JSON_BYTES = 4 * 1024 * 1024; // ~4MB soft cap per write attempt

/**
 * Safely parse JSON from localStorage
 */
function readStorage(key, fallback = null) {
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[historyService] Error reading ${key} from localStorage:`, err);
    return fallback;
  }
}

function isQuotaError(err) {
  if (!err) return false;
  if (err.name === "QuotaExceededError") return true;
  if (err.code === 22 || err.code === 1014) return true;
  return /quota/i.test(String(err.message || ""));
}

function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Infinity;
  }
}

function truncateString(value, max = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function truncateArray(arr, limit = SNAPSHOT_ARRAY_LIMIT) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, limit);
}

function compactCandidateRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    name: row.name,
    cid: row.cid,
    score: row.score,
    indication: row.indication,
    molecularWeight: row.molecularWeight,
    xlogp: row.xlogp,
    reasoning: truncateArray(row.reasoning, 3),
    strengths: truncateArray(row.strengths, 3),
    concerns: truncateArray(row.concerns, 3),
  };
}

function compactTargetRow(target) {
  if (!target || typeof target !== "object") return target;
  return {
    symbol: target.symbol,
    name: target.name,
    noveltyScore: target.noveltyScore,
    geneticScore: target.geneticScore,
    somaticScore: target.somaticScore,
    drugCount: target.drugCount,
    overallScore: target.overallScore,
    geneticLabel: target.geneticLabel,
    evidenceSummary: target.evidenceSummary,
  };
}

function compactStructureRow(structure) {
  if (!structure || typeof structure !== "object") return structure;
  return {
    id: structure.id,
    title: structure.title,
    score: structure.score,
    targetSelectionScore: structure.targetSelectionScore,
    resolution: structure.resolution,
    method: structure.method,
    hasLigand: structure.hasLigand,
    ligand: structure.ligand
      ? {
          name: structure.ligand.name,
          compId: structure.ligand.compId,
          formulaWeight: structure.ligand.formulaWeight,
        }
      : undefined,
    pocket: structure.pocket,
    family: structure.family,
    gene: structure.gene,
    symbol: structure.symbol,
    name: structure.name,
    queryName: structure.queryName,
  };
}

/**
 * Compact an agent pipeline report for durable localStorage persistence.
 */
export function compactAgentReport(report) {
  if (!report || typeof report !== "object") return report;

  const compactStepData = (data) => {
    if (!data || typeof data !== "object") return data;

    const next = { ...data };

    if (Array.isArray(next.noveltyTargets)) {
      next.noveltyTargets = next.noveltyTargets.slice(0, SNAPSHOT_ARRAY_LIMIT).map(compactTargetRow);
    }
    if (Array.isArray(next.targets)) {
      next.targets = next.targets.slice(0, SNAPSHOT_ARRAY_LIMIT).map(compactTargetRow);
    }
    if (next.primaryTarget) next.primaryTarget = compactTargetRow(next.primaryTarget);
    if (next.backupTarget) next.backupTarget = compactTargetRow(next.backupTarget);
    if (next.target) next.target = compactTargetRow(next.target);
    if (next.selectedStructure) next.selectedStructure = compactStructureRow(next.selectedStructure);
    if (Array.isArray(next.evaluatedStructures)) {
      next.evaluatedStructures = next.evaluatedStructures.slice(0, 6).map(compactStructureRow);
    }
    if (Array.isArray(next.ranking)) {
      next.ranking = next.ranking.slice(0, SNAPSHOT_RANKING_LIMIT).map(compactCandidateRow);
    }
    if (Array.isArray(next.top5)) {
      next.top5 = next.top5.slice(0, 5).map(compactCandidateRow);
    }
    if (next.recommended) next.recommended = compactCandidateRow(next.recommended);
    if (next.candidate) next.candidate = compactCandidateRow(next.candidate);
    if (next.critique?.case_against?.concerns) {
      next.critique = {
        ...next.critique,
        case_against: {
          ...next.critique.case_against,
          concerns: truncateArray(next.critique.case_against.concerns, 5),
          overall_assessment: truncateString(next.critique.case_against.overall_assessment),
        },
      };
    }

    return next;
  };

  const steps = {};
  for (const [stepId, step] of Object.entries(report.steps || {})) {
    if (!step || typeof step !== "object") continue;
    steps[stepId] = {
      id: step.id,
      title: step.title,
      subtitle: step.subtitle,
      status: step.status,
      action: step.action,
      narration: truncateString(step.narration),
      data: compactStepData(step.data),
    };
  }

  return {
    id: report.id,
    goal: report.goal,
    diseaseQuery: report.diseaseQuery,
    diseaseResolved: report.diseaseResolved,
    status: report.status,
    haltReason: truncateString(report.haltReason),
    totalDurationMs: report.totalDurationMs,
    executiveSummary: report.executiveSummary,
    steps,
    targetGeneRequested: report.targetGeneRequested,
    userTyped: report.userTyped,
  };
}

/**
 * Compact snapshot payloads by workflow type before writing to localStorage.
 */
export function compactSnapshot(type, snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") return {};

  switch (type) {
    case "agent-run": {
      const report = snapshot.report ? compactAgentReport(snapshot.report) : null;
      return { report };
    }
    case "staging-bench":
      return {
        protein: compactStructureRow(snapshot.protein),
        candidates: truncateArray(snapshot.candidates, SNAPSHOT_ARRAY_LIMIT),
        aiResult: snapshot.aiResult
          ? {
              ...snapshot.aiResult,
              ranking: truncateArray(snapshot.aiResult.ranking, SNAPSHOT_RANKING_LIMIT).map(compactCandidateRow),
              recommended: compactCandidateRow(snapshot.aiResult.recommended),
            }
          : null,
        handoffCid: snapshot.handoffCid,
      };
    case "target-discovery":
      return {
        ...snapshot,
        result: snapshot.result
          ? {
              ...snapshot.result,
              targets: truncateArray(snapshot.result.targets, SNAPSHOT_RANKING_LIMIT).map(compactTargetRow),
              novelty: truncateArray(snapshot.result.novelty, SNAPSHOT_RANKING_LIMIT).map(compactTargetRow),
              all: truncateArray(snapshot.result.all, SNAPSHOT_RANKING_LIMIT).map(compactTargetRow),
            }
          : snapshot.result,
      };
    case "repurposing-run":
      return {
        target: compactStructureRow(snapshot.target),
        topCandidates: truncateArray(snapshot.topCandidates, SNAPSHOT_RANKING_LIMIT).map(compactCandidateRow),
        highlightCount: snapshot.highlightCount,
        totalDrugs: snapshot.totalDrugs,
      };
    case "pdb-search":
      return {
        protein: compactStructureRow(snapshot.protein),
        query: snapshot.query,
      };
    default:
      return snapshot;
  }
}

function compactHistoryEntry(entry) {
  if (!entry || typeof entry !== "object") return entry;
  return {
    ...entry,
    summary: truncateString(entry.summary, 500),
    snapshot: compactSnapshot(entry.type, entry.snapshot),
  };
}

function compactHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(compactHistoryEntry);
}

/**
 * Safely write JSON to localStorage with quota protection and retry strategies.
 */
function writeStorage(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return false;

  const strategies = [
    { label: "full payload", transform: (v) => v },
    {
      label: "compact snapshots",
      transform: (v) => (Array.isArray(v) ? compactHistoryEntries(v) : v),
    },
    {
      label: "drop oldest 25%",
      transform: (v) => (Array.isArray(v) ? v.slice(0, Math.max(1, Math.floor(v.length * 0.75))) : v),
    },
    {
      label: "drop oldest 50%",
      transform: (v) => (Array.isArray(v) ? v.slice(0, Math.max(1, Math.floor(v.length * 0.5))) : v),
    },
    {
      label: "keep newest 10 entries",
      transform: (v) => (Array.isArray(v) ? v.slice(0, 10) : v),
    },
    {
      label: "keep newest 5 entries",
      transform: (v) => (Array.isArray(v) ? v.slice(0, 5) : v),
    },
  ];

  let lastError = null;

  for (const strategy of strategies) {
    const candidate = strategy.transform(value);
    if (estimateJsonBytes(candidate) > MAX_JSON_BYTES && Array.isArray(candidate) && candidate.length > 1) {
      continue;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(candidate));
      if (strategy.label !== "full payload") {
        console.warn(
          `[historyService] Wrote ${key} using fallback strategy "${strategy.label}" after storage pressure.`
        );
      }
      return true;
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) {
        console.warn(`[historyService] Error writing ${key}:`, err);
        return false;
      }
    }
  }

  console.error(`[historyService] Failed to write ${key} after all compaction/retry strategies:`, lastError);
  return false;
}

/**
 * Notify listening components across tabs or the same window
 */
function emitHistoryUpdate() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("pocketlink:history-updated"));
  } catch {
    // ignore
  }
}

/**
 * Retrieve all history entries, guaranteed array, sorted newest first
 */
export function getHistory() {
  const data = readStorage(HISTORY_STORAGE_KEY, []);
  if (!Array.isArray(data)) return [];
  return data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/**
 * Save a new history entry or refresh an existing identical one within 15s
 */
export function saveHistoryEntry({ type, title, summary, inputs = {}, snapshot = {} }) {
  if (!type || !title) return null;

  const current = getHistory();
  const now = Date.now();

  // Deduplicate rapid duplicate triggers (e.g. repeated re-renders with exact same input and title)
  const isDuplicate = (item) => {
    if (item.type !== type) return false;
    if (item.title !== title) return false;
    const a = JSON.stringify(item.inputs || {});
    const b = JSON.stringify(inputs || {});
    return a === b && now - (item.timestamp || 0) < 15000;
  };

  const filtered = current.filter((item) => !isDuplicate(item));

  const entry = {
    id: `hist_${now}_${Math.random().toString(36).slice(2, 7)}`,
    type, // 'staging-bench' | 'target-discovery' | 'pdb-search' | 'repurposing-run' | 'agent-run'
    timestamp: now,
    title,
    summary: summary || "",
    inputs,
    snapshot: compactSnapshot(type, snapshot),
  };

  const next = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
  const wrote = writeStorage(HISTORY_STORAGE_KEY, next);
  if (!wrote) {
    console.error("[historyService] saveHistoryEntry failed to persist history after compaction retries.", {
      type,
      title,
    });
    return null;
  }

  emitHistoryUpdate();
  return entry;
}

/**
 * Delete a specific entry by id
 */
export function deleteHistoryEntry(id) {
  if (!id) return;
  const current = getHistory();
  const next = current.filter((item) => item.id !== id);
  writeStorage(HISTORY_STORAGE_KEY, next);
  emitHistoryUpdate();
}

/**
 * Clear all history entries
 */
export function clearAllHistory() {
  writeStorage(HISTORY_STORAGE_KEY, []);
  emitHistoryUpdate();
}

/**
 * Save active view state for seamless back-and-forth navigation
 */
export function setActiveState(key, state) {
  if (!key) return;
  writeStorage(key, state);
}

/**
 * Retrieve active view state
 */
export function getActiveState(key, fallback = null) {
  if (!key) return fallback;
  return readStorage(key, fallback);
}

/**
 * Clear active view state (for "Reset" / "New Screen")
 */
export function clearActiveState(key) {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Subscribe to history updates
 */
export function subscribeToHistory(callback) {
  if (typeof window === "undefined") return () => {};

  const handleUpdate = () => {
    callback(getHistory());
  };

  window.addEventListener("pocketlink:history-updated", handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener("pocketlink:history-updated", handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}
