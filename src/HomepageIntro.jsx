import React from "react";
import SeoIntroLinks from "./SeoIntroLinks";

const AUDIENCES = [
  "Academic / student labs",
  "Biotech and CRO triage",
  "Hypothesis checks before wet-lab spend",
];

const STEPS = [
  { n: "1", title: "Stage a protein target", detail: "RCSB / gene / PDB" },
  { n: "2", title: "Shortlist up to 5 molecules", detail: "from PubChem" },
  { n: "3", title: "Compare drug-likeness and PAINS", detail: "then an AI ranking" },
  { n: "4", title: "Run docking and ADME", detail: "on the shortlist" },
];

export default function HomepageIntro({ onLoadDemo, onStartBlank, demoLoading }) {
  return (
    <div className="hero">
      <div className="hero-eyebrow">TargetForge · computational drug discovery</div>
      <h1>AI-Powered Drug Discovery &amp; Target Identification</h1>
      <p>
        TargetForge is an early-stage computational workbench for target identification, approved-drug
        repurposing, molecular docking, ADME triage, and hypothesis critique. Results help researchers
        prioritize follow-up. They are not experimental proof and not evidence of clinical efficacy.
      </p>

      <ul className="intro-audience" aria-label="Who TargetForge is for">
        {AUDIENCES.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>

      <ol className="intro-steps" aria-label="How a screen works">
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

      <div className="intro-actions">
        <button type="button" className="btn btn-primary" onClick={onLoadDemo} disabled={demoLoading}>
          {demoLoading ? "Loading demo…" : "Load demo: EGFR + imatinib"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onStartBlank}>
          Start with a blank screen
        </button>
      </div>
      <p className="intro-disclaimer">
        Docking scores, ADME flags, and AI rankings are computational estimates for prioritization only.
      </p>

      <h2>Discovery staging bench</h2>
      <p>
        Stage a protein target, shortlist up to five molecules from PubChem, compare drug-likeness and PAINS
        flags, and generate a transparent AI recommendation before running native molecular docking and ADME
        prediction.
      </p>
      <SeoIntroLinks currentPath="/" />
    </div>
  );
}
