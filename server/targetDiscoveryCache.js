/**
 * Cache Open Targets disease → associated-target payloads for 24 hours.
 * Keyed by disease / EFO / MONDO ID. Memory first, localStorage as backup.
 */

export const TARGET_DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;
export const TARGET_DISCOVERY_STORAGE_KEY = "pocketlink-ot-targets-v1";

const MEMORY_CACHE = new Map();

function readStore() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(TARGET_DISCOVERY_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeStore(map) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(TARGET_DISCOVERY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function cacheKeyForDisease(diseaseId) {
  return String(diseaseId || "").trim().toUpperCase();
}

export function getCachedTargets(diseaseId) {
  const key = cacheKeyForDisease(diseaseId);
  if (!key) return null;
  const fromMem = MEMORY_CACHE.get(key);
  if (fromMem && Date.now() - Number(fromMem.at) <= TARGET_DISCOVERY_TTL_MS) {
    return fromMem.payload;
  }
  const stored = readStore()[key];
  if (!stored || !stored.at || Date.now() - Number(stored.at) > TARGET_DISCOVERY_TTL_MS) {
    return null;
  }
  MEMORY_CACHE.set(key, stored);
  return stored.payload;
}

export function rememberTargets(diseaseId, payload) {
  const key = cacheKeyForDisease(diseaseId);
  if (!key || !payload) return;
  const entry = { payload, at: Date.now(), diseaseId: key };
  MEMORY_CACHE.set(key, entry);
  const map = readStore();
  map[key] = entry;
  writeStore(map);
}

export function clearTargetDiscoveryCache() {
  MEMORY_CACHE.clear();
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TARGET_DISCOVERY_STORAGE_KEY);
  } catch {
    // ignore
  }
}
