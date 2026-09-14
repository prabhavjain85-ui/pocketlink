import React, { useEffect, useMemo, useState } from "react";
import { fetchQuantumInsight } from "./quantumInsightService";
import { buildRefusalPreview, previewQuantumGateFromSmiles } from "./quantumInsightGate";
import { countQuantumAtomsFromSmiles, isH2Smiles } from "./quantumGeometry";
import { selectPocketContactFragment } from "./quantumFragmentSelector";

/**
 * Experimental, user-triggered quantum-chemistry VQE panel.
 * Never wired into scoring, ranking, repurposing, or agent flows.
 */
export default function QuantumInsight({ compound, smiles, protein = null }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState("");
  const [error, setError] = useState("");
  const [refusal, setRefusal] = useState(null);
  const [result, setResult] = useState(null);
  const [sizePreview, setSizePreview] = useState(() => previewQuantumGateFromSmiles(smiles));
  const [fragmentPlan, setFragmentPlan] = useState(null);
  const [fragmentLoading, setFragmentLoading] = useState(false);
  const [fragmentError, setFragmentError] = useState("");

  const cid = compound?.cid || compound?.CID || compound?.compound_id || "unknown";
  const displayName = compound?.displayName || compound?.name || `CID ${cid}`;

  const fullMoleculeOverLimit = Boolean(sizePreview?.overLimit && sizePreview?.refusal);
  const fragmentEligible = Boolean(fragmentPlan?.eligible);
  const fragmentRefusal = fragmentPlan?.refusal || null;
  const useFragmentPath = fullMoleculeOverLimit && fragmentEligible && !isH2Smiles(smiles);

  const clientRefusal = useMemo(() => {
    if (refusal) return refusal;
    if (useFragmentPath) return null;
    if (fullMoleculeOverLimit && fragmentRefusal) return fragmentRefusal;
    if (fullMoleculeOverLimit && sizePreview?.refusal) return sizePreview.refusal;
    return null;
  }, [refusal, useFragmentPath, fullMoleculeOverLimit, fragmentRefusal, sizePreview]);

  const canRun = Boolean(
    smiles && !loading && (useFragmentPath || (!fullMoleculeOverLimit && !clientRefusal))
  );

  useEffect(() => {
    setExpanded(false);
    setLoading(false);
    setLoadingPhase("");
    setError("");
    setRefusal(null);
    setResult(null);
    setFragmentPlan(null);
    setFragmentError("");

    const syncPreview = previewQuantumGateFromSmiles(smiles);
    setSizePreview(syncPreview);

    if (!smiles) {
      return undefined;
    }

    let cancelled = false;

    if (!syncPreview.overLimit) {
      (async () => {
        try {
          const counts = await countQuantumAtomsFromSmiles(smiles);
          if (cancelled) return;
          const refusalPreview = buildRefusalPreview(counts.atomCount, counts.nonHCount);
          setSizePreview({
            overLimit: Boolean(refusalPreview),
            atomCount: counts.atomCount,
            nonHCount: counts.nonHCount,
            refusal: refusalPreview,
          });
        } catch {
          // Keep sync preview (fail open except H₂, which sync already handles).
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setFragmentLoading(true);
    (async () => {
      try {
        const plan = await selectPocketContactFragment({ smiles, protein });
        if (cancelled) return;
        setFragmentPlan(plan);
      } catch (err) {
        if (cancelled) return;
        setFragmentError(err.message || "Could not select a pocket-contact fragment.");
      } finally {
        if (!cancelled) setFragmentLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [smiles, cid, protein?.id]);

  const runAnalysis = async () => {
    if (!smiles) {
      setError("Select a compound with a valid SMILES string first.");
      return;
    }

    if (!useFragmentPath && fullMoleculeOverLimit) {
      setRefusal(clientRefusal);
      return;
    }

    setLoading(true);
    setLoadingPhase(useFragmentPath ? "fragment-select" : "vqe");
    setError("");
    setRefusal(null);
    setResult(null);

    try {
      if (useFragmentPath) {
        setLoadingPhase("vqe");
      }

      const data = await fetchQuantumInsight({
        smiles,
        name: displayName,
        sizePreview,
        fragmentPlan: useFragmentPath ? fragmentPlan : null,
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
      setLoadingPhase("");
    }
  };

  const toggleExpanded = () => setExpanded((v) => !v);

  const collapsedLabel = fullMoleculeOverLimit
    ? fragmentEligible
      ? "Quantum Insight (Experimental) — full molecule too large; fragment VQE available"
      : fragmentLoading
        ? "Quantum Insight (Experimental) — checking pocket-contact fragment…"
        : "Quantum Insight (Experimental) — too large for this molecule"
    : "Run Quantum Chemistry Analysis (Experimental)";

  const expandedToggleLabel = "Hide Quantum Chemistry Analysis";

  return (
    <div className="quantum-insight-container" id={`quantum-insight-${cid}`}>
      <div className="quantum-insight-trigger-row">
        <button
          type="button"
          className={`btn-quantum-toggle ${expanded ? "expanded" : ""} ${fullMoleculeOverLimit ? "over-limit" : ""} ${fragmentEligible ? "fragment-available" : ""}`}
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-controls={`quantum-insight-panel-${cid}`}
        >
          <span className="quantum-icon" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          <span className="quantum-label-text">
            {expanded ? expandedToggleLabel : collapsedLabel}
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
            {useFragmentPath || (fullMoleculeOverLimit && fragmentEligible)
              ? " The full drug is too large for whole-molecule VQE; you can run an experimental pocket-contact fragment instead."
              : " Typical drugs exceed whole-molecule limits; when a pocket is staged we can try a tiny contact fragment."}
          </p>

          {fullMoleculeOverLimit && fragmentEligible && fragmentPlan && (
            <div className="quantum-fragment-offer">
              <div className="quantum-fragment-title">Pocket-contact fragment path</div>
              <p>
                The full molecule is outside experimental VQE limits. PocketLink can run VQE on a
                tiny site-contact fragment ({fragmentPlan.formula}) derived from{" "}
                {formatSelectionSource(fragmentPlan.selection_source)}
                {fragmentPlan.contact_residue ? ` near ${fragmentPlan.contact_residue}` : ""}.
              </p>
              <p className="quantum-fragment-disclaimer">
                This estimates the fragment&apos;s ground-state energy only — not the drug&apos;s energy,
                not binding affinity, not ΔG, and not a docking score.
              </p>
            </div>
          )}

          {fullMoleculeOverLimit && fragmentLoading && (
            <div className="quantum-fragment-loading">
              Selecting a pocket-contact fragment from staged pocket context…
            </div>
          )}

          {fragmentError && fullMoleculeOverLimit && !fragmentEligible && (
            <div className="quantum-error">
              <span>{fragmentError}</span>
            </div>
          )}

          <div className="quantum-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={runAnalysis}
              disabled={!canRun}
            >
              {loading
                ? loadingPhase === "fragment-select"
                  ? "Selecting pocket-contact fragment…"
                  : useFragmentPath
                    ? "Running fragment VQE…"
                    : "Running VQE simulation…"
                : useFragmentPath
                  ? "Run fragment VQE (experimental)"
                  : "Run VQE ground-state estimate"}
            </button>
          </div>

          {loading && (
            <div className="quantum-loading">
              <span className="spinner" aria-hidden="true" />
              <span>
                {useFragmentPath
                  ? "Picking the pocket-contact fragment, then building its Hamiltonian and running VQE on Aer. Cold starts can take a minute."
                  : "Building the molecular Hamiltonian and running VQE on Aer. Cold starts can take a minute; tiny molecules typically finish in seconds."}
              </span>
            </div>
          )}

          {error && (
            <div className="quantum-error">
              <span>{error}</span>
            </div>
          )}

          {clientRefusal && (
            <div className="quantum-refusal">
              <div className="quantum-refusal-title">
                {clientRefusal.fragment
                  ? "Fragment outside experimental limits"
                  : "Molecule outside experimental limits"}
              </div>
              <p>{clientRefusal.error}</p>
              {typeof clientRefusal.atom_count === "number" &&
                typeof clientRefusal.non_hydrogen_atom_count === "number" && (
                  <p className="quantum-refusal-counts">
                    {clientRefusal.fragment ? "This fragment" : "This compound"}:{" "}
                    {clientRefusal.atom_count} atoms,{" "}
                    {clientRefusal.non_hydrogen_atom_count} non-hydrogen atoms. Limits:{" "}
                    {clientRefusal.limits?.max_atoms ?? 4} atoms,{" "}
                    {clientRefusal.limits?.max_non_hydrogen_atoms ?? 2} non-hydrogen atoms.
                  </p>
                )}
              {Array.isArray(clientRefusal.reasons) && clientRefusal.reasons.length > 0 && (
                <ul>
                  {clientRefusal.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result && (
            <div className="quantum-result">
              {result.fragment && (
                <div className="quantum-fragment-result-banner">
                  <span className="quantum-experimental-badge">Fragment VQE</span>
                  <span>
                    Fragment {result.fragment_formula || fragmentPlan?.formula || "contact pair"}
                    {result.contact_residue ? ` · pocket contact ${result.contact_residue}` : ""}
                  </span>
                </div>
              )}
              <div className="quantum-energy-block">
                <div className="quantum-energy-label">
                  {result.fragment
                    ? "Fragment ground-state energy (Hartree)"
                    : "Ground-state energy (Hartree)"}
                </div>
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
              {result.fragment && (
                <p className="quantum-fragment-footnote">
                  Research-only fragment energy for the tiny contact substructure — not the full drug,
                  not binding affinity, and not used in PocketLink scoring or ranking.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSelectionSource(source) {
  switch (source) {
    case "docking_hbond":
      return "a prior docking H-bond contact";
    case "docking_closest_residue":
      return "a prior docking closest pocket residue";
    case "ligand_polar_pair_no_pocket":
      return "the ligand's most polar bonded pair (no pocket staged)";
    case "ligand_polar_pair_fallback":
      return "the ligand's most polar bonded pair";
    default:
      return "pocket/ligand contact analysis";
  }
}
