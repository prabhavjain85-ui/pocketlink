/**
 * TargetForge Persistent Search History Service.
 * Manages client-side persistence for searches, shortlists, and screenings in localStorage.
 * Capped at 50 entries to safeguard storage quotas (~5-10MB browser limit).
 */

export const HISTORY_STORAGE_KEY = "pocketlink_search_history_v1";
export const MAX_HISTORY_ENTRIES = 50;

export const ACTIVE_STATE_KEYS = {
  BENCH: "pocketlink_active_bench_v1",
  TARGET_DISCOVERY: "pocketlink_active_discovery_v1",
  REPURPOSING: "pocketlink_active_repurpose_v1",
  AGENT: "pocketlink_active_agent_v1",
};

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

/**
 * Safely write JSON to localStorage with quota protection
 */
function writeStorage(key, value) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[historyService] Quota exceeded or error writing ${key}:`, err);
    return false;
  }
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
    type, // 'staging-bench' | 'target-discovery' | 'pdb-search' | 'repurposing-run'
    timestamp: now,
    title,
    summary: summary || "",
    inputs,
    snapshot,
  };

  const next = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES);
  writeStorage(HISTORY_STORAGE_KEY, next);
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
