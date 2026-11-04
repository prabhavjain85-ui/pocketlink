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
import TargetTriageMatrix from "./TargetTriageMatrix";
import TargetPocketPreview from "./TargetPocketPreview";

const DEFAULT_CUSTOM_WEIGHTS = {
  genetic_association: 0.9,
  somatic_mutation: 0.65,
  rna_expression: 0.25,
  crispr_screen: 0.55,
  known_drug: 0.15,
};

const CUSTOM_SLIDER_DEFS = [
  { key: "genetic_association", label: "Genetic Association (GWAS / Rare Variant)" },
  { key: "somatic_mutation", label: "Somatic Driver Mutations (COSMIC / IntOGen)" },
  { key: "crispr_screen", label: "CRISPR Screen & Affected Pathway" },
  { key: "rna_expression", label: "RNA Expression Differential" },
  { key: "known_drug", label: "Clinical Precedence (Known Drugs)" },
];

const TDL_FILTERS = [
  { id: "ALL", label: "All TDLs" },
  { id: "Tclin", label: "Tclin (Approved Drug)" },
  { id: "Tchem", label: "Tchem (Tool Compound)" },
  { id: "Tbio", label: "Tbio (Biological Only)" },
  { id: "Tdark", label: "Tdark (Unexplored)" },
];

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
            <b>Safety &amp; Essentiality:</b> pan-essential genes (DepMap / gnomAD pLI &gt; 0.9 with broad vital-organ expression) incur a toxicity penalty.
          </li>
        </ul>
      </span>
    </span>
  );
}

function DiscoveryTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  onFindStructures,
  selectedPreviewSymbol,
  onInspectPocket,
}) {
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
            const isPreviewing = selectedPreviewSymbol === r.symbol;

            return (
              <React.Fragment key={r.ensemblId || r.symbol}>
                <tr className={r.highNovelty ? "high-novelty" : r.wellEstablished ? "established-target" : ""}>
                  <td>
                    <div className="result-id">{r.symbol}</div>
                    <div className="score-title">{r.name}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {r.tdl ? (
                        <span
                          className="novelty-badge"
                          title={r.tdlDescription || r.tdlLabel || r.tdl}
                          style={{
                            background:
                              r.tdl === "Tclin"
                                ? "rgba(34, 197, 94, 0.14)"
                                : r.tdl === "Tchem"
                                  ? "rgba(56, 189, 248, 0.14)"
                                  : r.tdl === "Tbio"
                                    ? "rgba(168, 85, 247, 0.14)"
                                    : "rgba(148, 163, 184, 0.14)",
                            color:
                              r.tdl === "Tclin"
                                ? "#4ade80"
                                : r.tdl === "Tchem"
                                  ? "#38bdf8"
                                  : r.tdl === "Tbio"
                                    ? "#c084fc"
                                    : "#cbd5e1",
                            border: "1px solid currentColor",
                          }}
                        >
                          {r.tdl}
                        </span>
                      ) : null}
                      {r.highNovelty ? <span className="novelty-badge undrugged">🆕 Undrugged target</span> : null}
                      {r.wellEstablished && !r.highNovelty ? (
                        <span className="novelty-badge established">Well-established</span>
                      ) : null}
                      {r.expectedMoA ? (
                        <span
                          className="novelty-badge"
                          title={`Directionality of effect: ${r.directionOfEffect || "context-dependent"} → ${r.expectedMoALabel || r.expectedMoA}`}
                          style={{
                            background: r.expectedMoA === "activator" ? "rgba(245, 158, 11, 0.14)" : "rgba(56, 189, 248, 0.14)",
                            color: r.expectedMoA === "activator" ? "#fbbf24" : "#38bdf8",
                            border: "1px solid currentColor",
                          }}
                        >
                          {r.expectedMoA === "activator"
                            ? "⚡ Activator / LoF target"
                            : r.expectedMoA === "inhibitor"
                              ? "🛡️ Inhibitor / GoF target"
                              : "⚖️ Modulator"}
                        </span>
                      ) : null}
                      {r.safetyProfile ? (
                        <span
                          className="novelty-badge"
                          style={{
                            background:
                              r.safetyProfile === "Pan-Essential Warning"
                                ? "rgba(239, 68, 68, 0.16)"
                                : r.safetyProfile === "Tissue-Specific"
                                  ? "rgba(34, 197, 94, 0.14)"
                                  : "rgba(148, 163, 184, 0.12)",
                            color:
                              r.safetyProfile === "Pan-Essential Warning"
                                ? "#f87171"
                                : r.safetyProfile === "Tissue-Specific"
                                  ? "#4ade80"
                                  : "#94a3b8",
                            border: "1px solid currentColor",
                          }}
                        >
                          {r.safetyProfile === "Pan-Essential Warning"
                            ? "⚠️ Pan-Essential Warning"
                            : r.safetyProfile}
                        </span>
                      ) : null}
                    </div>
                    {r.tractability?.topModality ? (
                      <div className="score-title" style={{ marginTop: 4 }}>
                        Tractability: {r.tractability.topModality}
                      </div>
                    ) : null}
                    {Array.isArray(r.paralogs) && r.paralogs.length > 0 ? (
                      <div className="score-title" style={{ marginTop: 2, color: "#cbd5e1" }}>
                        Homologous paralogs (&gt;65%):{" "}
                        {r.paralogs
                          .slice(0, 3)
                          .map((p) => `${p.symbol} (${p.identityPct}%)`)
                          .join(", ")}
                      </div>
                    ) : null}
                    {r.safety?.hasKnownSafetyFlags ? (
                      <div className="score-title" style={{ color: "#f87171", marginTop: 2 }}>
                        ⚠️ {r.safety.badge}
                        {r.safety.topOrgans?.length ? ` (${r.safety.topOrgans.join(", ")})` : ""}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      <button
                        type="button"
                        className={"btn-expression-toggle" + (isExpanded ? " active" : "")}
                        onClick={() => toggleExpression(r.symbol, r.ensemblId)}
                        aria-expanded={isExpanded}
                        title="View tissue expression distribution across human organs"
                      >
                        <span>🧬 Tissue Expression</span>
                        <span>{isExpanded ? "▲" : "▼"}</span>
                      </button>
                      {onInspectPocket ? (
                        <button
                          type="button"
                          className={"btn-expression-toggle" + (isPreviewing ? " active" : "")}
                          onClick={() => onInspectPocket(r)}
                          title="Inspect 3D binding pocket and conformation in-place"
                        >
                          <span>🔬 3D Pocket Preview</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="mono score-num">
                    {(r.profileScore ?? r.noveltyScore ?? 0).toFixed(1)}
                    {r.repurposingScore != null && r.evidenceProfile === "repurposing" ? (
                      <div className="score-title">novelty {r.noveltyScore.toFixed(1)}</div>
                    ) : null}
                  </td>
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
  const [profile, setProfile] = useState(() => savedActive?.profile || "novel_discovery");
  const [customSlidersOpen, setCustomSlidersOpen] = useState(() => Boolean(savedActive?.customSlidersOpen));
  const [customWeights, setCustomWeights] = useState(() => savedActive?.customWeights || DEFAULT_CUSTOM_WEIGHTS);
  const [useCustomWeights, setUseCustomWeights] = useState(() => Boolean(savedActive?.useCustomWeights));
  const [tdlFilter, setTdlFilter] = useState(() => savedActive?.tdlFilter || "ALL");
  const [previewTarget, setPreviewTarget] = useState(null);
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
    setActiveState(ACTIVE_STATE_KEYS.TARGET_DISCOVERY, {
      query,
      profile,
      customSlidersOpen,
      customWeights,
      useCustomWeights,
      tdlFilter,
      result,
      view,
      sort,
    });
  }, [query, profile, customSlidersOpen, customWeights, useCustomWeights, tdlFilter, result, view, sort]);

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

  const runSearch = async (
    raw,
    diseaseHint = null,
    profileOverride = null,
    customWeightsOverride = undefined
  ) => {
    const q = String(raw || query).trim();
    const activeProfile = profileOverride || profile;
    const activeCustomWeights =
      customWeightsOverride !== undefined
        ? customWeightsOverride
        : useCustomWeights
          ? customWeights
          : null;
    if (!q && !diseaseHint) return;
    const myReq = ++reqId.current;
    setLoading(true);
    setError("");
    setResult(null);
    setPreviewTarget(null);
    setSuggestOpen(false);
    setView(activeProfile === "repurposing" ? "established" : "novelty");
    setSort({ key: "noveltyScore", dir: "desc" });
    try {
      const callOpts = { diseaseHint, profile: activeProfile };
      if (activeCustomWeights) {
        callOpts.customWeights = activeCustomWeights;
      }
      const data = await runTargetDiscovery(q, callOpts);
      if (reqId.current !== myReq) return;
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data);

      const diseaseLabel = data?.disease?.name || q;
      const targetsList = data?.novelty || data?.targets || [];
      const topTarget = targetsList[0];
      const summaryText = topTarget
        ? `${targetsList.length} targets identified · Top lead: ${topTarget.symbol} (score ${(topTarget.profileScore ?? topTarget.noveltyScore)?.toFixed(1) ?? "n/a"})`
        : `${targetsList.length} candidate targets identified for ${diseaseLabel}`;

      saveHistoryEntry({
        type: "target-discovery",
        title: `Target Discovery: ${diseaseLabel}`,
        summary: summaryText,
        inputs: {
          query: q,
          profile: activeCustomWeights ? "custom" : activeProfile,
          diseaseName: diseaseLabel,
          diseaseId: data?.disease?.id || null,
        },
        snapshot: {
          result: data,
          query: q,
          profile: activeProfile,
          view: activeProfile === "repurposing" ? "established" : "novelty",
          sort: { key: "noveltyScore", dir: "desc" },
        },
      });
    } catch (e) {
      if (reqId.current === myReq) setError(e.message || "Target discovery failed.");
    } finally {
      if (reqId.current === myReq) setLoading(false);
    }
  };

  const onProfileChange = (nextProfile) => {
    setProfile(nextProfile);
    setUseCustomWeights(false);
    if (query.trim() || result?.disease) {
      runSearch(query || result?.disease?.name, result?.disease || null, nextProfile, null);
    }
  };

  const handleSliderChange = (key, val) => {
    const next = { ...customWeights, [key]: Number(val) };
    setCustomWeights(next);
    setUseCustomWeights(true);
  };

  const applyCustomWeights = () => {
    setUseCustomWeights(true);
    if (query.trim() || result?.disease) {
      runSearch(query || result?.disease?.name, result?.disease || null, profile, customWeights);
    }
  };

  const resetCustomWeights = () => {
    setCustomWeights(DEFAULT_CUSTOM_WEIGHTS);
    setUseCustomWeights(false);
    if (query.trim() || result?.disease) {
      runSearch(query || result?.disease?.name, result?.disease || null, profile, null);
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
    const params = new URLSearchParams({
      q: symbol,
      from: "target-discovery",
    });
    if (row?.expectedMoA) params.set("moa", row.expectedMoA);
    if (row?.uniprotId) params.set("uniprot", row.uniprotId);
    navigate(`/?${params.toString()}`);
  };

  const onInspectPocket = (row) => {
    setPreviewTarget((prev) => (prev?.symbol === row?.symbol ? null : row));
  };

  const onCommitTargetAndPocket = (targetRow, structureRow) => {
    const symbol = targetRow?.symbol || "";
    const stagedProtein = {
      ...structureRow,
      queryName: symbol || structureRow?.id,
      symbol,
      expectedMoA: targetRow?.expectedMoA,
      uniprotId: targetRow?.uniprotId || structureRow?.uniprotId,
      tdl: targetRow?.tdl,
      safetyProfile: targetRow?.safetyProfile,
      paralogs: targetRow?.paralogs || [],
    };
    const existingBench = getActiveState(ACTIVE_STATE_KEYS.BENCH) || {};
    setActiveState(ACTIVE_STATE_KEYS.BENCH, {
      ...existingBench,
      protein: stagedProtein,
      aiResult: null,
    });
    const params = new URLSearchParams({
      q: symbol || structureRow?.id || "",
      from: "target-discovery",
      committed: "1",
    });
    if (targetRow?.expectedMoA) params.set("moa", targetRow.expectedMoA);
    if (targetRow?.uniprotId) params.set("uniprot", targetRow.uniprotId);
    navigate(`/?${params.toString()}`);
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

  const rows = useMemo(() => {
    const baseRows = view === "established" ? result?.established || [] : result?.novelty || [];
    if (tdlFilter === "ALL") return baseRows;
    return baseRows.filter((r) => (r.tdl || "Tbio") === tdlFilter);
  }, [view, result, tdlFilter]);

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
          <div className="discovery-profile-bar" style={{ marginBottom: 12 }}>
            <div className="hint" style={{ marginBottom: 6, fontWeight: 600 }}>
              Evidence Weighting Profile:
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div className="view-toggle" role="radiogroup" aria-label="Evidence weighting profile">
                <button
                  type="button"
                  role="radio"
                  aria-checked={profile === "novel_discovery" && !useCustomWeights}
                  className={"chip" + (profile === "novel_discovery" && !useCustomWeights ? " active" : "")}
                  onClick={() => onProfileChange("novel_discovery")}
                >
                  Novel Discovery (Genetics &amp; CRISPR weighted)
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={profile === "repurposing" && !useCustomWeights}
                  className={"chip" + (profile === "repurposing" && !useCustomWeights ? " active" : "")}
                  onClick={() => onProfileChange("repurposing")}
                >
                  Repurposing (Clinical Precedence &amp; Tractability)
                </button>
              </div>
              <button
                type="button"
                className={"chip" + (customSlidersOpen || useCustomWeights ? " active" : "")}
                aria-expanded={customSlidersOpen}
                onClick={() => setCustomSlidersOpen((o) => !o)}
              >
                {useCustomWeights ? "⚙️ Custom Evidence Weights (Active)" : "⚙️ Custom Evidence Weights"}
              </button>
            </div>

            {customSlidersOpen && (
              <div
                data-testid="custom-evidence-weights-panel"
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(15, 23, 42, 0.65)",
                  border: "1px solid rgba(148, 163, 184, 0.24)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                    Custom Datatype Pillar Weights (0.0 – 1.0)
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="chip active" onClick={applyCustomWeights}>
                      Apply Custom Weights
                    </button>
                    <button type="button" className="chip" onClick={resetCustomWeights}>
                      Reset to Preset
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: 10,
                  }}
                >
                  {CUSTOM_SLIDER_DEFS.map((slider) => {
                    const val = Number(customWeights[slider.key] ?? 0.5);
                    return (
                      <label
                        key={slider.key}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          fontSize: 12,
                          color: "#cbd5e1",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>{slider.label}</span>
                          <span className="mono">{val.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          aria-label={slider.label}
                          value={val}
                          onChange={(e) => handleSliderChange(slider.key, e.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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

            <div className="discovery-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
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

            <div
              className="tdl-filter-bar"
              role="group"
              aria-label="Filter targets by Pharos Target Development Level"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                marginTop: 8,
                marginBottom: 10,
              }}
            >
              <span className="hint" style={{ margin: 0, marginRight: 4 }}>
                Pharos TDL Filter:
              </span>
              {TDL_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={"chip" + (tdlFilter === f.id ? " active" : "")}
                  onClick={() => setTdlFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {view === "established" && (
              <div className="hint">
                High overall association and three or more existing approved or investigational drugs. These are
                the already-explored end of the same Open Targets result — useful context, not the discovery default.
              </div>
            )}

            <TargetTriageMatrix
              rows={rows}
              selectedPreviewSymbol={previewTarget?.symbol || null}
              onInspectPocket={onInspectPocket}
              onFindStructures={onFindStructures}
            />

            {previewTarget && (
              <TargetPocketPreview
                target={previewTarget}
                onCommitToBench={onCommitTargetAndPocket}
                onClose={() => setPreviewTarget(null)}
              />
            )}

            {rows.length === 0 ? (
              <div className="empty-state">
                {tdlFilter !== "ALL"
                  ? `No targets in this view matched Pharos TDL filter "${tdlFilter}".`
                  : view === "established"
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
                selectedPreviewSymbol={previewTarget?.symbol || null}
                onInspectPocket={onInspectPocket}
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

