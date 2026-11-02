import React, { useEffect, useState } from "react";
import { describeTrialSuccessMatch, formatPhaseDisplay } from "./shared/trialSuccessDisplay";
import { getTrialSuccessContext } from "./serverApi";

const PHASE_COLUMNS = [
  { key: "PHASE1", label: "Phase 1" },
  { key: "PHASE2", label: "Phase 2" },
  { key: "PHASE3", label: "Phase 3" },
];

export default function HistoricalTrialSuccessContext({ target, className = "" }) {
  const [context, setContext] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    if (!target) return undefined;
    getTrialSuccessContext(target)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [target]);

  if (!context?.available) return null;

  const matchDescription = describeTrialSuccessMatch(context);

  return (
    <div
      className={`trial-success-context ${className}`.trim()}
      role="region"
      aria-label="Historical trial success context"
    >
      <div className="trial-success-header">
        <span className="trial-success-eyebrow">Historical context</span>
        <h4 className="trial-success-title">Historical Trial Success Context</h4>
      </div>

      <div className="trial-success-category-block">
        <p className="trial-success-category-primary">
          <strong>{context.categoryLabel}</strong>
          <span className="trial-success-category-sep"> · </span>
          <span className="trial-success-query">
            CT.gov: &ldquo;{context.query}&rdquo;
          </span>
        </p>
        {matchDescription ? (
          <p className="trial-success-match-type">Match: {matchDescription}</p>
        ) : null}
        <p className="trial-success-scope-note">
          Class and phase historical completion base rates — not a compound-specific prediction.
        </p>
      </div>

      <div className="trial-success-body">
        <table className="trial-success-phase-table">
          <caption className="trial-success-table-caption">
            Historical trial completion rates by phase
          </caption>
          <thead>
            <tr>
              {PHASE_COLUMNS.map((col) => (
                <th key={col.key} scope="col">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {PHASE_COLUMNS.map((col) => {
                const display = formatPhaseDisplay(context.phases[col.key]);
                const cellClass =
                  "trial-success-phase-cell" +
                  (display.kind === "insufficient" ? " insufficient" : "") +
                  (display.kind === "rate" ? " has-rate" : "");
                return (
                  <td key={col.key} className={cellClass}>
                    <span className="trial-success-phase-rate">{display.rateText}</span>
                    {display.detailText ? (
                      <span className="trial-success-phase-n">{display.detailText}</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="trial-success-limitation">{context.limitationNote}</p>
      <div className="trial-success-attribution">
        Source: {context.source}
        {context.generatedAt ? ` · data as of ${context.generatedAt.slice(0, 10)}` : ""}
      </div>
    </div>
  );
}
