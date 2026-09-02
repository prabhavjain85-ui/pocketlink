import { PDB_ID_RE } from "./targetContext";
import { fetchAndScoreTargets } from "./targetSelectionScore";

export const NO_EXPERIMENTAL_STRUCTURE_MSG =
  "No experimental structure currently available — this target may require AlphaFold-predicted structure support in a future update";

export function noPdbMatchMessage(query, { noStructureHint } = {}) {
  if (noStructureHint) return NO_EXPERIMENTAL_STRUCTURE_MSG;
  return `No PDB entries matched "${query}". Try a protein name, gene, or a 4-character PDB ID.`;
}

async function parseRcsbSearchResponse(res) {
  // RCSB returns 204 No Content (empty body) when the query has zero hits.
  if (res.status === 204) return { result_set: [] };
  if (!res.ok) throw new Error("search failed");
  const text = await res.text();
  if (!text.trim()) return { result_set: [] };
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("search failed");
  }
}

/**
 * Search RCSB for a protein name / gene / PDB ID and return scored structures.
 * Shared by the staging bench, Repurposing Mode, and Target Discovery handoff.
 */
export async function searchPdbTargets(query, options = {}) {
  const q = String(query || "").trim();
  if (!q) return { results: [], error: "" };
  const emptyError = noPdbMatchMessage(q, options);

  let ids = [];
  const looksLikeId = PDB_ID_RE.test(q);
  if (looksLikeId) {
    ids = [q.toUpperCase()];
  }
  if (!ids.length) {
    const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: { type: "terminal", service: "full_text", parameters: { value: q } },
        return_type: "entry",
        request_options: { paginate: { start: 0, rows: 6 } },
      }),
    });
    const data = await parseRcsbSearchResponse(res);
    ids = (data.result_set || []).map((r) => r.identifier);
  }
  if (!ids.length) {
    return {
      results: [],
      error: emptyError,
    };
  }

  let scored = await fetchAndScoreTargets(ids);
  if (!scored.length && looksLikeId) {
    const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: { type: "terminal", service: "full_text", parameters: { value: q } },
        return_type: "entry",
        request_options: { paginate: { start: 0, rows: 6 } },
      }),
    });
    if (res.ok) {
      const data = await parseRcsbSearchResponse(res);
      const searchIds = (data.result_set || []).map((r) => r.identifier);
      if (searchIds.length) scored = await fetchAndScoreTargets(searchIds);
    }
  }
  if (!scored.length) {
    return {
      results: [],
      error: emptyError,
    };
  }
  return { results: scored, error: "" };
}

export { PDB_ID_RE };
