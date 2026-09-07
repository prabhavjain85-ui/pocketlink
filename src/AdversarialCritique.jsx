import React, { useEffect, useState } from "react";
import { fetchAdversarialCritique, getCachedAdversarialCritique } from "./adversarialService";

/**
 * AdversarialCritique Component ("The Case Against")
 * Provides an on-demand, expandable second-opinion AI pass arguing against the candidate.
 * Collapsed by default; fetches lazily on expand and caches results.
 */
export default function AdversarialCritique({ candidate, target, compact = false, label = "See the case against this candidate" }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [critique, setCritique] = useState(() => getCachedAdversarialCritique(candidate, target));

  // Sync cache if candidate or target changes
  useEffect(() => {
    const cached = getCachedAdversarialCritique(candidate, target);
    setCritique(cached);
    if (!cached) {
      setExpanded(false);
    }
  }, [candidate, target]);

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (critique || loading) return;

    setLoading(true);
    setError("");
    try {
      const result = await fetchAdversarialCritique(candidate, target);
      setCritique(result);
    } catch (err) {
      setError(err.message || "Unable to generate adversarial critique.");
    } finally {
      setLoading(false);
    }
  };

  const cid = candidate?.cid || candidate?.compound_id || candidate?.CID || "unknown";
  const caseAgainst = critique?.case_against;

  return (
    <div className={`adversarial-container ${compact ? "compact" : ""}`} id={`adversarial-critique-${cid}`}>
      <div className="adversarial-trigger-row">
        <button
          type="button"
          className={`btn-adversarial-toggle ${expanded ? "expanded" : ""}`}
          onClick={toggleExpand}
          aria-expanded={expanded}
          aria-controls={`adversarial-content-${cid}`}
        >
          <span className="adversarial-icon" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className="adversarial-scale-icon" aria-hidden="true">⚖️</span>
          <span className="adversarial-label-text">
            {expanded ? "Hide the case against this candidate" : label}
          </span>
          {critique && !expanded && (
            <span className="adversarial-cached-pill">Ready</span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="adversarial-panel" id={`adversarial-content-${cid}`}>
          <div className="adversarial-header">
            <div className="adversarial-title-group">
              <span className="adversarial-eyebrow">Counterpoint Analysis</span>
              <h4 className="adversarial-title">The Case Against {candidate?.displayName || candidate?.name || `CID ${cid}`}</h4>
            </div>
            <div className="adversarial-badges">
              <span className="adversarial-mode-badge" title="Second-pass adversarial evaluation identifying potential downstream failure modes">
                Adversarial Review
              </span>
              {critique?.source === "ai" && (
                <span className="adversarial-model-badge">AI Synthesis</span>
              )}
            </div>
          </div>

          {loading && (
            <div className="adversarial-loading">
              <span className="spinner" aria-hidden="true" />
              <span>Analyzing counter-evidence, selectivity risks, and failure modes...</span>
            </div>
          )}

          {error && (
            <div className="adversarial-error">
              <span>{error}</span>
              <button
                type="button"
                className="btn btn-ghost-sm"
                onClick={() => {
                  setError("");
                  toggleExpand();
                }}
              >
                Retry
              </button>
            </div>
          )}

          {caseAgainst && (
            <div className="adversarial-body">
              {caseAgainst.overall_assessment && (
                <div className="adversarial-overall">
                  <div className="adversarial-overall-label">Critical Synthesis</div>
                  <p className="adversarial-overall-text">{caseAgainst.overall_assessment}</p>
                </div>
              )}

              {Array.isArray(caseAgainst.concerns) && caseAgainst.concerns.length > 0 && (
                <div className="adversarial-concerns-section">
                  <div className="adversarial-concerns-heading">Substantive Concerns & Liabilities</div>
                  <div className="adversarial-concerns-list">
                    {caseAgainst.concerns.map((concern, idx) => (
                      <div key={idx} className="adversarial-concern-item">
                        <div className="adversarial-concern-header">
                          <span className="adversarial-issue-bullet">⚠️</span>
                          <span className="adversarial-issue-title">{concern.issue}</span>
                        </div>
                        <p className="adversarial-concern-detail">{concern.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="adversarial-footer">
                <span className="adversarial-footnote">
                  This critique tests potential downstream liabilities (cross-reactivity, resistance, efflux, formulation limits) to balance in silico binding scores.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
