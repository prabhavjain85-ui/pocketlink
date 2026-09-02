/**
 * Cache AI / heuristic candidate scores by (PDB ID, compound CID).
 * A score computed against one target must never be reused for another.
 */

import { rankingCacheKey } from "./targetContext";

const MEMORY_CACHE = new Map();
const STORAGE_KEY = "pocketlink-rank-cache-v3";

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

export function pdbIdOf(protein) {
  return String(protein?.pdb_id || protein?.id || "none").toUpperCase();
}

export { rankingCacheKey };

export function getCachedScore(pdbId, cid) {
  const key = rankingCacheKey(pdbId, cid);
  if (!String(cid ?? "").trim()) return null;
  if (MEMORY_CACHE.has(key)) {
    const hit = MEMORY_CACHE.get(key);
    if (hit && String(hit.pdbId).toUpperCase() === String(pdbId || "none").toUpperCase()) return hit;
    return null;
  }
  const session = readSessionCache();
  const stored = session[key];
  if (stored && String(stored.pdbId).toUpperCase() === String(pdbId || "none").toUpperCase()) {
    MEMORY_CACHE.set(key, stored);
    return stored;
  }
  return null;
}

export function rememberScore(pdbId, row) {
  const cid = String(row?.compound_id ?? row?.cid ?? "").trim();
  if (!cid) return;
  const pdb = String(pdbId || "none").toUpperCase();
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
  writeSessionCache({ [key]: entry });
}

export function rememberRanking(protein, result) {
  const pdb = pdbIdOf(protein);
  const rows = Array.isArray(result?.candidates) && result.candidates.length
    ? result.candidates
    : result?.ranking || [];
  for (const row of rows) rememberScore(pdb, row);
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
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
