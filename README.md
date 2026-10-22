# TargetForge

**TargetForge** is a computational drug discovery and repurposing workbench. It integrates genetic target identification, crystallographic structure selection, knowledge-based triage scoring (`heuristic-v2`), in-browser ADME profiling, native docking (enabled; poses under validation per `benchmark/docking/RESULTS.md`), and an autonomous research agent into a unified workflow.

---

## Application Navigation & Modules

TargetForge is structured across nine dedicated routes:

| Route | Module | Core Functionality |
| --- | --- | --- |
| `/` | **Staging Bench** | Search PDB structures, evaluate Target Selection Scores, search PubChem compounds, run PAINS/toxicophore screens, and rank candidates using `heuristic-v2`. |
| `/target-discovery` | **Target Discovery** | Query Open Targets GraphQL for genetically validated disease targets, ranked by Novelty Score versus known clinical drug saturation. |
| `/repurposing` | **Drug Repurposing Screen** | Screen a target against a library of 2,983 approved small-molecule drugs using knowledge-based triage rules and Lipinski/Veber filters (not a validated activity predictor). |
| `/adme` | **In-Browser ADME Profiling** | Calculate physicochemical descriptors, BOILED-Egg gastrointestinal and BBB permeation, ESOL aqueous solubility, Lipinski/Veber/Ghose rules, and organ toxicity alerts using client-side RDKit WASM. |
| `/docking` | **Molecular Docking** | Native docking when `DOCKING_ENABLED` is true. Co-crystal redocking quality is uneven — see `benchmark/docking/RESULTS.md`. |
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
- **PAINS Filters:** A small local regex catalogue in `painsCheck.js` (not the full RDKit PAINS set), plus optional server-side checks when configured.
- **Reactive Toxicophores:** Screening for reactive functional groups not covered by PAINS, including Michael acceptors, aliphatic aldehydes, epoxides, and alkyl halides.
- **Reporting:** Flagged compounds display actionable warnings and structural liability descriptions. Flagged molecules remain selectable, and alerts are factored into downstream candidate scoring as deductions rather than arbitrary exclusions.

### Station 3: Knowledge-Based Triage Score (`heuristic-v2`)
Scores 2–5 staged molecules for the selected PDB target:
- **Triage engine (`heuristic-v2`):** Target-class prioritisation: points for whether the drug's known pharmacological target matches the selected protein (curated rules), then drug-likeness from PubChem properties and structural-alert penalties. It does **not** compute pocket geometry or predict binding affinity. The integer is an ordinal prioritisation heuristic, not a probability of activity.
- **Pharmacological Rule Table:** Rules for EGFR, ABL1, BRAF, HER2, $\beta_2$-AR, COX-1/2, HMGCR, DPP4, HIV Protease, SARS-CoV-2 Mpro, PDE5, HDACs, etc. Typical tiers from `scoreOne`: on-target + co-crystal ligand name (75–99), on-target (55–79), same-family/demoted (12–36), broad family without gene rule (25–49), drug-likeness only (1–24); +20 co-crystal **name** match; −12/−8 alert penalties.
- **Deterministic Calibration:** Scores come from the local deterministic engine for reproducibility.
- **Optional LLM Reasoning:** When `OPENAI_API_KEY` is set, `/api/rank-candidates` may attach OpenAI plain-language notes; **scores and rank always stay on heuristic-v2**.
- **Isolation:** Scores are cached by `(PDB_ID, CID)`. A score computed against one target is never reused for another.
- **Workflow handoff:** ADME (`/adme`) and native docking (`/docking`) from Station 4 when enabled in `featureFlags.js`.

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
  2. Uses structure metadata (pocket labels, reference ligand MW) for library messaging — not for heuristic-v2 numeric triage, which uses target-class rules only.
  3. Scores the library via the local `heuristic-v2` engine in client-side batches.
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

## 5. Molecular Docking (`/docking`)

Native docking is **enabled** when `DOCKING_ENABLED` / `DOCKING_ENGINE_ENABLED` are true in `featureFlags.js`. Co-crystal redocking is still uneven for several benchmark pairs documented in `benchmark/docking/RESULTS.md` (e.g. high RMSD on some EGFR/HIV pairs). Treat poses as hypothesis-generating, not validated binding.

---

## 6. Autonomous Research Agent (`/agent`)

The Autonomous Research Agent automates multi-stage hypothesis exploration from a single research goal:

1. **Step 1 — Target Discovery:** Translates natural-language disease queries into Open Targets ontology records, evaluates biological association scores, and ranks genes by Novelty Score.
2. **Step 2 — Crystallographic Structure Selection:** Searches RCSB PDB for experimental structures matching the lead gene. Validates authentic drug-like small-molecule ligands and binding pockets, rejecting DNA/RNA complexes, crystal additives, and unliganded structures.
   - *Honest Dead-End Handling:* If the top target lacks a suitable structural pocket, the agent articulates the dead-end and pivots to the next candidate rather than fabricating false confidence.
3. **Step 3 — Target-Aware Repurposing Screen:** Ranks a shortlist of approved drugs with `heuristic-v2` (target-class rules + drug-likeness, not pocket geometry).
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
- **RDKit WebAssembly:** Client-side chemical informatics, descriptor generation, and substructure matching.
- **Approved Drug Pharmacopeia:** Bundled library of 2,983 approved therapeutics (`src/data/approvedDrugs.json`).
- **3Dmol.js:** WebGL-accelerated interactive 3D protein-ligand structural visualization.

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
