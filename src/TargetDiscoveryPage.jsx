import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Panel } from "./benchUi";
import { getTargetExpressionProfile, runTargetDiscovery, searchDiseases } from "./serverApi";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
import ReportExportButtons from "./ReportExportButtons";
import { buildTargetDiscoveryReportMarkdown, defaultReportFilename } from "./reportExport";

function compareDiscoveryField(a, b, key) {
  if (key === "symbol" || key === "geneticLabel" || key === "evidenceSummary") {
    return String(a[key] || "").localeCompare(String(b[key] || ""));
  }
  if (key === "drugCount") return (a.drugCount ?? 0) - (b.drugCount ?? 0);
  if (key === "geneticScore") return (a.geneticScore ?? 0) - (b.geneticScore ?? 0);
  return (a.noveltyScore ?? 0) - (b.noveltyScore ?? 0);
}

function NoveltyInfoTip() {
  return (
    <span className="score-tip">
      <button type="button" className="score-tip-btn" aria-label="How novelty score is calculated">
        i
      </button>
      <span className="score-tip-pop" role="tooltip">
        <strong>Novelty score</strong>
        <span className="score-tip-lead">
          High genetic / biological association, inversely weighted by how many approved or investigational
          drugs already target the gene. Zero drugs keeps the full biology signal; well-drugged genes score low
          even when the disease association is strong.
        </span>
        <ul>
          <li>
            <b>Biology:</b> genetic association weighted most, then rare-variant literature, somatic mutation,
            overall Open Targets score, literature, pathway, animal model.
          </li>
          <li>
            <b>Drug penalty:</b> 1 / (1 + existing drug count) from Open Targets{" "}
            <code>drugAndClinicalCandidates</code> (replaces the older <code>knownDrugs</code> field).
          </li>
          <li>
            <b>Floor:</b> literature- or clinical-only rows are dropped so novelty is not the same as “random”.
          </li>
        </ul>
      </span>
    </span>
  );
}

function DiscoveryTable({ rows, sortKey, sortDir, onSort, onFindStructures }) {
  const [expandedExpression, setExpandedExpression] = useState({});
  const [expressionProfiles, setExpressionProfiles] = useState({});

  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareDiscoveryField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.symbol).localeCompare(String(b.symbol));
    });
  }, [rows, sortKey, sortDir]);

  const cols = [
    { key: "symbol", label: "Target / gene", sortable: true },
    { key: "noveltyScore", label: "Novelty score", sortable: true },
    { key: "geneticScore", label: "Genetic evidence", sortable: true },
    { key: "drugCount", label: "Drugs (any indication)", sortable: true },
    { key: "evidenceSummary", label: "Key evidence summary", sortable: false },
  ];

  const toggleExpression = (symbol, ensemblId) => {
    const opening = !expandedExpression[symbol];
    setExpandedExpression((prev) => ({
      ...prev,
      [symbol]: !prev[symbol],
    }));
    if (opening && !(symbol in expressionProfiles)) {
      getTargetExpressionProfile(symbol, { ensemblId })
        .then((profile) => setExpressionProfiles((prev) => ({ ...prev, [symbol]: profile })))
        .catch(() => setExpressionProfiles((prev) => ({ ...prev, [symbol]: null })));
    }
  };

  return (
    <div className="score-table-wrap discovery-table-wrap">
      <table className="score-table candidate-score-table discovery-table">
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
                        {active ? (sortDir === "asc" ? "\u25b2" : "\u25bc") : "\u2195"}
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
            const isExpanded = Boolean(expandedExpression[r.symbol]);
            const expProfile = isExpanded ? expressionProfiles[r.symbol] : null;

            return (
              <React.Fragment key={r.ensemblId || r.symbol}>
                <tr className={r.highNovelty ? "high-novelty" : r.wellEstablished ? "established-target" : ""}>
                  <td>
                    <div className="result-id">{r.symbol}</div>
                    <div className="score-title">{r.name}</div>
                    {r.highNovelty ? <span className="novelty-badge undrugged">\ud83c\udd95 Undrugged target</span> : null}
                    {r.wellEstablished && !r.highNovelty ? (
                      <span className="novelty-badge established">Well-established</span>
                    ) : null}
                    <div>
                      <button
                        type="button"
                        className={"btn-expression-toggle" + (isExpanded ? " active" : "")}
                        onClick={() => toggleExpression(r.symbol, r.ensemblId)}
                        aria-expanded={isExpanded}
                        title="View tissue expression distribution across human organs"
                      >
                        <span>\ud83e\uddec Tissue Expression</span>
                        <span>{isExpanded ? "\u25b2" : "\u25bc"}</span>
                      </button>
                    </div>
                  </td>
                  <td className="mono score-num">{r.noveltyScore.toFixed(1)}</td>
                  <td>
                    <div className={"genetic-strength " + r.geneticLevel}>{r.geneticLabel}</div>
                    <div className="score-title">{(r.geneticScore * 100).toFixed(0)} genetic score</div>
                  </td>
                  <td className="mono">{r.drugCount}</td>
                  <td>
                    <div className="repurpose-blurb">{r.explanation}</div>
                    <div className="score-title">{r.evidenceSummary}</div>
                    <button type="button" className="btn btn-target discovery-handoff" onClick={() => onFindStructures(r)}>
                      Find PDB structures for this target
                    </button>
                  </td>
                </tr>
                {isExpanded && expProfile && (
                  <tr className="expression-expanded-row">
                    <td colSpan={5}>
                      <div className="expression-drawer-card">
                        <div className="expression-header-row">
                          <div className="expression-title-group">
                            <h4 className="expression-title">
                              Gene Expression Context & Tissue Specificity — {r.symbol}
                            </h4>
                            <span className={"expression-badge " + expProfile.specificity}>
                              {expProfile.specificityBadge}
                            </span>
                          </div>
                          <span className="mono hint" style={{ margin: 0 }}>
                            {expProfile.available
                              ? `Primary: ${expProfile.primaryTissue} (${expProfile.primaryTpm} TPM) · tau ${expProfile.tau}`
                              : "No expression data"}
                          </span>
                        </div>

                        <div className="expression-intro">
                          A target expressed narrowly in diseased tissue is generally a safer, more selective drug target
                          than one expressed broadly throughout the body, since broad expression raises the risk of
                          systemic off-target and mechanism-based side effects.
                        </div>

                        <div className="expression-synthesis-box">
                          <strong>{expProfile.available ? "Physiological Specificity Assessment" : "No Expression Data"}</strong>
                          {expProfile.available ? expProfile.synthesis : expProfile.reason}
                        </div>

                        {expProfile.available && (
                        <div className="expression-chart-wrap">
                          <div className="expression-chart-header">
                            <span>Tissue / Anatomical System</span>
                            <span>Baseline RNA (TPM)</span>
                          </div>
                          <div className="expression-bar-list">
                            {expProfile.tissues.slice(0, 8).map((tissue) => (
                              <div key={tissue.id} className="expression-bar-row">
                                <div className="expression-tissue-meta">
                                  <span className="expression-tissue-name">{tissue.name}</span>
                                  <span className="expression-tissue-system">{tissue.organSystem}</span>
                                </div>
                                <div className="expression-bar-track" title={`${tissue.name}: ${tissue.tpm} TPM`}>
                                  <div
                                    className={
                                      "expression-bar-fill" +
                                      (tissue.id === expProfile.tissues[0].id ? " primary-tissue" : "")
                                    }
                                    style={{ width: `${tissue.relativePercent}%` }}
                                  />
                                </div>
                                <div className="expression-bar-val mono">{tissue.tpm} TPM</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        )}

                        <div className="expression-limit-note">
                          <strong>Methodology note:</strong>{" "}
                          {expProfile.available ? (
                            <>
                              Median TPM per tissue from {expProfile.source?.name}, across {expProfile.source?.tissueCount}{" "}
                              GTEx tissues for healthy adult donors. Specificity is the tau index (Yanai et al., 2005):
                              tau = Σ(1 − x<sub>i</sub>/x<sub>max</sub>)/(n − 1), where 0 is even expression everywhere and 1
                              is a single tissue. Expression in diseased or inflamed tissue can differ from healthy baseline.
                            </>
                          ) : (
                            <>
                              TargetForge shows GTEx medians from the Open Targets Platform and nothing else. When a gene has
                              no GTEx profile, no values are shown — earlier versions of this page filled the gap with
                              generated numbers, which has been removed.
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
  );
}

export default function TargetDiscoveryPage() {
  const navigate = useNavigate();

  const savedActive = useMemo(() => getActiveState(ACTIVE_STATE_KEYS.TARGET_DISCOVERY), []);
  const [query, setQuery] = useState(() => savedActive?.query || "");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(() => savedActive?.result || null);
  const [view, setView] = useState(() => savedActive?.view || "novelty");
  const [sort, setSort] = useState(() => savedActive?.sort || { key: "noveltyScore", dir: "desc" });
  const reqId = useRef(0);
  const suggestReq = useRef(0);

  useEffect(() => {
    setActiveState(ACTIVE_STATE_KEYS.TARGET_DISCOVERY, { query, result, view, sort });
  }, [query, result, view, sort]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return undefined;
    }
    const handle = setTimeout(async () => {
      const myReq = ++suggestReq.current;
      try {
        const hits = await searchDiseases(q);
        if (suggestReq.current !== myReq) return;
        setSuggestions(hits);
        setSuggestOpen(hits.length > 0);
        setActiveIndex(-1);
      } catch {
        if (suggestReq.current === myReq) {
          setSuggestions([]);
          setSuggestOpen(false);
        }
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [query]);

  const runSearch = async (raw, diseaseHint = null) => {
    const q = String(raw || query).trim();
    if (!q && !diseaseHint) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError("");
    setResult(null);
    setSuggestOpen(false);
    setView("novelty");
    setSort({ key: "noveltyScore", dir: "desc" });
    try {
      const data = await runTargetDiscovery(q, { diseaseHint });
      if (reqId.current !== myReq) return;
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);

      const diseaseLabel = data?.disease?.name || q;
      const targetsList = data?.targets || [];
      const topTarget = targetsList[0];
      const summaryText = topTarget
        ? `${targetsList.length} targets identified \u00b7 Top lead: ${topTarget.symbol} (novelty ${topTarget.noveltyScore?.toFixed(1) ?? "n/a"})`
        : `${targetsList.length} candidate targets identified for ${diseaseLabel}`;

      saveHistoryEntry({
        type: "target-discovery",
        title: `Target Discovery: ${diseaseLabel}`,
        summary: summaryText,
        inputs: {
          query: q,
          diseaseName: diseaseLabel,
          diseaseId: data?.disease?.id || null,
        },
        snapshot: {
          result: data,
          query: q,
          view: "novelty",
          sort: { key: "noveltyScore", dir: "desc" },
        },
      });
    } catch (e) {
      if (reqId.current === myReq) setError(e.message || "Target discovery failed.");
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
  };

  const onSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "symbol" || key === "geneticLabel" ? "asc" : "desc" };
    });
  };

  const onFindStructures = (row) => {
    const symbol = row?.symbol || "";
    if (!symbol) return;
    navigate(`/?q=${encodeURIComponent(symbol)}&from=target-discovery`);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (e.key === "ArrowDown" && suggestions.length) {
      e.preventDefault();
      setSuggestOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === "ArrowUp" && suggestions.length) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = activeIndex >= 0 ? suggestions[activeIndex] : null;
      if (picked) {
        setQuery(picked.name);
        runSearch(picked.name, picked);
      } else {
        runSearch(query);
      }
    }
  };

  const rows = view === "established" ? result?.established || [] : result?.novelty || [];
  const headline = (result?.novelty || []).filter((r) => r.highNovelty).slice(0, 8);
  const diseaseName = result?.disease?.name || "";

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · target discovery</div>
        <h1>Target Discovery</h1>
        <p>
          Find genetically validated but underexplored protein targets for a disease — opportunities with strong
          biological evidence and little to no existing drug coverage. TargetForge supports target identification
          by ranking Open Targets associations; it does not replace experimental target validation.
        </p>
      </div>

      <div className="grid with-scores">
        <Panel eyebrow="Open Targets Platform" title="Search a disease" kind="target">
          <div className="search-row discovery-search-row">
            <div className="search-autocomplete" role="combobox" aria-expanded={suggestOpen} aria-controls="disease-suggest" aria-haspopup="listbox">
              <input
                placeholder="Disease name (e.g. pancreatic cancer, chronic myeloid leukemia)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => suggestions.length && setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 180)}
                aria-autocomplete="list"
                aria-controls="disease-suggest"
              />
              {suggestOpen && suggestions.length > 0 && (
                <ul id="disease-suggest" className="suggest-list" role="listbox">
                  {suggestions.map((hit, i) => (
                    <li key={hit.id} role="option" aria-selected={i === activeIndex}>
                      <button
                        type="button"
                        className={"suggest-item" + (i === activeIndex ? " active" : "")}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQuery(hit.name);
                          runSearch(hit.name, hit);
                        }}
                      >
                        <span className="suggest-name">{hit.name}</span>
                        <span className="suggest-id">{hit.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button className="btn btn-target" onClick={() => runSearch(query)} disabled={loading || !query.trim()}>
              {loading ? <span className="spinner" /> : null}
              Search
            </button>
          </div>
          <div className="hint">
            Autocomplete and associations come from the Open Targets Platform GraphQL API. Results are cached by
            disease ID for 24 hours.
          </div>
          {error && <div className="error-msg">{error}</div>}
          {loading && (
            <div className="repurpose-progress" role="status" aria-live="polite">
              <div className="repurpose-progress-label">Querying Open Targets for associated targets\u2026</div>
            </div>
          )}
          {!loading && !result && !error && (
            <div className="empty-state">
              Search a disease to surface protein targets with strong genetic or biological evidence and little
              existing drug coverage.
            </div>
          )}
        </Panel>
      </div>

      {result && (
        <div className="handoff-panel">
          <Panel
            eyebrow="Novelty-ranked opportunities"
            title={`Targets for ${diseaseName}`}
            kind="candidate"
          >
            {result.fromCache && (
              <div className="source-pill">
                Reused today's Open Targets results for {result.disease.id} — cache-first, no new API call
              </div>
            )}
            <div className="hint" style={{ marginTop: result.fromCache ? 10 : 0 }}>
              Resolved to <span className="mono">{result.disease.id}</span>
              {result.disease.associationCount
                ? ` \u00b7 ${result.disease.associationCount.toLocaleString()} associations in Open Targets, showing the top ${result.fetchedCount} by overall score`
                : ""}
              . Known-drug counts use <span className="mono">target.drugAndClinicalCandidates.count</span> (the
              current schema; the older <span className="mono">knownDrugs</span> field is gone).
            </div>

            {headline.length > 0 && view === "novelty" && (
              <div className="recommend compact">
                <div className="recommend-label">Undrugged, genetically supported leads</div>
                <div className="winner">\ud83c\udd95 High-novelty targets for {diseaseName}</div>
                <div className="winner-score">
                  {headline.length} gene{headline.length === 1 ? "" : "s"} with strong evidence and 0 existing drugs
                </div>
                <ul className="rank-bullets">
                  {headline.map((row) => (
                    <li key={row.ensemblId}>
                      <b>{row.symbol}</b> (novelty {row.noveltyScore.toFixed(1)}) — {row.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="discovery-toolbar">
              <div className="view-toggle" role="tablist" aria-label="Result view">
                <button
                  type="button"
                  className={"chip" + (view === "novelty" ? " active" : "")}
                  onClick={() => {
                    setView("novelty");
                    setSort({ key: "noveltyScore", dir: "desc" });
                  }}
                >
                  Underexplored (novelty) \u00b7 {result.novelty.length}
                </button>
                <button
                  type="button"
                  className={"chip" + (view === "established" ? " active" : "")}
                  onClick={() => {
                    setView("established");
                    setSort({ key: "noveltyScore", dir: "desc" });
                  }}
                >
                  Well-established targets \u00b7 {result.established.length}
                </button>
              </div>
              <NoveltyInfoTip />
              <ReportExportButtons
                compact
                label="Export report"
                filename={defaultReportFilename("target-discovery-report", diseaseName)}
                getMarkdown={() =>
                  buildTargetDiscoveryReportMarkdown({
                    result,
                    query,
                    view,
                  })
                }
              />
            </div>

            {view === "established" && (
              <div className="hint">
                High overall association and three or more existing approved or investigational drugs. These are
                the already-explored end of the same Open Targets result — useful context, not the discovery default.
              </div>
            )}

            {rows.length === 0 ? (
              <div className="empty-state">
                {view === "established"
                  ? "No well-established (high association, many existing drugs) targets in this result set."
                  : "No targets passed the evidence threshold for this disease. Novelty is not the same as a random gene list."}
              </div>
            ) : (
              <DiscoveryTable
                rows={rows}
                sortKey={sort.key}
                sortDir={sort.dir}
                onSort={onSort}
                onFindStructures={onFindStructures}
              />
            )}

            <div className="lipinski-note">
              Association and drug counts are from the{" "}
              <a href="https://platform.opentargets.org" target="_blank" rel="noreferrer">
                Open Targets Platform
              </a>
              . Novelty is a TargetForge ranking, not Open Targets' own recency-based <span className="mono">novelty</span>{" "}
              field. A high novelty score is a hypothesis to follow up — not proof that a target is druggable.
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
