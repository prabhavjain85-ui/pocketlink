import React from "react";

export default function FalsificationPanel({ criteria = [] }) {
  if (!criteria || !criteria.length) return null;

  return (
    <div className="falsification-panel">
      <div className="falsification-header">
        <div className="falsification-badge-wrap">
          <span className="falsification-icon" aria-hidden="true">🎯</span>
          <span className="falsification-badge">FALSIFICATION CRITERIA</span>
        </div>
        <h3 className="falsification-title">What Would Prove Us Wrong?</h3>
        <p className="falsification-subtitle">
          True scientific inquiry requires defining explicit conditions under which this hypothesis is refuted. The hypothesis must be rejected if any of the following empirical benchmarks are met:
        </p>
      </div>

      <div className="falsification-list">
        {criteria.map((item, index) => (
          <div key={index} className="falsification-item">
            <div className="falsification-index-badge">
              <span>{index + 1}</span>
            </div>
            <div className="falsification-content">
              <p className="falsification-text">{item}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="falsification-footer-note">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, flexShrink: 0 }}>
          <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM10 6v4M10 14h.01" />
        </svg>
        <span>
          <strong>Popperian Falsifiability:</strong> An unfalsifiable claim is dogma, not science. If experimental observations meet these criteria, the hypothesis must be abandoned rather than rescued with ad-hoc rationalizations.
        </span>
      </div>
    </div>
  );
}
