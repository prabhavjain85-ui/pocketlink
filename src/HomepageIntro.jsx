import React from "react";
import { Link } from "react-router-dom";

const STEPS = [
  { n: "1", title: "Pick a protein target", detail: "RCSB PDB, gene, or disease handoff" },
  { n: "2", title: "Add 2–5 compounds", detail: "PubChem search & drug-likeness pre-check" },
  { n: "3", title: "Rank & follow up", detail: "Knowledge-based triage score, then ADME" },
];

export default function HomepageIntro({ onLoadDemo, onStartBlank, demoLoading }) {
  return (
    <div className="hero">
      <div className="hero-eyebrow">TargetForge · computational drug discovery</div>
      <h1>Rank compounds against a protein target — in minutes</h1>
      <p className="hero-lead">
        Stage a structure, shortlist molecules, and get a transparent, critiqued knowledge-based triage ranking
        before ADME follow-up (in-browser docking is under validation).
      </p>

      <div className="intro-actions intro-actions-primary">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onLoadDemo}
          disabled={demoLoading}
          aria-busy={demoLoading}
        >
          {demoLoading ? "Loading demo…" : "One-click demo: EGFR screen"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onStartBlank}>
          Start with a blank screen
        </button>
      </div>
      <p className="intro-demo-note">
        Stages EGFR (<span className="mono">1M17</span>), compares <strong>imatinib</strong> (weak on EGFR) with{" "}
        <strong>osimertinib</strong> (EGFR inhibitor), and runs the triage ranking — a quick portfolio walkthrough with no
        manual PDB search.
      </p>

      <h2 className="intro-section-title">How it works</h2>
      <ol className="intro-steps intro-steps-three" aria-label="How a screen works">
        {STEPS.map((step) => (
          <li key={step.n}>
            <span className="intro-step-n">{step.n}</span>
            <span>
              <strong>{step.title}</strong>
              <span className="intro-step-detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="intro-methodology-link">
        Station-by-station detail, scoring rules, and validation notes live on{" "}
        <Link to="/methodology#staging-bench">Methodology</Link>.
      </p>
    </div>
  );
}
