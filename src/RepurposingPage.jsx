import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { approvedDrugCount } from "./approvedDrugs";
import { Panel, PainsBadge, PainsInfoTip } from "./benchUi";
import PdbTargetSearch from "./PdbTargetSearch";
import {
  HIGHLIGHT_COUNT,
  PAGE_SIZE,
  SERVERLESS_TIMEOUT_NOTE,
  INSUFFICIENT_STRUCTURE_ERROR,
} from "./shared/repurposingConstants";
import { getDrugSafetyProfiles, screenApprovedLibrary } from "./serverApi";
import { targetDisplayName } from "./shared/targetLabels";
import AdversarialCritique from "./AdversarialCritique";
import ReportExportButtons from "./ReportExportButtons";
import { buildRepurposingReportMarkdown, defaultReportFilename } from "./reportExport";
import HistoricalTrialSuccessContext from "./HistoricalTrialSuccessContext";
import { DOCKING_ENABLED, DOCKING_ENGINE_ENABLED } from "./featureFlags";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
function compareRepurposeField(a, b, key) {
  if (key === "name") return String(a.name || "").localeCompare(String(b.name || ""));
  if (key === "indication") return String(a.indication || "").localeCompare(String(b.indication || ""));
  return (a.score ?? 0) - (b.score ?? 0);
}

function RepurposingTable({ rows, highlightCount, sortKey, sortDir, onSort, page, pageSize, onPage, target }) {
  const [expandedSafety, setExpandedSafety] = useState({});

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareRepurposeField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [rows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // Safety profiles are computed on the server; load them for the visible page.
  const [safetyByCid, setSafetyByCid] = useState({});
  const missingSafety = slice.filter((r) => !(String(r.cid) in safetyByCid));
  const missingKey = missingSafety.map((r) => r.cid).join(",");
  useEffect(() => {
    if (!missingSafety.length) return undefined;
    let cancelled = false;
    getDrugSafetyProfiles(
      missingSafety.map((r) => ({ cid: r.cid, id: r.id, name: r.name, indication: r.indication, class: r.class }))
    )
      .then((profiles) => {
        if (cancelled) return;
        setSafetyByCid((prev) => {
          const next = { ...prev };
          missingSafety.forEach((r, i) => {
            next[String(r.cid)] = profiles?.[i] || null;
          });
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);

  const cols = [
    { key: "name", label: "Drug name", sortable: true },
    { key: "score", label: "Score", sortable: true },
    { key: "reasoning", label: "Key reasoning", sortable: false },
    { key: "indication", label: "Original indication", sortable: true },
  ];

  const toggleSafety = (cid) => {
    setExpandedSafety((prev) => ({
      ...prev,
      [cid]: !prev[cid],
    }));
  };

  return (
    <>
      <div className="score-table-wrap repurpose-table-wrap">
        <table className="score-table candidate-score-table repurpose-table">
          <thead>
            <tr>
              {cols.map((col) => {
                const active = sortKey === col.key;
                const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
                return (
                  <th key={col.key} aria-sort={ariaSort}>
                    {col.sortable ? (
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
            {slice.map((r) => {
              const highlighted = (r.rank || 0) <= highlightCount && sortKey === "score" && sortDir === "desc";
              const reasons = r.reasoning && r.reasoning.length ? r.reasoning : [];
              const isSafetyExpanded = Boolean(expandedSafety[r.cid]);
              const loadedSafety = safetyByCid[String(r.cid)] || null;
              const safetyProfile = isSafetyExpanded ? loadedSafety : null;
              const quickSafety = loadedSafety || { categoryLabel: "Loading…", hasBoxedWarning: false };

              return (
                <React.Fragment key={r.cid}>
                  <tr className={highlighted ? "recommended" : ""}>
                    <td>
                      <div className="result-id">{r.name}</div>
                      <div className="score-title">CID {r.cid}{r.class ? ` · ${r.class}` : ""}</div>
                      <PainsBadge result={r.pains} tipId={`repurpose-pains-${r.cid}`} />
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                        <button
                          type="button"
                          className={
                            "btn-safety-toggle" +
                            (isSafetyExpanded ? " active" : "") +
                            (quickSafety.hasBoxedWarning ? " alert" : "")
                          }
                          onClick={() => toggleSafety(r.cid)}
                          aria-expanded={isSafetyExpanded}
                          title="View clinical safety profile & adverse event records from FDA FAERS"
                        >
                          <span>Safety: {quickSafety.categoryLabel}</span>
                          <span>{isSafetyExpanded ? "▲" : "▼"}</span>
                        </button>
                        <Link
                          to={`/adme?smiles=${encodeURIComponent(r.canonicalSmiles || r.smiles || "")}&name=${encodeURIComponent(r.name || "")}&cid=${r.cid}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: "11px",
                            padding: "3px 7px",
                            borderRadius: "4px",
                            background: "var(--surface-subtle)",
                            border: "1px solid var(--border)",
                            color: "var(--primary)",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                          title="Compute native ADME profile and BOILED-Egg model for this compound"
                        >
                          ADME →
                        </Link>
                        {(DOCKING_ENABLED || DOCKING_ENGINE_ENABLED) && (
                          <Link
                            to={`/docking?pdb=${encodeURIComponent(target?.id || "1IEP")}&smiles=${encodeURIComponent(r.canonicalSmiles || r.smiles || "")}&name=${encodeURIComponent(r.name || "")}&cid=${r.cid}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              fontSize: "11px",
                              padding: "3px 7px",
                              borderRadius: "4px",
                              background: "var(--surface-subtle)",
                              border: "1px solid var(--border)",
                              color: "var(--primary)",
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                            title="Run native molecular docking against target binding cavity"
                          >
                            Dock →
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="mono score-num">{r.score}/100</td>
                    <td>
                      <div className="repurpose-blurb">{r.blurb}</div>
                      <ul className="rank-bullets table-reasons">
                        {reasons.slice(0, 3).map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
                        <AdversarialCritique
                          candidate={r}
                          target={target}
                          compact
                          label="See the case against this drug"
                        />
                      </div>
                    </td>
                    <td>{r.indication}</td>
                  </tr>
                  {isSafetyExpanded && safetyProfile && (
                    <tr className="safety-expanded-row">
                      <td colSpan={4}>
                        <div className="safety-drawer-card">
                          <div className="safety-header-row">
                            <div className="safety-title-group">
                              <h4 className="safety-title">
                                Clinical Safety & Pharmacovigilance Cross-Reference — {r.name}
                              </h4>
                              <span className={"safety-badge " + safetyProfile.safetyCategory}>
                                {safetyProfile.categoryLabel}
                              </span>
                            </div>
                            <span className="mono hint" style={{ margin: 0 }}>
                              {safetyProfile.isEstimate
                                ? "No curated pharmacovigilance record"
                                : `First Approved: ~${safetyProfile.approvalYear} · FAERS Post-Market Surveillance`}
                            </span>
                          </div>

                          <div className="safety-intro">
                            {safetyProfile.isEstimate
                              ? "Approved drugs carry a real-world safety record, but TargetForge holds curated entries for only part of the library. Look this one up in FDA labeling or FAERS before relying on it."
                              : "Already-approved drugs come with an established real-world human safety track record, which is a major practical advantage over developing completely uncharacterized de novo chemotypes."}
                          </div>

                          <div className="safety-synthesis-box">
                            <strong>{safetyProfile.isEstimate ? "No Record Held" : "Observed Clinical Tolerability"}</strong>
                            {safetyProfile.synthesis}
                          </div>

                          <div className="safety-details-grid">
                            <div className="safety-events-panel">
                              <div className="safety-panel-title">
                                {safetyProfile.isEstimate
                                  ? "Class-level themes to check (not reported events)"
                                  : "Top Reported Adverse Events (FDA FAERS)"}
                              </div>
                              <div className="safety-events-list">
                                {safetyProfile.topEvents.map((evt, idx) => (
                                  <div key={idx} className="safety-event-item">
                                    <span className="safety-event-name">{evt.term}</span>
                                    {evt.count ? (
                                      <div className="safety-event-counts">
                                        <span className="mono">{evt.count} reports</span>
                                        <span className="safety-event-freq">({evt.frequency})</span>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="safety-precaution-panel">
                              <div className="safety-panel-title">Surveillance & Regulatory Precautions</div>
                              <div className="safety-precaution-row">
                                <div className="safety-precaution-label">Approved Indication</div>
                                <div className="safety-precaution-text">{safetyProfile.indication}</div>
                              </div>
                              <div className="safety-precaution-row">
                                <div className="safety-precaution-label">Precaution / Black Box Status</div>
                                <div className="safety-precaution-text">
                                  {safetyProfile.hasBoxedWarning ? (
                                    <span style={{ color: "#be123c", fontWeight: 600 }}>⚠️ {safetyProfile.boxedWarning}</span>
                                  ) : (
                                    <span>✓ {safetyProfile.boxedWarning}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="safety-limit-note">
                            {safetyProfile.isEstimate ? (
                              <>
                                <strong>No pharmacovigilance record:</strong> TargetForge holds curated safety entries for a subset of
                                the approved-drug library. This drug is not one of them, so no adverse-event counts, frequencies,
                                approval date or boxed-warning status are shown. The themes above are class-level prompts for your own
                                lookup in FDA labeling or FAERS, not observations about this drug.
                              </>
                            ) : (
                              <>
                            <strong>Methodology Note & Reporting Limitations:</strong> Adverse event reports from public safety databases
                            (such as FDA FAERS) are voluntary, spontaneous, and do not establish clinical causation. Reporting rates
                            are heavily influenced by commercial prescription volume, media publicity, and background disease severity.
                            This cross-reference serves as an empirical tolerability baseline, not a definitive safety verdict.
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="repurpose-pager">
        <span>
          {sorted.length} scored drugs · page {safePage + 1} of {pageCount}
        </span>
        <div className="repurpose-pager-btns">
          <button type="button" className="btn btn-ghost" disabled={safePage <= 0} onClick={() => onPage(safePage - 1)}>
            Previous
          </button>
          <button type="button" className="btn btn-ghost" disabled={safePage >= pageCount - 1} onClick={() => onPage(safePage + 1)}>
            Next
          </button>
        </div>
      </div>
    </>
  );
}

export default function RepurposingPage() {
  const librarySize = approvedDrugCount();

  const savedActive = React.useMemo(() => getActiveState(ACTIVE_STATE_KEYS.REPURPOSING), []);
  const [protein, setProtein] = useState(() => savedActive?.protein || null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(() => savedActive?.result || null);
  const [sort, setSort] = useState({ key: "score", dir: "desc" });
  const [page, setPage] = useState(0);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    setActiveState(ACTIVE_STATE_KEYS.REPURPOSING, { protein, result });
  }, [protein, result]);

  const runScreen = async (target) => {
    if (!target) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError("");
    setResult(null);
    setPage(0);
    setSort({ key: "score", dir: "desc" });
    setProgress({
      percent: 0,
      message: `Screening ${librarySize} approved drugs against ${targetDisplayName(target) || target.id}... 0% complete`,
    });
    try {
      const data = await screenApprovedLibrary(target, {
        onProgress: (info) => {
          if (reqId.current === myReq) setProgress(info);
        },
      });
      if (reqId.current !== myReq) return;
      setResult(data);

      const targetLabel = targetDisplayName(target) || target.id;
      const topDrug = data?.ranking?.[0];
      const summaryText = topDrug
        ? `Screened ${librarySize} approved drugs · Top lead: ${topDrug.name} (${topDrug.score}/100) for ${targetLabel}`
        : `Screened ${librarySize} approved drugs against ${targetLabel}`;

      saveHistoryEntry({
        type: "repurposing-run",
        title: `Repurposing Screen: ${targetLabel}`,
        summary: summaryText,
        inputs: {
          target: targetLabel,
          pdbId: target.id,
          librarySize,
        },
        snapshot: {
          target,
          topCandidates: (data?.ranking || []).slice(0, 20),
          highlightCount: data?.highlightCount || HIGHLIGHT_COUNT,
          totalDrugs: librarySize,
        },
      });
    } catch (e) {
      if (reqId.current === myReq) setError(e.message || "Repurposing screen failed.");
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
  };

  const onSelect = (row) => {
    setProtein(row);
    runScreen(row);
  };

  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "name" || key === "indication" ? "asc" : "desc" };
    });
    setPage(0);
  };

  const targetName = result?.target?.name || (protein ? targetDisplayName(protein) : "");
  const highlightCount = result?.highlightCount || HIGHLIGHT_COUNT;
  const topRows = (result?.ranking || []).slice(0, highlightCount);

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · drug repurposing screen</div>
        <h1>Drug Repurposing Screen</h1>
        <p>
          Search a target and screen approved drugs for repurposing candidates. TargetForge scores each compound against
          the selected structure using target-aware heuristics across a curated library of {librarySize} marketed small
          molecules.
        </p>
      </div>

      <div className="grid with-scores">
        <PdbTargetSearch
          protein={protein}
          onSelect={onSelect}
          eyebrow="Station 1 — RCSB PDB"
          title="Select a target to screen"
          hint="Same PDB search and Target Selection Score as the staging bench. Picking a structure starts a batch screen of the approved-drug library — no compound shortlist."
          emptyText="Search a protein name, gene, or PDB ID to begin a repurposing screen."
        />
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 2 — approved-drug library" title="Batch screen against marketed drugs" kind="candidate">
          <div className="hint" style={{ marginTop: 0 }}>
            {librarySize} curated approved drugs (kinase inhibitors, beta-blockers, analgesics, antihistamines, statins, and
            other classes) are scored in batches of 25. Extreme Lipinski outliers and molecules above 900 g/mol are dropped
            before the AI pass. Scores are cached as PDB ID + compound CID, and a full screen of the same target is reused
            for 24 hours so repeat searches do not burn AI credits.
          </div>
          {loading && progress && (
            <div className="repurpose-progress" role="status" aria-live="polite">
              <div className="repurpose-progress-label">{progress.message}</div>
              <div className="repurpose-progress-bar">
                <span style={{ width: `${progress.percent || 0}%` }} />
              </div>
            </div>
          )}
          {error && <div className="error-msg">{error}</div>}
          {result?.aiError && (
            <div className="error-msg">
              Unable to score against this target with the language model ({result.aiError}).{" "}
              {result.degraded
                ? "Insufficient structural data for a target-specific ranking."
                : "TargetForge used its target-aware model instead."}
            </div>
          )}
          {result?.degraded && !result.aiError && (
            <div className="error-msg">
              {INSUFFICIENT_STRUCTURE_ERROR}. This structure has no co-crystallized ligand or pocket, and the target
              family could not be recognized. The table below is general drug-likeness only — not a repurposing hit list.
            </div>
          )}
          {result?.warning && !result.degraded && <div className="lipinski-note">{result.warning}</div>}
          {!loading && !result && !error && (
            <div className="empty-state">
              Select a PDB structure above to screen the approved-drug library. This is a longer-running batch than the
              5-compound shortlist.
            </div>
          )}
          {result && (
            <div className="score-block">
              {result.fromDailyCache && (
                <div className="source-pill">Reused today's screen for {result.target.pdb_id} — cache-first, no new AI calls</div>
              )}
              <div className="recommend compact">
                <div className="recommend-label">Repurposing candidates for {targetName}</div>
                <div className="winner">
                  🏆 Repurposing Candidates for {targetName}
                  {result.target?.pdb_id ? ` (${result.target.pdb_id})` : ""}
                </div>
                <div className="winner-score">
                  Top {highlightCount} of {result.scoredCount} scored drugs
                  {result.recommended ? ` · lead ${result.recommended.name} ${result.recommended.score}/100` : ""}
                </div>
                <ul className="rank-bullets">
                  {topRows.slice(0, 8).map((row) => (
                    <li key={row.cid}>
                      <b>{row.name}</b> ({row.score}/100) — originally approved for {row.indication}
                    </li>
                  ))}
                </ul>
                {result.recommended && (
                  <div style={{ marginTop: 12 }}>
                    <AdversarialCritique
                      candidate={result.recommended}
                      target={result.target || protein}
                      label={`See the case against lead drug (${result.recommended.name})`}
                    />
                  </div>
                )}
              </div>
              <div className="score-toolbar" style={{ marginTop: 14 }}>
                <span className="score-toolbar-label">Full library ranking</span>
                <PainsInfoTip />
                <ReportExportButtons
                  compact
                  label="Export report"
                  filename={defaultReportFilename(
                    "repurposing-report",
                    result.target?.pdb_id || targetName
                  )}
                  getMarkdown={() => buildRepurposingReportMarkdown({ result })}
                />
              </div>
              <RepurposingTable
                rows={result.ranking}
                highlightCount={highlightCount}
                sortKey={sort.key}
                sortDir={sort.dir}
                onSort={toggleSort}
                page={page}
                pageSize={PAGE_SIZE}
                onPage={setPage}
                target={result.target || protein}
              />
              {result.excluded?.length > 0 && (
                <div className="lipinski-note">
                  Pre-filter excluded {result.excluded.length} library entry{result.excluded.length === 1 ? "" : "ies"} (missing
                  SMILES, MW &gt; 900, or ≥5 Lipinski/Veber failures) before AI scoring.
                </div>
              )}
              <HistoricalTrialSuccessContext target={result.target || protein} />
              <div className="lipinski-note">{result.summary}</div>
              <div className="source-pill">
                {result.usedLlm
                  ? "Ranked with OpenAI in 25-compound batches for this specific target"
                  : result.source === "cache" || result.fromDailyCache
                    ? "Reused cached scores for this (drug, PDB) pair"
                    : "Ranked with TargetForge's target-aware model (batched locally to stay inside serverless limits)"}
              </div>
              <div className="lipinski-note">{SERVERLESS_TIMEOUT_NOTE}</div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
