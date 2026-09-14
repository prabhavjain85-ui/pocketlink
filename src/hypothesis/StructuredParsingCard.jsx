import React, { useState } from "react";

export default function StructuredParsingCard({ parsed, onChange, onConfirm, isEvaluating }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(parsed);

  if (!parsed) return null;

  const handleFieldChange = (field, val) => {
    const updated = { ...draft, [field]: val };
    setDraft(updated);
    if (onChange) onChange(updated);
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    if (onChange) onChange(draft);
  };

  return (
    <div className="structured-parsing-card" id="structured-hypothesis-interpretation">
      <div className="parsing-card-header">
        <div className="parsing-title-wrap">
          <span className="parsing-badge-tag">STRUCTURED TRANSLATION</span>
          <h3 className="parsing-title">Deconstructed Scientific Hypothesis</h3>
          <p className="parsing-subtitle">
            PocketLink translated your natural language premise into a rigorous, testable pharmacological model.
          </p>
        </div>
        <div className="parsing-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (isEditing) handleSaveEdit();
              else {
                setDraft(parsed);
                setIsEditing(true);
              }
            }}
          >
            {isEditing ? "Done Editing" : "Edit Parameters"}
          </button>
        </div>
      </div>

      <div className="parsing-grid">
        <div className="parsing-item">
          <span className="parsing-label">Disease Indication:</span>
          {isEditing ? (
            <input
              type="text"
              className="parsing-input"
              value={draft.disease || ""}
              onChange={(e) => handleFieldChange("disease", e.target.value)}
            />
          ) : (
            <span className="parsing-val font-semibold">{parsed.disease || "Not specified"}</span>
          )}
        </div>

        <div className="parsing-item">
          <span className="parsing-label">Intervention Modality:</span>
          {isEditing ? (
            <input
              type="text"
              className="parsing-input"
              value={draft.intervention || ""}
              onChange={(e) => handleFieldChange("intervention", e.target.value)}
            />
          ) : (
            <span className="parsing-val">{parsed.intervention || "Targeted modulation"}</span>
          )}
        </div>

        <div className="parsing-item">
          <span className="parsing-label">Molecular Target / Gene:</span>
          {isEditing ? (
            <input
              type="text"
              className="parsing-input"
              value={draft.target || ""}
              onChange={(e) => handleFieldChange("target", e.target.value)}
            />
          ) : (
            <span className="parsing-val target-pill">
              {parsed.target || "Target"} {parsed.targetGene ? `(${parsed.targetGene})` : ""}
            </span>
          )}
        </div>

        <div className="parsing-item">
          <span className="parsing-label">Patient Population:</span>
          {isEditing ? (
            <input
              type="text"
              className="parsing-input"
              value={draft.patientPopulation || ""}
              onChange={(e) => handleFieldChange("patientPopulation", e.target.value)}
            />
          ) : (
            <span className="parsing-val">{parsed.patientPopulation || "General indicated population"}</span>
          )}
        </div>

        <div className="parsing-item full-width">
          <span className="parsing-label">Proposed Biological Mechanism:</span>
          {isEditing ? (
            <textarea
              className="parsing-textarea"
              rows={2}
              value={draft.proposedMechanism || ""}
              onChange={(e) => handleFieldChange("proposedMechanism", e.target.value)}
            />
          ) : (
            <span className="parsing-val mechanism-text">{parsed.proposedMechanism || "Cascade unstated"}</span>
          )}
        </div>

        <div className="parsing-item full-width">
          <span className="parsing-label">Expected Phenotypic Outcome:</span>
          {isEditing ? (
            <textarea
              className="parsing-textarea"
              rows={2}
              value={draft.expectedOutcome || ""}
              onChange={(e) => handleFieldChange("expectedOutcome", e.target.value)}
            />
          ) : (
            <span className="parsing-val">{parsed.expectedOutcome || "Symptom reduction"}</span>
          )}
        </div>

        <div className="parsing-item full-width">
          <span className="parsing-label">Identified Potential Liabilities / Risks:</span>
          {isEditing ? (
            <textarea
              className="parsing-textarea"
              rows={2}
              value={draft.potentialRisks || ""}
              onChange={(e) => handleFieldChange("potentialRisks", e.target.value)}
            />
          ) : (
            <span className="parsing-val risks-text">{parsed.potentialRisks || "None highlighted"}</span>
          )}
        </div>
      </div>

      <div className="parsing-footer">
        <span className="parsing-confirm-hint">
          {isEditing ? "Click 'Done Editing' to preserve changes, then run evaluation." : "Parameters verified. Ready for 15-step scientific evaluation."}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-run-eval"
          onClick={onConfirm}
          disabled={isEvaluating}
        >
          {isEvaluating ? (
            <>
              <span className="spinner-inline" /> Evaluating Evidence...
            </>
          ) : (
            <>
              Run Comprehensive Scientific Evaluation
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginLeft: 6 }}>
                <path d="M5 10h10M10 5l5 5-5 5" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
