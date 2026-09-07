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
    clearActiveState(ACTIVE_STATE_KEYS.AGENT);
    setReport(null);
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

  const handleExportBrief = () => {
    if (!report) return;
    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pocketlink_agent_${report.diseaseResolved?.id || "run"}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    if (!structure) return;
    setActiveState(ACTIVE_STATE_KEYS.REPURPOSING, {
      protein: structure,
    });
    navigate("/repurposing");
  };

  const step1 = report?.steps?.[1];
  const step2 = report?.steps?.[2];
  const step3 = report?.steps?.[3];
  const step4 = report?.steps?.[4];
  const exec = report?.executiveSummary;

  return (
    <div className="agent-page">
      {/* Hero Section */}
      <div className="hero">
        <div className="hero-eyebrow">
          PocketLink · Autonomous Research Agent
        </div>
        <h1>Autonomous Research Agent</h1>
        <p>
          State a therapeutic goal to automatically orchestrate disease-target discovery,
          crystallographic structure selection, approved-drug repurposing screening, and adversarial
          stress-testing in a single continuous pipeline.
        </p>
      </div>

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
              placeholder="e.g., Find repurposing candidates for pancreatic cancer"
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
                className="agent-btn-submit"
                disabled={!goalInput.trim()}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Pipeline
              </button>
            )}
          </div>

          {/* Example prompt pills */}
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

      {/* Progress Card (When Running or Steps in Progress) */}
      {isRunning && (
        <section className="agent-progress-card" aria-label="Pipeline Live Execution Tracker">
          <div className="agent-progress-header">
            <div className="agent-live-ticker">
              <span className="agent-spinner" aria-hidden="true" />
              <span>{progressMsg || "Processing pipeline stage..."}</span>
            </div>
            <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Step {currentStepNum} of 4
            </span>
          </div>

          <div className="agent-steps-stepper">
            {[
              { id: 1, name: "Target Discovery" },
              { id: 2, name: "PDB Selection" },
              { id: 3, name: "Repurposing Screen" },
              { id: 4, name: "Adversarial Critique" },
            ].map((st) => {
              const stepState = report?.steps?.[st.id]?.status || (currentStepNum === st.id ? "running" : "pending");
              return (
                <div key={st.id} className={`agent-stepper-item ${stepState}`}>
                  <span className="agent-stepper-num">
                    {stepState === "complete" ? "✓" : st.id}
                  </span>
                  <div className="agent-stepper-meta">
                    <span className="agent-stepper-name">{st.name}</span>
                    <span className="agent-stepper-status">
                      {stepState === "running" ? "Running…" : stepState === "complete" ? "Completed" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Executive Summary Banner (when run completes or report exists) */}
      {exec && (
        <section className="agent-exec-summary" aria-label="Executive Research Brief">
          <div className="agent-exec-header">
            <div className="agent-exec-title-group">
              <span className="agent-exec-eyebrow">Executive Research Brief · Autonomous Findings</span>
              <h2 className="agent-exec-title">
                {exec.disease} → {exec.targetSymbol}
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

          <p className="agent-exec-verdict">
            {exec.verdict}
          </p>

          <div className="agent-metrics-grid">
            <div className="agent-metric-card">
              <span className="agent-metric-label">Disease Resolved</span>
              <span className="agent-metric-value">{exec.disease}</span>
              <span className="agent-metric-sub">Open Targets Ontology</span>
            </div>

            <div className="agent-metric-card highlight">
              <span className="agent-metric-label">Target Selected</span>
              <span className="agent-metric-value">{exec.targetSymbol}</span>
              <span className="agent-metric-sub">
                {exec.pivotedFrom ? `Pivoted from ${exec.pivotedFrom}` : "Top Novelty Candidate"}
              </span>
            </div>

            <div className="agent-metric-card">
              <span className="agent-metric-label">Selected PDB</span>
              <span className="agent-metric-value mono">{exec.pdbId}</span>
              <span className="agent-metric-sub">
                Score: {exec.targetSelectionScore}/100 · {exec.pdbResolution}
              </span>
            </div>

            <div className="agent-metric-card highlight">
              <span className="agent-metric-label">Lead Approved Drug</span>
              <span className="agent-metric-value">{exec.leadDrugName}</span>
              <span className="agent-metric-sub">
                Score: {exec.repurposingScore}/100 (CID: {exec.leadDrugCid})
              </span>
            </div>

            <div className="agent-metric-card warning">
              <span className="agent-metric-label">Primary Risk</span>
              <span className="agent-metric-value" style={{ fontSize: 13, color: "#92400e" }}>
                {exec.keyConcern}
              </span>
              <span className="agent-metric-sub">Adversarial Stress-Test</span>
            </div>
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
                      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>
                        Novelty Score: <strong className="mono">{step1.data.primaryTarget.noveltyScore}/100</strong> · Approved Drugs: <strong className="mono">{step1.data.primaryTarget.drugCount ?? 0}</strong>
                      </div>
                    </div>

                    {step1.data.backupTarget && (
                      <div className="summary-item" style={{ background: "var(--surface-muted)", padding: 12, borderRadius: 6 }}>
                        <span className="summary-label">Contingency Backup Target</span>
                        <strong style={{ fontSize: 16 }}>{step1.data.backupTarget.symbol}</strong>
                        <div className="score-title">{step1.data.backupTarget.name}</div>
                        <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>
                          Novelty Score: <strong className="mono">{step1.data.backupTarget.noveltyScore}/100</strong> · Approved Drugs: <strong className="mono">{step1.data.backupTarget.drugCount ?? 0}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Expandable Table for Full Underlying Discovery Data */}
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
          {/* STEP 3: REPURPOSING SCREEN */}
          {/* ================================================================= */}
          <article className={`agent-step-card ${step3?.status || "pending"}`} id="agent-step-3">
            <header className="agent-step-card-header">
              <div className="agent-step-header-left">
                <span className="agent-step-badge-num">
                  {step3?.status === "complete" ? "✓" : "3"}
                </span>
                <div className="agent-step-titles">
                  <h3 className="agent-step-title">{step3?.title || "Step 3: Repurposing Screen"}</h3>
                  <span className="agent-step-sub">{step3?.subtitle}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${step3?.status === "complete" ? "badge-clean" : step3?.status === "dead_end" ? "badge-amber" : "badge-pill"}`}>
                  {step3?.status === "complete" ? "Candidate Screened" : step3?.status === "dead_end" ? "No Hits" : "Pending"}
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

              {/* Recommended Candidate Spotlight */}
              {step3?.data?.recommended && (
                <div className="agent-result-spotlight">
                  <div className="agent-spotlight-header">Top Repurposing Candidate (#1 Recommendation)</div>
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
                      <span className="summary-label">Target-Aware Rationale</span>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12, color: "var(--text-dim)" }}>
                        {(step3.data.recommended.reasoning || []).slice(0, 2).map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Expandable Table for Repurposing Leaderboard */}
              {Array.isArray(step3?.data?.ranking) && (
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
                    {expandedDrawers[3] ? "Hide" : "Inspect"} Repurposing Leaderboard ({step3.data.ranking.length} compounds)
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
                            <th>Key Computational Reasoning</th>
                          </tr>
                        </thead>
                        <tbody>
                          {step3.data.ranking.map((c, idx) => (
                            <tr key={idx} className={idx === 0 ? "table-active" : ""}>
                              <td className="mono">#{idx + 1}</td>
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
          {/* STEP 4: ADVERSARIAL CRITIQUE ("THE CASE AGAINST") */}
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

              {/* Itemized Adversarial Critique Card */}
              {step4?.data?.critique?.case_against && (
                <div className="adversarial-critique-panel" style={{ marginTop: 0 }}>
                  <div className="adversarial-critique-header">
                    <div className="adversarial-title-group">
                      <span className="adversarial-badge">Devil's Advocate Analysis</span>
                      <h4 className="adversarial-title">
                        The Case Against {step4.data.candidate?.name || "the Candidate"}
                      </h4>
                    </div>
                    <span className="adversarial-source-tag">
                      {step4.data.critique.source || "Gemini 3.8 Flash"}
                    </span>
                  </div>

                  <div className="adversarial-critique-body">
                    {step4.data.critique.case_against.overall_assessment && (
                      <p className="adversarial-overall-text">
                        {step4.data.critique.case_against.overall_assessment}
                      </p>
                    )}

                    {Array.isArray(step4.data.critique.case_against.concerns) && step4.data.critique.case_against.concerns.length > 0 && (
                      <>
                        <div className="adversarial-concerns-heading">Substantive Concerns &amp; Liabilities</div>
                        <div className="adversarial-concerns-list">
                          {step4.data.critique.case_against.concerns.map((c, i) => (
                            <div key={i} className="adversarial-concern-item">
                              <div className="adversarial-concern-header">
                                <span className="adversarial-issue-bullet" aria-hidden="true">⚠️</span>
                                <span className="adversarial-issue-title">{c.issue}</span>
                              </div>
                              <p className="adversarial-concern-detail">{c.detail}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="adversarial-footer">
                    <span className="adversarial-footnote">
                      Computational scores capture shape and lipophilicity matching, but biological efficacy requires overcoming selectivity traps, metabolism, and off-target toxicities.
                    </span>
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
              onClick={handleExportBrief}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Report JSON
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
