import React, { useState, useEffect } from "react";
import SeoIntroLinks from "./SeoIntroLinks";

export default function MethodologyPage() {
  const [activeSection, setActiveSection] = useState("pdb-target-score");

  useEffect(() => {
    const handleScroll = () => {
      const sectionIds = [
        "staging-bench",
        "pdb-target-score",
        "pains-screening",
        "target-aware-scoring",
        "target-discovery",
        "repurposing-screen",
        "validation-benchmark",
        "adme-profiling",
        "research-agent",
        "molecule-local-search",
        "clinical-disclaimer",
      ];

      const scrollPosition = window.scrollY + 140;

      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i]);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setActiveSection(sectionIds[i]);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="methodology-container" id="methodology-page">
      {/* Page Header */}
      <div className="methodology-header-block" id="methodology-header">
        <div className="methodology-meta-tag">Scientific Methodology &amp; Validation Transparency</div>
        <h1 className="methodology-title">Evaluation Criteria, Computational Heuristics &amp; Operational Boundaries</h1>
        <p className="methodology-lead">
          TargetForge is an early-stage computational workbench designed to accelerate hit triage, structural evaluation,
          and hypothesis generation. This document details scoring criteria, cheminformatics rules, algorithmic design
          choices, and operational boundaries for computational drug discovery.
        </p>
        <SeoIntroLinks currentPath="/methodology" />
      </div>

      <div className="methodology-layout">
        {/* Sticky Table of Contents Sidebar */}
        <aside className="methodology-sidebar" id="methodology-sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-heading">Contents</div>
            <nav className="sidebar-nav" aria-label="Methodology sections">
              <button
                type="button"
                id="toc-link-staging-bench"
                className={`sidebar-link ${activeSection === "staging-bench" ? "active" : ""}`}
                onClick={() => scrollToSection("staging-bench")}
              >
                <span className="sidebar-num">00</span> Discovery Staging Bench
              </button>
              <button
                type="button"
                id="toc-link-pdb"
                className={`sidebar-link ${activeSection === "pdb-target-score" ? "active" : ""}`}
                onClick={() => scrollToSection("pdb-target-score")}
              >
                <span className="sidebar-num">01</span> PDB Target Selection
              </button>
              <button
                type="button"
                id="toc-link-pains"
                className={`sidebar-link ${activeSection === "pains-screening" ? "active" : ""}`}
                onClick={() => scrollToSection("pains-screening")}
              >
                <span className="sidebar-num">02</span> PAINS &amp; Toxicophores
              </button>
              <button
                type="button"
                id="toc-link-scoring"
                className={`sidebar-link ${activeSection === "target-aware-scoring" ? "active" : ""}`}
                onClick={() => scrollToSection("target-aware-scoring")}
              >
                <span className="sidebar-num">03</span> Target-Aware Ranking
              </button>
              <button
                type="button"
                id="toc-link-discovery"
                className={`sidebar-link ${activeSection === "target-discovery" ? "active" : ""}`}
                onClick={() => scrollToSection("target-discovery")}
              >
                <span className="sidebar-num">04</span> Discovery &amp; Novelty
              </button>
              <button
                type="button"
                id="toc-link-repurposing"
                className={`sidebar-link ${activeSection === "repurposing-screen" ? "active" : ""}`}
                onClick={() => scrollToSection("repurposing-screen")}
              >
                <span className="sidebar-num">05</span> Repurposing Screen
              </button>
              <button
                type="button"
                id="toc-link-validation"
                className={`sidebar-link ${activeSection === "validation-benchmark" ? "active" : ""}`}
                onClick={() => scrollToSection("validation-benchmark")}
              >
                <span className="sidebar-num">06</span> Validation Benchmark
              </button>
              <button
                type="button"
                id="toc-link-adme"
                className={`sidebar-link ${activeSection === "adme-profiling" ? "active" : ""}`}
                onClick={() => scrollToSection("adme-profiling")}
              >
                <span className="sidebar-num">08</span> ADME &amp; PK Profiling
              </button>
              <button
                type="button"
                id="toc-link-agent"
                className={`sidebar-link ${activeSection === "research-agent" ? "active" : ""}`}
                onClick={() => scrollToSection("research-agent")}
              >
                <span className="sidebar-num">09</span> Research Agent
              </button>
              <button
                type="button"
                id="toc-link-molecule-local-search"
                className={`sidebar-link ${activeSection === "molecule-local-search" ? "active" : ""}`}
                onClick={() => scrollToSection("molecule-local-search")}
              >
                <span className="sidebar-num">10</span> Local molecular search
              </button>
              <button
                type="button"
                id="toc-link-disclaimer"
                className={`sidebar-link ${activeSection === "clinical-disclaimer" ? "active" : ""}`}
                onClick={() => scrollToSection("clinical-disclaimer")}
              >
                <span className="sidebar-num">11</span> Clinical Disclaimer
              </button>
            </nav>

            <div className="sidebar-badge-card" id="sidebar-meta-card">
              <div className="sidebar-badge-title">Transparent Science</div>
              <p className="sidebar-badge-text">
                Every calculation is reproducible and traceable to published public databases (RCSB PDB, Open Targets, PubChem)
                or native in-browser RDKit WebAssembly cheminformatics routines.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Sections */}
        <main className="methodology-main" id="methodology-main-content">
          {/* Section 0: Discovery staging bench workflow */}
          <section className="methodology-section" id="staging-bench">
            <div className="section-eyebrow">Workflow Overview</div>
            <h2 className="section-title">Discovery Staging Bench</h2>
            <p className="section-text">
              The home screen (<strong>Run a screen</strong>) is a four-station pipeline for structure-based hit triage.
              Each station builds on the previous one; you can hand off to native docking and ADME when you are ready.
            </p>
            <ol className="methodology-staging-steps">
              <li>
                <strong>Station 1 — RCSB PDB target search.</strong> Stage a crystallographic structure with TargetForge&apos;s
                Target Selection Score (resolution, co-ligand, pocket geometry, completeness, and method).
              </li>
              <li>
                <strong>Station 2 — PubChem shortlist (up to five molecules).</strong> Search compounds one at a time, review
                Lipinski/Veber pre-checks and PAINS/toxicophore flags, and build a 2–5 molecule shortlist for ranking.
              </li>
              <li>
                <strong>Station 3 — AI prioritization.</strong> Score the shortlist for the <em>selected PDB</em> using pocket context,
                known pharmacology, drug-likeness, and PAINS deprioritization. Optional OpenAI narration when an API key is configured;
                otherwise TargetForge uses its built-in target-aware model. Adversarial critique is available for the top pick.
              </li>
              <li>
                <strong>Station 4 — ADME handoff (docking paused).</strong> Pick a compound and launch RDKit-based ADME profiling with
                the staged SMILES pre-filled. In-browser molecular docking is under validation and currently unavailable.
              </li>
            </ol>
            <p className="section-text">
              The <strong>One-click demo: EGFR screen</strong> on the homepage loads PDB <code>1M17</code> with imatinib and osimertinib
              so you can compare a weak vs strong EGFR binder without manual setup.
            </p>
          </section>

          {/* Section 1: PDB Target Selection Score */}
          <section className="methodology-section" id="pdb-target-score">
            <div className="section-eyebrow">Criterion 01</div>
            <h2 className="section-title">PDB Target Selection Score</h2>
            <p className="section-text">
              To conduct reliable structure-based screening, researchers must select a high-fidelity representative model
              from the Protein Data Bank (PDB). Not all PDB files are equally suited for virtual screening. TargetForge scores
              candidate crystal and cryo-EM structures on a normalized scale (0–100) based on five core structural criteria:
            </p>

            <div className="methodology-criteria-grid">
              <div className="criteria-card" id="card-criteria-resolution">
                <div className="criteria-header">
                  <span className="criteria-tag">Structural Metric</span>
                  <h3 className="criteria-title">Experimental Resolution</h3>
                </div>
                <p className="criteria-desc">
                  Atomic resolution indicates coordinate uncertainty. High-resolution structures (≤ 2.0 Å) provide precise
                  spatial coordinates for side chains and water networks, while structures worse than 3.0 Å have broader electron
                  density envelopes that obscure critical pocket contact points.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-ligand">
                <div className="criteria-header">
                  <span className="criteria-tag">Binding Site Metric</span>
                  <h3 className="criteria-title">Co-Crystallized Ligand</h3>
                </div>
                <p className="criteria-desc">
                  A structure crystallized with a bound small-molecule inhibitor confirms that the binding cavity is sterically
                  competent and captures the protein in a biologically relevant binding conformation (induced fit). Apo (unbound)
                  structures frequently exhibit collapsed or occluded active sites.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-pocket">
                <div className="criteria-header">
                  <span className="criteria-tag">Cavity Geometry</span>
                  <h3 className="criteria-title">Binding Pocket Detection</h3>
                </div>
                <p className="criteria-desc">
                  Identifies whether a defined cavity with suitable volume, depth, and hydrophobic surface area is present
                  to accommodate drug-like small molecules, rather than an undruggable flat protein surface.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-completeness">
                <div className="criteria-header">
                  <span className="criteria-tag">Integrity Check</span>
                  <h3 className="criteria-title">Structural Completeness</h3>
                </div>
                <p className="criteria-desc">
                  Penalizes structures with missing backbone residues, disordered flexible loops intersecting the binding cleft,
                  or artificial mutation artifacts that distort the native wild-type active site.
                </p>
              </div>

              <div className="criteria-card" id="card-criteria-method">
                <div className="criteria-header">
                  <span className="criteria-tag">Biophysical Origin</span>
                  <h3 className="criteria-title">Experimental Method</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates the experimental technique (X-ray diffraction, high-resolution Cryo-EM, or solution NMR). Static
                  crystallographic models provide rigid atomic coordinates ideal for geometry matching, whereas NMR conformational
                  ensembles require distinct multi-conformation handling.
                </p>
              </div>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-pdb">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                A high PDB Target Selection Score reflects crystallographic and geometric quality in the static experimental model.
                It cannot predict allosteric conformational switches, physiological pH variations, dynamic breathing motions,
                or post-translational modifications that may be absent in recombinant in vitro protein constructs.
              </p>
            </div>
          </section>

          {/* Section 2: PAINS & Toxicophores */}
          <section className="methodology-section" id="pains-screening">
            <div className="section-eyebrow">Criterion 02</div>
            <h2 className="section-title">PAINS &amp; Toxicophore Flagging</h2>
            <p className="section-text">
              Pan-Assay Interference Compounds (PAINS) are chemical structures that repeatedly yield false-positive readouts
              in biochemical screening assays. Instead of specifically binding to the target protein's pocket, these molecules
              often disrupt experiments through non-specific, artifactual mechanisms:
            </p>

            <ul className="methodology-bullet-list">
              <li>
                <strong>Covalent Reactivity:</strong> Compounds containing electrophilic warheads that react indiscriminately
                with nucleophilic protein residues (like cysteine thiol groups) rather than forming reversible non-covalent complexes.
              </li>
              <li>
                <strong>Redox Cycling:</strong> Molecules that generate hydrogen peroxide or free radicals in the assay buffer,
                causing artificial protein denaturation or fluorescent quenching.
              </li>
              <li>
                <strong>Colloidal Aggregation:</strong> Hydrophobic molecules that form sub-micromolar aggregates, sequestering
                target proteins non-specifically on their surface.
              </li>
              <li>
                <strong>Photochemical Interference:</strong> Chemotypes that fluoresce at the exact wavelengths used by standard
                optical detection assays, generating false readings.
              </li>
            </ul>

            <p className="section-text">
              TargetForge runs candidate SMILES structures against algorithmic substructure pattern matching based on established
              rules (including Baell &amp; Holloway filters) to flag liabilities early in the triage pipeline.
            </p>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-pains">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                PAINS flagging identifies known chemical motifs associated with assay promiscuity; a "Clean" result is not a guarantee
                of biological safety, selectivity, or non-toxicity in animals or humans. Importantly, a flagged substructure is
                <strong> not an automatic disqualifier</strong>. Multiple approved, effective pharmaceutical drugs contain motifs
                that trigger standard alerts (e.g., catecholamines, quinone-derived antibiotics, or rhodanine scaffolds). Flags
                are warnings for medicinal chemists to verify mechanism of action, not instant filters.
              </p>
            </div>
          </section>

          {/* Section 3: Target-Aware Compound Ranking (heuristic-v2) */}
          <section className="methodology-section" id="target-aware-scoring">
            <div className="section-eyebrow">Criterion 03</div>
            <h2 className="section-title">Knowledge-Based Triage Score (heuristic-v2)</h2>
            <p className="section-text">
              Conventional virtual screening tools often evaluate compounds solely through generic drug-likeness rules (such as Lipinski&apos;s
              Rule of Five). However, a molecule can be exceptionally &quot;drug-like&quot; in the abstract while having zero pharmacological
              relevance to the specific target pocket. TargetForge&apos;s 0–100 output is a <strong>knowledge-based triage score</strong> — a heuristic
              built from curated target rules and literature knowledge, not a validated activity or binding predictor. It is tagged programmatically
              as <code>source: &quot;heuristic-v2&quot;</code> and combines two distinct components:
            </p>

            <div className="scoring-tiers-grid">
              <div className="scoring-tier-box" id="tier-physicochemical">
                <div className="scoring-tier-num">Part 1</div>
                <h3 className="scoring-tier-title">Lipinski &amp; Veber Drug-Likeness</h3>
                <p className="scoring-tier-desc">
                  Evaluates 6 oral bioavailability parameters using trapezoidal scoring functions (up to ~24 points): Molecular Weight (≤ 500 Da),
                  calculated LogP (≤ 5.0), Hydrogen Bond Donors (≤ 5), Hydrogen Bond Acceptors (≤ 10), Rotatable Bonds (≤ 10), and Topological
                  Polar Surface Area (TPSA ≤ 140 Å²). This establishes baseline oral bioavailability feasibility.
                </p>
              </div>

              <div className="scoring-tier-box" id="tier-pharmacological">
                <div className="scoring-tier-num">Part 2</div>
                <h3 className="scoring-tier-title">Gene / PDB Target Rule Table</h3>
                <p className="scoring-tier-desc">
                  Maps the resolved target gene and PDB structure against curated pharmacological rules spanning major therapeutic classes:
                  EGFR, ABL1, BRAF, HER2, β2-AR (ADRB2), COX-1/2, HMGCR, DPP-4, HIV-1 Protease, SARS-CoV-2 Mpro, PDE5, HDAC, and Nuclear
                  Receptors (ER/ESR1). Differentiates on-target actives, same-family off-target analogs, and unrelated chemistries.
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "8px" }}>
                Score Bands &amp; Score Composition
              </h4>
              <p className="section-text">
                Candidate molecules are stratified into distinct score bands reflecting specific pharmacological evidence:
              </p>
              <ul className="methodology-bullet-list">
                <li>
                  <strong>On-Target (~67 points):</strong> Awarded when a compound has proven, established on-target clinical pharmacology
                  matching the resolved gene or PDB rule (+55 on-target bonus + ~12–18 drug-likeness points).
                </li>
                <li>
                  <strong>Same-Family (~24 points):</strong> Awarded when a compound shares the broad target class but is demoted due to
                  primary target divergence (+12 family bonus + ~12–16 drug-likeness points), such as testing an EGFR kinase inhibitor against ABL1.
                </li>
                <li>
                  <strong>Generic Drug-Like (~12 points):</strong> Assigned to drug-like small molecules with zero established target or class
                  relevance (+0 target bonus + ~12–18 drug-likeness points).
                </li>
                <li>
                  <strong>Optional Co-Crystal Name Bonus (+20 points):</strong> Awarded when a candidate directly matches the co-crystallized
                  reference ligand in the experimental PDB complex (e.g., STI-571 / Imatinib in PDB 2HYY), bringing the score to ~87.
                </li>
              </ul>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-scoring">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                The <code>heuristic-v2</code> scoring engine is a <strong>rule-based prioritization heuristic</strong>, not molecular docking,
                not a trained machine learning model, and not measured binding affinity. It does not predict free energy of binding (ΔG),
                equilibrium dissociation constants (Kd), or experimental IC50 values. Its output field is explicitly tagged as <code>source: &quot;heuristic-v2&quot;</code>.
              </p>
            </div>
          </section>

          {/* Section 4: Target Discovery / Novelty Scoring */}
          <section className="methodology-section" id="target-discovery">
            <div className="section-eyebrow">Criterion 04</div>
            <h2 className="section-title">Target Discovery &amp; Novelty Scoring</h2>
            <p className="section-text">
              The Target Discovery engine queries the Open Targets Platform to identify therapeutic targets, balancing causal genetic
              association against clinical landscape saturation:
            </p>

            <div className="discovery-columns">
              <div className="discovery-col" id="col-established-targets">
                <h4 className="col-heading">Established Targets (Pipeline Benchmarks)</h4>
                <p className="col-text">
                  Defined by <strong>drugCount ≥ 3</strong> and Open Targets association <strong>overallScore ≥ 0.4</strong>. These represent
                  clinically validated targets already addressed by approved therapies or late-stage trials, making them reliable structural
                  benchmarks with rich crystallographic models.
                </p>
              </div>
              <div className="discovery-col" id="col-novelty-metric">
                <h4 className="col-heading">Novelty Targets (First-in-Class Potential)</h4>
                <p className="col-text">
                  Targets with robust genetic or somatic evidence but little or no existing drug coverage (<strong>drugCount = 0</strong> or
                  few pipeline drugs). Highlighted as underexplored opportunities for first-in-class therapeutic development.
                </p>
              </div>
            </div>

            {/* Zero Associations & Anti-Hype Clarification */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Data Source Transparency &amp; Zero-Association Policy
              </h3>
              <p className="section-text">
                The sole data source for disease-target associations is the Open Targets Platform. A query returning <strong>0 associations</strong> means
                there is <strong>no Open Targets hit</strong> for that indication in public ontologies. It does <em>not</em> indicate a hidden or
                secret novel target.
              </p>
              <div style={{ background: "var(--surface-muted)", borderLeft: "3px solid var(--primary)", padding: "10px 14px", borderRadius: "0 6px 6px 0", fontSize: "13px", color: "var(--text)", marginBottom: 12 }}>
                <strong style={{ color: "var(--primary)", display: "block", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                  Anti-Hype Reporting Policy
                </strong>
                TargetForge strictly forbids synthetic promotional language. Targets with low novelty scores (e.g. 0.1/100) are explicitly labeled
                as low novelty, never &quot;high&quot;. Targets with multiple approved drugs are accurately identified as clinically saturated,
                never &quot;underexplored&quot;.
              </div>
            </div>

            {/* Gene Expression Specificity Subsection */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Gene Expression Context &amp; Physiological Selectivity
              </h3>
              <p className="section-text">
                Where a target is expressed in the human body directly influences therapeutic index. Narrow baseline tissue expression (GTEx v8)
                suggests favorable selectivity with lower risk of systemic on-target side effects, whereas ubiquitous expression across vital
                organs (heart, liver, CNS) signals mechanism-based toxicity risk.
              </p>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-discovery">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                Open Targets associations synthesize public genetic studies and literature text-mining. They do not capture confidential, unreleased
                biopharmaceutical pipelines. Furthermore, GTEx RNA expression data reflects healthy adult donors; diseased, inflamed, or
                malignant microenvironments frequently exhibit altered transcriptional levels or aberrant isoform expression.
              </p>
            </div>
          </section>

          {/* Section 5: Repurposing Screen */}
          <section className="methodology-section" id="repurposing-screen">
            <div className="section-eyebrow">Criterion 05</div>
            <h2 className="section-title">Systematic Repurposing Screen</h2>
            <p className="section-text">
              Drug repurposing explores new indications for already approved pharmaceutical agents with established human pharmacokinetic profiles,
              clinical safety records, and existing chemical manufacturing.
            </p>
            <p className="section-text">
              TargetForge evaluates approved small molecules against a selected PDB structure. Reliable scoring requires comprehensive
              protein context: <strong>target gene symbol</strong>, <strong>protein name</strong>, <strong>PDB ID</strong>, and <strong>co-crystallized ligand name</strong>.
              Evaluating compounds within a broad, generic &quot;kinase&quot; or &quot;GPCR&quot; family context collapses distinct targets together
              and destroys target selectivity. The <code>heuristic-v2</code> engine uses granular gene-level rules to prevent this collapse.
            </p>

            <div style={{ marginTop: "16px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                Screening Library Scope vs. Autonomous Agent Shortlist
              </h4>
              <p className="section-text">
                The dedicated Repurposing bench systematically evaluates an exhaustive library of over 2,900 approved small molecules.
                By contrast, the Autonomous Research Agent uses a curated shortlist (~25 prioritized compounds) during automated multi-step
                discovery runs to satisfy real-time latency and triaging constraints.
              </p>
            </div>

            {/* Clinical Safety Cross-Reference Subsection */}
            <div style={{ marginTop: 24, marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                Clinical Safety &amp; Post-Market Surveillance Cross-Reference (FAERS)
              </h3>
              <p className="section-text">
                Approved therapeutics come with documented human tolerability and safety surveillance. Cross-referencing adverse event records
                from the FDA Adverse Event Reporting System (FAERS) and boxed warnings provides real-world clinical tolerability context before
                advancing a candidate into secondary screening.
              </p>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-repurposing">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                Adverse event reports from public registries (FDA FAERS) are voluntary, spontaneous, and <strong>do not establish clinical causation</strong>.
                Reporting frequency correlates with commercial prescription volume and underlying disease severity. Furthermore, agent shortlist
                screens do not substitute for comprehensive chemical library screens.
              </p>
            </div>
          </section>

          {/* Section 6: Validation */}
          <section className="methodology-section" id="validation-benchmark">
            <div className="section-eyebrow">Criterion 06</div>
            <h2 className="section-title">Validation Status</h2>
            <p className="section-text">
              TargetForge reports validation outcomes honestly. The knowledge-based triage score is for computational prioritization only;
              it is not evidence of binding affinity, enzymatic inhibition, or clinical efficacy.
            </p>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Triage score (heuristic-v2)
            </h3>
            <ul className="methodology-bullet-list">
              <li>
                <strong>Circular first test (withdrawn):</strong> Early checks used known drugs that are explicitly encoded in the app&apos;s own
                target rule table (for example, comparing osimertinib vs imatinib on EGFR). Those drugs scored highly because the rules were written
                around them — this is not independent validation.
              </li>
              <li>
                <strong>Held-out drugs (not in rule table):</strong> On a set of approved molecules not encoded in the rules, the triage score
                reached ROC-AUC ~0.35 — no better than chance at separating actives from decoys.
              </li>
              <li>
                <strong>Rebuilt benchmark (in progress):</strong> A property-matched decoy benchmark is being rebuilt. So far only 3 of 15
                targets pass decoy sanity checks; where benchmarks exist, scores are near random (~0.48 AUC).
              </li>
            </ul>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              In-browser molecular docking
            </h3>
            <p className="section-text">
              Co-crystal redocking validation is in progress. The in-browser docking engine failed redocking on every target tested (in-place RMSD
              5.5–11.5 Å where a pose was returned; no valid pose on six targets). The engine remains in the repository but is disabled in the UI
              until it passes redocking — the Docking page shows: &quot;Docking is under validation and currently unavailable.&quot; No docking scores or
              poses are displayed in the app.
            </p>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 20, marginBottom: 8 }}>
              Predicted pose protein–ligand interactions
            </h3>
            <p className="section-text">
              The interaction view labels contacts inferred from the <strong>predicted docked pose</strong> (and optional offline demo JSON), not
              experimentally validated binding data. Binding-site residues are residues with any protein heavy atom within 4.5 Å of the ligand
              (extended 5.0 Å list shown for context). Contacts use PLIP/ProLIF-style geometric rules on the Fly.io Vina service and a matching
              client classifier: hydrogen bonds (donor–acceptor ≤ 3.5 Å; D–H···A ≥ 120° when polar hydrogens are present, otherwise
              &quot;distance-only&quot;), salt bridges (charged atom pairs ≤ 4.0 Å), hydrophobic C–C contacts (≤ 4.0 Å), π–π stacking (face-to-face or
              T-shaped centroid/normal criteria), cation–π (≤ 6.0 Å), and halogen bonds to N/O acceptors (≤ 4.0 Å). Where a co-crystal ligand is
              available, matching interaction types at the same residue may be flagged as consistent with the crystal pose.
            </p>
          </section>

          {/* Section 8: ADME & Pharmacokinetic Profiling */}
          <section className="methodology-section" id="adme-profiling">
            <div className="section-eyebrow">Criterion 08</div>
            <h2 className="section-title">ADME &amp; Pharmacokinetic Profiling</h2>
            <p className="section-text">
              Early attrition in drug discovery is predominantly driven by poor absorption, distribution, metabolism, and safety liabilities.
              TargetForge includes an in-browser ADME engine powered by native <strong>RDKit WebAssembly</strong>, allowing researchers to evaluate
              physicochemical properties and predictive pharmacokinetic filters directly on client hardware with zero server data transmission.
            </p>

            <div className="methodology-criteria-grid">
              <div className="criteria-card" id="criteria-druglikeness">
                <div className="criteria-header">
                  <span className="criteria-tag">Oral Filters</span>
                  <h3 className="criteria-title">Druglikeness Assessment</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates <strong>Lipinski Rule of 5</strong> (MW ≤ 500, cLogP ≤ 5, HBD ≤ 5, HBA ≤ 10), <strong>Veber rules</strong> (RotB ≤ 10,
                  TPSA ≤ 140 Å²), and the <strong>Ghose filter</strong> (MW 160–480, cLogP -0.4–5.6, MR 40–130, atoms 20–70).
                </p>
              </div>

              <div className="criteria-card" id="criteria-solubility">
                <div className="criteria-header">
                  <span className="criteria-tag">Delaney ESOL</span>
                  <h3 className="criteria-title">Aqueous Solubility Estimate</h3>
                </div>
                <p className="criteria-desc">
                  Computes estimated aqueous solubility (LogS, mol/L) via the Delaney (2004) equation based on molecular weight, rotatable bonds,
                  aromatic proportion, and Crippen lipophilicity. Classifies candidates from highly soluble to insoluble.
                </p>
              </div>

              <div className="criteria-card" id="criteria-boiled-egg">
                <div className="criteria-header">
                  <span className="criteria-tag">Passive Transport</span>
                  <h3 className="criteria-title">BOILED-Egg Permeation Model</h3>
                </div>
                <p className="criteria-desc">
                  Evaluates topological polar surface area (TPSA) versus lipophilicity (using Crippen atomic cLogP approximations labeled approximate)
                  to compute <strong>Passive HIA</strong> (Human Intestinal Absorption - the White) and <strong>Passive BBB</strong> (Blood-Brain
                  Barrier permeation - the Yolk).
                </p>
              </div>

              <div className="criteria-card" id="criteria-structural-alerts">
                <div className="criteria-header">
                  <span className="criteria-tag">SMARTS Alerts</span>
                  <h3 className="criteria-title">Structural Liabilities &amp; Organ Alerts</h3>
                </div>
                <p className="criteria-desc">
                  Identifies toxicophoric substructures using SMARTS pattern matching (e.g., reactive warheads, quinone-methides, troglitazone-like
                  thiazolidinediones, hERG pharmacophores, and DILI structural alerts).
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                Pharmacokinetic Scope &amp; Modeling Boundaries
              </h4>
              <ul className="methodology-bullet-list">
                <li>
                  <strong>Labels Must Say &quot;Passive&quot; and &quot;Estimate&quot;:</strong> All BOILED-Egg and solubility readouts represent
                  passive physicochemical estimates, not active transporter-mediated clearance.
                </li>
                <li>
                  <strong>P-glycoprotein (P-gp):</strong> Evaluated through a rule-based physicochemical heuristic (based on MW &gt; 400 and
                  N+O counts ≥ 8 or large TKI chemotypes), explicitly labeled as a heuristic estimate.
                </li>
                <li>
                  <strong>Cytochrome P450 (CYP):</strong> CYP isoform inhibition (CYP1A2, 2C9, 2C19, 2D6, 3A4) and metabolic stability are
                  <strong> not modeled</strong>. TargetForge reports <em>&quot;CYP: not modeled&quot;</em> rather than producing unverified guesses.
                </li>
                <li>
                  <strong>Structural Alerts vs. Clinical Tox:</strong> SMARTS structural alert matches are heuristic flags pointing to potential
                  mechanistic concerns; they do <strong>not</strong> represent clinical toxicity or in vivo animal toxicology findings.
                </li>
              </ul>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-adme">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                In-browser ADME descriptors are calculated directly from 2D molecular graphs. They do not simulate active influx/efflux transporters,
                phase I/II hepatic clearance, plasma protein binding, or clinical pharmacokinetics. All computed values are intended strictly for
                preliminary compound triage.
              </p>
            </div>
          </section>

          {/* Section 9: Autonomous Research Agent */}
          <section className="methodology-section" id="research-agent">
            <div className="section-eyebrow">Criterion 09</div>
            <h2 className="section-title">Autonomous Research Agent</h2>
            <p className="section-text">
              The Autonomous Research Agent executes an end-to-end computational investigation for a given disease indication by orchestrating
              four discrete, reproducible stages:
            </p>

            <div className="scoring-tiers-grid">
              <div className="scoring-tier-box" id="agent-stage-1">
                <div className="scoring-tier-num">Stage 1</div>
                <h3 className="scoring-tier-title">Disease Resolution &amp; Target Identification</h3>
                <p className="scoring-tier-desc">
                  Sanitizes input disease terms, maps them to the Open Targets ontology, queries causal genetic and clinical evidence, and
                  scores novelty and tractability across associated targets.
                </p>
              </div>

              <div className="scoring-tier-box" id="agent-stage-2">
                <div className="scoring-tier-num">Stage 2</div>
                <h3 className="scoring-tier-title">Target &amp; PDB Structure Selection</h3>
                <p className="scoring-tier-desc">
                  Searches RCSB PDB for high-resolution crystallographic coordinates. Prioritizes established/drugged targets with verified
                  hetero small-molecule co-crystal ligands and pocket geometry. The novelty list is not automatically chosen as the docking target.
                </p>
              </div>

              <div className="scoring-tier-box" id="agent-stage-3">
                <div className="scoring-tier-num">Stage 3</div>
                <h3 className="scoring-tier-title">Target-Aware Repurposing Screen</h3>
                <p className="scoring-tier-desc">
                  Screens candidate molecules against the resolved PDB and target rules using <code>heuristic-v2</code>. Ranks candidates
                  based on target-specific pharmacophores and oral drug-likeness.
                </p>
              </div>

              <div className="scoring-tier-box" id="agent-stage-4">
                <div className="scoring-tier-num">Stage 4</div>
                <h3 className="scoring-tier-title">Adversarial Scientific Critique</h3>
                <p className="scoring-tier-desc">
                  Subjects prioritized leads to rigorous counter-argumentation: safety liabilities, target expression specificity, potential
                  off-target liabilities, and structural limitations.
                </p>
              </div>
            </div>

            <div style={{ marginTop: "20px", marginBottom: "16px" }}>
              <h4 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--text)", marginBottom: "6px" }}>
                Target Selection Strategy, Honest Halts &amp; Narration Adjectives
              </h4>
              <ul className="methodology-bullet-list">
                <li>
                  <strong>Target Selection Priority:</strong> The agent intentionally prefers well-established targets (high Open Targets score,
                  drugCount ≥ 1) with high-quality ligand-bound PDB structures for repurposing screens. Novel targets lacking experimental
                  structures or druggable pockets are documented in the novelty portfolio rather than forced into docking.
                </li>
                <li>
                  <strong>Explicit Fail-Safe Halts:</strong> The agent is not an ungrounded literature summarizer. It immediately halts if the
                  disease cannot be resolved, if Open Targets returns 0 associations, if no ligand-bound PDB structure with a detectable binding
                  pocket exists, or if top repurposing scores fail to meet minimum discrimination thresholds (&lt; 15/100).
                </li>
                <li>
                  <strong>Numeric Adjective Consistency:</strong> Agent narration adjectives strictly reflect calculated metrics:
                  novelty is &quot;high&quot; (≥ 50), &quot;moderate&quot; (20–49), or &quot;low&quot; (&lt; 20); genetic association is &quot;strong&quot;
                  (≥ 40%), &quot;moderate&quot; (15–39%), or &quot;weak / none&quot; (&lt; 15%); drug coverage is &quot;no approved drugs (underexplored)&quot;
                  (0), &quot;few drugs&quot; (1–2), or &quot;already has N approved/pipeline drugs (not underexplored)&quot; (≥ 3).
                </li>
              </ul>
            </div>

            {/* Limitation Callout */}
            <div className="limitation-callout" id="limitation-agent">
              <div className="limitation-header">
                <svg className="limitation-icon" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span className="limitation-badge">Methodology Note &amp; Limitations</span>
              </div>
              <p className="limitation-body">
                The Autonomous Research Agent generates structured computational hypotheses grounded in public databases. It does not perform
                wet-lab validation, synthetic accessibility synthesis planning, or customized multi-target pharmacokinetic optimization.
              </p>
            </div>
          </section>

          {/* Section: Local molecular search */}
          <section className="methodology-section" id="molecule-local-search">
            <div className="section-eyebrow">Tools</div>
            <h2 className="section-title">Local search around a seed (drug-likeness &amp; synthesizability heuristics)</h2>
            <p>
              This workflow mutates a user-provided seed with a curated library of RDKit reaction SMARTS (no generative SMILES from language
              models). Survivors are chosen by multi-objective ranking plus fingerprint diversity picking. It is explicitly{" "}
              <strong>not</strong> target binding optimization: there is no docking or affinity term in the objective when no target is staged.
            </p>
            <ul className="methodology-bullet-list">
              <li>
                <strong>Similarity floor:</strong> Variants whose Morgan fingerprint (radius 2, 2048 bits) Tanimoto similarity to the seed falls
                below a configurable floor (default 0.4) are rejected before ranking.
              </li>
              <li>
                <strong>Protected substructure:</strong> By default the seed&apos;s Murcko scaffold (extracted with the same ring/linker rules as
                RDKit&apos;s Murcko framework) must remain intact; users may override with a custom SMARTS query.
              </li>
              <li>
                <strong>SA score:</strong> Ertl &amp; Schuffenhauer (2009) fragment-frequency synthetic accessibility on a hydrogen-stripped,
                canonicalized structure. It is a coarse complexity prior — not retrosynthesis, not purchasability.
              </li>
              <li>
                <strong>Diversity &amp; scaffolds:</strong> Survivors are selected with MaxMin or Butina-style leader picking to avoid near-duplicate
                fingerprints; unique Murcko bucket keys are tracked across generations for collapse monitoring.
              </li>
              <li>
                <strong>Goodhart chart:</strong> Each generation plots the best heuristic score together with mean seed similarity and PAINS alert
                counts so score gains that track falling similarity are visible.
              </li>
              <li>
                <strong>Repeat runs:</strong> Multiple independent RNG seeds report recurring survivors and run-to-run score spread. Offline
                retrosynthesis screening (e.g. AiZynthFinder) on the final top hits is a plausible follow-up but is not run in the browser.
              </li>
            </ul>
          </section>

          {/* Section 10: General Disclaimer */}
          <section className="methodology-section" id="clinical-disclaimer">
            <div className="section-eyebrow">Regulatory Notice &amp; Disclaimer</div>
            <h2 className="section-title">Scientific &amp; Clinical Research Disclaimer</h2>
            <div className="disclaimer-panel" id="disclaimer-box">
              <div className="disclaimer-header">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="disclaimer-title">Intended Use &amp; Limitations Notice</h3>
              </div>
              <div className="disclaimer-content">
                <p>
                  <strong>Hypothesis Generator Only:</strong> TargetForge is strictly an early-stage computational hypothesis generator and hit
                  triage research tool developed for exploratory, academic, and pre-screening workflows.
                </p>
                <p>
                  <strong>No Prescribing or Medical Advice:</strong> The scores, alerts, rankings, and structural assessments generated by this
                  platform do not constitute medical, pharmacological, or clinical advice. TargetForge must not be used to prescribe treatments,
                  guide clinical patient care, diagnose medical conditions, or inform off-label drug administration.
                </p>
                <p>
                  <strong>No Binding-Energy Claim:</strong> Heuristic ranking scores and rule points do not represent thermodynamic free energy
                  of binding (ΔG), equilibrium dissociation constants (Kd), or experimental inhibition potency (IC50).
                </p>
                <p>
                  All computational hypotheses prioritized by TargetForge require formal experimental confirmation, including biophysical binding assays
                  (SPR, ITC), in vitro enzymatic inhibition, cellular target engagement, and rigorous GLP ADMET evaluation conducted by qualified
                  scientific professionals.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
