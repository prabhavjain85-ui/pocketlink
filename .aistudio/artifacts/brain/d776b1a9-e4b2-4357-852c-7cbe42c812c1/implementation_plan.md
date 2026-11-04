# TargetForge Thin-Client Security Refactoring & Target Identification Upgrade

This plan transitions TargetForge into a strict thin-client architecture where all proprietary datasets, cheminformatics, scoring rules, and external scientific API integrations execute exclusively on the backend, while simultaneously upgrading the Target Identification and Structural Triage engine with granular Open Targets evidence profiles, Mechanism-of-Action (MoA) directionality matching, and AlphaFold DB pLDDT fallback support.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices were confirmed during Phase 1 clarification and govern the execution of Phases 2, 3, and 4:

- **Confirmed Decision 1 — Evidence Profile Selector Toggle**: The Target Identification workbench will expose an interactive profile toggle (`Novel Discovery` vs. `Repurposing`) so researchers can dynamically weight genetic/pathway evidence versus clinical/known-drug evidence on the server.
- **Confirmed Decision 2 — Automated AlphaFold DB Fallback with pLDDT Badge**: When no experimental RCSB PDB structure meets the backend quality threshold, the backend will automatically query AlphaFold DB (`v6` coordinates), compute binding-region `pLDDT` confidence, and stage the predicted model with a 4-tier confidence badge and disorder warning if applicable.
- **Confirmed Decision 3 — Server-Side RDKit 2D SVG Rendering**: Chemical 2D structure depictions will be rendered server-side via RDKit SVG generation (with a backend-proxied PubChem PNG fallback) so the browser never issues direct calls to PubChem.

---

## 1. Overview & Core Concept

- **What It Does**: Transforms the client application into a pure presentation layer that communicates exclusively with hardened backend compute routes via sanitized Data Transfer Objects (DTOs), while delivering a richer, scientifically rigorous Target Identification and 3D Structure Triage pipeline.
- **Target Audience / Persona**: Computational chemists, translational biologists, and academic drug discovery teams prioritizing disease targets, screening repurposing libraries, and staging structures for molecular docking.
- **Key Value**: Eliminates intellectual property leakage (curated compound libraries, scoring weights, BOILED-Egg ellipse geometry, thermodynamic constants, and LLM critique prompts) from the browser bundle and static web root, while preventing false-positive target/ligand matches through MoA directionality matching and automated AlphaFold structural fallback.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Target Identification & Evidence Profile Selection**: Users enter a disease or phenotype query and toggle between **Novel Discovery** (prioritizing genetic association, somatic mutations, RNA expression, and pathway perturbation while discounting broad known drugs) and **Repurposing** (prioritizing clinical precedent, tractability, and approved/clinical drug evidence). Results display sanitized composite scores, tractability modality indicators (`Small Molecule`, `Antibody`, `PROTAC`), safety liability alerts, and inferred **Expected MoA** (`Inhibitor` vs. `Activator`).
  2. **Structural Triage & AlphaFold Fallback**: Selecting a target triggers backend evaluation of experimental RCSB PDB entries (scoring resolution $< 2.5\text{ \AA}$, R-free factor, drug-like co-crystal ligand presence, and sequence coverage). If no experimental structure passes triage, the workbench automatically stages the canonical AlphaFold DB structure alongside its mean and binding-region `pLDDT` confidence rating (`Very High >90`, `Confident 70–90`, `Low 50–70`, `Very Low <50`).
  3. **Directionality-Aware Compound Shortlisting**: On the Discovery Staging Bench and Repurposing Screen, candidate compounds are evaluated on the backend against the target's `expectedMoA`. Inhibitors paired with a loss-of-function target requiring activation receive an explicit MoA mismatch penalty and warning label.
  4. **Server-Rendered 2D & 3D Molecular Inspection**: 2D chemical structures render from server-generated RDKit SVGs, and 3D Mol* crystal/AlphaFold structures load BinaryCIF/mmCIF coordinates through the backend proxy.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-contrast scientific workbench matching TargetForge's established publication-grade light theme.
  - *Color Palette & Mood*: Crisp laboratory slate canvas (`#F8FAFC`), white structural surfaces (`#FFFFFF`) with `1px solid #E2E8F0` hairline borders, deep navy headings (`#0F172A`), and calibrated teal (`#0F766E`) primary accents. AlphaFold `pLDDT` badges adhere to the canonical 4-band scale (`#0053D6` deep blue, `#65CBF3` light blue, `#FFDB13` yellow, `#FF7D45` orange).
  - *Typography & Hierarchy*: Clean sans-serif headings and prose paired with `font-mono tabular-nums` for all scores, $K_i$ estimates, resolution ($\text{\AA}$), R-free values, and accession identifiers.
  - *Component Styling & Layout*: Segmented filter controls for Evidence Profile selection, clean unboxed metadata separated by typographic mid-dots (`·`), and synchronized split-pane inspection cards.
- **Interactive Feedback & Motion**: Immediate loading skeletons during backend GraphQL/AlphaFold evaluation, smooth $150\text{ms}$ state transitions when switching evidence profiles, and clear epistemic provenance labels (`Experimentally Determined` vs. `AlphaFold Predicted Model`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Server-Only Data & Cheminformatics Consolidation**
  - *Chosen Approach*: Relocate all static compound libraries, SA calibration binaries, Lipinski/Veber evaluators, thermodynamic $K_i$ conversions, 3D interaction geometry builders, and RDKit loaders exclusively into the backend data and compute layer.
  - *Why*: Guarantees zero proprietary datasets or rule weights can be scraped from static URLs or reverse-engineered from minified client JavaScript bundles.
  - *Alternatives Considered*: Keeping basic Lipinski checks or PubChem image URLs in the browser for lower latency was rejected because it violates the thin-client boundary and leaks external queries from the user's browser.
- **Decision 2: Sanitized DTOs & Redacted Methodology Copy**
  - *Chosen Approach*: Strip raw rule tables, weight multipliers, `breakdown` sub-score objects, `datatypeScores` vectors, and `heuristic-v2` engine tags from API JSON payloads; return only final normalized scores, high-level category tiers, and human-readable rationale strings.
  - *Why*: Protects the exact mathematical parameterization of TargetForge's ranking and structural triage algorithms even when a user inspects browser network traffic.
  - *Alternatives Considered*: Filtering fields on the frontend still exposes the raw JSON in the Network tab.
- **Decision 3: Multi-Factor Structural Score + AlphaFold DB `v6` Integration**
  - *Chosen Approach*: Upgrade experimental PDB ranking to incorporate `rcsb_entry_info.resolution_combined`, `refine.ls_R_factor_R_free`, non-artifact ligand filtering, and sequence coverage, with automatic fallback to AlphaFold DB's `/api/prediction/{uniprotId}` endpoint when experimental quality falls below threshold.
  - *Why*: High-resolution crystal structures with low R-free and bound drug-like ligands provide superior docking pockets, while AlphaFold ensures proteome-wide coverage with transparent `pLDDT` confidence gating.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BROWSER (THIN PRESENTATION UI)                        │
│                                                                              │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐  │
│  │  Target Identification  │  │ Discovery Staging Bench │  │  3D Mol* &   │  │
│  │  • Profile Toggle UI    │  │ • Station 1-4 Cards     │  │  2D SVG View │  │
│  │  • Tractability/Safety  │  │ • MoA Alignment Alerts  │  │  • pLDDT HUD │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └──────┬───────┘  │
└───────────────┼────────────────────────────┼──────────────────────┼──────────┘
                │ POST /api/compute          │ POST /api/*          │
                ▼ (Strict CORS, Rate Limit, Request Validation)     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     BACKEND SERVER & API GATEWAY LAYER                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    DTO Sanitizer & Security Middleware                 │  │
│  │  • Origin allowlist check   • Per-IP rate limiter   • Schema validator │  │
│  │  • Strips raw weights, rule tables, system prompts & sub-score trees   │  │
│  └────────────┬────────────────────────────┬──────────────────────┬───────┘  │
│               ▼                            ▼                      ▼          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐  │
│  │ Upgraded Target Engine  │  │ Cheminformatics & Triage│  │ Proxy & 3D   │  │
│  │ • Open Targets v4 GQL   │  │ • Server RDKit (ADME,   │  │ Structure Svc│  │
│  │ • Novel vs Repurposing  │  │   PAINS, 2D SVG, Lip.)  │  │ • RCSB Search│  │
│  │ • MoA Directionality    │  │ • MoA-Aware Candidate   │  │   + R-free   │  │
│  │ • Tractability & Safety │  │   Scoring & Docking Ki  │  │ • AlphaFold  │  │
│  │                         │  │ • Private Drug Libraries│  │   v6 + pLDDT │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & DTO Strategy

- **Target Identification DTO (`TargetCandidateDTO`)**:
  - `ensemblId`, `symbol`, `name`, `uniprotId`
  - `overallScore` (0–100 integer), `evidenceProfile` (`"novel_discovery"` | `"repurposing"`), `evidenceTierLabel` (`"Strong Genetic Anchor"`, `"Clinical Precedent"`, etc.)
  - `expectedMoA`: `"inhibitor"` | `"activator"` | `"modulator"` (derived from Open Targets mechanism of action, genetic gain/loss-of-function annotations, and RNA expression directionality)
  - `tractabilitySummary`: `{ smallMolecule: boolean, antibody: boolean, protac: boolean, primaryLabel: string }`
  - `safetySummary`: `{ hasLiability: boolean, count: number, topEvents: string[] }`
  - *Stripped*: Raw `datatypeScores`, `datasourceScores`, and linear combination multipliers.
- **Structural Triage DTO (`StructureSelectionDTO`)**:
  - `structureId` (PDB ID or `AF-{UniProt}-F1`), `source` (`"RCSB_PDB"` | `"ALPHAFOLD_DB"`)
  - `qualityScore` (0–100), `qualityTier` (`"High Confidence Pocket"`, `"Moderate Experimental"`, `"Predicted AlphaFold Model"`)
  - `metricsSummary`: `{ resolutionAngstrom: number | null, rFree: number | null, hasDrugLikeLigand: boolean, ligandIds: string[], coveragePct: number, meanPlddt: number | null, pocketPlddt: number | null, plddtTier: string | null, disorderWarning: string | null }`
  - *Stripped*: Raw point breakdowns (`resolution`, `completeness`, `ligand`, `pocket`, `method` component weights).
- **Candidate Triage & ADME DTO (`ScoredCandidateDTO`)**:
  - `cid`, `name`, `smiles`, `structureSvg` (server-rendered 2D SVG)
  - `triageScore` (0–100), `confidenceTier`, `moaMatchStatus` (`"aligned"` | `"mismatch"` | `"neutral"`), `moaRationale`
  - `drugLikeness`: `{ lipinskiPass: boolean, veberPass: boolean, ghosePass: boolean, violationsCount: number, summaryLabel: string }`
  - *Stripped*: Internal `source: "heuristic-v2"`, raw rule bonus tables, BOILED-Egg ellipse parameters, and thermodynamic constants.

### Interactive Component & State Mapping

- **Evidence Profile Selector (Target Identification View)**: Switching between `Novel Discovery` and `Repurposing` dispatches a backend compute call with `profile: "novel_discovery" | "repurposing"`, re-ranking disease targets in real time and updating each target card's `expectedMoA` and tractability summary.
- **Stage Target & Structure Resolution (Station 1)**: Staging a target passes its `symbol`, `uniprotId`, and `expectedMoA` to the backend structural triage service. If experimental structures pass quality gating, the top PDB structure is staged; otherwise, the AlphaFold DB structure is auto-staged with its `pLDDT` confidence badge and coordinate stream proxied via the backend.
- **Compound Search, Shortlist & MoA Validation (Stations 2–4)**: Searching a compound name calls the backend PubChem proxy, returns server-computed Lipinski/Veber badges and 2D RDKit SVG depictions, and evaluates candidates against the staged target's `expectedMoA` and docking $K_i$ calculation on the server.
