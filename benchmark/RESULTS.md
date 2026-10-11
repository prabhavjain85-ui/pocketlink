# TargetForge ranking benchmark — results

Generated: 2026-10-11T07:52:37.708Z

## Headline metrics (heuristic-v2 / Staging Bench engine)

| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |
| --- | --- | --- | --- | --- |
| Mean ROC-AUC | 1 | 0.50 | 0.678 | 0.506 |
| Top-1 hit rate | 100.0% | 37.1% | 60.0% | 28.6% |
| Top-3 hit rate | 100.0% | 81.5% | 90.0% | 57.1% |
| Mean active rank (↓ better) | 2 | 4.550 | 3.633 | 4.333 |
| Mean EF@20% | 2.700 | 1.00 | 1.350 | 0.778 |

## Per-target summary

| Target | PDB | N | Actives | ROC-AUC | Top-1 | Top-3 | Mean active rank | EF@20% | Top failure (if any) |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| EGFR | 1M17 | 9 | 3 | 1 | ✓ | ✓ | 2 | 3 | — |
| ABL1 | 1IEP | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| ERBB2 | 3PP0 | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| BRAF | 4XV2 | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| PTGS2 | 4COX | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| HMGCR | 1HWK | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| PDE5A | 1UDT | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| ESR1 | 3ERT | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| DPP4 | 1X70 | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |
| ADRB2 | 3SN6 | 8 | 3 | 1 | ✓ | ✓ | 2 | 2.667 | — |

## Honest limitations

- Small, hand-curated panel (10 targets, 30 actives, 60 decoys) — not a substitute for DUD-E or large-scale virtual screens.
- Decoys are other approved drugs, so all compounds are drug-like; separation is harder than vs random SMILES.
- Decoys were not property-matched to actives (MW/logP), so some baselines may look better or worse than in matched decoy sets.
- On-target labels come from primary indications / pharmacology tables encoded in TargetForge rules, not from fresh IC50 measurements.
- Co-crystal ligand identity bonuses can inflate scores for exact reference matches (e.g., erlotinib on 1M17).

## Pipeline coverage in this runner

- Scored with `rankCandidatesLocal` / `scoreOne` from `src/scoreCandidates.js` (source: heuristic-v2) — identical to local Staging Bench and repurposing batch numeric ranks.
- PAINS/toxicophore checks run via `checkPainsFast` on supplied SMILES (same patterns as the bench).
- OpenAI `/api/rank-candidates` reasoning is excluded so results stay deterministic and reproducible.
- RDKit WASM ADME (`admeCalculator.js`) and organ-toxicity flags are not combined into the 0–100 ranking score in production; they were not applied here.
- Native docking baseline uses `runMolecularDocking` (via `src/benchmark/dockingBench.test.js` + RDKit WASM) with searchExhaustiveness=4 and seeded Math.random per (PDB, CID).

## Notable mis-ranks (docking ΔG baseline)

- **EGFR (1M17)**: decoy **celecoxib** (ΔG -19.600 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **imatinib** (ΔG -18.110 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **sitagliptin** (ΔG -14.680 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **omeprazole** (ΔG -7.460 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **losartan** (ΔG -6.680 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **ABL1 (1IEP)**: decoy **losartan** (ΔG -20.520 kcal/mol) beat active **dasatinib** (ΔG -15.060)
- **ABL1 (1IEP)**: decoy **gefitinib** (ΔG -18.450 kcal/mol) beat active **dasatinib** (ΔG -15.060)
- **ABL1 (1IEP)**: decoy **dabrafenib** (ΔG -17.690 kcal/mol) beat active **dasatinib** (ΔG -15.060)

## Interpretation

On this 10-target panel, TargetForge's deterministic target-aware heuristic (30 labeled actives) achieved mean ROC-AUC 1 with top-1 hit rate 100.0% (37.1% expected by chance on these class priors). That near-perfect separation is expected: the benchmark labels are the same drug-name lists encoded in `TARGET_RULES`, so the test largely verifies lookup consistency rather than predictive binding. By contrast, the empirical docking baseline (mean ROC-AUC 0.506, top-1 28.6%) is only slightly better than chance on this small set and is **not** wired into the 0–100 Staging Bench score. RDKit ADME and organ-toxicity modules are likewise separate. For portfolio messaging, cite the heuristic panel result as "rule-table consistency on curated actives vs approved decoys," not as prospective virtual-screening accuracy.
