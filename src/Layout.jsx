import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import SeoHead from "./SeoHead";

export default function Layout() {
  return (
    <div className="app">
      <SeoHead />
      <Header />
      <Outlet />
      <div className="footer-note">
        Structures from the <a href="https://www.rcsb.org" target="_blank" rel="noreferrer">RCSB Protein Data Bank</a>.
        Disease–target associations from the <a href="https://platform.opentargets.org" target="_blank" rel="noreferrer">Open Targets Platform</a>.
        Compound data from <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noreferrer">PubChem</a> (NCBI).
        Native molecular docking is computed locally in-browser using empirical binding free energy potentials and Monte Carlo pose minimization (AutoDock/Vina models) without external server dependencies.
        Native ADME prediction is computed locally in-browser via RDKit WebAssembly using established open rules (Lipinski, Veber, Ghose, Delaney ESOL, and the BOILED-Egg method) without external data transmission.
        PAINS filters follow Baell &amp; Holloway as implemented in RDKit; they are computational interference flags, not proof of inactivity or toxicity.
        The approved-drug library is a curated public subset of marketed small molecules (PubChem CIDs), not a complete pharmacopeia.
        AI output is computational prioritization only and should not be treated as evidence of biological activity or clinical efficacy.
      </div>
    </div>
  );
}
