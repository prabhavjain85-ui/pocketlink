import React, { useEffect, useState } from "react";
import { fetchQuantumInsight } from "./quantumInsightService";

/**
 * Experimental, user-triggered quantum-chemistry VQE panel.
 * Never wired into scoring, ranking, repurposing, or agent flows.
 */
export default function QuantumInsight({ compound, smiles }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState(null);
  const [result, setResult] = useState(null);

  const cid = compound?.cid || compound?.CID || compound?.compound_id || "unknown";
  const displayName = compound?.displayName || compound?.name || `CID ${cid}`;

  useEffect(() => {
    setExpanded(false);
    setLoading(false);
    setError("");
    setRefusal(null);
    setResult(null);
  }, [smiles, cid]);

  const runAnalysis = async () => {
    if (!smiles) {
      setError("Select a compound with a valid SMILES string first.");
      return;
    }

    setLoading(true);
    setError("");
    setRefusal(null);
    setResult(null);

    try {
      const data = await fetchQuantumInsight({
        smiles,
        name: displayName,
      });
      if (data.refused) {
        setRefusal(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      if (err.payload?.refused) {
        setRefusal(err.payload);
      } else {
        setError(err.message || "Quantum Insight simulation failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = () => setExpanded((v) => !v);

  return (
    <div className="quantum-insight-container" id={`quantum-insight-${cid}`}>
      <div className="quantum-insight-trigger-row">
        <button
          type="button"
          className={`btn-quantum-toggle ${expanded ? "expanded" : ""}`}
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={`quantum-insight-panel-${cid}`}
        >
          <span className="quantum-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="quantum-label-text">
            {expanded ? "Hide Quantum Chemistry Analysis" : "Run Quantum Chemistry Analysis (Experimental)"}
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

          <p className="quantum-limitations">
            Quantum-chemistry simulation here is research-stage, not validated for drug-discovery
            decisions, and is <strong>not</strong> part of PocketLink scoring, ranking, or repurposing.
            Results come from a classical simulator (Qiskit Aer) — no IBM Quantum hardware.
            Tiny molecules only (≤4 atoms, ≤2 heavy atoms, ≤8 mapped qubits).
          </p>

          <div className="quantum-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={runAnalysis}
              disabled={loading || !smiles}
            >
              {loading ? "Running VQE simulation…" : "Run VQE ground-state estimate"}
            </button>
          </div>

          {loading && (
            <div className="quantum-loading">
              <span className="spinner" aria-hidden="true" />
              <span>
                Building the molecular Hamiltonian and running VQE on Aer. Cold starts can take
                a minute; tiny molecules typically finish in seconds.
              </span>
            </div>
          )}

          {error && (
            <div className="quantum-error">
              <span>{error}</span>
            </div>
          )}

          {refusal && (
            <div className="quantum-refusal">
              <div className="quantum-refusal-title">Molecule outside experimental limits</div>
              <p>{refusal.error}</p>
              {Array.isArray(refusal.reasons) && refusal.reasons.length > 0 && (
                <ul>
                  {refusal.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="quantum-result">
              <div className="quantum-energy-block">
                <div className="quantum-energy-label">Ground-state energy (Hartree)</div>
                <div className="quantum-energy-value mono">
                  {typeof result.total_energy_hartree === "number"
                    ? result.total_energy_hartree.toFixed(6)
                    : "—"}
                </div>
              </div>
              <div className="quantum-meta">
                <span>{result.n_qubits} mapped qubits</span>
                <span>{result.basis} basis</span>
                <span>{result.mapper}</span>
                <span>{result.ansatz}</span>
                {typeof result.runtime_seconds === "number" && (
                  <span>{result.runtime_seconds.toFixed(2)}s runtime</span>
                )}
              </div>
              {result.explanation && (
                <p className="quantum-explanation">{result.explanation}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
