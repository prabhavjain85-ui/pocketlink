import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, ScoreInfoTip, TargetScoreTable } from "./benchUi";
import { searchPdbTargets } from "./pdbSearch";

/**
 * Shared PDB target search + Target Selection Score table.
 * Used by the staging bench, the dedicated /repurposing page, and Target Discovery handoff.
 */
export default function PdbTargetSearch({
  protein,
  onSelect,
  onResultsChange,
  eyebrow = "Station 1 — RCSB PDB",
  title = "Find a target",
  hint = "Live query against search.rcsb.org and data.rcsb.org. Matching structures are scored locally for docking/design suitability.",
  emptyText = "No target staged yet.",
  initialQuery = "",
  autoSearch = false,
  noStructureHint = false,
}) {
  const [pQuery, setPQuery] = useState(initialQuery || "");
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pResults, setPResults] = useState([]);
  const [scoreSort, setScoreSort] = useState({ key: "score", dir: "desc" });
  const reqId = useRef(0);
  const autoKey = useRef("");

  const runSearch = useCallback(async (raw) => {
    const q = String(raw ?? "").trim();
    if (!q) return;
    const myReq = ++reqId.current;
    setPLoading(true);
    setPError("");
    setPResults([]);
    if (typeof onResultsChange === "function") onResultsChange([]);
    setScoreSort({ key: "score", dir: "desc" });
    try {
      const { results, error } = await searchPdbTargets(q, { noStructureHint });
      if (reqId.current !== myReq) return;
      if (error) {
        setPError(error);
        return;
      }
      setPResults(results);
      if (typeof onResultsChange === "function") onResultsChange(results);
    } catch (e) {
      if (reqId.current === myReq) setPError("Couldn't reach RCSB PDB. Check your connection and try again.");
    } finally {
      if (reqId.current === myReq) setPLoading(false);
    }
  }, [onResultsChange, noStructureHint]);

  const searchProtein = useCallback(() => runSearch(pQuery), [runSearch, pQuery]);

  useEffect(() => {
    if (!autoSearch) return;
    const q = String(initialQuery || "").trim();
    if (!q || autoKey.current === q) return;
    autoKey.current = q;
    setPQuery(q);
    runSearch(q);
  }, [autoSearch, initialQuery, runSearch]);

  const recommendedTarget = useMemo(() => {
    if (!pResults.length) return null;
    return pResults.reduce((best, row) => {
      if (!best) return row;
      if ((row.score ?? 0) > (best.score ?? 0)) return row;
      return best;
    }, null);
  }, [pResults]);

  const toggleScoreSort = (key) => {
    setScoreSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "id" || key === "method" ? "asc" : "desc" };
    });
  };

  return (
    <Panel eyebrow={eyebrow} title={title} kind="target">
      <div className="search-row">
        <input
          placeholder="Protein name, gene, or PDB ID (e.g. EGFR, 1M17)"
          value={pQuery}
          onChange={(e) => setPQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchProtein()}
        />
        <button className="btn btn-target" onClick={searchProtein} disabled={pLoading}>
          {pLoading ? <span className="spinner" /> : null}Search
        </button>
      </div>
      <div className="hint">{hint}</div>
      {noStructureHint && pQuery ? (
        <div className="source-pill" style={{ marginTop: 0, marginBottom: 10 }}>
          Pre-filled from Target Discovery: {pQuery}
        </div>
      ) : null}
      {pError && <div className="error-msg">{pError}</div>}
      {pResults.length > 0 && (
        <div className="score-block">
          <div className="score-toolbar">
            <span className="score-toolbar-label">Target selection score</span>
            <ScoreInfoTip />
          </div>
          {recommendedTarget && (
            <div className="recommend compact">
              <div className="recommend-label">Recommended structure</div>
              <div className="winner">🏆 Recommended structure: {recommendedTarget.id}</div>
              <div className="winner-score">Target selection score {recommendedTarget.score}/100</div>
              <ul className="rank-bullets">
                {(recommendedTarget.reasons || []).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
          <TargetScoreTable
            results={pResults}
            selectedId={protein?.id}
            recommendedId={recommendedTarget?.id}
            sortKey={scoreSort.key}
            sortDir={scoreSort.dir}
            onSort={toggleScoreSort}
            onSelect={(row) => onSelect({ ...row, queryName: pQuery.trim() })}
          />
          {protein && pResults.some((r) => r.id === protein.id) && (
            <div className="hint" style={{ margin: 0 }}>
              Staged target: <span className="mono">{protein.id}</span>
              {protein.title ? ` — ${protein.title}` : ""}
            </div>
          )}
        </div>
      )}
      {!pResults.length && !pLoading && !pError && (
        <div className="empty-state">{emptyText}</div>
      )}
    </Panel>
  );
}
