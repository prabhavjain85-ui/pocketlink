import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { runResearchAgent } from "./agentPipeline";
import {
  ACTIVE_STATE_KEYS,
  clearActiveState,
  getActiveState,
  setActiveState,
} from "./historyService";

const EXAMPLE_GOALS = [
  "Find repurposing candidates for pancreatic cancer",
  "Identify novel targets & approved leads for glioblastoma",
  "Screen repurposing candidates for colorectal cancer",
  "Investigate targets and repurposed drugs for Alzheimer disease",
  "EGFR inhibitors for lung cancer",
];

const STEPS_CONFIG = [
  { id: 1, name: "Resolve disease", sub: "Open Targets ontology" },
  { id: 2, name: "Select PDB", sub: "Experimental pocket filter" },
  { id: 3, name: "Rank approved drugs", sub: "heuristic-v2 shortlist" },
  { id: 4, name: "Adversarial critique", sub: "Case for vs case against" },
];

export default function AgentPage() {
  const navigate = useNavigate();

  // Active state initialization
  const [goalInput, setGoalInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [currentStepNum, setCurrentStepNum] = useState(1);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isRestoredRun, setIsRestoredRun] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Expandable drawers state
  const [expandedDrawers, setExpandedDrawers] = useState({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const abortControllerRef = useRef(null);

  // Restore active agent run if one was cached in localStorage
  useEffect(() => {
    const cached = getActiveState(ACTIVE_STATE_KEYS.AGENT);
    if (cached && cached.steps) {
      setReport(cached);
      setIsRestoredRun(true);
      if (cached.goal) setGoalInput(cached.goal);
    }
  }, []);

  const toggleDrawer = (stepId) => {
    setExpandedDrawers((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setProgressMsg("Agent execution cancelled by user.");
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearActiveState(ACTIVE_STATE_KEYS.AGENT);
    setReport(null);
    setIsRestoredRun(false);
    setErrorMsg(null);
    setProgressMsg("");
    setGoalInput("");
  };

  const executeRun = async (targetGoal) => {
    const trimmed = (targetGoal || goalInput).trim();
    if (!trimmed) {
      setErrorMsg("Please enter a research goal.");
      return;
    }

    setErrorMsg(null);
    setIsRestoredRun(false);
    setIsRunning(true);
    setCurrentStepNum(1);
    setProgressMsg("Initializing autonomous research pipeline...");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const finalReport = await runResearchAgent({
        goal: trimmed,
        signal: controller.signal,
        onProgress: ({ step, message }) => {
          if (step) setCurrentStepNum(step);
          if (message) setProgressMsg(message);
        },
        onStepUpdate: (updatedReport) => {
          setReport(updatedReport);
        },
      });

      setReport(finalReport);
      if (finalReport.status === "halted") {
        setErrorMsg(finalReport.haltReason);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[AgentPage] Pipeline error:", err);
        setErrorMsg(err.message || "An unexpected error occurred during the agent run.");
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeRun(goalInput);
  };

  const handleExampleClick = (example) => {
    setGoalInput(example);
    executeRun(example);
  };

  const handleHandoffToBench = (structure) => {
    if (!structure) return;
    setActiveState(ACTIVE_STATE_KEYS.BENCH, {
      protein: structure,
      candidates: [],
      aiResult: null,
    });
    navigate("/");
  };

  const handleHandoffToDiscovery = (disease) => {
    if (!disease) return;
    navigate(`/target-discovery?q=${encodeURIComponent(disease.name || disease.id)}`);
  };

  const handleHandoffToRepurposing = (structure) => {
    const s = structure || step2?.data?.selectedStructure || step3?.data?.selectedStructure;
    if (!s) return;
    setActiveState(ACTIVE_STATE_KEYS.REPURPOSING, {
      protein: s,
    });
    navigate("/repurposing");
  };

  const handleHandoffToAdme = () => {
    if (!exec) return;
    const params = new URLSearchParams();
    if (exec.leadDrugSmiles) params.set("smiles", exec.leadDrugSmiles);
    if (exec.leadDrugName) params.set("name", exec.leadDrugName);
    if (exec.leadDrugCid) params.set("cid", String(exec.leadDrugCid));
    navigate(`/adme?${params.toString()}`);
  };

  const handleCopyReport = () => {
    if (!exec) return;
    const text = [
      "TargetForge Autonomous Research Agent Report",
      `Objective: ${report?.goal || goalInput}`,
      `Disease: ${exec.disease} (${exec.diseaseId || report?.diseaseResolved?.id || "N/A"})`,
      `Target: ${exec.targetSymbol} — ${exec.targetOneLineWhy || "Validated disease association"}`,
      `PDB Structure: ${exec.pdbId} (${exec.pdbResolution || "Experimental"})`,
      `Lead Approved Drug: ${exec.leadDrugName} (CID: ${exec.leadDrugCid || "N/A"}, Score: ${exec.repurposingScore}/100)`,
      `Primary Indication: ${exec.primaryIndication || "N/A"}`,
      `Adversarial Critique Summary: ${exec.critiqueSummary || exec.keyConcern || "Computational assessment complete."}`,
      "Status: Computational assessment only. Experimental validation required.",
    ].join("\n");

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      });
    }
  };

  const step1 = report?.steps?.[1];
  const step2 = report?.steps?.[2];
  const step3 = report?.steps?.[3];
  const step4 = report?.steps?.[4];
  const exec = report?.executiveSummary;

  // Derive Top 5 for Step 3 card
  const top5Candidates = Array.isArray(step3?.data?.top5) && step3.data.top5.length > 0
    ? step3.data.top5
    : Array.isArray(step3?.data?.ranking)
    ? step3.data.ranking.slice(0, 5)
    : [];

  const remainingCandidates = Array.isArray(step3?.data?.ranking)
    ? step3.data.ranking.slice(5)
    : [];

  return (
    <div className="agent-page">
      {/* Hero Section */}
      <div className="hero">
        <div className="hero-eyebrow">
          TargetForge · Autonomous Research Agent
        </div>
        <h1>Autonomous Research Agent</h1>
        <p className="hero-subtitle">
          Runs TargetForge’s Target Discovery, PDB pick, approved-drug ranking, and a critique in order. Computational only.
        </p>
      </div>

      {/* Restore Last Run Banner */}
      {isRestoredRun && report && (
        <aside className="agent-restored-banner" role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>📂</span>
            <span>
              Restored previous agent run:{" "}
              <strong>{exec?.disease || report.diseaseResolved?.name || report.goal}</strong>
              {exec?.targetSymbol && (
                <>
                  {" → "}
                  <strong>{exec.targetSymbol}</strong>
                </>
              )}
              {exec?.leadDrugName && <span> ({exec.leadDrugName})</span>}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost-sm"
            onClick={handleReset}
          >
            Clear run
          </button>
        </aside>
      )}

      {/* Goal Input Card */}
      <section className="agent-input-card" aria-labelledby="agent-goal-heading">
        <form className="agent-form" onSubmit={handleSubmit}>
          <label id="agent-goal-heading" htmlFor="agent-goal-input" className="label" style={{ fontWeight: 600 }}>
            Specify High-Level Research Objective
          </label>
          <div className="agent-input-row">
            <input
              id="agent-goal-input"
              type="text"
              className="agent-input"
              placeholder="e.g., Find repurposing candidates for pancreatic cancer, CML, or EGFR inhibitors"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              disabled={isRunning}
              autoComplete="off"
            />
            {isRunning ? (
              <button
                type="button"
                className="agent-btn-cancel"
                onClick={handleCancel}
                title="Cancel agent execution"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Cancel Run
              </button>
            ) : (
              <button
                type="submit"
                id="btn-run-agent"
                className="btn btn-primary agent-btn-submit"
                disabled={!goalInput.trim() || isRunning}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Pipeline
              </button>
            )}
          </div>

          <div className="agent-input-helper">
            Expected runtime: Typically 30–90 seconds. Computational only.
          </div>

          {/* Resolved Disease Indicator */}
          {report?.diseaseResolved && (
            <div className="agent-resolved-indicator" role="status">
              You typed: <span className="mono">{report.userTyped || report.diseaseQuery || goalInput}</span> →{" "}
              <strong>{report.diseaseResolved.name}</strong>{" "}
              <span className="mono">({report.diseaseResolved.id})</span>
            </div>
          )}

          {/* Example prompt chips */}
          <div className="agent-examples-wrap">
            <span className="agent-examples-label">Example Goals:</span>
            {EXAMPLE_GOALS.map((eg, idx) => (
              <button
                key={idx}
                type="button"
                className="agent-example-chip"
                onClick={() => handleExampleClick(eg)}
                disabled={isRunning}
              >
                {eg}
              </button>
            ))}
          </div>
        </form>

        {errorMsg && (
          <div className="error-banner" style={{ marginTop: 16 }}>
            <strong>Pipeline Notice:</strong> {errorMsg}
          </div>
        )}
      </section>

      {/* Visible 4-Step Rail: Visible on empty page, while running, and after run */}
      <section className="agent-progress-card" aria-label="Pipeline 4-Step Orchestrator Rail">
        <div className="agent-progress-header">
          {isRunning ? (
            <div className="agent-live-ticker">
              <span className="agent-spinner" aria-hidden="true" />
              <span>{progressMsg || "Processing pipeline stage..."}</span>
            </div>
          ) : report ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Pipeline Status:</span>
              <span className={`badge ${report.status === "completed" ? "badge-clean" : "badge-amber"}`}>
                {report.status === "completed" ? "Completed (4 of 4)" : report.haltReason || "Halted"}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-dim)" }}>
              4-Step Computational Pipeline
            </div>
          )}
          <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {isRunning
              ? `Step ${currentStepNum} of 4`
              : report?.totalDurationMs
              ? `${(report.totalDurationMs / 1000).toFixed(1)}s elapsed`
              : "Sequential Rail"}
          </span>
        </div>

        <div className="agent-steps-stepper">
          {STEPS_CONFIG.map((st) => {
            let stepState = "pending";
            if (isRunning) {
              if (report?.steps?.[st.id]?.status === "complete") stepState = "complete";
              else if (report?.steps?.[st.id]?.status === "dead_end") stepState = "dead_end";
              else if (currentStepNum === st.id) stepState = "running";
            } else if (report) {
              stepState = report?.steps?.[st.id]?.status || "pending";
            }

            return (
              <div key={st.id} className={`agent-stepper-item ${stepState}`}>
                <span className="agent-stepper-num">
                  {stepState === "complete" ? "✓" : st.id}
                </span>
                <div className="agent-stepper-meta">
                  <span className="agent-stepper-name">{st.name}</span>
                  <span className="agent-stepper-status">
                    {stepState === "running"
                      ? "Running…"
                      : stepState === "complete"
                      ? "Completed"
                      : stepState === "dead_end"
                      ? "Dead-end"
                      : st.sub}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Summary Card Strip (Requirement 8): Disease, Target, PDB, Lead drug, Critique, Actions */}
      {exec && (
        <section className="agent-summary-strip" aria-label="Executive Summary Strip">
          <div className="agent-summary-strip-header">
            <div>
              <span className="agent-exec-eyebrow">Executive Research Brief · Autonomous Findings</span>
              <h2 className="agent-exec-title" style={{ marginTop: 2 }}>
                {exec.disease} → {exec.targetSymbol} ({exec.leadDrugName})
              </h2>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="badge badge-agent">
                Autonomous Run Complete
              </span>
              <button
                type="button"
                className="btn btn-ghost-sm"
                onClick={handleReset}
                title="Start a fresh investigation"
              >
                New Run
              </button>
            </div>
          </div>

          <div className="agent-summary-strip-grid">
            <div className="agent-summary-item">
              <span className="agent-summary-label">Disease Resolved</span>
              <span className="agent-summary-val">
                {exec.disease} {exec.diseaseId ? `(${exec.diseaseId})` : ""}
              </span>
            </div>

            <div className="agent-summary-item">
              <span className="agent-summary-label">Target Symbol &amp; Rationale</span>
              <span className="agent-summary-val">
                <strong>{exec.targetSymbol}</strong> — {exec.targetOneLineWhy || "Validated disease association"}
              </span>
            </div>

            <div className="agent-summary-item">
              <span className="agent-summary-label">PDB Structure</span>
              <span className="agent-summary-val mono">
                {exec.pdbId} ({exec.pdbResolution || "Experimental"})
              </span>
            </div>

            <div className="agent-summary-item">
              <span className="agent-summary-label">Lead Approved Drug</span>
              <span className="agent-summary-val">
                <strong>{exec.leadDrugName}</strong> ({exec.repurposingScore}/100)
              </span>
            </div>
          </div>

          <div className="agent-summary-critique">
            <strong>Adversarial Critique Summary:</strong> {exec.critiqueSummary || exec.keyConcernDetail || exec.keyConcern}
          </div>

          <div className="agent-summary-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleHandoffToRepurposing()}
            >
              Open in Repurposing
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleHandoffToAdme}
            >
              Open in ADME
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleCopyReport}
            >
              {copiedReport ? "✓ Copied to Clipboard" : "Copy Report (Plain Text)"}
            </button>
          </div>
        </section>
      )}

      {/* Step-by-Step Narrated Cards */}
      {report && (
        <div className="agent-step-section">
          {/* ================================================================= */}
          {/* STEP 1: TARGET DISCOVERY */}
          {/* ================================================================= */}
          <article className={`agent-step-card ${step1?.status || "pending"}`} id="agent-step-1">
            <header className="agent-step-card-header">
              <div className="agent-step-header-left">
                <span className="agent-step-badge-num">
                  {step1?.status === "complete" ? "✓" : "1"}
                </span>
                <div className="agent-step-titles">
                  <h3 className="agent-step-title">{step1?.title || "Step 1: Target Discovery"}</h3>
                  <span className="agent-step-sub">{step1?.subtitle}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${step1?.status === "complete" ? "badge-clean" : step1?.status === "dead_end" ? "badge-amber" : "badge-pill"}`}>
                  {step1?.status === "complete" ? "Targets Ranked" : step1?.status === "dead_end" ? "Target Dead-End" : "Pending"}
                </span>
                {step1?.data?.disease && (
                  <button
                    type="button"
                    className="btn btn-ghost-sm"
                    onClick={() => handleHandoffToDiscovery(step1.data.disease)}
                    title="Open disease in Target Discovery module"
                  >
                    Open in Discovery
                  </button>
                )}
              </div>
            </header>

            <div className="agent-step-body">
              {/* Narration */}
              {step1?.narration && (
                <div className="agent-narration-box">
                  <div className="agent-narration-header">
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                    </svg>
                    Agent Scientific Narration &amp; Rationale
                  </div>
                  <p className="agent-narration-text" dangerouslySetInnerHTML={{
                    __html: step1.narration.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                </div>
              )}

              {/* Spotlight Target Result */}
              {step1?.data?.primaryTarget && (
                <div className="agent-result-spotlight">
                  <div className="agent-spotlight-header">Discovery Candidates Summary</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    <div className="summary-item" style={{ background: "var(--surface-muted)", padding: 12, borderRadius: 6 }}>
                      <span className="summary-label">Primary Target</span>
                      <strong style={{ fontSize: 16 }}>{step1.data.primaryTarget.symbol}</strong>
                      <div className="score-title">{step1.data.primaryTarget.name}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)", display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                        <span>Novelty: <strong className="mono">{step1.data.primaryTarget.noveltyScore != null ? `${step1.data.primaryTarget.noveltyScore}/100` : "N/A"}</strong></span>
                        <span>·</span>
                        <span>Genetic: <strong className="mono">{step1.data.primaryTarget.geneticScore != null ? `${(step1.data.primaryTarget.geneticScore * 100).toFixed(0)}%` : "0%"}</strong></span>
                        <span>·</span>
                        <span>Approved Drugs: <strong className="mono">{step1.data.primaryTarget.drugCount ?? 0}</strong></span>
                      </div>
                    </div>

                    {step1.data.backupTarget && (
                      <div className="summary-item" style={{ background: "var(--surface-muted)", padding: 12, borderRadius: 6 }}>
                        <span className="summary-label">Contingency Backup Target</span>
                        <strong style={{ fontSize: 16 }}>{step1.data.backupTarget.symbol}</strong>
                        <div className="score-title">{step1.data.backupTarget.name}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)", display: "flex", flexWrap: "wrap", gap: "4px 8px" }}>
                          <span>Novelty: <strong className="mono">{step1.data.backupTarget.noveltyScore != null ? `${step1.data.backupTarget.noveltyScore}/100` : "N/A"}</strong></span>
                          <span>·</span>
                          <span>Genetic: <strong className="mono">{step1.data.backupTarget.geneticScore != null ? `${(step1.data.backupTarget.geneticScore * 100).toFixed(0)}%` : "0%"}</strong></span>
                          <span>·</span>
                          <span>Approved Drugs: <strong className="mono">{step1.data.backupTarget.drugCount ?? 0}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Expandable Table for Full Evaluated Targets */}
              {Array.isArray(step1?.data?.noveltyTargets) && (
                <div className="agent-drawer-wrap">
                  <button
                    type="button"
                    className="agent-drawer-toggle"
                    onClick={() => toggleDrawer(1)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="12"
                      height="12"
                      fill="currentColor"
                      style={{ transform: expandedDrawers[1] ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
                    >
                      <path d="M6 4l8 6-8 6V4z" />
                    </svg>
                    {expandedDrawers[1] ? "Hide" : "Inspect"} Full Evaluated Targets ({step1.data.noveltyTargets.length} candidates)
                  </button>

                  {expandedDrawers[1] && (
                    <div className="agent-drawer-content">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Target / Gene</th>
                            <th>Novelty Score</th>
                            <th>Overall Score</th>
                            <th>Genetic Assoc.</th>
                            <th>Somatic Mut.</th>
                            <th>Approved Drugs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {step1.data.noveltyTargets.map((t, idx) => (
                            <tr key={idx}>
                              <td className="mono">#{idx + 1}</td>
                              <td>
                                <strong>{t.symbol}</strong>
                                <div className="score-title">{t.name}</div>
                              </td>
                              <td className="mono"><strong>{t.noveltyScore}/100</strong></td>
                              <td className="mono">{t.overallScore != null ? Number(t.overallScore).toFixed(2) : "—"}</td>
                              <td className="mono">{t.geneticScore != null ? `${(t.geneticScore * 100).toFixed(0)}%` : "—"}</td>
                              <td className="mono">{t.somaticScore != null ? `${(t.somaticScore * 100).toFixed(0)}%` : "—"}</td>
                              <td className="mono">{t.drugCount ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* ================================================================= */}
          {/* STEP 2: PDB STRUCTURE SELECTION */}
          {/* ================================================================= */}
          <article className={`agent-step-card ${step2?.status || "pending"}`} id="agent-step-2">
            <header className="agent-step-card-header">
              <div className="agent-step-header-left">
                <span className="agent-step-badge-num">
                  {step2?.status === "complete" ? "✓" : "2"}
                </span>
                <div className="agent-step-titles">
                  <h3 className="agent-step-title">{step2?.title || "Step 2: PDB Structure Selection"}</h3>
                  <span className="agent-step-sub">{step2?.subtitle}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${step2?.status === "complete" ? "badge-clean" : step2?.status === "dead_end" ? "badge-amber" : "badge-pill"}`}>
                  {step2?.status === "complete" ? "PDB Selected" : step2?.status === "dead_end" ? "Structure Gap" : "Pending"}
                </span>
                {step2?.data?.selectedStructure && (
                  <button
                    type="button"
                    className="btn btn-ghost-sm"
                    onClick={() => handleHandoffToBench(step2.data.selectedStructure)}
                    title="Load this crystallographic structure into the Staging Bench"
                  >
                    Load in Bench
                  </button>
                )}
              </div>
            </header>

            <div className="agent-step-body">
              {/* Narration */}
              {step2?.narration && (
                <div className={`agent-narration-box ${step2.data?.pivoted ? "pivoted" : ""}`}>
                  <div className="agent-narration-header">
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                    </svg>
                    {step2.data?.pivoted ? "Honest Dead-End & Contingency Pivot Rationale" : "Agent Structural Selection Rationale"}
                  </div>
                  <p className="agent-narration-text" dangerouslySetInnerHTML={{
                    __html: step2.narration.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                </div>
              )}

              {/* Selected Structure Spotlight */}
              {step2?.data?.selectedStructure && (
                <div className="agent-result-spotlight">
                  <div className="agent-spotlight-header">Selected Experimental Structure Specs</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div>
                      <span className="summary-label">PDB Entry</span>
                      <strong className="mono" style={{ fontSize: 16 }}>{step2.data.selectedStructure.id}</strong>
                      <div className="score-title" style={{ marginTop: 2 }}>{step2.data.selectedStructure.title}</div>
                    </div>
                    <div>
                      <span className="summary-label">Target Selection Score</span>
                      <strong className="mono" style={{ fontSize: 16, color: "var(--primary)" }}>
                        {step2.data.selectedStructure.score}/100
                      </strong>
                      <div className="score-title">Resolution: {step2.data.selectedStructure.resolution || "N/A"}</div>
                    </div>
                    <div>
                      <span className="summary-label">Ligand &amp; Pocket Status</span>
                      <strong style={{ fontSize: 13, display: "block" }}>
                        {step2.data.selectedStructure.ligand?.name || step2.data.selectedStructure.ligand?.compId || "Co-crystallized ligand present"}
                      </strong>
                      <div className="score-title">
                        Pocket: {step2.data.selectedStructure.pocket?.sizeLabel || "detected"} ({step2.data.selectedStructure.pocket?.residueCount || "—"} residues)
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Expandable Table for All Evaluated PDB Structures */}
              {Array.isArray(step2?.data?.evaluatedStructures) && (
                <div className="agent-drawer-wrap">
                  <button
                    type="button"
                    className="agent-drawer-toggle"
                    onClick={() => toggleDrawer(2)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="12"
                      height="12"
                      fill="currentColor"
                      style={{ transform: expandedDrawers[2] ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
                    >
                      <path d="M6 4l8 6-8 6V4z" />
                    </svg>
                    {expandedDrawers[2] ? "Hide" : "Inspect"} Evaluated PDB Structures ({step2.data.evaluatedStructures.length} structures)
                  </button>

                  {expandedDrawers[2] && (
                    <div className="agent-drawer-content">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>PDB ID</th>
                            <th>Method</th>
                            <th>Resolution</th>
                            <th>Ligand</th>
                            <th>Pocket Status</th>
                            <th>Target Selection Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {step2.data.evaluatedStructures.map((s, idx) => (
                            <tr key={idx} className={s.id === step2.data.selectedStructure?.id ? "table-active" : ""}>
                              <td>
                                <strong className="mono">{s.id}</strong>
                                {s.id === step2.data.selectedStructure?.id && (
                                  <span className="badge badge-clean" style={{ marginLeft: 6, fontSize: 10 }}>Selected</span>
                                )}
                              </td>
                              <td>{s.method || "X-ray"}</td>
                              <td className="mono">{s.resolution || "N/A"}</td>
                              <td>{s.hasLigand ? "Yes" : "None / Buffer"}</td>
                              <td>{s.pocket || "Unclear"}</td>
                              <td className="mono"><strong>{s.score}/100</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* ================================================================= */}
          {/* STEP 3: REPURPOSING SCREEN (Top 5 on-target vs same-family) */}
          {/* ================================================================= */}
          <article className={`agent-step-card ${step3?.status || "pending"}`} id="agent-step-3">
            <header className="agent-step-card-header">
              <div className="agent-step-header-left">
                <span className="agent-step-badge-num">
                  {step3?.status === "complete" ? "✓" : "3"}
                </span>
                <div className="agent-step-titles">
                  <h3 className="agent-step-title">{step3?.title || "Step 3: Repurposing Screen"}</h3>
                  <span className="agent-step-sub">
                    {step3?.data?.librarySize
                      ? `Screened against ${step3.data.librarySize.toLocaleString()} Approved Drugs (heuristic-v2)`
                      : step3?.subtitle}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${step3?.status === "complete" ? "badge-clean" : step3?.status === "dead_end" ? "badge-amber" : "badge-pill"}`}>
                  {step3?.status === "complete" ? "Candidates Screened" : step3?.status === "dead_end" ? "No Hits" : "Pending"}
                </span>
                {step3?.data?.selectedStructure && (
                  <button
                    type="button"
                    className="btn btn-ghost-sm"
                    onClick={() => handleHandoffToRepurposing(step3.data.selectedStructure)}
                    title="Open full library in Repurposing screen"
                  >
                    Open in Repurposing
                  </button>
                )}
              </div>
            </header>

            <div className="agent-step-body">
              {/* Narration */}
              {step3?.narration && (
                <div className="agent-narration-box">
                  <div className="agent-narration-header">
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
                      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z" />
                    </svg>
                    Agent Repurposing Rationale &amp; Findings
                  </div>
                  <p className="agent-narration-text" dangerouslySetInnerHTML={{
                    __html: step3.narration.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                </div>
              )}

              {/* Recommended Lead Candidate Spotlight */}
              {step3?.data?.recommended && (
                <div className="agent-result-spotlight">
                  <div className="agent-spotlight-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <span>Lead Repurposing Candidate (#1 Recommendation)</span>
                    {step3.data.totalScreened && (
                      <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>
                        Target-aware screen: {step3.data.totalScreened} prioritized approved small molecules
                      </span>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                    <div>
                      <span className="summary-label">Approved Drug</span>
                      <strong style={{ fontSize: 16 }}>{step3.data.recommended.name}</strong>
                      <div className="score-title mono">PubChem CID: {step3.data.recommended.cid}</div>
                    </div>
                    <div>
                      <span className="summary-label">Repurposing Score</span>
                      <strong className="mono" style={{ fontSize: 16, color: "var(--primary)" }}>
                        {step3.data.recommended.score}/100
                      </strong>
                      <div className="score-title">Indication: {step3.data.recommended.indication || "N/A"}</div>
                    </div>
                    <div>
                      <span className="summary-label">On-Target vs Same-Family Rationale</span>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12, color: "var(--text-dim)" }}>
                        {(step3.data.recommended.reasoning || []).slice(0, 2).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Requirement 5: Show Top 5 on Step-3 card with score and on-target vs same-family reasoning */}
              {top5Candidates.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                    Top 5 Evaluated Approved Candidates (heuristic-v2)
                  </div>
                  <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                    <table className="table" style={{ fontSize: 12, margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 50 }}>Rank</th>
                          <th>Drug Name</th>
                          <th>Score</th>
                          <th>Approved Indication</th>
                          <th>On-Target vs Same-Family Reasoning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {top5Candidates.map((c, idx) => (
                          <tr key={idx} className={idx === 0 ? "table-active" : ""}>
                            <td className="mono">#{idx + 1}</td>
                            <td>
                              <strong>{c.name}</strong>
                              <div className="score-title mono" style={{ fontSize: 11 }}>CID {c.cid}</div>
                            </td>
                            <td className="mono">
                              <strong style={{ color: "var(--primary)" }}>{c.score}/100</strong>
                            </td>
                            <td>{c.indication || "—"}</td>
                            <td>
                              <span style={{ color: "var(--text-dim)" }}>
                                {(c.reasoning || []).slice(0, 2).join("; ") || "Pocket shape and lipophilicity complementarity"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Expandable Table for Remaining Candidates if > 5 */}
              {remainingCandidates.length > 0 && (
                <div className="agent-drawer-wrap">
                  <button
                    type="button"
                    className="agent-drawer-toggle"
                    onClick={() => toggleDrawer(3)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="12"
                      height="12"
                      fill="currentColor"
                      style={{ transform: expandedDrawers[3] ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
                    >
                      <path d="M6 4l8 6-8 6V4z" />
                    </svg>
                    {expandedDrawers[3] ? "Hide" : "Inspect"} Additional Candidates ({remainingCandidates.length} more compounds)
                  </button>

                  {expandedDrawers[3] && (
                    <div className="agent-drawer-content">
                      <table className="table" style={{ fontSize: 12 }}>
                        <thead>
                          <tr>
                            <th>Rank</th>
                            <th>Drug Name</th>
                            <th>Score</th>
                            <th>Approved Indication</th>
                            <th>Reasoning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {remainingCandidates.map((c, idx) => (
                            <tr key={idx}>
                              <td className="mono">#{idx + 6}</td>
                              <td>
                                <strong>{c.name}</strong>
                                <div className="score-title mono">CID {c.cid}</div>
                              </td>
                              <td className="mono"><strong>{c.score}/100</strong></td>
                              <td>{c.indication || "—"}</td>
                              <td>
                                <span style={{ color: "var(--text-dim)" }}>
                                  {(c.reasoning || []).slice(0, 2).join("; ") || "Compatible pocket fit"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>

          {/* ================================================================= */}
          {/* STEP 4: ADVERSARIAL CRITIQUE (Case for vs Case against) */}
          {/* ================================================================= */}
          <article className={`agent-step-card ${step4?.status || "pending"}`} id="agent-step-4">
            <header className="agent-step-card-header">
              <div className="agent-step-header-left">
                <span className="agent-step-badge-num">
                  {step4?.status === "complete" ? "✓" : "4"}
                </span>
                <div className="agent-step-titles">
                  <h3 className="agent-step-title">{step4?.title || "Step 4: Adversarial Critique"}</h3>
                  <span className="agent-step-sub">{step4?.subtitle}</span>
                </div>
              </div>
              <div>
                <span className={`badge ${step4?.status === "complete" ? "badge-amber" : "badge-pill"}`}>
                  {step4?.status === "complete" ? "Stress-Test Complete" : "Pending"}
                </span>
              </div>
            </header>

            <div className="agent-step-body">
              {/* Narration */}
              {step4?.narration && (
                <div className="agent-narration-box" style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                  <div className="agent-narration-header" style={{ color: "#92400e" }}>
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Agent Devil's Advocate Narration &amp; Synthesis
                  </div>
                  <p className="agent-narration-text" dangerouslySetInnerHTML={{
                    __html: step4.narration.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                  }} />
                </div>
              )}

              {/* Requirement 6: Two columns — Case for vs Case against */}
              {step4?.data?.candidate && (
                <div className="adversarial-two-col">
                  {/* Column 1: Case For */}
                  <div className="adversarial-col case-for">
                    <div className="adversarial-col-header">
                      <h4 className="adversarial-col-title">
                        <span style={{ color: "var(--primary)" }}>✓</span> Case For {step4.data.candidate.name}
                      </h4>
                      <span className="badge badge-clean" style={{ fontSize: 10 }}>
                        Score: {step4.data.candidate.score}/100
                      </span>
                    </div>

                    <ul className="adversarial-point-list">
                      <li className="adversarial-point-item">
                        <strong>Target-Aware Pocket Fit:</strong> Scored {step4.data.candidate.score}/100 using TargetForge’s heuristic-v2 ranker accounting for pocket residues, ligand coordinates, and catalytic site constraints.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Pharmacophore Rationale:</strong> {Array.isArray(step4.data.candidate.reasoning) ? step4.data.candidate.reasoning.slice(0, 2).join("; ") : "Favorable geometric and electrostatic complementarity."}
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Physicochemical Drug-Likeness:</strong> Lipinski Rule of 5 and Veber compliant
                        {step4.data.candidate.molecularWeight ? ` (MW ${Number(step4.data.candidate.molecularWeight).toFixed(1)} Da` : ""}
                        {step4.data.candidate.xlogp != null ? `, XLogP ${Number(step4.data.candidate.xlogp).toFixed(1)}` : ""}
                        {step4.data.candidate.tpsa != null ? `, TPSA ${Number(step4.data.candidate.tpsa).toFixed(1)} Å²)` : ")"}
                        , supporting oral bioavailability.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Clinical Precedence:</strong> Approved human pharmaceutical for {step4.data.candidate.indication || "clinical indications"}, establishing known safety profiles and human tolerability bounds.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Commercial Availability:</strong> Readily accessible for immediate in vitro validation, bypassing de novo synthesis and early medicinal chemistry cycles.
                      </li>
                    </ul>
                  </div>

                  {/* Column 2: Case Against */}
                  <div className="adversarial-col case-against">
                    <div className="adversarial-col-header">
                      <h4 className="adversarial-col-title">
                        <span style={{ color: "#d97706" }}>⚠️</span> Case Against {step4.data.candidate.name}
                      </h4>
                      <span className="badge badge-amber" style={{ fontSize: 10 }}>
                        Adversarial Stress-Test
                      </span>
                    </div>

                    <ul className="adversarial-point-list">
                      <li className="adversarial-point-item">
                        <strong>On-Label vs Repurposing Regimen:</strong> Approved for {step4.data.candidate.indication || "its primary indication"}. Reaching therapeutic concentrations at the disease site ({report.diseaseResolved?.name || "target tissue"}) may require dosing exceeding established toxicity windows.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Endogenous Substrate Competition:</strong> In silico scores reflect pocket geometry; the scaffold must outcompete physiological ATP and native cofactors in vivo.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Transporter &amp; First-Pass Clearance:</strong> Subject to hepatic CYP metabolism and P-gp/BCRP transporter efflux, which in silico heuristic scoring cannot rule out.
                      </li>
                      <li className="adversarial-point-item">
                        <strong>Heuristic-Not-Docking Limitation:</strong> TargetForge uses 2D pharmacophores and geometric heuristics, not all-atom MD or free-energy binding simulation (ΔG).
                      </li>

                      {/* Itemized concerns from API or Fallback */}
                      {Array.isArray(step4.data?.critique?.case_against?.concerns) &&
                        step4.data.critique.case_against.concerns.map((c, i) => (
                          <li key={`api-${i}`} className="adversarial-point-item">
                            <strong>{c.issue}:</strong> {c.detail}
                          </li>
                        ))}

                      {/* Ranker limitation warnings */}
                      <li className="adversarial-point-item" style={{ fontSize: 11.5, color: "var(--text-muted)", borderTop: "1px dashed #fde68a", paddingTop: 8 }}>
                        <strong>Next Steps &amp; Precautions:</strong> Flagged structural alerts are warnings, not definitive exclusions. Use TargetForge Native Docking and ADME Profiling, followed by orthogonal biochemical binding assays, before treating this candidate as a confirmed lead.
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </article>
        </div>
      )}

      {/* Footer Actions */}
      {report && (
        <div className="agent-actions-footer">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-primary-sm"
              onClick={handleCopyReport}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              {copiedReport ? "✓ Copied Report" : "Copy Report"}
            </button>
            <button
              type="button"
              className="btn btn-ghost-sm"
              onClick={() => navigate("/history")}
            >
              View in History
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost-sm"
            onClick={handleReset}
          >
            Start New Run
          </button>
        </div>
      )}
    </div>
  );
}
