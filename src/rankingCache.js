/**
 * Cache AI / heuristic candidate scores by (PDB ID, compound CID).
 * A score computed against one target must never be reused for another.
 */

import { rankingCacheKey } from "./targetContext";

const MEMORY_CACHE = new Map();
const STORAGE_KEY = "pocketlink-rank-cache-v3";

let rankingSessionLoaded = false;

function ensureSessionLoaded() {
  if (rankingSessionLoaded) return;
  rankingSessionLoaded = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
    for (const [k, v] of Object.entries(raw)) {
      if (!MEMORY_CACHE.has(k)) MEMORY_CACHE.set(k, v);
    }
  } catch {
    // ignore
  }
}

function writeSessionCache() {
  if (typeof sessionStorage === "undefined") return;
  try {
    ensureSessionLoaded();
    const current = {};
    for (const [k, v] of MEMORY_CACHE.entries()) {
      current[k] = v;
    }
    const keys = Object.keys(current);
    if (keys.length > 500) {
      const bounded = {};
      for (const k of keys.slice(-500)) bounded[k] = current[k];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // quota / private mode — memory cache still works
  }
}

export function pdbIdOf(protein) {
  return String(protein?.pdb_id || protein?.id || "none").toUpperCase();
}

export { rankingCacheKey };

export function getCachedScore(pdbId, cid) {
  const key = rankingCacheKey(pdbId, cid);
  if (!String(cid ?? "").trim()) return null;
  ensureSessionLoaded();
  if (MEMORY_CACHE.has(key)) {
    const hit = MEMORY_CACHE.get(key);
    if (hit && String(hit.pdbId).toUpperCase() === String(pdbId || "none").toUpperCase()) return hit;
  }
  return null;
}

export function rememberScores(pdbId, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;
  const pdb = String(pdbId || "none").toUpperCase();
  for (const row of list) {
    const cid = String(row?.compound_id ?? row?.cid ?? "").trim();
    if (!cid) continue;
    const key = rankingCacheKey(pdb, cid);
    const entry = {
      pdbId: pdb,
      cid,
      compound_id: cid,
      score: Number(row.score),
      reasoning: Array.isArray(row.reasoning) ? row.reasoning.slice(0, 8) : [],
      strengths: Array.isArray(row.strengths) ? row.strengths.slice(0, 4) : [],
      concerns: Array.isArray(row.concerns) ? row.concerns.slice(0, 4) : [],
      name: row.name || "",
    };
    MEMORY_CACHE.set(key, entry);
  }
  writeSessionCache();
}

export function rememberScore(pdbId, row) {
  if (row) rememberScores(pdbId, [row]);
}

export function rememberRanking(protein, result) {
  const pdb = pdbIdOf(protein);
  const rows = Array.isArray(result?.candidates) && result.candidates.length
    ? result.candidates
    : result?.ranking || [];
  rememberScores(pdb, rows);
}

export function hydrateRankingFromCache(candidates, protein) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length < 2) return null;
  const pdb = pdbIdOf(protein);
  const rows = [];
  for (const candidate of list) {
    const cid = String(candidate.CID ?? candidate.cid ?? "");
    const cached = getCachedScore(pdb, cid);
    if (!cached) return null;
    rows.push(cached);
  }
  return rows;
}

export function clearRankingCache() {
  MEMORY_CACHE.clear();
  rankingSessionLoaded = false;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
