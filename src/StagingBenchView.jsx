import React from "react";
import {
  Panel,
  PainsBadge,
  PainsInfoTip,
  PubChemStructureImage,
  getCompoundSmiles,
} from "./benchUi";
import PdbTargetSearch from "./PdbTargetSearch";
import SeoIntroLinks from "./SeoIntroLinks";
import HomepageIntro from "./HomepageIntro";
import { CandidateRow } from "./CandidateViews";
import HandoffStations from "./HandoffStations";

export default function StagingBenchView(b) {
  const {
    protein, setProtein, hasTargetResults, setHasTargetResults,
    cQuery, setCQuery, cLoading, cError, cResult, candidates,
    setHandoffCid,
    painsByCid, demoKey, demoTargetQuery, demoLoading,
    handoffQuery, fromDiscovery,
    searchCompound, addOrRemovePreview, removeCandidate,
    loadEgfrImatinibDemo, startBlankScreen,
    alreadyStaged, shortlistFull, recommendedCid,
    compound, previewChecks, previewPass, progress, aiResult,
  } = b;
  return (
    <>
      <HomepageIntro
        onLoadDemo={loadEgfrImatinibDemo}
        onStartBlank={startBlankScreen}
        demoLoading={demoLoading}
      />
      <SeoIntroLinks currentPath="/" />

      <div className="trace-wrap" id="staging-bench">
        <div className="trace">
          <span className={"trace-node" + (protein ? " lit" : "")}>1</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: protein ? "100%" : "0%" }} /></span>
          <span className={"trace-node" + (candidates.length ? " lit" : "")}>2</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: candidates.length >= 2 ? "100%" : candidates.length ? "50%" : "0%" }} /></span>
          <span className={"trace-node" + (aiResult ? " lit" : "")}>3</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: progress >= 1 ? "100%" : aiResult ? "50%" : "0%" }} /></span>
          <span className={"trace-node" + (protein && compound ? " lit" : "")}>4</span>
        </div>
      </div>

      <div className={"grid" + (hasTargetResults ? " with-scores" : "")}>
        <PdbTargetSearch
          key={`target-${demoKey}-${handoffQuery}`}
          protein={protein}
          onSelect={setProtein}
          onResultsChange={(rows) => setHasTargetResults(Boolean(rows?.length))}
          initialQuery={handoffQuery || demoTargetQuery}
          autoSearch={Boolean(handoffQuery || demoTargetQuery)}
          noStructureHint={fromDiscovery}
          inputId="target-search-input"
          emptyText="No target staged yet."
          emptyAction={
            <button type="button" className="empty-state-action" onClick={loadEgfrImatinibDemo}>
              Load EGFR (1M17) demo
            </button>
          }
        />

        <Panel eyebrow="Station 2 — PubChem" title="Build a 5-molecule shortlist" kind="candidate">
          <div className="search-row">
            <input
              placeholder="Compound name (e.g. imatinib, caffeine)"
              value={cQuery}
              onChange={(e) => setCQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCompound()}
            />
            <button className="btn btn-candidate" onClick={searchCompound} disabled={cLoading}>
              {cLoading ? <span className="spinner" /> : null}Search
            </button>
          </div>
          <div className="hint">Search one compound at a time and add it to the shortlist. AI ranking unlocks at 2–5 molecules.</div>
          {cError && <div className="error-msg">{cError}</div>}
          {cResult && (
            <div>
              <div className="compound-card">
                <div className="compound-visual">
                  <PubChemStructureImage cid={cResult.CID} />
                  <span className="compound-thumb-label">PubChem reference structure</span>
                </div>
                <div>
                  <div className="compound-name">{cResult.displayName}</div>
                  <div className="compound-formula">{cResult.MolecularFormula} · CID {cResult.CID}</div>
                  <div className="compound-smiles">
                    <span className="compound-smiles-label">Selected structure SMILES</span>
                    {getCompoundSmiles(cResult) || "SMILES unavailable"}
                  </div>
                  <div className="compound-props">
                    <span>MW <b>{Number(cResult.MolecularWeight).toFixed(1)}</b></span>
                    <span>XLogP <b>{cResult.XLogP !== undefined ? cResult.XLogP : "n/a"}</b></span>
                    <span>HBD <b>{cResult.HBondDonorCount}</b></span>
                    <span>HBA <b>{cResult.HBondAcceptorCount}</b></span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  className={"btn " + (alreadyStaged ? "btn-ghost" : "btn-candidate")}
                  onClick={addOrRemovePreview}
                  type="button"
                  disabled={shortlistFull}
                  style={{ width: "100%" }}
                >
                  {alreadyStaged ? "Remove from shortlist" : shortlistFull ? "Shortlist is full (5/5)" : `Add to shortlist (${candidates.length}/5)`}
                </button>
              </div>
              <div className="checklist">
                <div className="checklist-head">
                  <span className="checklist-title">Quick drug-likeness screen</span>
                  <span className={"checklist-score " + (previewPass >= 5 ? "score-good" : "score-warn")}>{previewPass}/6 pass</span>
                </div>
                {previewChecks.map((c) => (
                  <div className="check-row" key={c.label}>
                    <span className="check-label">
                      <span className={"check-dot " + (c.pass ? "dot-pass" : "dot-fail")} />
                      {c.label}
                    </span>
                    <span className="check-value">{c.value}</span>
                  </div>
                ))}
                <div className="lipinski-note">
                  Lipinski Rule-of-Five + Veber criteria, computed from PubChem's own properties — a fast pre-screen,
                  not a substitute for TargetForge's full native ADME profiling engine.
                </div>
                {painsByCid[String(cResult.CID)] && (
                  <div className="pains-preview">
                    <PainsBadge result={painsByCid[String(cResult.CID)]} tipId={`pains-preview-${cResult.CID}`} />
                    <span className="pains-preview-note">PAINS / toxicophore screen runs when a compound is searched or shortlisted. Alerts do not block adding it.</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {!cResult && !cLoading && !cError && candidates.length === 0 && (
            <div className="empty-state">
              No candidates staged yet. Search a compound and add it to the shortlist.
              <button type="button" className="empty-state-action" onClick={loadEgfrImatinibDemo}>
                Add imatinib demo compound
              </button>
            </div>
          )}
          {candidates.length > 0 && (
            <>
              <div className="shortlist-head">
                <span className="shortlist-head-left">
                  Shortlist
                  <PainsInfoTip />
                </span>
                <span>{candidates.length}/5 selected{candidates.length < 2 ? " · add at least one more for AI" : " · ready for AI"}</span>
              </div>
              <div className="shortlist">
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.CID}
                    candidate={c}
                    selected={String(compound?.CID) === String(c.CID)}
                    recommended={String(recommendedCid) === String(c.CID)}
                    pains={painsByCid[String(c.CID)] || { status: "pending" }}
                    onToggle={() => setHandoffCid(c.CID)}
                    onRemove={() => removeCandidate(c.CID)}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <HandoffStations b={b} />
    </>
  );
}
