import React from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";

export default function Layout() {
  return (
    <div className="app">
      <Header />
      <Outlet />
      <div className="footer-note">
        Structures from the <a href="https://www.rcsb.org" target="_blank" rel="noreferrer">RCSB Protein Data Bank</a>.
        Compound data from <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noreferrer">PubChem</a> (NCBI).
        Docking via <a href="https://www.swissdock.ch" target="_blank" rel="noreferrer">SwissDock</a> and ADME
        prediction via <a href="https://www.swissadme.ch" target="_blank" rel="noreferrer">SwissADME</a> (SIB Swiss
        Institute of Bioinformatics) — both run on their own servers and are opened here, not embedded.
        PAINS filters follow Baell &amp; Holloway as implemented in RDKit; they are computational interference flags, not proof of inactivity or toxicity.
        The approved-drug library is a curated public subset of marketed small molecules (PubChem CIDs), not a complete pharmacopeia.
        AI output is computational prioritization only and should not be treated as evidence of biological activity or clinical efficacy.
      </div>
    </div>
  );
}
