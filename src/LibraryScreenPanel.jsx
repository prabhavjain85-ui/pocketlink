import React from "react";
import { PainsBadge } from "./benchUi";

const TOP_SHOWN = 15;

/**
 * The first reason is the target-rule verdict, which for a similarity-surfaced
 * compound reads "No established target or class relevance" — true, but it is
 * not what put the compound here. Prefer the reason that did.
 */
function leadReason(row) {
  const reasons = (row.reasoning || []).filter(Boolean);
  if (!reasons.length) return "—";
  const negative = /^no established target/i.test(reasons[0]);
  if (negative) {
    const better = reasons.find((r) => /structural similarity/i.test(r));
    if (better) return better;
  }
  return reasons[0];
}

function formatSimilarity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/**
 * Station 2, library mode: screen a whole committed compound set against the
 * staged structure instead of typing compounds one at a time.
 *
 * Every number here is computed on the server from the committed snapshot.
 * The similarity column is 2D fingerprint resemblance to the ligand bound in
 * this structure — it is not a binding prediction.
 */
export default function LibraryScreenPanel({
  protein,
  libraries,
  libraryId,
  setLibraryId,
  running,
  error,
  progress,
  result,
  onRun,
  onCancel,
  onPromote,
}) {
  const selected = (libraries || []).find((l) => l.id === libraryId) || null;
  const rows = result?.ranking || [];
  const top = rows.slice(0, TOP_SHOWN);

  return (
    <div className="library-screen">
      <div className="search-row">
        <select
          value={libraryId}
          onChange={(e) => setLibraryId(e.target.value)}
          disabled={running}
          aria-label="Compound library"
        >
          {(libraries || []).map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.label} (~{lib.approxCount.toLocaleString()})
            </option>
          ))}
        </select>
        {running ? (
          <button className="btn" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : (
          <button
            className="btn btn-candidate"
            onClick={() => onRun()}
            type="button"
            disabled={!protein}
          >
            Screen library
          </button>
        )}
      </div>

      {selected && (
        <div className="hint">
          {selected.description} Source: {selected.source}. {selected.license}.
        </div>
      )}
      {!protein && <div className="hint">Stage a target structure in Station 1 first.</div>}

      {running && (
        <div className="library-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
          </div>
          <div className="hint">{progress?.message || "Screening…"}</div>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {result && !running && (
        <>
          <div className="library-summary">
            <strong>{rows.length.toLocaleString()}</strong> of{" "}
            {Number(result.librarySize || 0).toLocaleString()} compounds scored against{" "}
            {result.target?.pdb_id}
            {result.library?.label ? ` · ${result.library.label}` : ""}
            {result.fromDailyCache ? " · reused today's cached screen" : ""}
          </div>

          <div className="score-table-wrap">
            <table className="score-table candidate-score-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Compound</th>
                  <th>Score</th>
                  <th>Similarity to bound ligand</th>
                  <th>Top reason</th>
                </tr>
              </thead>
              <tbody>
                {top.map((row) => {
                  const sim = formatSimilarity(row.structuralSimilarity);
                  return (
                    <tr key={row.cid}>
                      <td className="mono">{row.rank}</td>
                      <td>
                        <div className="result-id">{row.name}</div>
                        <div className="score-title">
                          {row.cid}
                          {row.maxPhase ? ` · phase ${row.maxPhase}` : ""}
                        </div>
                        <PainsBadge result={row.pains} tipId={`lib-pains-${row.cid}`} />
                      </td>
                      <td className="mono score-num">{row.score}/100</td>
                      <td className="mono">{sim ? `${sim} Tanimoto` : "—"}</td>
                      <td>
                        <div className="score-title">{leadReason(row)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="library-actions">
            <button type="button" className="btn btn-candidate" onClick={() => onPromote(5)}>
              Send top 5 to shortlist
            </button>
            <button type="button" className="btn" onClick={() => onRun({ force: true })}>
              Re-run screen
            </button>
          </div>

          <div className="lipinski-note">
            Scores are a knowledge-based triage heuristic, not a binding or activity prediction.
            The similarity column is Morgan fingerprint (radius 2, 2048-bit) Tanimoto against the
            ligand co-crystallised in this structure — chemical resemblance only.
            {result.library?.generatedAt
              ? ` Library snapshot: ${new Date(result.library.generatedAt).toISOString().slice(0, 10)}.`
              : ""}
          </div>
        </>
      )}
    </div>
  );
}
