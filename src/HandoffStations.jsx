import React from "react";
import { Link } from "react-router-dom";
import { CopyField, Panel } from "./benchUi";
import AdversarialCritique from "./AdversarialCritique";
import QuantumInsight from "./QuantumInsight";
import { CandidateScoreTable } from "./CandidateViews";
import HistoricalTrialSuccessContext from "./HistoricalTrialSuccessContext";
import { DOCKING_ENGINE_ENABLED, DOCKING_UNAVAILABLE_NOTICE } from "./featureFlags";

export default function HandoffStations({ b }) {
  const {
    protein, candidates, aiLoading, aiError, aiResult, setHandoffCid,
    aiSort, recommendedCid, rankingRows, fitTargetName, fitPdbId,
    compound, smiles, winner, winnerCandidate, analyze, toggleAiSort,
  } = b;
  return (
    <>
      <div className="handoff-panel">
        <Panel eyebrow="Station 3 — AI prioritization" title="Which molecule fits this target?" kind="handoff">
          <div className="ai-toolbar">
            <div>
              <div className="ai-kicker">Score the shortlist for this target</div>
              <div className="hint" style={{ margin: "6px 0 0" }}>
                Applies a knowledge-based triage score (0–100) to 2–5 molecules for the selected PDB structure using curated target rules, pocket/ligand context, Lipinski/Veber drug-likeness, and PAINS flags — a heuristic for prioritization, not a validated activity or binding predictor. The same compound is scored differently against different targets. If an OpenAI key is configured, a language model writes the comparison; otherwise TargetForge uses its built-in target-aware model.
              </div>
            </div>
            <button className="btn btn-handoff" onClick={analyze} disabled={candidates.length < 2 || aiLoading} type="button">
              {aiLoading ? <span className="spinner" /> : null}
              {aiLoading ? "Analyzing…" : `Analyze ${candidates.length || ""} candidate${candidates.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {aiError && <div className="error-msg">{aiError}</div>}
          {!aiResult && !aiLoading && (
            <div className="empty-state">
              Select 2–5 molecules in Station 2, then run analysis. TargetForge will score each compound for the staged target — not as a universal drug-likeness rank.
            </div>
          )}
          {aiResult && (
            <div className="score-block">
              <div className="recommend compact">
                <div className="recommend-label">Best fit for this structure</div>
                <div className="winner">
                  {fitPdbId
                    ? `Best fit for ${fitTargetName || "this target"} (${fitPdbId})`
                    : "Best fit (no structure selected — scores are not pocket-specific)"}
                </div>
                <div className="winner-score">
                  {winner?.displayName || (recommendedCid ? `CID ${recommendedCid}` : "—")} · {aiResult.recommended?.score ?? "—"}/100
                </div>
                <div className="winner-reason">{aiResult.recommended?.reason}</div>
                {winnerCandidate && (
                  <div style={{ marginTop: 10 }}>
                    <AdversarialCritique
                      candidate={winnerCandidate}
                      target={protein}
                      label="See the case against this top candidate"
                    />
                  </div>
                )}
              </div>
              <CandidateScoreTable
                rows={rankingRows}
                selectedCid={compound?.CID}
                recommendedCid={recommendedCid}
                sortKey={aiSort.key}
                sortDir={aiSort.dir}
                onSort={toggleAiSort}
                onSelect={setHandoffCid}
                target={protein}
                candidates={candidates}
              />
              <HistoricalTrialSuccessContext target={protein} />
              <div className="lipinski-note" style={{ marginTop: 12 }}>{aiResult.summary}</div>
              <div className="lipinski-note"><strong>Limitations:</strong> {(aiResult.limitations || []).join(" ")}</div>
              <div className="source-pill">
                {aiResult.source === "llm"
                  ? "Ranked with OpenAI for this specific target"
                  : aiResult.source === "cache"
                    ? "Reused cached scores for this (compound, PDB) pair"
                    : "Ranked with TargetForge's target-aware model"}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 4 — handoff" title="Follow-up: ADME prediction (docking paused)" kind="handoff">
          {!protein && !candidates.length && (
            <div className="empty-state">
              Stage a target and a shortlist above — TargetForge will prepare inputs for ADME prediction.
              Molecular docking is temporarily unavailable during validation.
            </div>
          )}
          {(protein || candidates.length > 0) && (
            <div>
              <div className="lipinski-note" style={{ marginTop: 0, marginBottom: 14 }}>
                Use the handoff below for ADME on your selected compound — the triage score does not replace experimental assays or ADME modeling.
              </div>
              {candidates.length > 1 && (
                <div className="handoff-pick">
                  {candidates.map((c) => (
                    <button
                      key={c.CID}
                      type="button"
                      className={"chip" + (String(compound?.CID) === String(c.CID) ? " active" : "")}
                      onClick={() => setHandoffCid(c.CID)}
                    >
                      {c.displayName}{String(recommendedCid) === String(c.CID) ? " · AI pick" : ""}
                    </button>
                  ))}
                </div>
              )}
              {protein && <CopyField label="Target — PDB ID" value={protein.id} />}
              {compound && <CopyField label={`${compound.displayName} — SMILES`} value={smiles} />}
              {compound && smiles && (
                <div style={{ marginTop: 14 }}>
                  <QuantumInsight compound={compound} smiles={smiles} protein={protein} />
                </div>
              )}
              <div className="handoff-actions">
                {DOCKING_ENGINE_ENABLED ? (
                  <Link
                    to={`/docking?pdb=${encodeURIComponent(protein?.id || "")}&smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                    className="btn btn-primary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                  >
                    Run Native Docking →
                  </Link>
                ) : (
                  <span className="lipinski-note" style={{ margin: 0, flex: "1 1 100%" }}>
                    {DOCKING_UNAVAILABLE_NOTICE}
                  </span>
                )}
                <Link
                  to={`/adme?smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                  className={DOCKING_ENGINE_ENABLED ? "btn btn-secondary" : "btn btn-primary"}
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Predict Native ADME →
                </Link>
              </div>
              <div className="lipinski-note" style={{ marginTop: 14 }}>
                ADME descriptors are computed locally in-browser via RDKit WebAssembly without external server dependencies.
                Docking poses and binding scores are not available while the in-browser engine is under validation.
              </div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
