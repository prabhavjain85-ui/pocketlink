import React from "react";
import "./clinicalActivity.css";

const STAGE_LABELS = {
  APPROVAL: "Approved",
  PHASE_4: "Phase 4",
  PHASE_3: "Phase 3",
  PHASE_2_3: "Phase 2/3",
  PHASE_2: "Phase 2",
  PHASE_1_2: "Phase 1/2",
  PHASE_1: "Phase 1",
  WITHDRAWAL: "Withdrawn",
  UNKNOWN: "Unknown stage",
};

/** Non-scientific stops are the majority, so they are shown separately. */
function stopBreakdown(categories = {}) {
  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return entries.map(([k, v]) => `${k.replace(/_/g, " ")} (${v})`).join(", ");
}

/**
 * Clinical history for one target, scoped to the disease that was searched.
 *
 * Deliberately not part of the novelty score: only about a quarter of
 * discovered targets have any clinical record, so folding it into the ranking
 * would move rows for a reason that is absent from most of them.
 */
export default function ClinicalActivityPanel({ activity, loading, symbol, onRedesignFailedDrug }) {
  if (loading) {
    return <div className="clinical-activity loading">Checking clinical history for {symbol}…</div>;
  }
  if (!activity) return null;

  if (!activity.available) {
    return (
      <div className="clinical-activity">
        <div className="clinical-activity-state unavailable">Clinical history unavailable</div>
        <div className="hint">{activity.reason}</div>
      </div>
    );
  }

  const here = activity.forThisDisease || {};
  const global = activity.anyIndication || {};
  const hasHistoryElsewhere = (global.candidates || 0) > 0;
  const prescription = activity.redesignPrescription || null;

  const renderRedesignAutopsy = () => {
    if (!prescription || !prescription.active) return null;
    const drugs = (prescription.candidateDrugs || []).slice(0, 4);
    return (
      <div className="clinical-autopsy-box" data-testid="clinical-failure-autopsy">
        <div className="clinical-autopsy-header">
          <span className="clinical-autopsy-eyebrow">Clinical Failure Autopsy → Molecule Redesign</span>
          <span className="clinical-autopsy-badge">{prescription.label}</span>
        </div>
        <div className="clinical-autopsy-row">
          <strong>Diagnosed Setback:</strong> {prescription.detectedReason}
        </div>
        <div className="clinical-autopsy-row">
          <strong>Biological Mechanism:</strong> {prescription.biologicalMechanism}
        </div>
        <div className="clinical-autopsy-row">
          <strong>Medicinal-Chemistry Prescription:</strong> {prescription.prescriptionSummary}
        </div>
        {Array.isArray(prescription.targets) && prescription.targets.length > 0 && (
          <div className="clinical-autopsy-targets">
            {prescription.targets.map((t) => (
              <span key={t.key} className="clinical-autopsy-target-pill">
                <b>{t.label}:</b> {t.targetText}
              </span>
            ))}
          </div>
        )}
        {onRedesignFailedDrug && (
          <div className="clinical-autopsy-actions">
            {drugs.length > 0 ? (
              drugs.map((d) => (
                <button
                  key={d.id || d.name}
                  type="button"
                  className="btn btn-target clinical-autopsy-btn"
                  onClick={() =>
                    onRedesignFailedDrug({
                      symbol: activity.symbol || symbol,
                      drugName: d.name,
                      mode: prescription.mode,
                      reason: prescription.detectedReason,
                    })
                  }
                >
                  🧬 Redesign {d.name} in {prescription.shortLabel} Mode →
                </button>
              ))
            ) : (
              <button
                type="button"
                className="btn btn-target clinical-autopsy-btn"
                onClick={() =>
                  onRedesignFailedDrug({
                    symbol: activity.symbol || symbol,
                    drugName: "",
                    mode: prescription.mode,
                    reason: prescription.detectedReason,
                  })
                }
              >
                🧬 Launch {prescription.shortLabel} Mode in Lead Evolution →
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (activity.state === "none") {
    return (
      <div className="clinical-activity">
        <div className="clinical-activity-state none">No clinical programme for this disease</div>
        <div className="hint">
          Open Targets records no drug in clinical development against {activity.symbol || symbol} for{" "}
          {activity.diseaseName || "this disease"}.
          {hasHistoryElsewhere
            ? ` ${global.candidates} candidate${global.candidates === 1 ? "" : "s"} exist for other indications, which may be a starting point for repurposing.`
            : " No candidates in any indication either."}
        </div>
        {renderRedesignAutopsy()}
      </div>
    );
  }

  const stops = stopBreakdown(here.stopCategories);

  return (
    <div className="clinical-activity">
      <div className={"clinical-activity-state " + activity.state}>{activity.stateLabel}</div>

      <div className="clinical-activity-grid">
        <div>
          <span className="clinical-activity-label">Candidates for this disease</span>
          <span className="clinical-activity-value mono">
            {here.candidates}
            {here.maxStage ? ` · up to ${STAGE_LABELS[here.maxStage] || here.maxStage}` : ""}
          </span>
        </div>
        <div>
          <span className="clinical-activity-label">Trials ongoing</span>
          <span className="clinical-activity-value mono">{here.ongoing ?? 0}</span>
        </div>
        <div>
          <span className="clinical-activity-label">Stopped: efficacy or safety</span>
          <span className={"clinical-activity-value mono" + (here.stoppedScientific > 0 ? " alert" : "")}>
            {here.stoppedScientific ?? 0}
          </span>
        </div>
        <div>
          <span className="clinical-activity-label">Stopped: other reasons</span>
          <span className="clinical-activity-value mono">{here.stoppedOther ?? 0}</span>
        </div>
      </div>

      {here.drugs?.length ? (
        <div className="clinical-activity-drugs">
          <span className="clinical-activity-label">Drugs</span>{" "}
          {here.drugs.map((d) => d.name).join(", ")}
        </div>
      ) : null}

      {here.whyStopped?.length ? (
        <div className="clinical-activity-why">
          <span className="clinical-activity-label">Reported reasons for stopping</span>
          <ul>
            {here.whyStopped.map((w, i) => (
              <li key={i}>
                {w.reason}
                {w.year ? ` (${w.year})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stops ? <div className="hint">All stop categories: {stops}</div> : null}

      {renderRedesignAutopsy()}

      <div className="clinical-activity-note">
        Counts are trials of drugs that list this target, filtered to the disease you searched — not
        trials of this target alone, so a broadly used drug inflates them. Stop categories are
        assigned by Open Targets; only efficacy and safety stops say anything about the target.
        {hasHistoryElsewhere && global.candidates > here.candidates
          ? ` ${global.candidates} candidates exist across all indications.`
          : ""}
      </div>
    </div>
  );
}
