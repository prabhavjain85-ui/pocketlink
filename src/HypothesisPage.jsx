import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVE_HYPOTHESIS_KEY,
  evaluateHypothesisApi,
  generateHypothesisReport,
  parseHypothesisApi,
} from "./hypothesis/hypothesisService";
import EvidenceGraph from "./hypothesis/EvidenceGraph";
import EvidenceMatrixTable from "./hypothesis/EvidenceMatrixTable";
import ExperimentDesignerCard from "./hypothesis/ExperimentDesignerCard";
import FalsificationPanel from "./hypothesis/FalsificationPanel";
import ScientificDebatePanel from "./hypothesis/ScientificDebatePanel";
import StructuredParsingCard from "./hypothesis/StructuredParsingCard";
import {
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";

const EXAMPLE_HYPOTHESES = [
  {
    title: "IKKβ in Ulcerative Colitis",
    text: "IKKβ inhibition could be therapeutically useful in ulcerative colitis.",
    disease: "Ulcerative colitis",
    target: "IKKβ (IKBKB)",
    drug: "Small-molecule kinase inhibitor",
    mechanism: "Suppression of canonical NF-κB inflammatory signaling",
    patientPopulation: "Refractory active ulcerative colitis",
  },
  {
    title: "Metformin Repurposing in Cancer",
    text: "Metformin could be repurposed for cancer.",
    disease: "Solid tumors (breast, colorectal, prostate)",
    target: "Mitochondrial Complex I / AMPK (PRKAA1)",
    drug: "Metformin",
    mechanism: "Complex I inhibition → AMPK activation → mTORC1 suppression & systemic insulin lowering",
    patientPopulation: "Oncological adjuvant therapy",
  },
  {
    title: "TNF Inhibition in Rheumatoid Arthritis",
    text: "TNF inhibition should reduce inflammatory activity in rheumatoid arthritis.",
    disease: "Rheumatoid arthritis",
    target: "TNF-α (TNF)",
    drug: "Anti-TNF biologic antibody (Infliximab, Adalimumab)",
    mechanism: "Blockade of soluble & membrane TNF prevents synovial joint erosion and inflammation",
    patientPopulation: "Moderate-to-severe active rheumatoid arthritis",
  },
  {
    title: "PCSK9 in Hypercholesterolemia",
    text: "PCSK9 inhibition reduces LDL cholesterol and lowers cardiovascular event rates in high-risk patients.",
    disease: "Atherosclerotic cardiovascular disease & Familial hypercholesterolemia",
    target: "PCSK9",
    drug: "Evolocumab / Alirocumab (mAbs) or Inclisiran (siRNA)",
    mechanism: "Inhibition of PCSK9 prevents hepatic LDL receptor lysosomal degradation, accelerating LDL clearance",
    patientPopulation: "Patients with elevated LDL-C despite maximally tolerated statin therapy",
  },
];

export default function HypothesisPage() {
  // Input state
  const [hypothesisText, setHypothesisText] = useState("");
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [optionalDisease, setOptionalDisease] = useState("");
  const [optionalTarget, setOptionalTarget] = useState("");
  const [optionalDrug, setOptionalDrug] = useState("");
  const [optionalMechanism, setOptionalMechanism] = useState("");
  const [optionalPopulation, setOptionalPopulation] = useState("");

  // Investigation pipeline states
  const [isParsing, setIsParsing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [parsedHypothesis, setParsedHypothesis] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Export report modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Active view persistence
  useEffect(() => {
    const cached = getActiveState(ACTIVE_HYPOTHESIS_KEY);
    if (cached && cached.parsed) {
      setParsedHypothesis(cached.parsed);
      setHypothesisText(cached.hypothesisText || "");
      if (cached.evaluation) {
        setEvaluation(cached.evaluation);
      }
    }
  }, []);

  const handleSelectExample = (ex) => {
    setHypothesisText(ex.text);
    setOptionalDisease(ex.disease || "");
    setOptionalTarget(ex.target || "");
    setOptionalDrug(ex.drug || "");
    setOptionalMechanism(ex.mechanism || "");
    setOptionalPopulation(ex.patientPopulation || "");
    setShowOptionalFields(true);
    setParsedHypothesis(null);
    setEvaluation(null);
    setErrorMsg(null);
  };

  const handleTestHypothesis = async (e) => {
    if (e) e.preventDefault();
    if (!hypothesisText.trim()) {
      setErrorMsg("Please enter a scientific hypothesis to evaluate.");
      return;
    }

    setErrorMsg(null);
    setIsParsing(true);
    setEvaluation(null);

    try {
      const parsed = await parseHypothesisApi(hypothesisText, {
        disease: optionalDisease,
        target: optionalTarget,
        drug: optionalDrug,
        mechanism: optionalMechanism,
        patientPopulation: optionalPopulation,
      });

      setParsedHypothesis(parsed);
      setActiveState(ACTIVE_HYPOTHESIS_KEY, {
        hypothesisText,
        parsed,
        evaluation: null,
      });

      // Automatically scroll to parsed interpretation
      setTimeout(() => {
        const el = document.getElementById("structured-hypothesis-interpretation");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setErrorMsg("Failed to parse hypothesis: " + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleRunEvaluation = async () => {
    if (!parsedHypothesis) return;

    setErrorMsg(null);
    setIsEvaluating(true);

    try {
      const evalData = await evaluateHypothesisApi(parsedHypothesis);
      setEvaluation(evalData);

      setActiveState(ACTIVE_HYPOTHESIS_KEY, {
        hypothesisText,
        parsed: parsedHypothesis,
        evaluation: evalData,
      });

      // Save into TargetForge session history
      saveHistoryEntry({
        type: "hypothesis-eval",
        title: `${parsedHypothesis.target || "Target"} in ${parsedHypothesis.disease || "Disease"}`,
        summary: `Score: ${evalData?.decisionScore?.overall}/100 (${evalData?.decisionScore?.classification}). Verdict: ${evalData?.scientificVerdict?.recommendation}`,
        inputs: {
          hypothesis: hypothesisText,
          disease: parsedHypothesis.disease,
          target: parsedHypothesis.target,
        },
        snapshot: {
          parsed: parsedHypothesis,
          evaluation: evalData,
        },
      });

      // Scroll to evaluation results
      setTimeout(() => {
        const el = document.getElementById("hypothesis-evaluation-results");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 150);
    } catch (err) {
      setErrorMsg("Evaluation failed: " + err.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleReset = () => {
    setHypothesisText("");
    setOptionalDisease("");
    setOptionalTarget("");
    setOptionalDrug("");
    setOptionalMechanism("");
    setOptionalPopulation("");
    setParsedHypothesis(null);
    setEvaluation(null);
    setErrorMsg(null);
    setActiveState(ACTIVE_HYPOTHESIS_KEY, null);
  };

  const handleCopyReport = () => {
    const md = generateHypothesisReport(evaluation);
    if (!md) return;
    navigator.clipboard.writeText(md);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const getScoreColorClass = (score) => {
    if (score >= 80) return "score-band-high";
    if (score >= 60) return "score-band-promising";
    if (score >= 40) return "score-band-weak";
    return "score-band-low";
  };

  const getVerdictClass = (rec) => {
    if (String(rec).includes("ADVANCE") && !String(rec).includes("DO NOT")) return "verdict-advance";
    if (String(rec).includes("INVESTIGATE")) return "verdict-investigate";
    if (String(rec).includes("DO NOT")) return "verdict-reject";
    return "verdict-neutral";
  };

  const getCausalityBadgeClass = (cls) => {
    switch (cls) {
      case "STRONGLY SUPPORTED AS CAUSAL":
        return "causality-strong";
      case "PLAUSIBLY CAUSAL":
        return "causality-plausible";
      case "CORRELATIONAL":
        return "causality-correlational";
      case "CONTRADICTED":
        return "causality-contradicted";
      default:
        return "causality-uncertain";
    }
  };

  return (
    <div className="hypothesis-page-wrapper">
      {/* Platform Header / Hero Banner */}
      <div className="hypothesis-hero-banner">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            <span>AI SCIENTIFIC HYPOTHESIS TESTING ENGINE</span>
          </div>
          <h1 className="hero-title">Scientific Hypothesis Evaluator</h1>
          <p className="hero-description">
            Critically interrogate scientific and drug discovery hypotheses against empirical evidence. Evaluates biological plausibility, human genetics, cellular vs in-vivo models, clinical trial failure modes, pharmacokinetic exposure limits, and active counter-evidence.
          </p>
          <div className="hero-tenet-banner">
            <span className="tenet-chip">CORRELATION ≠ CAUSATION</span>
            <span className="tenet-separator">•</span>
            <span>Weighted Human Genetics &gt; Paper Counting</span>
            <span className="tenet-separator">•</span>
            <span>Active Contradiction &amp; Falsification Engine</span>
          </div>
        </div>
      </div>

      {/* Main Input Form Card */}
      <div className="hypothesis-input-card card">
        <form onSubmit={handleTestHypothesis}>
          <div className="form-group">
            <label htmlFor="input-hypothesis-text" className="hypothesis-input-label">
              <span>Enter your scientific hypothesis:</span>
              <span className="label-subtext">State proposed target, intervention, disease mechanism, or repurposing rationale</span>
            </label>
            <textarea
              id="input-hypothesis-text"
              rows={3}
              className="hypothesis-textarea"
              placeholder="Example: IKKβ inhibition could be an effective therapeutic strategy for ulcerative colitis."
              value={hypothesisText}
              onChange={(e) => setHypothesisText(e.target.value)}
            />
          </div>

          {/* Toggle Optional Context Fields */}
          <div className="optional-fields-toggle">
            <button
              type="button"
              className="btn-toggle-optional"
              onClick={() => setShowOptionalFields(!showOptionalFields)}
            >
              <span className="toggle-icon">{showOptionalFields ? "▼" : "▶"}</span>
              <span>{showOptionalFields ? "Hide optional specification fields" : "Add optional fields (Disease, Target, Drug, Mechanism, Population)"}</span>
            </button>
          </div>

          {showOptionalFields && (
            <div className="optional-fields-grid">
              <div className="form-group">
                <label className="field-sublabel" htmlFor="input-opt-disease">Disease:</label>
                <input
                  id="input-opt-disease"
                  type="text"
                  className="input-subfield"
                  placeholder="e.g. Ulcerative colitis"
                  value={optionalDisease}
                  onChange={(e) => setOptionalDisease(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="field-sublabel" htmlFor="input-opt-target">Target:</label>
                <input
                  id="input-opt-target"
                  type="text"
                  className="input-subfield"
                  placeholder="e.g. IKKβ / IKBKB"
                  value={optionalTarget}
                  onChange={(e) => setOptionalTarget(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="field-sublabel" htmlFor="input-opt-drug">Drug / Modality:</label>
                <input
                  id="input-opt-drug"
                  type="text"
                  className="input-subfield"
                  placeholder="e.g. BMS-345541 or Small molecule"
                  value={optionalDrug}
                  onChange={(e) => setOptionalDrug(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="field-sublabel" htmlFor="input-opt-mechanism">Mechanism:</label>
                <input
                  id="input-opt-mechanism"
                  type="text"
                  className="input-subfield"
                  placeholder="e.g. Blockade of canonical NF-κB nuclear translocation"
                  value={optionalMechanism}
                  onChange={(e) => setOptionalMechanism(e.target.value)}
                />
              </div>
              <div className="form-group full-width">
                <label className="field-sublabel" htmlFor="input-opt-population">Patient population:</label>
                <input
                  id="input-opt-population"
                  type="text"
                  className="input-subfield"
                  placeholder="e.g. Moderate-to-severe active refractory ulcerative colitis"
                  value={optionalPopulation}
                  onChange={(e) => setOptionalPopulation(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="input-action-bar">
            <button
              type="submit"
              id="btn-test-hypothesis"
              className="btn btn-primary btn-submit-hypothesis"
              disabled={isParsing || isEvaluating || !hypothesisText.trim()}
            >
              {isParsing ? (
                <>
                  <span className="spinner-inline" /> Deconstructing Statement...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM10 6v4M10 14h.01" />
                  </svg>
                  TEST HYPOTHESIS
                </>
              )}
            </button>

            {(hypothesisText || parsedHypothesis || evaluation) && (
              <button
                type="button"
                className="btn btn-secondary btn-reset-form"
                onClick={handleReset}
              >
                Reset
              </button>
            )}
          </div>
        </form>

        {/* Example Presets Row */}
        <div className="example-hypotheses-block">
          <span className="examples-header-label">Or load a landmark benchmark hypothesis:</span>
          <div className="examples-pill-list">
            {EXAMPLE_HYPOTHESES.map((ex, i) => (
              <button
                key={i}
                type="button"
                className="example-pill-btn"
                onClick={() => handleSelectExample(ex)}
                title={ex.text}
              >
                <span className="example-pill-icon">💡</span>
                <span className="example-pill-title">{ex.title}</span>
              </button>
            ))}
          </div>
        </div>

        {errorMsg && (
          <div className="hypothesis-error-banner" role="alert">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, flexShrink: 0 }}>
              <circle cx="10" cy="10" r="8" />
              <path d="M10 6v4M10 14h.01" />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* STEP: Structured Interpretation Display & Editor */}
      {parsedHypothesis && (
        <StructuredParsingCard
          parsed={parsedHypothesis}
          onChange={(up) => setParsedHypothesis(up)}
          onConfirm={handleRunEvaluation}
          isEvaluating={isEvaluating}
        />
      )}

      {/* FULL RESULTS SECTION */}
      {evaluation && (
        <div id="hypothesis-evaluation-results" className="hypothesis-results-container">
          {/* Top Bar: Action Buttons (Export, Print, Target handoff) */}
          <div className="results-top-action-bar">
            <div className="results-status-badge">
              <span className="status-dot-active" />
              <span>Evidence Investigation Complete</span>
            </div>
            <div className="results-action-buttons">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowExportModal(true)}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <path d="M4 16v1a2 2 0 002 2h8a2 2 0 002-2v-1M14 8l-4-4-4 4M10 4v12" />
                </svg>
                Export Full Report
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handlePrintReport}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <path d="M6 9V2h8v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h12a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h8v6H6v-6z" />
                </svg>
                Print
              </button>
            </div>
          </div>

          {/* Section 1: Hypothesis Statement */}
          <div className="result-section-card primary-hypothesis-card">
            <span className="section-step-badge">1. INVESTIGATED HYPOTHESIS</span>
            <blockquote className="hypothesis-quote-block">
              "{hypothesisText}"
            </blockquote>
          </div>

          {/* Section 3 & 4: Score + Scientific Verdict & Recommendation */}
          <div className="score-and-verdict-grid">
            {/* Decision Score Card */}
            <div className="result-section-card score-dashboard-card">
              <span className="section-step-badge">14. DECISION SCORE</span>
              <div className="overall-score-display">
                <div className={`score-circle ${getScoreColorClass(evaluation.decisionScore?.overall || 0)}`}>
                  <span className="score-number">{evaluation.decisionScore?.overall || 0}</span>
                  <span className="score-denominator">/ 100</span>
                </div>
                <div className="score-meta-block">
                  <h3 className="score-classification-title">
                    {evaluation.decisionScore?.classification}
                  </h3>
                  <span className="score-brand-label">TargetForge Evidence-Based Hypothesis Score</span>
                  <p className="score-disclaimer">
                    {evaluation.decisionScore?.note}
                  </p>
                </div>
              </div>

              {/* Subcomponent Breakdown Bars */}
              <div className="score-breakdown-container">
                <h4 className="breakdown-title">Multi-Factor Weighting Breakdown:</h4>
                <div className="breakdown-bars-list">
                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Biological Plausibility</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.biologicalPlausibility || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-plausibility" style={{ width: `${evaluation.decisionScore?.breakdown?.biologicalPlausibility || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Human Evidence (Genetics/Clinical)</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.humanEvidence || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-human" style={{ width: `${evaluation.decisionScore?.breakdown?.humanEvidence || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Causal Evidence</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.causalEvidence || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-causal" style={{ width: `${evaluation.decisionScore?.breakdown?.causalEvidence || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Pharmacological Feasibility</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.pharmacologicalFeasibility || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-pharma" style={{ width: `${evaluation.decisionScore?.breakdown?.pharmacologicalFeasibility || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Clinical Validation</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.clinicalValidation || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-clinical" style={{ width: `${evaluation.decisionScore?.breakdown?.clinicalValidation || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item">
                    <div className="bar-header">
                      <span>Safety &amp; Tolerability</span>
                      <span className="bar-val">{evaluation.decisionScore?.breakdown?.safety || 0}/100</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill fill-safety" style={{ width: `${evaluation.decisionScore?.breakdown?.safety || 0}%` }} />
                    </div>
                  </div>

                  <div className="breakdown-bar-item contradiction-penalty-bar">
                    <div className="bar-header">
                      <span>Contradictory Evidence Penalty</span>
                      <span className="bar-val font-semibold text-danger">
                        {evaluation.decisionScore?.breakdown?.contradictoryPenalty || 0} pts
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scientific Verdict Card */}
            <div className="result-section-card verdict-card">
              <span className="section-step-badge">15. FINAL SCIENTIFIC VERDICT</span>
              <div className="verdict-header">
                <div className={`verdict-recommendation-pill ${getVerdictClass(evaluation.scientificVerdict?.recommendation)}`}>
                  RECOMMENDATION: {evaluation.scientificVerdict?.recommendation}
                </div>
              </div>
              <p className="verdict-synthesis-text">
                {evaluation.scientificVerdict?.verdict}
              </p>
              <div className="verdict-rationale-box">
                <strong className="rationale-heading">Translational Rationale:</strong>
                <p className="rationale-body">{evaluation.scientificVerdict?.recommendationRationale}</p>
              </div>

              {/* Module Integration Shortcuts */}
              <div className="module-crosslink-card">
                <span className="crosslink-title">Connect with TargetForge Modules:</span>
                <div className="crosslink-buttons-row">
                  {parsedHypothesis.target && (
                    <Link
                      to={`/?q=${encodeURIComponent(parsedHypothesis.targetGene || parsedHypothesis.target)}`}
                      className="btn-crosslink"
                      title="Search target structures in PDB on Staging Bench"
                    >
                      <span className="crosslink-icon">🔬</span>
                      <span>Target in PDB Bench</span>
                    </Link>
                  )}
                  {parsedHypothesis.disease && (
                    <Link
                      to={`/target-discovery`}
                      className="btn-crosslink"
                      title="Explore Open Targets disease associations"
                    >
                      <span className="crosslink-icon">🎯</span>
                      <span>Target Discovery</span>
                    </Link>
                  )}
                  <Link
                    to="/repurposing"
                    className="btn-crosslink"
                    title="Screen 2,983 approved small molecules for this indication"
                  >
                    <span className="crosslink-icon">💊</span>
                    <span>Repurposing Screen</span>
                  </Link>
                  <Link
                    to="/adme"
                    className="btn-crosslink"
                    title="Run BOILED-Egg and toxicity alerts on candidate inhibitors"
                  >
                    <span className="crosslink-icon">🧪</span>
                    <span>ADME Predictor</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Causality Assessment */}
          <div className="result-section-card causality-assessment-card">
            <div className="causality-header-row">
              <div>
                <span className="section-step-badge">10. CAUSALITY ASSESSMENT</span>
                <h3 className="causality-title">
                  Target Association vs. Disease Modification
                </h3>
              </div>
              <div className={`causality-status-pill ${getCausalityBadgeClass(evaluation.causalityScore?.classification)}`}>
                {evaluation.causalityScore?.classification}
              </div>
            </div>

            <div className="causality-principle-banner">
              <span className="principle-highlight">MANDATORY SCIENTIFIC PRINCIPLE:</span>
              <span className="principle-text">
                CORRELATION ≠ CAUSATION. A target may be strongly elevated in disease tissue purely as an epiphenomenon or protective response. TargetForge explicitly differentiates "Target is associated with disease" from "Modulating the target therapeutically alters disease biology."
              </span>
            </div>

            <p className="causality-reasoning-body">
              {evaluation.causalityScore?.reasoning}
            </p>
          </div>

          {/* Section 5: Evidence Summary (5 Pillars: Biological Plausibility, Human Genetics, In Vitro, In Vivo, Clinical) */}
          <div className="result-section-card evidence-pillars-card">
            <span className="section-step-badge">PIPELINE STEPS 1–5 • EVIDENCE TIERS</span>
            <h3 className="pillars-section-title">Evidence Modality Breakdown</h3>

            <div className="evidence-pillars-grid">
              {/* Step 1: Biological Plausibility */}
              <div className="pillar-item">
                <div className="pillar-header">
                  <span className="pillar-num">Step 1</span>
                  <h4 className="pillar-name">Biological Plausibility</h4>
                  <span className="pillar-score-badge">{evaluation.biologicalPlausibility?.score || 0}/100</span>
                </div>
                <p className="pillar-content">{evaluation.biologicalPlausibility?.rationale}</p>
              </div>

              {/* Step 2: Human Genetic Evidence */}
              <div className="pillar-item">
                <div className="pillar-header">
                  <span className="pillar-num">Step 2</span>
                  <h4 className="pillar-name">Human Genetic Evidence</h4>
                  <span className={`pillar-tag tag-genetic-${(evaluation.humanGeneticEvidence?.classification || "").toLowerCase().replace(/\s+/g, "-")}`}>
                    {evaluation.humanGeneticEvidence?.classification}
                  </span>
                </div>
                <p className="pillar-content">{evaluation.humanGeneticEvidence?.summary}</p>
              </div>

              {/* Step 3: Cellular / In-Vitro Evidence */}
              <div className="pillar-item">
                <div className="pillar-header">
                  <span className="pillar-num">Step 3</span>
                  <h4 className="pillar-name">Cellular / In-Vitro Evidence</h4>
                  <span className="pillar-tag tag-cellular">GENETIC vs PHARMACOLOGICAL</span>
                </div>
                <div className="pillar-subfields">
                  <div className="subfield-block">
                    <span className="subfield-label">Genetic Perturbation (CRISPR/siRNA):</span>
                    <p className="subfield-text">{evaluation.cellularEvidence?.geneticPerturbation}</p>
                  </div>
                  <div className="subfield-block">
                    <span className="subfield-label">Pharmacological Perturbation:</span>
                    <p className="subfield-text">{evaluation.cellularEvidence?.pharmacologicalPerturbation}</p>
                  </div>
                </div>
              </div>

              {/* Step 4: Animal Evidence */}
              <div className="pillar-item">
                <div className="pillar-header">
                  <span className="pillar-num">Step 4</span>
                  <h4 className="pillar-name">Animal In-Vivo Evidence</h4>
                  <span className="pillar-tag tag-animal">ANIMAL ≠ HUMAN</span>
                </div>
                <p className="pillar-content">{evaluation.animalEvidence?.summary}</p>
              </div>

              {/* Step 5: Clinical Evidence & Failed Trial Root Causes */}
              <div className="pillar-item full-width-pillar">
                <div className="pillar-header">
                  <span className="pillar-num">Step 5</span>
                  <h4 className="pillar-name">Clinical Evidence &amp; Trial Failure Analysis</h4>
                  <span className="pillar-tag tag-clinical">CLINICAL TRIALS</span>
                </div>
                <div className="clinical-trials-list">
                  {(evaluation.clinicalEvidence?.trials || []).map((t, idx) => (
                    <div key={idx} className="trial-record-box">
                      <div className="trial-record-top">
                        <span className="trial-name">{t.title}</span>
                        <span className="trial-phase-badge">{t.phase}</span>
                        <span className={`trial-status-badge ${String(t.status).toLowerCase().includes("positive") ? "status-pos" : "status-neg"}`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="trial-failure-detail">
                        <strong>Root Cause Attribution:</strong> {t.failureCause} — {t.failureDetail}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="clinical-why-failed-summary">
                  <span className="summary-label">Translational Failure Mode Analysis:</span>
                  <p className="summary-body">{evaluation.clinicalEvidence?.whyFailedAnalysis}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 8: Contradiction Engine (Why This Hypothesis Might Be Wrong) */}
          <div className="result-section-card contradiction-engine-card">
            <div className="contradiction-header">
              <div className="contradiction-badge-wrap">
                <span className="contradiction-icon" aria-hidden="true">⚠️</span>
                <span className="contradiction-badge">CONTRADICTION ENGINE</span>
              </div>
              <h3 className="contradiction-title">Why This Hypothesis Might Be Wrong</h3>
              <p className="contradiction-subtitle">
                A rigorous scientific system must act as a skeptical devil's advocate. We actively search for negative genetic studies, compensatory pathway bypass, animal model discordance, and trial failures.
              </p>
            </div>

            <div className="contradictions-grid">
              {(evaluation.contradictionEngine?.whyMightBeWrong || []).map((item, idx) => (
                <div key={idx} className="contradiction-card-item">
                  <div className="contradiction-card-top">
                    <span className="contradiction-index">Liability #{idx + 1}</span>
                    <h4 className="contradiction-point-title">{item.point}</h4>
                  </div>
                  <p className="contradiction-detail-text">{item.detail}</p>
                  {item.source && (
                    <div className="contradiction-source">
                      <span className="source-label">Documented Source:</span> {item.source}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 6 & 7: Pharmacological Feasibility & Safety/Toxicology */}
          <div className="pharma-safety-grid">
            {/* Step 6: Pharmacological Feasibility */}
            <div className="result-section-card pharma-feasibility-card">
              <span className="section-step-badge">STEP 6 • PHARMACOLOGICAL FEASIBILITY</span>
              <h3 className="pharma-card-title">Target Modulation Exposure Cascade</h3>
              <p className="pharma-card-desc">
                Can clinically achievable drug concentrations engage the target in diseased tissue without exceeding safety margins?
              </p>

              <div className="exposure-cascade-box">
                <span className="cascade-label">Translational PK/PD Cascade:</span>
                <div className="cascade-flow">
                  {evaluation.pharmacologicalFeasibility?.cascade?.split("→").map((step, sIdx) => (
                    <span key={sIdx} className="cascade-step-pill">
                      {step.trim()}
                      {sIdx < evaluation.pharmacologicalFeasibility?.cascade?.split("→").length - 1 && " ➔ "}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pharma-metrics-list">
                <div className="pharma-metric-row">
                  <span className="metric-name">Potency &amp; In-Vitro Parameters:</span>
                  <span className="metric-val">{evaluation.pharmacologicalFeasibility?.ic50}</span>
                </div>
                <div className="pharma-metric-row">
                  <span className="metric-name">Exposure &amp; PK/PD Limits:</span>
                  <span className="metric-val">{evaluation.pharmacologicalFeasibility?.pkPdLimits}</span>
                </div>
                <div className="pharma-metric-row">
                  <span className="metric-name">Feasibility Assessment:</span>
                  <span className="metric-val font-semibold">{evaluation.pharmacologicalFeasibility?.status}</span>
                </div>
              </div>
            </div>

            {/* Step 7: Safety & Toxicology */}
            <div className="result-section-card safety-toxicology-card">
              <div className="safety-header-top">
                <div>
                  <span className="section-step-badge">STEP 7 • SAFETY &amp; TOXICOLOGY</span>
                  <h3 className="safety-card-title">Target Inhibition Safety Liabilities</h3>
                </div>
                <div className={`safety-concern-pill concern-${String(evaluation.safetyToxicology?.level || "moderate").toLowerCase()}`}>
                  CONCERN: {evaluation.safetyToxicology?.level}
                </div>
              </div>

              <p className="safety-rationale-text">
                {evaluation.safetyToxicology?.rationale}
              </p>

              <div className="safety-checklist">
                <div className="safety-check-item">
                  <span className="check-bullet">✓</span>
                  <span>Knockout phenotype &amp; essential physiological functions reviewed</span>
                </div>
                <div className="safety-check-item">
                  <span className="check-bullet">✓</span>
                  <span>Tissue expression &amp; barrier integrity dependencies evaluated</span>
                </div>
                <div className="safety-check-item">
                  <span className="check-bullet">✓</span>
                  <span>Systemic immune suppression &amp; infection liabilities accounted for</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 10: Competing Hypotheses Comparison */}
          {evaluation.competingHypotheses?.length > 0 && (
            <div className="result-section-card competing-hypotheses-card">
              <span className="section-step-badge">ALTERNATIVE EXPLANATIONS</span>
              <h3 className="competing-title">Competing Hypotheses &amp; Mechanistic Counter-Theories</h3>
              <p className="competing-subtitle">
                To prevent confirmation bias, TargetForge generates and contrasts competing biological explanations for the observed phenotype.
              </p>

              <div className="competing-table-wrap">
                <table className="competing-table">
                  <thead>
                    <tr>
                      <th style={{ width: "38%" }}>Alternative Hypothesis</th>
                      <th style={{ width: "32%" }}>Supporting Evidence</th>
                      <th style={{ width: "20%" }}>Known Gaps / Contradictions</th>
                      <th style={{ width: "10%" }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluation.competingHypotheses.map((alt, aIdx) => (
                      <tr key={aIdx}>
                        <td className="competing-cell-hypo">
                          <strong>{alt.hypothesis}</strong>
                        </td>
                        <td className="competing-cell-evidence">{alt.evidence}</td>
                        <td className="competing-cell-contra">{alt.contradictions}</td>
                        <td className="competing-cell-conf">
                          <span className={`badge-confidence-tag conf-${String(alt.confidence).toLowerCase().replace(/\s+/g, "-")}`}>
                            {alt.confidence}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 11: Knowledge Gaps Detection */}
          {evaluation.knowledgeGaps?.length > 0 && (
            <div className="result-section-card knowledge-gaps-card">
              <span className="section-step-badge">STEP 11 • UNANSWERED QUESTIONS</span>
              <h3 className="gaps-title">Critical Knowledge Gaps</h3>
              <p className="gaps-subtitle">
                Ranked uncertainties that currently prevent definitive validation of this therapeutic hypothesis.
              </p>

              <div className="gaps-list">
                {evaluation.knowledgeGaps.map((gap, gIdx) => (
                  <div key={gIdx} className={`gap-item rank-${String(gap.rank).toLowerCase()}`}>
                    <span className={`gap-rank-badge rank-${String(gap.rank).toLowerCase()}`}>
                      {gap.rank}
                    </span>
                    <span className="gap-text">{gap.gap}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 12: Experiment Designer */}
          <ExperimentDesignerCard experiments={evaluation.experiments} />

          {/* Section 13: Falsification Engine */}
          <FalsificationPanel criteria={evaluation.falsificationCriteria} />

          {/* Interactive Evidence Flow Graph */}
          {evaluation.evidenceGraph && (
            <EvidenceGraph
              graph={evaluation.evidenceGraph}
              parsed={parsedHypothesis}
              evaluation={evaluation}
            />
          )}

          {/* Section 9: Comprehensive Evidence Matrix Table */}
          <div className="result-section-card">
            <span className="section-step-badge">STEP 9 • INTERACTIVE EVIDENCE MATRIX</span>
            <h3 className="matrix-heading">Evidence Matrix &amp; Factual Citations</h3>
            <p className="matrix-subheading">
              Every scientific claim is systematically indexed with its evidence modality, direction, strength, human relevance, and primary source citation.
            </p>
            <EvidenceMatrixTable matrix={evaluation.evidenceMatrix} />
          </div>

          {/* AI Scientific Panel Debate */}
          <ScientificDebatePanel debate={evaluation.aiDebate} />
        </div>
      )}

      {/* Export Report Modal */}
      {showExportModal && evaluation && (
        <div className="export-modal-backdrop" onClick={() => setShowExportModal(false)}>
          <div className="export-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="export-modal-header">
              <div>
                <span className="modal-badge">STANDARDIZED REPORT</span>
                <h3 className="modal-title">TargetForge Scientific Hypothesis Report</h3>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowExportModal(false)}
                aria-label="Close export report dialog"
              >
                ✕
              </button>
            </div>

            <div className="export-modal-body">
              <p className="export-modal-instructions">
                Below is the formatted investigation report in Markdown format, ready for journal clubs, lab meetings, or research archives.
              </p>
              <textarea
                readOnly
                className="report-textarea"
                rows={18}
                value={generateHypothesisReport(evaluation)}
              />
            </div>

            <div className="export-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handlePrintReport}
              >
                Print / Save as PDF
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCopyReport}
              >
                {copiedReport ? "✓ Copied to Clipboard" : "Copy Markdown"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
