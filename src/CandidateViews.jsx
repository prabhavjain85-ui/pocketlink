import React, { useMemo } from "react";
import {
  PainsBadge,
  PubChemStructureImage,
  prettyName,
  getCompoundSmiles,
} from "./benchUi";
import { drugLikenessChecks } from "./scoreCandidates";
import AdversarialCritique from "./AdversarialCritique";

export function compareCandidateField(a, b, key) {
  if (key === "compound") {
    return String(a.name || a.cid).localeCompare(String(b.name || b.cid));
  }
  return (a.score ?? 0) - (b.score ?? 0);
}

export function CandidateScoreTable({ rows, selectedCid, recommendedCid, sortKey, sortDir, onSort, onSelect, target, candidates }) {
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareCandidateField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.cid).localeCompare(String(b.cid));
    });
  }, [rows, sortKey, sortDir]);

  const cols = [
    { key: "compound", label: "Compound" },
    { key: "score", label: "Score" },
    { key: "reasons", label: "Key reasons" },
  ];

  return (
    <div className="score-table-wrap">
      <table className="score-table candidate-score-table">
        <thead>
          <tr>
            {cols.map((col) => {
              const active = sortKey === col.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              const sortable = col.key !== "reasons";
              return (
                <th key={col.key} aria-sort={ariaSort}>
                  {sortable ? (
                    <button type="button" className={"score-th" + (active ? " active" : "")} onClick={() => onSort(col.key)}>
                      {col.label}
                      <span className="sort-ind" aria-hidden="true">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    <span className="score-th">{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const selected = String(selectedCid) === String(r.cid);
            const recommended = String(recommendedCid) === String(r.cid);
            const reasons = r.reasoning && r.reasoning.length
              ? r.reasoning
              : [...(r.strengths || []), ...(r.concerns || [])];
            const fullCandidate = candidates?.find((c) => String(c.CID) === String(r.cid)) || {};
            const mergedCandidate = { ...fullCandidate, ...r, cid: r.cid };

            return (
              <tr
                key={r.cid}
                className={(selected ? "selected" : "") + (recommended ? " recommended" : "")}
                onClick={() => onSelect(r.cid)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.cid);
                  }
                }}
              >
                <td>
                  <div className="result-id">{r.name || `CID ${r.cid}`}</div>
                  <div className="score-title">CID {r.cid}</div>
                </td>
                <td className="mono score-num">{r.score}/100</td>
                <td>
                  <ul className="rank-bullets table-reasons">
                    {reasons.slice(0, 4).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                    <AdversarialCritique
                      candidate={mergedCandidate}
                      target={target}
                      compact
                      label="See the case against this candidate"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CandidateRow({ candidate, selected, recommended, pains, onToggle, onRemove }) {
  const checks = drugLikenessChecks(candidate);
  const pass = checks.filter((c) => c.pass).length;
  return (
    <div className={"shortlist-card" + (selected ? " selected" : "") + (recommended ? " recommended" : "")}>
      <button type="button" className="shortlist-main" onClick={onToggle}>
        <PubChemStructureImage cid={candidate.CID} compact />
        <div className="shortlist-copy">
          <div className="shortlist-top">
            <strong>{candidate.displayName || prettyName(candidate)}</strong>
            <span className="cid">CID {candidate.CID}</span>
          </div>
          <div className="shortlist-formula">{candidate.MolecularFormula}</div>
          <div className="shortlist-smiles">{getCompoundSmiles(candidate)}</div>
          <div className="shortlist-meta">
            MW {Number(candidate.MolecularWeight).toFixed(1)} · XLogP {candidate.XLogP ?? "n/a"} · HBD {candidate.HBondDonorCount} · HBA {candidate.HBondAcceptorCount} · TPSA {candidate.TPSA}
          </div>
          <div className={"shortlist-pass " + (pass >= 5 ? "good" : "warn")}>{pass}/6 drug-likeness checks pass{recommended ? " · AI pick" : ""}</div>
        </div>
      </button>
      <PainsBadge result={pains} tipId={`pains-pop-${candidate.CID}`} />
      <button type="button" className="shortlist-remove" onClick={onRemove} aria-label="Remove from shortlist">
        ×
      </button>
    </div>
  );
}
