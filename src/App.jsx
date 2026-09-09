import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { rankCandidates, tryCachedRanking } from "./aiCandidateRanking";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
import {
  CopyField,
  Panel,
  PainsBadge,
  PainsInfoTip,
  PubChemStructureImage,
  getCompoundSmiles,
  prettyName,
} from "./benchUi";
import PdbTargetSearch from "./PdbTargetSearch";
import { checkPainsBatch } from "./painsCheck";
import { MAX_CANDIDATES, drugLikenessChecks } from "./scoreCandidates";
import { targetDisplayName } from "./targetContext";
import AdversarialCritique from "./AdversarialCritique";
import ReportExportButtons from "./ReportExportButtons";
import { buildBenchReportMarkdown, defaultReportFilename } from "./reportExport";

function compareCandidateField(a, b, key) {
  if (key === "compound") {
    return String(a.name || a.cid).localeCompare(String(b.name || b.cid));
  }
  return (a.score ?? 0) - (b.score ?? 0);
}

function CandidateScoreTable({ rows, selectedCid, recommendedCid, sortKey, sortDir, onSort, onSelect, target, candidates }) {
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareCandidateField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.cid).localeCompare(String(b.cid));
    });
  }, [rows, sortKey, sortDir]);

  const cols = [
    { key: "compound", label: "Compound" },
    { key: "score", label: "Score" },
    { key: "reasons", label: "Key reasons" },
  ];

  return (
    <div className="score-table-wrap">
      <table className="score-table candidate-score-table">
        <thead>
          <tr>
            {cols.map((col) => {
              const active = sortKey === col.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              const sortable = col.key !== "reasons";
              return (
                <th key={col.key} aria-sort={ariaSort}>
                  {sortable ? (
                    <button type="button" className={"score-th" + (active ? " active" : "")} onClick={() => onSort(col.key)}>
                      {col.label}
                      <span className="sort-ind" aria-hidden="true">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    <span className="score-th">{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const selected = String(selectedCid) === String(r.cid);
            const recommended = String(recommendedCid) === String(r.cid);
            const reasons = r.reasoning && r.reasoning.length
              ? r.reasoning
              : [...(r.strengths || []), ...(r.concerns || [])];
            const fullCandidate = candidates?.find((c) => String(c.CID) === String(r.cid)) || {};
            const mergedCandidate = { ...fullCandidate, ...r, cid: r.cid };

            return (
              <tr
                key={r.cid}
                className={(selected ? "selected" : "") + (recommended ? " recommended" : "")}
                onClick={() => onSelect(r.cid)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.cid);
                  }
                }}
              >
                <td>
                  <div className="result-id">{r.name || `CID ${r.cid}`}</div>
                  <div className="score-title">CID {r.cid}</div>
                </td>
                <td className="mono score-num">{r.score}/100</td>
                <td>
                  <ul className="rank-bullets table-reasons">
                    {reasons.slice(0, 4).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                    <AdversarialCritique
                      candidate={mergedCandidate}
                      target={target}
                      compact
                      label="See the case against this candidate"
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CandidateRow({ candidate, selected, recommended, pains, onToggle, onRemove }) {
  const checks = drugLikenessChecks(candidate);
  const pass = checks.filter((c) => c.pass).length;
  return (
    <div className={"shortlist-card" + (selected ? " selected" : "") + (recommended ? " recommended" : "")}>
      <button type="button" className="shortlist-main" onClick={onToggle}>
        <PubChemStructureImage cid={candidate.CID} compact />
        <div className="shortlist-copy">
          <div className="shortlist-top">
            <strong>{candidate.displayName || prettyName(candidate)}</strong>
            <span className="cid">CID {candidate.CID}</span>
          </div>
          <div className="shortlist-formula">{candidate.MolecularFormula}</div>
          <div className="shortlist-smiles">{getCompoundSmiles(candidate)}</div>
          <div className="shortlist-meta">
            MW {Number(candidate.MolecularWeight).toFixed(1)} · XLogP {candidate.XLogP ?? "n/a"} · HBD {candidate.HBondDonorCount} · HBA {candidate.HBondAcceptorCount} · TPSA {candidate.TPSA}
          </div>
          <div className={"shortlist-pass " + (pass >= 5 ? "good" : "warn")}>{pass}/6 drug-likeness checks pass{recommended ? " · AI pick" : ""}</div>
        </div>
      </button>
      <PainsBadge result={pains} tipId={`pains-pop-${candidate.CID}`} />
      <button type="button" className="shortlist-remove" onClick={onRemove} aria-label="Remove from shortlist">
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [searchParams] = useSearchParams();
  const handoffQuery = searchParams.get("q") || "";
  const fromDiscovery = searchParams.get("from") === "target-discovery";

  const savedActive = useMemo(() => {
    if (handoffQuery) return null;
    return getActiveState(ACTIVE_STATE_KEYS.BENCH);
  }, [handoffQuery]);

  const [protein, setProtein] = useState(() => savedActive?.protein || null);
  const [hasTargetResults, setHasTargetResults] = useState(false);

  const [cQuery, setCQuery] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");
  const [cResult, setCResult] = useState(null);
  const [candidates, setCandidates] = useState(() => savedActive?.candidates || []);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(() => savedActive?.aiResult || null);
  const [handoffCid, setHandoffCid] = useState(() => savedActive?.handoffCid || null);

  const [dockCopied, setDockCopied] = useState(false);
  const [admeCopied, setAdmeCopied] = useState(false);
  const [aiSort, setAiSort] = useState({ key: "score", dir: "desc" });
  const [painsByCid, setPainsByCid] = useState({});

  useEffect(() => {
    setActiveState(ACTIVE_STATE_KEYS.BENCH, {
      protein,
      candidates,
      aiResult,
      handoffCid,
    });
  }, [protein, candidates, aiResult, handoffCid]);

  const searchCompound = useCallback(async () => {
    const q = cQuery.trim();
    if (!q) return;
    setCLoading(true);
    setCError("");
    setCResult(null);
    try {
      const props = [
        "MolecularFormula",
        "MolecularWeight",
        "CanonicalSMILES",
        "IsomericSMILES",
        "XLogP",
        "HBondDonorCount",
        "HBondAcceptorCount",
        "RotatableBondCount",
        "TPSA",
        "IUPACName",
      ].join(",");
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/${props}/JSON`;
      const res = await fetch(url);
      if (!res.ok) {
        setCError(`PubChem has no compound named "${q}". Try the common or generic drug name (e.g. "ibuprofen", "imatinib").`);
        setCLoading(false);
        return;
      }
      const data = await res.json();
      const p = data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0];
      if (!p) {
        setCError(`PubChem returned no usable data for "${q}".`);
        setCLoading(false);
        return;
      }
      setCResult({ ...p, displayName: prettyName(p, q) });
    } catch (e) {
      setCError("Couldn't reach PubChem. Check your connection and try again.");
    } finally {
      setCLoading(false);
    }
  }, [cQuery]);

  const alreadyStaged = cResult && candidates.some((c) => c.CID === cResult.CID);
  const shortlistFull = candidates.length >= MAX_CANDIDATES && !alreadyStaged;

  const addOrRemovePreview = () => {
    if (!cResult) return;
    setAiResult(null);
    setAiError("");
    setCandidates((prev) => {
      if (prev.some((c) => c.CID === cResult.CID)) {
        const next = prev.filter((c) => c.CID !== cResult.CID);
        setHandoffCid((cid) => (String(cid) === String(cResult.CID) ? (next[0]?.CID ?? null) : cid));
        return next;
      }
      if (prev.length >= MAX_CANDIDATES) return prev;
      return [...prev, cResult];
    });
  };

  const removeCandidate = (cid) => {
    setAiResult(null);
    setAiError("");
    setCandidates((prev) => prev.filter((c) => c.CID !== cid));
    setHandoffCid((current) => (String(current) === String(cid) ? null : current));
  };

  useEffect(() => {
    const toCheck = [...candidates];
    if (cResult && !toCheck.some((c) => String(c.CID) === String(cResult.CID))) {
      toCheck.push(cResult);
    }
    if (!toCheck.length) return undefined;
    let cancelled = false;
    checkPainsBatch(toCheck).then((next) => {
      if (!cancelled) {
        setPainsByCid((prev) => ({ ...prev, ...next }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, cResult]);

  useEffect(() => {
    setAiSort({ key: "score", dir: "desc" });
    if (candidates.length < 2) {
      setAiResult(null);
      return;
    }
    const cached = tryCachedRanking(candidates, protein);
    setAiResult(cached);
    if (cached?.recommended?.cid) setHandoffCid(cached.recommended.cid);
  }, [protein, candidates]);

  const analyze = async () => {
    if (candidates.length < 2) return;
    setAiLoading(true);
    setAiError("");
    try {
      const latestPains = { ...painsByCid, ...(await checkPainsBatch(candidates)) };
      setPainsByCid((prev) => ({ ...prev, ...latestPains }));
      const data = await rankCandidates(candidates, protein, latestPains);
      setAiResult(data);
      if (data?.aiError) {
        setAiError(`Unable to score against this target with the language model (${data.aiError}). PocketLink used its target-aware model instead.`);
      }
      if (data?.recommended?.cid) setHandoffCid(data.recommended.cid);

      // Record in persistent history
      const winnerRow = data?.ranking?.find((r) => String(r.cid) === String(data?.recommended?.cid)) || data?.ranking?.[0];
      const winnerCandidate = candidates.find((c) => String(c.CID) === String(winnerRow?.cid));
      const winnerName = winnerCandidate?.displayName || winnerCandidate?.name || winnerRow?.name || `CID ${winnerRow?.cid}`;
      const targetLabel = protein ? targetDisplayName(protein) : "Target";

      saveHistoryEntry({
        type: "staging-bench",
        title: `Staging Bench: ${targetLabel} (${candidates.length} compounds)`,
        summary: `Winner: ${winnerName} (${winnerRow?.score ?? "n/a"}/100) · ${candidates.length} candidates scored against ${targetLabel}`,
        inputs: {
          target: targetLabel,
          pdbId: protein?.id,
          compoundCount: candidates.length,
          compoundNames: candidates.map((c) => c.displayName || c.name || `CID ${c.CID}`),
        },
        snapshot: {
          protein,
          candidates,
          aiResult: data,
          handoffCid: data?.recommended?.cid,
        },
      });
    } catch (e) {
      setAiError(e.message || "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleAiSort = (key) => {
    setAiSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "compound" ? "asc" : "desc" };
    });
  };

  const recommendedCid = aiResult?.recommended?.cid;
  const ranking = aiResult?.ranking || [];
  const rankingRows = ranking.map((row) => {
    const match = candidates.find((c) => String(c.CID) === String(row.cid));
    return { ...row, name: match?.displayName || row.name || `CID ${row.cid}` };
  });
  const fitTargetName = aiResult?.target?.name || (protein ? targetDisplayName(protein) : "");
  const fitPdbId = aiResult?.target?.pdb_id || protein?.id || "";
  const compound = useMemo(() => {
    if (!candidates.length) return null;
    const fromHandoff = candidates.find((c) => String(c.CID) === String(handoffCid));
    const fromAi = candidates.find((c) => String(c.CID) === String(recommendedCid));
    return fromHandoff || fromAi || candidates[0];
  }, [candidates, handoffCid, recommendedCid]);

  const smiles = getCompoundSmiles(compound);
  const previewChecks = cResult ? drugLikenessChecks(cResult) : [];
  const previewPass = previewChecks.filter((c) => c.pass).length;
  const progress =
    (protein ? 0.25 : 0) +
    (candidates.length ? 0.25 : 0) +
    (aiResult ? 0.25 : 0) +
    (protein && compound ? 0.25 : 0);

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      return false;
    }
  };

  const openSwissDock = () => {
    window.open("https://www.swissdock.ch/", "_blank", "noopener,noreferrer");
    if (protein) {
      copyToClipboard(protein.id).then((ok) => {
        setDockCopied(ok);
        if (ok) setTimeout(() => setDockCopied(false), 4000);
      });
    }
  };
  const openSwissADME = () => {
    window.open("https://www.swissadme.ch/", "_blank", "noopener,noreferrer");
    if (smiles) {
      copyToClipboard(smiles).then((ok) => {
        setAdmeCopied(ok);
        if (ok) setTimeout(() => setAdmeCopied(false), 4000);
      });
    }
  };

  const winner = recommendedCid
    ? candidates.find((c) => String(c.CID) === String(recommendedCid))
    : null;
  const winnerRow = aiResult?.ranking?.find((r) => String(r.cid) === String(recommendedCid));
  const winnerCandidate = winner
    ? { ...winner, cid: winner.CID, score: aiResult?.recommended?.score, reasoning: winnerRow?.reasoning || [aiResult?.recommended?.reason] }
    : null;

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow">PocketLink · discovery staging bench</div>
        <h1>Stage a target, shortlist up to five molecules,<br />then let AI pick the strongest follow-up.</h1>
        <p>
          Search live PDB structures and PubChem compounds, compare up to five candidates on drug-likeness,
          and generate a transparent recommendation before handing the winner to SwissDock and SwissADME.
        </p>
      </div>

      <div className="trace-wrap">
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
          protein={protein}
          onSelect={setProtein}
          onResultsChange={(rows) => setHasTargetResults(Boolean(rows?.length))}
          initialQuery={handoffQuery}
          autoSearch={Boolean(handoffQuery)}
          noStructureHint={fromDiscovery}
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
                  not a substitute for SwissADME's full pharmacokinetic model.
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
            <div className="empty-state">No candidates staged yet. Search a compound and add it to the shortlist.</div>
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

      <div className="handoff-panel">
        <Panel eyebrow="Station 3 — AI prioritization" title="Which molecule fits this target?" kind="handoff">
          <div className="ai-toolbar">
            <div>
              <div className="ai-kicker">Score the shortlist for this target</div>
              <div className="hint" style={{ margin: "6px 0 0" }}>
                Scores 2–5 molecules for the selected PDB structure using pocket/ligand context, known pharmacology, Lipinski/Veber drug-likeness, and PAINS flags. The same compound is scored differently against different targets. If an OpenAI key is configured, a language model writes the comparison; otherwise PocketLink uses its built-in target-aware model.
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
              Select 2–5 molecules in Station 2, then run analysis. PocketLink will score each compound for the staged target — not as a universal drug-likeness rank.
            </div>
          )}
          {aiResult && (
            <div className="score-block">
              <div className="recommend compact">
                <div className="recommend-label">Best fit for this structure</div>
                <div className="winner">
                  {fitPdbId
                    ? `🏆 Best fit for ${fitTargetName || "this target"} (${fitPdbId})`
                    : "🏆 Best fit (no structure selected — scores are not pocket-specific)"}
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
              <div className="lipinski-note" style={{ marginTop: 12 }}>{aiResult.summary}</div>
              <div className="lipinski-note"><strong>Limitations:</strong> {(aiResult.limitations || []).join(" ")}</div>
              <div className="source-pill">
                {aiResult.source === "llm"
                  ? "Ranked with OpenAI for this specific target"
                  : aiResult.source === "cache"
                    ? "Reused cached scores for this (compound, PDB) pair"
                    : "Ranked with PocketLink's target-aware model"}
              </div>
              <ReportExportButtons
                label="Export report"
                filename={defaultReportFilename(
                  "staging-bench-report",
                  protein?.id || protein?.pdb_id || fitPdbId
                )}
                getMarkdown={() =>
                  buildBenchReportMarkdown({
                    protein,
                    candidates,
                    aiResult,
                  })
                }
              />
            </div>
          )}
        </Panel>
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 4 — handoff" title="Follow-up: Native Docking & ADME Prediction" kind="handoff">
          {!protein && !candidates.length && (
            <div className="empty-state">
              Stage a target and a shortlist above — PocketLink will prepare the exact inputs for native
              docking simulation and ADME prediction.
            </div>
          )}
          {(protein || candidates.length > 0) && (
            <div>
              <div className="lipinski-note" style={{ marginTop: 0, marginBottom: 14 }}>
                The ranking is a triage aid. It does not replace docking, ADME prediction, toxicity assessment, or experimental validation.
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
              <div className="handoff-actions">
                <Link
                  to={`/docking?pdb=${encodeURIComponent(protein?.id || "")}&smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                  className="btn btn-primary"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Run Native Docking →
                </Link>
                <Link
                  to={`/adme?smiles=${encodeURIComponent(smiles || "")}&name=${encodeURIComponent(compound?.displayName || "")}&cid=${compound?.CID || ""}`}
                  className="btn btn-secondary"
                  style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                >
                  Predict Native ADME →
                </Link>
                <button className="btn btn-handoff" onClick={openSwissDock} disabled={!protein} type="button">
                  {dockCopied ? "PDB ID copied ✓" : "Open SwissDock →"}
                </button>
                <button className="btn btn-handoff" onClick={openSwissADME} disabled={!compound} type="button">
                  {admeCopied ? "SMILES copied ✓" : "Open SwissADME →"}
                </button>
              </div>
              <div className="lipinski-note" style={{ marginTop: 14 }}>
                PocketLink computes native molecular docking and ADME predictions locally in-browser using empirical force fields and RDKit WebAssembly without external server dependencies.
              </div>
            </div>
          )}
        </Panel>
      </div>

    </>
  );
}
