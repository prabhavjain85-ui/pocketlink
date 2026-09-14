import React, { useState } from "react";

export default function ExperimentDesignerCard({ experiments = [] }) {
  const [expandedIndex, setExpandedIndex] = useState(0);

  if (!experiments || !experiments.length) return null;

  return (
    <div className="experiment-designer-container">
      <div className="experiment-designer-header">
        <div>
          <h3 className="designer-title">
            <span className="designer-icon" aria-hidden="true">🧪</span>
            Recommended Empirical Experiments
          </h3>
          <p className="designer-subtitle">
            Targeted experimental protocols engineered to efficiently validate or falsify the core assumptions of the hypothesis with definitive controls.
          </p>
        </div>
      </div>

      <div className="experiments-accordion-list">
        {experiments.map((exp, idx) => {
          const isExpanded = expandedIndex === idx;
          return (
            <div key={idx} className={`experiment-card ${isExpanded ? "expanded" : "collapsed"}`}>
              <button
                type="button"
                className="experiment-card-header"
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                aria-expanded={isExpanded}
              >
                <div className="exp-header-left">
                  <span className="exp-num-badge">Protocol {idx + 1}</span>
                  <span className="exp-name-title">{exp.name}</span>
                </div>
                <div className="exp-header-right">
                  <span className="exp-expand-icon">{isExpanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="experiment-card-body">
                  <div className="exp-objective-banner">
                    <strong>Objective:</strong> {exp.objective}
                  </div>

                  <div className="exp-grid-details">
                    <div className="exp-detail-col">
                      <div className="exp-field-row">
                        <span className="exp-field-label">Model System:</span>
                        <span className="exp-field-val">{exp.model}</span>
                      </div>
                      <div className="exp-field-row">
                        <span className="exp-field-label">Intervention:</span>
                        <span className="exp-field-val">{exp.intervention}</span>
                      </div>
                      <div className="exp-field-row">
                        <span className="exp-field-label">Negative Control:</span>
                        <span className="exp-field-val">{exp.control}</span>
                      </div>
                    </div>

                    <div className="exp-detail-col">
                      <div className="exp-field-row">
                        <span className="exp-field-label">Primary Endpoint:</span>
                        <span className="exp-field-val font-semibold">{exp.primaryEndpoint}</span>
                      </div>
                      <div className="exp-field-row">
                        <span className="exp-field-label">Secondary Endpoint:</span>
                        <span className="exp-field-val">{exp.secondaryEndpoint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Differential Outcomes: TRUE vs FALSE */}
                  <div className="differential-outcomes-grid">
                    <div className="outcome-box outcome-true">
                      <div className="outcome-header">
                        <span className="outcome-tag tag-true">✓ IF HYPOTHESIS IS TRUE</span>
                      </div>
                      <p className="outcome-text">{exp.expectedTrue}</p>
                    </div>

                    <div className="outcome-box outcome-false">
                      <div className="outcome-header">
                        <span className="outcome-tag tag-false">✗ IF HYPOTHESIS IS FALSE</span>
                      </div>
                      <p className="outcome-text">{exp.expectedFalse}</p>
                    </div>
                  </div>

                  {/* Scientific Interpretation */}
                  {exp.interpretation && (
                    <div className="exp-interpretation-footer">
                      <span className="interpretation-label">Scientific Interpretation:</span>
                      <span className="interpretation-text">{exp.interpretation}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
