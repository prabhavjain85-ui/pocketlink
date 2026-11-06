import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import SeoHead from "./SeoHead";
import AnalyticsTracker from "./AnalyticsTracker";

export default function Layout() {
  return (
    <div className="app">
      <SeoHead />
      <AnalyticsTracker />
      <Header />
      <Outlet />
      <div className="footer-note">
        Structures from the <a href="https://www.rcsb.org" target="_blank" rel="noreferrer">RCSB Protein Data Bank</a>.
        Disease–target associations from the <a href="https://platform.opentargets.org" target="_blank" rel="noreferrer">Open Targets Platform</a>.
        Compound data from <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noreferrer">PubChem</a> (NCBI).
        Compound triage uses a knowledge-based heuristic score (curated target rules and literature knowledge), not a validated predictor of binding or clinical activity.
        In-browser molecular docking is under validation and currently unavailable — no docking poses or scores are shown.
        ADME descriptors are computed on the TargetForge backend via RDKit using established open rules (Lipinski, Veber, Ghose, Delaney ESOL, and the BOILED-Egg method).
        PAINS filters follow Baell &amp; Holloway as implemented in RDKit; they are computational interference flags, not proof of inactivity or toxicity.
        The approved-drug library is a curated public subset of marketed small molecules (PubChem CIDs), not a complete pharmacopeia.
      </div>
    </div>
  );
}
