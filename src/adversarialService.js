/**
 * Client-side service for Adversarial Critique ("The Case Against").
 * Provides on-demand generation and dual-layer caching (in-memory + localStorage).
 */

const STORAGE_CACHE_KEY = "pocketlink_adversarial_cache_v1";
const memoryCache = new Map();

function buildCacheKey(candidate, target) {
  const cid = String(candidate?.cid || candidate?.compound_id || candidate?.CID || "");
  const targetId = String(target?.pdb_id || target?.id || target?.queryName || target?.name || "unknown");
  return `${targetId}__${cid}`;
}

function readStorageCache() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStorageCache(key, data) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const cache = readStorageCache();
    cache[key] = {
      data,
      timestamp: Date.now(),
    };
    // Keep max 100 critiques in cache to protect localStorage limits
    const entries = Object.entries(cache);
    if (entries.length > 100) {
      entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));
      const pruned = Object.fromEntries(entries.slice(0, 100));
      window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(pruned));
    } else {
      window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function getCachedAdversarialCritique(candidate, target) {
  if (!candidate) return null;
  const key = buildCacheKey(candidate, target);

  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }

  const storageCache = readStorageCache();
  if (storageCache[key]?.data) {
    const data = storageCache[key].data;
    memoryCache.set(key, data);
    return data;
  }

  return null;
}

export async function fetchAdversarialCritique(candidate, target) {
  if (!candidate) throw new Error("A candidate compound is required.");
  const key = buildCacheKey(candidate, target);

  // 1. Check memory or localStorage cache first
  const cached = getCachedAdversarialCritique(candidate, target);
  if (cached) return cached;

  // 2. Fetch from /api/adversarial-critique
  const payload = {
    candidate: {
      cid: candidate.cid || candidate.compound_id || candidate.CID,
      name: candidate.name || candidate.displayName,
      molecularWeight: candidate.molecularWeight,
      xlogp: candidate.xlogp,
      hbd: candidate.hbd,
      hba: candidate.hba,
      rotatableBonds: candidate.rotatableBonds,
      tpsa: candidate.tpsa,
      class: candidate.class || candidate.drugClass,
      indication: candidate.indication,
      score: candidate.score,
      reasoning: candidate.reasoning || [],
      pains: candidate.pains || candidate.painsAlerts,
    },
    target: target ? {
      name: target.name || target.queryName,
      pdb_id: target.pdb_id || target.id,
      id: target.id || target.pdb_id,
      title: target.title,
      family: target.family,
      resolution: target.resolution,
      method: target.method,
      hasLigand: target.hasLigand,
      ligand: target.ligand,
      pocket: target.pocket,
      dataGaps: target.dataGaps,
    } : null,
  };

  const res = await fetch("/api/adversarial-critique", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error || `Critique service returned ${res.status}`);
  }

  const data = await res.json();
  if (!data?.case_against) {
    throw new Error("Received malformed critique data.");
  }

  // 3. Populate memory and localStorage caches
  memoryCache.set(key, data);
  writeStorageCache(key, data);

  return data;
}
