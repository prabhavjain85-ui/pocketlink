import React, { useState } from "react";
import { Link } from "react-router-dom";

/**
 * Quantum Insight — planned future feature on Station 4 handoff.
 * Preserves the product concept without calling a VQE backend (removed from Vercel).
 * Never wired into scoring, ranking, repurposing, or agent flows.
 */
export default function QuantumInsight({ compound, smiles, protein = null }) {
  const [expanded, setExpanded] = useState(false);

  const cid = compound?.cid || compound?.CID || compound?.compound_id || "unknown";
  const displayName = compound?.displayName || compound?.name || `CID ${cid}`;
  const pdbId = protein?.id || null;

  const collapsedLabel = "Quantum Insight — coming soon";

  const dockingHandoffUrl =
    pdbId && smiles
      ? `/docking?pdb=${encodeURIComponent(pdbId)}&smiles=${encodeURIComponent(smiles)}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`
      : "/docking";

  return (
    <div className="quantum-insight-container" id={`quantum-insight-${cid}`}>
      <div className="quantum-insight-trigger-row">
        <button
          type="button"
          className={`btn-quantum-toggle ${expanded ? "expanded" : ""} coming-soon`}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`quantum-insight-panel-${cid}`}
        >
          <span className="quantum-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="quantum-label-text">
            {expanded ? "Hide Quantum Insight preview" : collapsedLabel}
          </span>
          <span className="quantum-coming-soon-badge">Coming soon</span>
        </button>
      </div>

      {expanded && (
        <div className="quantum-insight-panel" id={`quantum-insight-panel-${cid}`}>
          <div className="quantum-insight-header">
            <div>
              <span className="quantum-eyebrow">Planned capability</span>
              <h4 className="quantum-title">Quantum Insight — {displayName}</h4>
            </div>
            <span className="quantum-experimental-pill">Not part of AI scoring</span>
          </div>

          <div className="quantum-roadmap">
            <div className="quantum-roadmap-kicker">Future feature</div>
            <p className="quantum-roadmap-lead">
              Quantum Insight will add research-stage quantum-chemistry estimates alongside your classical
              docking and ADME handoff — optional context, not a replacement for either.
            </p>

            <h5 className="quantum-roadmap-heading">What it will do</h5>
            <ul className="quantum-roadmap-list">
              <li>
                Run variational quantum eigensolver (VQE) ground-state energy estimates for small molecular
                fragments derived from your staged ligand, using Qiskit and PySCF on dedicated Python compute.
              </li>
              <li>
                Surface quantum-chemistry-level context for ligand–pocket triage (electronic structure and
                ground-state energies) as a complement to experimental, unvalidated force-field docking scores.
              </li>
            </ul>

            {(smiles || pdbId) && (
              <div className="quantum-roadmap-staged" aria-label="Staged inputs for future runs">
                {pdbId && (
                  <p>
                    Staged target: <span className="mono">{pdbId}</span>
                  </p>
                )}
                {smiles && (
                  <p>
                    Staged ligand: <span className="mono">{smiles}</span>
                  </p>
                )}
              </div>
            )}

            <div className="quantum-roadmap-actions">
              <Link to={dockingHandoffUrl} className="btn btn-primary quantum-cta">
                Run native docking →
              </Link>
              <Link to="/" className="btn btn-secondary quantum-cta">
                Run a screen
              </Link>
              <Link to="/contact" className="btn btn-ghost quantum-cta">
                Contact — express interest
              </Link>
            </div>
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
