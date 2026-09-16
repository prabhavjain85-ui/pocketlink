import React, { useState } from "react";

/**
 * Experimental Quantum Insight placeholder — preserves the product concept on Station 4
 * without calling a Vercel Python VQE backend (removed to reduce Functions Storage).
 * Never wired into scoring, ranking, repurposing, or agent flows.
 */
export default function QuantumInsight({ compound, smiles, protein = null }) {
  const [expanded, setExpanded] = useState(false);

  const cid = compound?.cid || compound?.CID || compound?.compound_id || "unknown";
  const displayName = compound?.displayName || compound?.name || `CID ${cid}`;

  const collapsedLabel = "Quantum Insight (Experimental) — temporarily unavailable";

  return (
    <div className="quantum-insight-container" id={`quantum-insight-${cid}`}>
      <div className="quantum-insight-trigger-row">
        <button
          type="button"
          className={`btn-quantum-toggle ${expanded ? "expanded" : ""} unavailable`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`quantum-insight-panel-${cid}`}
        >
          <span className="quantum-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="quantum-label-text">
            {expanded ? "Hide Quantum Chemistry Analysis" : collapsedLabel}
          </span>
          <span className="quantum-experimental-badge">Experimental</span>
        </button>
      </div>

      {expanded && (
        <div className="quantum-insight-panel" id={`quantum-insight-panel-${cid}`}>
          <div className="quantum-insight-header">
            <div>
              <span className="quantum-eyebrow">Research-stage simulation</span>
              <h4 className="quantum-title">Quantum Insight — {displayName}</h4>
            </div>
            <span className="quantum-experimental-pill">Not part of AI scoring</span>
          </div>

          <div className="quantum-unavailable">
            <div className="quantum-unavailable-title">Temporarily unavailable</div>
            <p>
              Quantum Insight explored variational quantum eigensolver (VQE) ground-state estimates for
              tiny molecular fragments using Qiskit and PySCF. That Python compute stack was removed from
              Vercel serverless functions to reduce Functions Storage — each deployment bundled roughly
              600&nbsp;MB+ of scientific Python dependencies.
            </p>
            <p>
              <strong>This panel does not run simulations.</strong> Planned future work is external Python
              compute (not on Vercel) so VQE can return without bloating every deployment.
            </p>
            {smiles && (
              <p className="quantum-unavailable-smiles">
                Staged structure: <span className="mono">{smiles}</span>
              </p>
            )}
          </div>

          <p className="quantum-limitations">
            Quantum-chemistry simulation is research-stage, not validated for drug-discovery decisions,
            and is <strong>not</strong> part of TargetForge scoring, ranking, or repurposing.
          </p>
        </div>
      )}
    </div>
  );
}
