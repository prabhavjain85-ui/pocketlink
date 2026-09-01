import { PDB_ID_RE } from "./targetContext";
import { fetchAndScoreTargets } from "./targetSelectionScore";

/**
 * Search RCSB for a protein name / gene / PDB ID and return scored structures.
 * Shared by the staging bench and Repurposing Mode.
 */
export async function searchPdbTargets(query) {
  const q = String(query || "").trim();
  if (!q) return { results: [], error: "" };

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
    if (!res.ok) throw new Error("search failed");
    const data = await res.json();
    ids = (data.result_set || []).map((r) => r.identifier);
  }
  if (!ids.length) {
    return {
      results: [],
      error: `No PDB entries matched "${q}". Try a protein name, gene, or a 4-character PDB ID.`,
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
      const data = await res.json();
      const searchIds = (data.result_set || []).map((r) => r.identifier);
      if (searchIds.length) scored = await fetchAndScoreTargets(searchIds);
    }
  }
  if (!scored.length) {
    return {
      results: [],
      error: `No PDB entries matched "${q}". Try a protein name, gene, or a 4-character PDB ID.`,
    };
  }
  return { results: scored, error: "" };
}

export { PDB_ID_RE };
