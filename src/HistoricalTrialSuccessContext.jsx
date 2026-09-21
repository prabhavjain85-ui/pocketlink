import React, { useMemo, useState } from "react";
import { formatPhaseRate, getTrialSuccessContext } from "./trialSuccessContext";

const PHASE_TABS = [
  { key: "PHASE1", label: "Phase 1" },
  { key: "PHASE2", label: "Phase 2" },
  { key: "PHASE3", label: "Phase 3" },
];

export default function HistoricalTrialSuccessContext({ target, className = "" }) {
  const context = useMemo(() => getTrialSuccessContext(target), [target]);
  const [activePhase, setActivePhase] = useState("PHASE2");

  if (!context.available) return null;

  const phaseData = context.phases[activePhase];
  const pct = formatPhaseRate(phaseData);
  const activeLabel = PHASE_TABS.find((t) => t.key === activePhase)?.label || activePhase;

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

      <div className="trial-success-tabs" role="tablist" aria-label="Clinical trial phase">
        {PHASE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activePhase === tab.key}
            className={"trial-success-tab" + (activePhase === tab.key ? " active" : "")}
            onClick={() => setActivePhase(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="trial-success-body" role="tabpanel">
        <div className="trial-success-stat-row">
          {phaseData?.reliable ? (
            <>
              <span className="trial-success-pct">{pct}%</span>
              <span className="trial-success-meta">
                historical completion rate · {activeLabel} · n={phaseData.n}
              </span>
            </>
          ) : (
            <span className="trial-success-insufficient">
              Insufficient historical sample (n&lt;{context.minSampleSize})
              {phaseData?.n > 0 ? ` · n=${phaseData.n} for ${activeLabel}` : ` for ${activeLabel}`}
            </span>
          )}
        </div>
        <div className="trial-success-category">
          Category: <strong>{context.categoryLabel}</strong>
          <span className="trial-success-query"> (CT.gov: &ldquo;{context.query}&rdquo;)</span>
        </div>
      </div>

      <p className="trial-success-limitation">{context.limitationNote}</p>
      <div className="trial-success-attribution">
        Source: {context.source}
        {context.generatedAt ? ` · data as of ${context.generatedAt.slice(0, 10)}` : ""}
      </div>
    </div>
  );
}
