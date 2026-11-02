# TargetForge

**TargetForge** is a computational drug discovery and repurposing workbench. It integrates genetic target identification, crystallographic structure selection, knowledge-based triage scoring (`heuristic-v2`), in-browser ADME profiling, an in-browser docking module (currently disabled pending validation), and an autonomous research agent into a unified workflow.

---

## Application Navigation & Modules

TargetForge is structured across nine dedicated routes:

| Route | Module | Core Functionality |
| --- | --- | --- |
| `/` | **Staging Bench** | Search PDB structures, evaluate Target Selection Scores, search PubChem compounds, run PAINS/toxicophore screens, and rank candidates using `heuristic-v2`. |
| `/target-discovery` | **Target Discovery** | Query Open Targets GraphQL for genetically validated disease targets, ranked by Novelty Score versus known clinical drug saturation. |
| `/repurposing` | **Drug Repurposing Screen** | Screen a target against a library of 2,983 approved small-molecule drugs using knowledge-based triage rules and Lipinski/Veber filters (not a validated activity predictor). |
| `/adme` | **In-Browser ADME Profiling** | Calculate physicochemical descriptors, BOILED-Egg gastrointestinal and BBB permeation, ESOL aqueous solubility, Lipinski/Veber/Ghose rules, and organ toxicity alerts using client-side RDKit WASM. |
| `/docking` | **Molecular Docking (paused)** | In-browser docking is under validation and currently unavailable in the UI. Engine code remains in-repo behind `DOCKING_ENGINE_ENABLED`. |
| `/agent` | **Autonomous Research Agent** | Orchestrate an automated 4-step pipeline: Target Discovery $\rightarrow$ PDB Selection $\rightarrow$ Repurposing Screen $\rightarrow$ Adversarial Critique ("The Case Against"). |
| `/history` | **Session History** | Track and review past staging sessions, target discoveries, screening runs, agent investigations, and docking logs saved in persistent browser storage. |
| `/methodology` | **Scientific Methodology** | Detailed documentation of scoring equations, rule tables, heuristic bands, algorithmic thresholds, and literature citations. |
| `/contact` | **Contact & Inquiries** | Support and feedback form with multi-tier resilient delivery (Resend, Formspree, FormSubmit, and dry-run mode). |

---

## 1. Staging Bench (`/`)

The Staging Bench provides a multi-station workspace for evaluating specific protein-ligand pairs:

### Station 1: Target Selection Score (RCSB PDB)
Ranks crystallographic PDB entries to identify the most reliable experimental structure for computational analysis:
- **Scoring Engine:** Deterministic 100-point composite score based on experimental resolution ($\le 2.0$ Å optimal), structural completeness, presence of an authentic co-crystallized small-molecule ligand (excluding crystallization salts and cryoprotectants), binding pocket proximity (~5 Å), and experimental method (X-ray/cryo-EM).
- **Data Ingestion:** Batched from RCSB PDB (`data.rcsb.org/graphql` with REST fallback). Missing metrics display as `N/A` and contribute zero points.

### Station 2: PAINS and Toxicophore Screening
Screens chemical structures against recognized pan-assay interference and reactive chemotypes prior to ranking:
- **PAINS Filters:** Substructure pattern matching corresponding to `PAINS_A`, `PAINS_B`, and `PAINS_C` filter catalogs (Baell & Holloway).
- **Reactive Toxicophores:** Screening for reactive functional groups not covered by PAINS, including Michael acceptors, aliphatic aldehydes, epoxides, and alkyl halides.
- **Reporting:** Flagged compounds display actionable warnings and structural liability descriptions. Flagged molecules remain selectable, and alerts are factored into downstream candidate scoring as deductions rather than arbitrary exclusions.

### Station 3: Knowledge-Based Triage Score (`heuristic-v2`)
Scores 2–5 staged molecules specifically against the selected PDB target:
- **Triage engine (`heuristic-v2`):** A 0–100 knowledge-based triage score built from curated target rules and literature knowledge — not a validated predictor of binding or clinical activity. It evaluates target context (protein name, gene symbol, family classification, co-crystal ligand functional groups, and binding pocket size/hydrophobicity) alongside drug-likeness.
- **Pharmacological Rule Table:** Specific rules match recognized target genes and families (e.g., EGFR, ABL1, BRAF, HER2, $\beta_2$-AR, COX-1/2, HMGCR, DPP4, HIV Protease, SARS-CoV-2 Mpro, PDE5, HDACs) into calibrated score bands:
  - **On-target canonical chemotypes:** $\sim 67$ base points
  - **Same-family chemotypes:** $\sim 24$ base points
  - **Generic / off-target drug-like molecules:** $\sim 12$ base points
  - **Co-crystal ligand / pocket geometry match:** up to $+15$ bonus points
  - **Penalties:** Deductions for Lipinski/Veber rule violations and PAINS/toxicophore alerts.
- **Deterministic Calibration:** Numeric scores are governed by the local deterministic engine to ensure reproducibility across batches.
- **Optional LLM Reasoning:** When `OPENAI_API_KEY` is provided, `/api/rank-candidates` invokes OpenAI (`gpt-4o-mini` by default) to generate qualitative clinical reasoning, strengths, and concerns without overriding the baseline calibrated score scale. If the LLM is absent or encounters an error, the system seamlessly uses local rule-based reasoning.
- **Isolation:** Scores are cached by `(PDB_ID, CID)`. A score computed against one target is never reused for another.
- **Workflow handoff:** ADME profiling (`/adme`) is available from Station 4. In-browser docking (`/docking`) is disabled until redocking validation passes.

---

## 2. Target Discovery (`/target-discovery`)

The Target Discovery module identifies genetically supported yet underexplored therapeutic targets:

- **Open Targets GraphQL API:** Live queries to `https://api.platform.opentargets.org/api/v4/graphql`. Free-text disease searches resolve to EFO/MONDO ontology IDs and retrieve target associations across genetic, somatic, literature, and pathway data types.
- **Clinical Drug Saturation:** Tracks `target.drugAndClinicalCandidates.count` (the count of approved or clinical-stage drugs targeting the gene).
- **Novelty Score Formula:**
  $$\text{Biology Signal} = 0.50 \times \text{Genetic} + 0.12 \times \text{GenLit} + 0.12 \times \text{Somatic} + 0.10 \times \text{Overall} + 0.08 \times \text{Lit} + 0.05 \times \text{Pathway} + 0.03 \times \text{Animal} + 0.02 \times \text{RNA}$$
  $$\text{Novelty Score} = 100 \times \text{Biology Signal} \times \frac{1}{1 + \text{Drug Count}}$$
- **Descriptive Categorization:**
  - **Novelty Score:** $\ge 50$ ("high"), $20\text{--}49$ ("moderate"), $< 20$ ("low").
  - **Genetic Association:** $\ge 0.40$ ("strong"), $0.15\text{--}0.39$ ("moderate"), $< 0.15$ ("weak / none").
  - **Drug Count:** $0$ ("no approved drugs (underexplored)"), $1\text{--}2$ ("few drugs"), $\ge 3$ ("already has $N$ approved/pipeline drugs (not underexplored)").
- **Target Segmentation:** Separates candidates into **High Novelty Targets** (high biological association with minimal prior drug development) and **Established Targets** (extensively drugged controls).
- **Bench Handoff:** 1-click transition transfers the gene to the Staging Bench or Repurposing Screen to locate viable PDB structures.

---

## 3. Drug Repurposing Screen (`/repurposing`)

The Repurposing Screen evaluates existing approved therapeutics against any crystallographic PDB target:

- **Approved Drug Library:** Served from `public/data/approvedDrugs.json` (lazy-loaded at runtime, not in the main JS bundle), containing **2,983 approved small-molecule drugs** with SMILES, PubChem CIDs, indications, and physicochemical properties. `src/data/approvedDrugs.json` remains for scripts and tests.
- **Pre-Qualification Pipeline:**
  1. Filters out entries with missing SMILES, extreme molecular weight ($\text{MW} > 900\text{ g/mol}$), or severe drug-likeness failures ($\ge 5$ Lipinski/Veber violations).
  2. Evaluates pocket geometry (small, large, hydrophobic, hydrophilic) and reference ligand molecular weight.
  3. Pre-qualifies top candidates for deep scoring, while the remaining library is evaluated via the local `heuristic-v2` engine.
- **Client-Side Batching:** Shortlisted compounds are scored in client-side batches of 25 to respect the 30-second execution window of serverless functions.
- **24-Hour Snapshot Cache:** Results for each PDB structure are cached locally for 24 hours, preventing redundant calculations and minimizing serverless traffic.

---

## 4. In-Browser ADME Profiling (`/adme`)

The ADME module executes physicochemical and pharmacokinetic predictions entirely client-side using **RDKit WebAssembly**:

- **BOILED-Egg Passive Permeation:**
  - Calculates topological polar surface area ($\text{TPSA}$) and lipophilicity ($\text{cLogP} / \text{WLogP}$) against the mathematical rotated ellipses defined by Daina & Zoete (*ChemMedChem* 2016).
  - Classifies passive gastrointestinal absorption (HIA, "White") and blood-brain barrier penetration (BBB, "Yolk").
  - Includes clinical non-CNS borderline corrections for hydrophilic analgesics (e.g., Aspirin, Paracetamol) to prevent false-positive BBB classifications.
- **Delaney ESOL Aqueous Solubility:**
  - Computes aqueous solubility ($\text{LogS}$, mol/L and mg/mL) using the Delaney (2004) equation based on cLogP, molecular weight, rotatable bonds, and aromatic proportion.
- **Druglikeness Filters:**
  - **Lipinski's Rule of 5:** MW $\le 500$, cLogP $\le 5.0$, HBD $\le 5$, HBA $\le 10$.
  - **Veber Bioavailability Rules:** Rotatable bonds $\le 10$, TPSA $\le 140\text{ \AA}^2$.
  - **Ghose Filter:** MW $160\text{--}480$, cLogP $-0.4\text{ to }5.6$, MR $40\text{--}130$, total atoms $20\text{--}70$.
- **Pharmacokinetic Rules:**
  - **P-glycoprotein (P-gp) Substrate Liability:** Heuristic rule flagging molecules with $\text{MW} > 400$ and $(\text{N}+\text{O}) \ge 8$, or recognized large kinase inhibitor chemotypes.
  - **CYP Metabolic Risk:** Transparently labeled as **"CYP: not modeled"** rather than fabricating ungrounded 2D risk scores.
  - **Abbott Bioavailability Score:** Implements the Martin (2005) probability score ($0.55$ if Lipinski violations $\le 1$ and $\text{TPSA} \le 140\text{ \AA}^2$; $0.17$ otherwise).
- **Organ Toxicity Structural Alerts:**
  - RDKit SMARTS substructure screening for literature-curated toxicophores across drug-induced liver injury (DILI / quinone-imines / hydrazines / nitroaromatics), hERG cardiotoxicity (basic lipophilic amines / terfenadine-like pharmacophores), nephrotoxicity, and mutagenicity/carcinogenicity (ICH M7 alerts).

---

## 5. Molecular Docking (`/docking`) — validation paused

The in-browser docking engine (`src/dockingEngine.js`) is **disabled in the UI** (`DOCKING_ENGINE_ENABLED = false`) while co-crystal redocking validation is in progress. The Docking page shows: *Docking is under validation and currently unavailable.* No binding scores or poses are shown elsewhere in the app. Source code remains for future re-enable after validation.

---

## 6. Autonomous Research Agent (`/agent`)

The Autonomous Research Agent automates multi-stage hypothesis exploration from a single research goal:

1. **Step 1 — Target Discovery:** Translates natural-language disease queries into Open Targets ontology records, evaluates biological association scores, and ranks genes by Novelty Score.
2. **Step 2 — Crystallographic Structure Selection:** Searches RCSB PDB for experimental structures matching the lead gene. Validates authentic drug-like small-molecule ligands and binding pockets, rejecting DNA/RNA complexes, crystal additives, and unliganded structures.
   - *Honest Dead-End Handling:* If the top target lacks a suitable structural pocket, the agent articulates the dead-end and pivots to the next candidate rather than fabricating false confidence.
3. **Step 3 — Target-Aware Repurposing Screen:** Scores a targeted shortlist of approved drugs against the resolved binding site using `heuristic-v2`.
4. **Step 4 — Adversarial Critique ("The Case Against"):** Invokes Gemini AI (or OpenAI/heuristic fallback) to act as a devil's advocate against the top lead, probing for off-target liabilities, metabolic instability, resistance mutations, and formulation roadblocks.

---

## 7. History & Methodology

- **Session History (`/history`):** Maintains unified local storage of staging bench sessions, target discovery runs, repurposing results, docking simulations, and autonomous agent reports for auditability and session resumption.
- **Scientific Methodology (`/methodology`):** Detailed reference documenting scoring formulas, empirical constants, rule-table mappings, validation data, and scientific limitations across every subsystem.

---

## Environment Variables

TargetForge operates out-of-the-box with local deterministic models. Advanced AI reasoning and email delivery can be configured via environment variables:

| Variable | Required | Service | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Optional | OpenAI | Enables structured qualitative reasoning in `/api/rank-candidates` and fallback critique in `/api/adversarial-critique`. |
| `OPENAI_MODEL` | Optional | OpenAI | Model identifier for OpenAI calls (default: `gpt-4o-mini`). |
| `GEMINI_API_KEY` | Optional | Google Gemini | Primary model provider for the Step 4 Adversarial Critique in `/api/adversarial-critique`. |
| `GEMINI_MODEL` | Optional | Google Gemini | Model identifier for Gemini calls (default: `gemini-3.8-flash`). |
| `RESEND_API_KEY` | Optional | Resend | API key for transactional email delivery from `/api/contact`. |
| `CONTACT_TO_EMAIL` | Optional | Email | Destination email for contact form submissions (default: `prabhavjain85@gmail.com`). |
| `CONTACT_FROM_EMAIL`| Optional | Resend | Verified sender email header for Resend delivery. |
| `FORMSPREE_ID` | Optional | Formspree | Alternative form endpoint if Resend is not configured. |
| `CONTACT_DRY_RUN` | Optional | Contact API | Set to `1` or `true` to validate payloads without transmitting actual emails (default in local dev). |

*Note: If no email credentials are set, `/api/contact` safely routes submissions through FormSubmit with zero configuration required.*

---

## Live Data Sources & Infrastructure

- **RCSB Protein Data Bank:** Crystallographic structure models, resolution metrics, ligands, and pocket coordinates (`data.rcsb.org`).
- **Open Targets Platform:** Live GraphQL API for genetic associations, somatic mutations, and clinical drug pipelines (`api.platform.opentargets.org`).
- **PubChem PUG-REST:** Chemical structure records, 2D depictions, and compound property retrieval (`pubchem.ncbi.nlm.nih.gov`).
- **RDKit WebAssembly:** Server-side chemical informatics, descriptor generation, and substructure matching (the browser uses RDKit only to draw structures).
- **Approved Drug Pharmacopeia:** Library of 2,983 approved therapeutics (`public/data/approvedDrugs.json`).
- **3Dmol.js:** WebGL-accelerated interactive 3D protein-ligand structural visualization.

---

## Scoring: What Generalises and What Does Not

The curated target rules in `server/scoreCandidates.js` recognise compounds by **name**, so they award the 55-point on-target bonus only to drugs already listed in a rule. They say nothing about an unnamed or newly generated molecule.

`server/structuralSimilarity.js` adds the one target-specific signal that works for any molecule: Morgan fingerprint (radius 2, 2048-bit) Tanimoto similarity to the ligand co-crystallised in the staged PDB entry, fetched from the RCSB chemical-component record. It is continuous, so it also breaks the score ties the discrete bonuses produce.

- Named on-target drugs score exactly as before — similarity only fills in the target and ligand terms when the name lookup finds nothing.
- Similarity contributes at most 35 target points and 20 ligand points, ramping from Tanimoto 0.25 to 0.75. Resembling the bound ligand is deliberately weaker evidence than documented pharmacology.
- It is a 2D fingerprint comparison, not docking, and does not estimate binding.

`src/structuralSimilarity.test.js` includes a held-out check: the same compounds are scored with their names replaced, which removes the curated-rule signal entirely. Without similarity the known inhibitor is indistinguishable from an unrelated stimulant; with it, the co-crystal analogue is recovered without using its name.

Equally scored compounds now share a rank (`tiedWithPrevious`) instead of being ordered by the alphabetical accident of their compound id.

### Auditing the Target Selection Score

```bash
node scripts/audit-target-score-variance.mjs 150
```

Scores a sample of real PDB entries and reports how much each weighted axis varies. On a 150-entry sample, completeness (25 pts) and method (15 pts) together accounted for about 3.6% of the total spread — 40 of 100 points that barely separate structures — while ligand presence (20 pts) accounted for ~25%. Re-run it before changing the weights.

---

## Code Layout: UI in the Browser, Calculations on the Server

All scoring, screening and analysis code lives in `server/` and never ships to the browser. Create React App refuses to bundle files outside `src/`, so nothing in `server/` can leak into the production build by accident.

- `src/` — UI only. Pages call `src/serverApi.js`, which keeps the original function names (`searchPdbTargets`, `screenApprovedLibrary`, `runEvolutionCampaign`, …) but runs them on the server. `src/shared/` holds display-only constants and formatters (example compounds, chart geometry, colour tables); keep algorithms out of it.
- `api/compute.js` — one Vercel function that runs any allow-listed operation and streams progress callbacks back as newline-delimited JSON.
- `server/compute.js` — the allow-list. To expose a new calculation, add it here and a matching export in `src/serverApi.js`.
- `server/runtime.js` — lets server code `fetch("/api/...")` and `fetch("/data/...")` in-process.

Production builds set `GENERATE_SOURCEMAP=false`, so readable source is never published. Requires Node 22+ (see `engines` in `package.json`).

---

## Local Development

```bash
# Install dependencies
npm install

# Start local Vite development server
npm run dev

# Build production distribution
npm run build

# Run linting checks
npm run lint
```
