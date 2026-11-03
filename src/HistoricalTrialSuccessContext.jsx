import React, { useEffect, useState } from "react";
import {
  describeTrialSuccessMatch,
  formatPhaseDisplay,
  formatWhyStoppedSummary,
} from "./shared/trialSuccessDisplay";
import { getTrialSuccessContext } from "./serverApi";

const TRANSITION_COLUMNS = [
  { key: "PHASE1", label: "Phase 1 (→ Ph2+)" },
  { key: "PHASE2", label: "Phase 2 (→ Ph3+)" },
  { key: "PHASE3", label: "Phase 3 (→ Approval)" },
];

const COMPLETION_COLUMNS = [
  { key: "PHASE1", label: "Phase 1" },
  { key: "PHASE2", label: "Phase 2" },
  { key: "PHASE3", label: "Phase 3" },
  { key: "COMBINED", label: "Combined (Ph1/2, Ph2/3)" },
];

function SplitCompletionRow({ split }) {
  if (!split) return null;
  return (
    <div className="trial-success-disease-split-item">
      <div className="trial-success-disease-split-header">
        <strong>{split.label}</strong>
        <span> ({split.trials ?? 0} trials)</span>
      </div>
      <div className="trial-success-disease-split-grid">
        {["PHASE1", "PHASE2", "PHASE3"].map((phaseKey) => {
          const comp = formatPhaseDisplay(split.completion?.[phaseKey]);
          const label = phaseKey.replace("PHASE", "Phase ");
          return (
            <div key={phaseKey} className="trial-success-disease-split-cell">
              <span className="trial-success-split-phase-label">{label} completion: </span>
              <span className="trial-success-split-phase-val">{comp.rateText}</span>
              {comp.detailText ? (
                <span className="trial-success-split-phase-detail"> ({comp.detailText})</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

  if (!target || !context) return null;

  const attributionText = `Source: ${context.source || "ClinicalTrials.gov API v2"}${
    context.generatedAt ? ` · data generated ${context.generatedAt.slice(0, 10)}` : ""
  }`;

  if (!context.available) {
    return (
      <div
        className={`trial-success-context ${className}`.trim()}
        role="region"
        aria-label="Historical phase transition and trial completion context"
      >
        <div className="trial-success-header">
          <span className="trial-success-eyebrow">Historical clinical context</span>
          <h4 className="trial-success-title">
            Historical Phase Transition &amp; Trial Completion Rates
          </h4>
        </div>
        <p className="trial-success-scope-note">
          Unavailable — no curated drug-intervention category matched this target.
        </p>
        <p className="trial-success-limitation">{context.limitationNote}</p>
        <div className="trial-success-attribution">{attributionText}</div>
      </div>
    );
  }

  const matchDescription = describeTrialSuccessMatch(context);
  const transitions = context.transitions || {};
  const completion = context.completion || context.phases || {};
  const byDiseaseArea = context.byDiseaseArea || null;
  const selectedDiseaseArea = context.selectedDiseaseArea || "both";

  const splitsToShow = [];
  if (byDiseaseArea) {
    if (selectedDiseaseArea === "oncology" && byDiseaseArea.oncology) {
      splitsToShow.push(byDiseaseArea.oncology);
    } else if (selectedDiseaseArea === "non_oncology" && byDiseaseArea.non_oncology) {
      splitsToShow.push(byDiseaseArea.non_oncology);
    } else {
      if (byDiseaseArea.oncology) splitsToShow.push(byDiseaseArea.oncology);
      if (byDiseaseArea.non_oncology) splitsToShow.push(byDiseaseArea.non_oncology);
    }
  }

  return (
    <div
      className={`trial-success-context ${className}`.trim()}
      role="region"
      aria-label="Historical phase transition and trial completion context"
    >
      <div className="trial-success-header">
        <span className="trial-success-eyebrow">Historical clinical context</span>
        <h4 className="trial-success-title">
          Historical Phase Transition &amp; Trial Completion Rates
        </h4>
      </div>

      <div className="trial-success-category-block">
        <p className="trial-success-category-primary">
          <strong>{context.categoryLabel}</strong>
          <span className="trial-success-category-sep"> · </span>
          <span className="trial-success-query">
            CT.gov query.intr:{" "}
            {Array.isArray(context.drugs) && context.drugs.length
              ? context.drugs.join(", ")
              : context.query}
          </span>
        </p>
        {matchDescription ? (
          <p className="trial-success-match-type">Match: {matchDescription}</p>
        ) : null}
        {typeof context.fetched === "number" && context.fetched > 0 ? (
          <p className="trial-success-filter-note">
            Intervention filter: kept {context.kept ?? 0} of {context.fetched} fetched trials (
            {context.discarded ?? 0} discarded as off-intervention).
          </p>
        ) : null}
        <p className="trial-success-scope-note">
          Class and phase historical phase transition and trial completion base rates — not a
          compound-specific prediction. Minimum sample size n &ge; {context.minSampleSize ?? 30}.
        </p>
      </div>

      <div className="trial-success-body">
        <table className="trial-success-phase-table">
          <caption className="trial-success-table-caption">
            Phase transition rate (drugs advancing to a subsequent phase; 3-year censoring)
          </caption>
          <thead>
            <tr>
              {TRANSITION_COLUMNS.map((col) => (
                <th key={col.key} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {TRANSITION_COLUMNS.map((col) => {
                const phaseData = transitions[col.key];
                const display = formatPhaseDisplay(phaseData);
                const cellClass =
                  "trial-success-phase-cell" +
                  (display.kind === "insufficient" || display.kind === "unavailable"
                    ? " insufficient"
                    : "") +
                  (display.kind === "rate" ? " has-rate" : "");
                return (
                  <td key={col.key} className={cellClass}>
                    <span className="trial-success-transition-rate">{display.rateText}</span>
                    {display.detailText ? (
                      <span className="trial-success-phase-n">{display.detailText}</span>
                    ) : null}
                    {phaseData?.censored > 0 ? (
                      <span className="trial-success-phase-sub">
                        {phaseData.censored} drug(s) censored (&lt;3y)
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        <table className="trial-success-phase-table trial-success-completion-table">
          <caption className="trial-success-table-caption">
            Trial completion rate (secondary — finished without early stop)
          </caption>
          <thead>
            <tr>
              {COMPLETION_COLUMNS.map((col) => (
                <th key={col.key} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {COMPLETION_COLUMNS.map((col) => {
                const phaseData = completion[col.key];
                const display = formatPhaseDisplay(phaseData);
                const exclDisplay = phaseData?.excludingOperational
                  ? formatPhaseDisplay(phaseData.excludingOperational)
                  : null;
                const sensDisplay = phaseData?.sensitivityIncludeUnknown
                  ? formatPhaseDisplay(phaseData.sensitivityIncludeUnknown)
                  : null;
                const whyText = formatWhyStoppedSummary(phaseData?.whyStopped);
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
                    {exclDisplay && exclDisplay.kind !== "empty" ? (
                      <span className="trial-success-phase-sub">
                        Excl. operational stops: {exclDisplay.rateText}
                        {exclDisplay.detailText ? ` (${exclDisplay.detailText})` : ""}
                      </span>
                    ) : null}
                    {phaseData?.unknownStatus > 0 && sensDisplay ? (
                      <span className="trial-success-phase-sub">
                        UNKNOWN status: {phaseData.unknownStatus} · sensitivity (UNKNOWN as
                        non-completed): {sensDisplay.rateText}
                        {sensDisplay.detailText ? ` (${sensDisplay.detailText})` : ""}
                      </span>
                    ) : null}
                    {whyText ? <span className="trial-success-phase-sub">{whyText}</span> : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        {splitsToShow.length > 0 ? (
          <div className="trial-success-disease-splits">
            <div className="trial-success-table-caption">
              Disease-area breakdown (
              {selectedDiseaseArea === "both"
                ? "oncology and non-oncology"
                : selectedDiseaseArea === "oncology"
                ? "target context: oncology"
                : "target context: non-oncology"}
              )
            </div>
            {splitsToShow.map((split) => (
              <SplitCompletionRow key={split.label} split={split} />
            ))}
          </div>
        ) : null}
      </div>

      <p className="trial-success-limitation">{context.limitationNote}</p>
      <div className="trial-success-attribution">{attributionText}</div>
    </div>
  );
}
