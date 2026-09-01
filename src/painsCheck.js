const MEMORY_CACHE = new Map();
const STORAGE_KEY = "pocketlink-pains-cache-v1";
const MAX_BATCH = 5;

export function compoundSmiles(compound) {
  if (!compound) return "";
  return String(
    compound.IsomericSMILES ||
      compound.CanonicalSMILES ||
      compound.SMILES ||
      compound.ConnectivitySMILES ||
      compound.smiles ||
      ""
  ).trim();
}

export function painsCacheKey(compound) {
  const cid = compound?.CID ?? compound?.cid;
  if (cid != null && String(cid) !== "") return `cid:${cid}`;
  const smiles = compoundSmiles(compound);
  return smiles ? `smiles:${smiles}` : null;
}

function unableResult(compound, reason) {
  return {
    cid: String(compound?.CID ?? compound?.cid ?? ""),
    smiles: compoundSmiles(compound),
    status: "unable",
    hasAlerts: false,
    checked: false,
    alerts: [],
    reason: reason || "Unable to check",
  };
}

function readSessionCache() {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeSessionCache(entries) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const current = readSessionCache();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...entries }));
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function getCachedPains(compound) {
  const key = painsCacheKey(compound);
  if (!key) return unableResult(compound, "Missing SMILES");
  if (MEMORY_CACHE.has(key)) return MEMORY_CACHE.get(key);
  const session = readSessionCache();
  if (session[key]) {
    MEMORY_CACHE.set(key, session[key]);
    return session[key];
  }
  return null;
}

function remember(result) {
  const cidKey = result.cid ? `cid:${result.cid}` : null;
  const smilesKey = result.smiles ? `smiles:${result.smiles}` : null;
  const persist = {};
  if (cidKey) {
    MEMORY_CACHE.set(cidKey, result);
    persist[cidKey] = result;
  }
  if (smilesKey) {
    MEMORY_CACHE.set(smilesKey, result);
    persist[smilesKey] = result;
  }
  if (Object.keys(persist).length) writeSessionCache(persist);
}

export function compactPainsForRanking(result) {
  if (!result || typeof result !== "object") return null;
  return {
    status: result.status || "unable",
    hasAlerts: Boolean(result.hasAlerts),
    alerts: Array.isArray(result.alerts)
      ? result.alerts.slice(0, 8).map((alert) => ({
          family: alert.family || "",
          catalog: alert.catalog || "",
          name: alert.name || "Alert",
          explanation: alert.explanation || "",
        }))
      : [],
    reason: result.reason || null,
  };
}

export async function checkPainsBatch(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, MAX_BATCH);
  const byCid = {};
  const toFetch = [];

  for (const compound of list) {
    const cid = String(compound?.CID ?? compound?.cid ?? "");
    const smiles = compoundSmiles(compound);
    const key = cid || smiles;
    if (!smiles) {
      const result = unableResult(compound, "Missing SMILES");
      remember(result);
      if (key) byCid[cid || key] = result;
      continue;
    }
    const cached = getCachedPains(compound);
    if (cached) {
      if (cid) byCid[cid] = cached;
      continue;
    }
    toFetch.push({ cid, smiles });
  }

  if (toFetch.length) {
    try {
      const response = await fetch("/api/pains-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compounds: toFetch }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.results)) {
        throw new Error(data?.error || "PAINS check failed.");
      }
      for (const row of data.results) {
        const result = {
          cid: String(row.cid || ""),
          smiles: String(row.smiles || ""),
          status: row.status || "unable",
          hasAlerts: Boolean(row.hasAlerts),
          checked: Boolean(row.checked),
          alerts: Array.isArray(row.alerts) ? row.alerts : [],
          reason: row.reason || null,
        };
        remember(result);
        if (result.cid) byCid[result.cid] = result;
      }
    } catch {
      for (const item of toFetch) {
        byCid[item.cid] = unableResult(item, "PAINS service unavailable");
      }
    }
  }

  return byCid;
}

/**
 * Screen an arbitrary-length library in the same 5-compound PAINS batches
 * the shortlist uses, so the Python function payload stays small.
 */
export async function checkPainsLibrary(candidates, { onProgress } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const byCid = {};
  for (let i = 0; i < list.length; i += MAX_BATCH) {
    const chunk = list.slice(i, i + MAX_BATCH);
    Object.assign(byCid, await checkPainsBatch(chunk));
    if (typeof onProgress === "function") {
      onProgress({ done: Math.min(i + MAX_BATCH, list.length), total: list.length });
    }
  }
  return byCid;
}

export function clearPainsCache() {
  MEMORY_CACHE.clear();
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
