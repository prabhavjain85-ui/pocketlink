import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ACTIVE_STATE_KEYS,
  clearAllHistory,
  deleteHistoryEntry,
  getHistory,
  setActiveState,
  subscribeToHistory,
} from "./historyService";
import ReportExportButtons from "./ReportExportButtons";
import { buildHistoryEntryReportMarkdown, defaultReportFilename } from "./reportExport";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_CONFIG = {
  "staging-bench": {
    label: "Staging Bench",
    badgeClass: "badge-bench",
    icon: "🧪",
    targetRoute: "/",
    actionLabel: "Open in Bench",
  },
  "target-discovery": {
    label: "Target Discovery",
    badgeClass: "badge-discovery",
    icon: "🎯",
    targetRoute: "/target-discovery",
    actionLabel: "Open Discovery",
  },
  "pdb-search": {
    label: "PDB Target",
    badgeClass: "badge-pdb",
    icon: "🔬",
    targetRoute: "/",
    actionLabel: "Load in Bench",
  },
  "repurposing-run": {
    label: "Repurposing Screen",
    badgeClass: "badge-repurpose",
    icon: "💊",
    targetRoute: "/repurposing",
    actionLabel: "Open Screen",
  },
  "agent-run": {
    label: "Autonomous Agent",
    badgeClass: "badge-agent",
    icon: "🤖",
    targetRoute: "/agent",
    actionLabel: "Open Report",
  },
};

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
    const unsub = subscribeToHistory((next) => {
      setHistory(next);
    });
    return unsub;
  }, []);

  const filteredHistory = useMemo(() => {
    if (filterType === "all") return history;
    return history.filter((item) => item.type === filterType);
  }, [history, filterType]);

  const handleRestore = (item) => {
    if (!item) return;

    if (item.type === "staging-bench") {
      setActiveState(ACTIVE_STATE_KEYS.BENCH, {
        protein: item.snapshot?.protein || null,
        candidates: item.snapshot?.candidates || [],
        aiResult: item.snapshot?.aiResult || null,
        handoffCid: item.snapshot?.handoffCid || null,
      });
      navigate("/");
    } else if (item.type === "pdb-search") {
      setActiveState(ACTIVE_STATE_KEYS.BENCH, {
        protein: item.snapshot?.protein || null,
        initialQuery: item.inputs?.query || "",
        candidates: [],
        aiResult: null,
      });
      navigate("/");
    } else if (item.type === "target-discovery") {
      setActiveState(ACTIVE_STATE_KEYS.TARGET_DISCOVERY, {
        query: item.inputs?.query || item.inputs?.diseaseName || "",
        result: item.snapshot?.result || null,
        view: item.snapshot?.view || "novelty",
        sort: item.snapshot?.sort || { key: "noveltyScore", dir: "desc" },
      });
      navigate("/target-discovery");
    } else if (item.type === "repurposing-run") {
      setActiveState(ACTIVE_STATE_KEYS.REPURPOSING, {
        protein: item.snapshot?.target || null,
        result: {
          target: item.snapshot?.target || null,
          ranking: item.snapshot?.topCandidates || [],
          highlightCount: item.snapshot?.highlightCount || 3,
        },
      });
      navigate("/repurposing");
    } else if (item.type === "agent-run") {
      if (item.snapshot?.report) {
        setActiveState(ACTIVE_STATE_KEYS.AGENT, item.snapshot.report);
      }
      navigate("/agent");
    }
  };

  const handleDelete = (e, id) => {
    e.stopPropagation();
    deleteHistoryEntry(id);
    if (expandedId === id) setExpandedId(null);
  };

  const handleClearAll = () => {
    clearAllHistory();
    setConfirmClear(false);
    setExpandedId(null);
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="hero">
        <div className="hero-eyebrow">PocketLink · persistent search history</div>
        <h1>Search &amp; Screening History</h1>
        <p>
          Review past target investigations, compound shortlists, AI rankings, and drug repurposing screens saved
          locally on this device. Restore any previous run with full data without re-calling external APIs or the AI model.
        </p>
      </div>

      <div className="history-control-bar">
        <div className="history-filters" role="tablist" aria-label="Filter history by feature">
          {[
            { id: "all", label: "All Workflows" },
            { id: "staging-bench", label: "Staging Bench" },
            { id: "target-discovery", label: "Target Discovery" },
            { id: "pdb-search", label: "PDB Targets" },
            { id: "repurposing-run", label: "Repurposing" },
            { id: "agent-run", label: "Research Agent" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={"history-filter-btn" + (filterType === tab.id ? " active" : "")}
              onClick={() => setFilterType(tab.id)}
            >
              {tab.label}
              {tab.id === "all" ? (
                <span className="history-filter-count">{history.length}</span>
              ) : (
                <span className="history-filter-count">
                  {history.filter((h) => h.type === tab.id).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="history-actions">
          {history.length > 0 && (
            <>
              {confirmClear ? (
                <div className="confirm-clear-group">
                  <span className="confirm-text">Clear all {history.length} entries?</span>
                  <button type="button" className="btn btn-danger-sm" onClick={handleClearAll}>
                    Yes, clear all
                  </button>
                  <button type="button" className="btn btn-ghost-sm" onClick={() => setConfirmClear(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost-sm history-clear-btn"
                  onClick={() => setConfirmClear(true)}
                  title="Clear all saved history entries"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  Clear history
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="history-empty-card">
          <div className="history-empty-icon">📂</div>
          <h3>No search history found</h3>
          <p>
            {filterType === "all"
              ? "When you search PDB targets, evaluate candidate compounds on the Staging Bench, run Target Discovery, perform Repurposing screens, or run the Autonomous Research Agent, your sessions will be automatically preserved here."
              : `No saved entries under "${TYPE_CONFIG[filterType]?.label || filterType}".`}
          </p>
          <div className="history-empty-cta">
            <button type="button" className="btn btn-primary" onClick={() => navigate("/")}>
              Go to Staging Bench
            </button>
            <button type="button" className="btn btn-target" onClick={() => navigate("/target-discovery")}>
              Go to Target Discovery
            </button>
          </div>
        </div>
      ) : (
        <div className="history-list">
          {filteredHistory.map((item) => {
            const cfg = TYPE_CONFIG[item.type] || {
              label: item.type,
              badgeClass: "badge-bench",
              icon: "📄",
              targetRoute: "/",
              actionLabel: "Open",
            };
            const isExpanded = expandedId === item.id;
            const fullDate = item.timestamp ? new Date(item.timestamp).toLocaleString() : "";

            return (
              <div key={item.id} className={"history-card" + (isExpanded ? " expanded" : "")}>
                <div className="history-card-header">
                  <div className="history-card-meta">
                    <span className={"history-type-badge " + cfg.badgeClass}>
                      <span className="history-badge-icon">{cfg.icon}</span>
                      {cfg.label}
                    </span>
                    <span className="history-card-time" title={fullDate}>
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  <div className="history-card-actions">
                    <button
                      type="button"
                      className="btn-history-toggle"
                      onClick={() => toggleExpand(item.id)}
                      aria-expanded={isExpanded}
                      title="Inspect snapshot details"
                    >
                      <span>{isExpanded ? "Hide Details ▲" : "View Details ▼"}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary-sm history-restore-btn"
                      onClick={() => handleRestore(item)}
                      title={`Restore and navigate to ${cfg.label}`}
                    >
                      <span>{cfg.actionLabel}</span>
                      <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M4 10h12M10 4l6 6-6 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-history-del"
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Delete this history entry"
                      aria-label="Delete entry"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="history-card-body" onClick={() => toggleExpand(item.id)}>
                  <h3 className="history-card-title">{item.title}</h3>
                  {item.summary ? <p className="history-card-summary">{item.summary}</p> : null}
                </div>

                {isExpanded && (
                  <div className="history-snapshot-drawer">
                    <div className="history-drawer-header">
                      <strong>Stored Snapshot Data (Saved without re-calling external APIs)</strong>
                      <span className="mono hint" style={{ margin: 0 }}>ID: {item.id}</span>
                    </div>

                    {/* Staging Bench Snapshot */}
                    {item.type === "staging-bench" && (
                      <div className="snapshot-content">
                        {item.snapshot?.protein && (
                          <div className="snapshot-section">
                            <span className="snapshot-label">Target Structure:</span>
                            <span className="snapshot-val">
                              {item.snapshot.protein.id} — {item.snapshot.protein.title || item.snapshot.protein.name} (Score: {item.snapshot.protein.targetSelectionScore ?? item.snapshot.protein.score ?? "n/a"}/100)
                            </span>
                          </div>
                        )}
                        {Array.isArray(item.snapshot?.candidates) && (
                          <div className="snapshot-section">
                            <span className="snapshot-label">Shortlisted Compounds ({item.snapshot.candidates.length}):</span>
                            <div className="snapshot-tag-list">
                              {item.snapshot.candidates.map((c, i) => (
                                <span key={i} className="snapshot-tag">
                                  {c.displayName || c.name || `CID ${c.CID}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {Array.isArray(item.snapshot?.aiResult?.ranking) && (
                          <div className="snapshot-table-wrap">
                            <table className="snapshot-table">
                              <thead>
                                <tr>
                                  <th>Candidate</th>
                                  <th>Score</th>
                                  <th>Key Reasons</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.snapshot.aiResult.ranking.map((r, i) => (
                                  <tr key={i} className={r.cid === item.snapshot.aiResult.recommended?.cid ? "snapshot-winner" : ""}>
                                    <td>
                                      <strong>{r.name || `CID ${r.cid}`}</strong>
                                      {r.cid === item.snapshot.aiResult.recommended?.cid ? (
                                        <span className="snapshot-winner-badge">Winner</span>
                                      ) : null}
                                    </td>
                                    <td className="mono">{r.score}/100</td>
                                    <td>
                                      <ul className="snapshot-reasons">
                                        {(r.reasoning || r.strengths || []).slice(0, 2).map((reason, idx) => (
                                          <li key={idx}>{reason}</li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Target Discovery Snapshot */}
                    {item.type === "target-discovery" && (
                      <div className="snapshot-content">
                        <div className="snapshot-section">
                          <span className="snapshot-label">Disease:</span>
                          <span className="snapshot-val">{item.inputs?.diseaseName || item.inputs?.query}</span>
                        </div>
                        {Array.isArray(item.snapshot?.result?.targets) && (
                          <div className="snapshot-table-wrap">
                            <table className="snapshot-table">
                              <thead>
                                <tr>
                                  <th>Target / Gene</th>
                                  <th>Novelty</th>
                                  <th>Genetic Evidence</th>
                                  <th>Approved Drugs</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.snapshot.result.targets.slice(0, 5).map((t, idx) => (
                                  <tr key={idx}>
                                    <td>
                                      <strong>{t.symbol}</strong>
                                      <div className="score-title">{t.name}</div>
                                    </td>
                                    <td className="mono">{t.noveltyScore?.toFixed(1) ?? "n/a"}</td>
                                    <td>{t.geneticLabel || "Standard"} ({(t.geneticScore * 100)?.toFixed(0)}%)</td>
                                    <td className="mono">{t.drugCount ?? 0}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* PDB Target Search Snapshot */}
                    {item.type === "pdb-search" && (
                      <div className="snapshot-content">
                        <div className="snapshot-section">
                          <span className="snapshot-label">Search Query:</span>
                          <span className="snapshot-val">{item.inputs?.query}</span>
                        </div>
                        {item.snapshot?.protein && (
                          <div className="snapshot-section">
                            <span className="snapshot-label">Selected Structure:</span>
                            <span className="snapshot-val">
                              {item.snapshot.protein.id} · {item.snapshot.protein.title} · Resolution: {item.snapshot.protein.resolution || "n/a"} · Target Selection Score: {item.snapshot.protein.targetSelectionScore ?? item.snapshot.protein.score}/100
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Repurposing Screen Snapshot */}
                    {item.type === "repurposing-run" && (
                      <div className="snapshot-content">
                        {item.snapshot?.target && (
                          <div className="snapshot-section">
                            <span className="snapshot-label">Target Screened:</span>
                            <span className="snapshot-val">
                              {item.snapshot.target.id} — {item.snapshot.target.title || item.snapshot.target.name}
                            </span>
                          </div>
                        )}
                        {Array.isArray(item.snapshot?.topCandidates) && (
                          <div className="snapshot-table-wrap">
                            <table className="snapshot-table">
                              <thead>
                                <tr>
                                  <th>Drug Candidate</th>
                                  <th>Repurposing Score</th>
                                  <th>Approved Indication</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.snapshot.topCandidates.slice(0, 6).map((r, i) => (
                                  <tr key={i} className={i < (item.snapshot.highlightCount || 3) ? "snapshot-winner" : ""}>
                                    <td>
                                      <strong>{r.name}</strong>
                                      <div className="score-title">CID {r.cid}</div>
                                    </td>
                                    <td className="mono">{r.score}/100</td>
                                    <td>{r.indication}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Agent Run Snapshot */}
                    {item.type === "agent-run" && item.snapshot?.report && (
                      <div className="snapshot-content">
                        <div className="snapshot-section">
                          <span className="snapshot-label">Research Goal:</span>
                          <span className="snapshot-val">"{item.inputs?.goal}"</span>
                        </div>
                        {(item.snapshot.report.executiveSummary?.verdict || item.snapshot.report.haltReason) && (
                          <div className="snapshot-section">
                            <span className="snapshot-label">
                              {item.snapshot.report.status === "halted" ? "Halt Reason:" : "Agent Findings:"}
                            </span>
                            <span className="snapshot-val">
                              {item.snapshot.report.executiveSummary?.verdict || item.snapshot.report.haltReason}
                            </span>
                          </div>
                        )}
                        <div className="snapshot-section" style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "8px" }}>
                          <div>
                            <span className="snapshot-label">Target:</span>{" "}
                            <strong>{item.snapshot.report.executiveSummary?.targetSymbol || item.inputs?.target || "—"}</strong>
                          </div>
                          <div>
                            <span className="snapshot-label">PDB:</span>{" "}
                            <span className="mono">{item.snapshot.report.executiveSummary?.pdbId || "—"}</span>
                          </div>
                          <div>
                            <span className="snapshot-label">Lead Drug:</span>{" "}
                            <strong>{item.snapshot.report.executiveSummary?.leadDrugName || "—"}</strong>
                          </div>
                          <div>
                            <span className="snapshot-label">Repurposing Score:</span>{" "}
                            <span className="mono">{item.snapshot.report.executiveSummary?.repurposingScore != null ? `${item.snapshot.report.executiveSummary.repurposingScore}/100` : "—"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="snapshot-drawer-actions">
                      <ReportExportButtons
                        compact
                        label="Export report"
                        filename={defaultReportFilename(item.type, item.title)}
                        getMarkdown={() => buildHistoryEntryReportMarkdown(item)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary-sm"
                        onClick={() => handleRestore(item)}
                      >
                        Restore into {cfg.label}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
