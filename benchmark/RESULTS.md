# TargetForge ranking benchmark — results

Generated: 2026-10-11T08:02:39.290Z

## In-rule (circular) — `validation_set.json`

Actives are drawn from the same drug-name lists encoded in `TARGET_RULES`; expect near-perfect separation.

### Headline metrics (heuristic-v2)

| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |
| --- | --- | --- | --- | --- |
| Mean ROC-AUC | 1 | 0.50 | 0.678 | 0.506 |
| Top-1 hit rate | 100.0% | 37.1% | 60.0% | 28.6% |
| Top-3 hit rate | 100.0% | 81.5% | 90.0% | 57.1% |
| Mean active rank (↓ better) | 2 | 4.550 | 3.633 | 4.333 |
| Mean EF@20% | 2.700 | 1.00 | 1.350 | 0.778 |

### Per-target summary

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

## Held-out (non-circular) — `heldout_set.json`

Actives are real inhibitors **not** present in `TARGET_RULES` / `KINASE_INHIBITOR_RE` / `GPCR_LIGAND_RE` (see `rule_audit` in JSON). Decoys are property-matched off-target drugs also absent from those lists.

### Headline metrics (heuristic-v2)

| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |
| --- | --- | --- | --- | --- |
| Mean ROC-AUC | 0.352 | 0.50 | 0.871 | 0.422 |
| Top-1 hit rate | 40.0% | 33.2% | 80.0% | 28.6% |
| Top-3 hit rate | 50.0% | 75.7% | 90.0% | 71.4% |
| Mean active rank (↓ better) | 5.642 | 5 | 2.775 | 4.333 |
| Mean EF@20% | 1.075 | 1.00 | 2.150 | 1.200 |

### Per-target summary

| Target | PDB | N | Actives | ROC-AUC | Top-1 | Top-3 | Mean active rank | EF@20% | Top failure (if any) |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| EGFR | 1M17 | 10 | 4 | 0.521 | ✓ | ✓ | 5.250 | 1.250 | — |
| ABL1 | 1IEP | 9 | 3 | 0 | ✗ | ✗ | 8 | 0 | spironolactone ranked #1 above radotinib |
| ERBB2 | 3PP0 | 9 | 3 | 0 | ✗ | ✗ | 8 | 0 | venlafaxine ranked #1 above poziotinib |
| BRAF | 4XV2 | 9 | 3 | 0.167 | ✗ | ✗ | 7 | 0 | metronidazole ranked #1 above lifirafenib |
| PTGS2 | 4COX | 9 | 3 | 0.944 | ✓ | ✓ | 2 | 3 | — |
| HMGCR | 1HWK | 8 | 2 | 0.417 | ✗ | ✓ | 4.500 | 2 | omeprazole ranked #1 above mevastatin |
| PDE5A | 1UDT | 9 | 3 | 0.167 | ✗ | ✗ | 7 | 0 | levofloxacin ranked #1 above lodenafil |
| ESR1 | 3ERT | 9 | 3 | 0.167 | ✗ | ✗ | 7 | 0 | levofloxacin ranked #1 above lasofoxifene |
| DPP4 | 1X70 | 9 | 3 | 0.583 | ✓ | ✓ | 4 | 1.500 | — |
| ADRB2 | 3SN6 | 9 | 3 | 0.556 | ✓ | ✓ | 3.667 | 3 | — |

### Suggested honest one-line claim (CV / site)

> Target-aware ranking separates FDA-listed on-target drugs from off-target decoys for rule-covered targets (in-rule top-1 100.0%); on held-out inhibitors absent from the rule tables, enrichment is modest (ROC-AUC 0.352, top-1 40.0%) and should be paired with docking/assays.

## Honest limitations

- Small, hand-curated panels — not a substitute for DUD-E or large-scale virtual screens.
- In-rule actives mirror `TARGET_RULES` lists (circular); held-out actives are verified absent from those lists via `benchmark/auditRuleLists.mjs`.
- Held-out decoys are property-matched (MW, logP, HBD/HBA, rotatable bonds) but not full DUD-E decoy sets.
- Potency labels come from ChEMBL / literature citations in `heldout_set.json`, not re-measured in this run.
- Co-crystal ligand bonuses still apply when PDB titles mention rule-list drugs (e.g., erlotinib on 1M17).

## Pipeline coverage in this runner

- Scored with `rankCandidatesLocal` / `scoreOne` from `src/scoreCandidates.js` (source: heuristic-v2) — identical to local Staging Bench and repurposing batch numeric ranks.
- PAINS/toxicophore checks run via `checkPainsFast` on supplied SMILES (same patterns as the bench).
- OpenAI `/api/rank-candidates` reasoning is excluded so results stay deterministic and reproducible.
- RDKit WASM ADME (`admeCalculator.js`) and organ-toxicity flags are not combined into the 0–100 ranking score in production; they were not applied here.
- Native docking baseline uses `runMolecularDocking` (via `src/benchmark/dockingBench.test.js` + RDKit WASM) with searchExhaustiveness=4 and seeded Math.random per (PDB, CID).

## Held-out mis-ranks (heuristic-v2)

- **ABL1 (1IEP)**: spironolactone (#1, score 24) ranked above radotinib (score 17)
- **ABL1 (1IEP)**: ezetimibe (#2, score 23) ranked above radotinib (score 17)
- **ABL1 (1IEP)**: donepezil (#3, score 23) ranked above radotinib (score 17)
- **ERBB2 (3PP0)**: venlafaxine (#1, score 24) ranked above poziotinib (score 18)
- **ERBB2 (3PP0)**: tramadol (#2, score 24) ranked above poziotinib (score 18)
- **ERBB2 (3PP0)**: fluoxetine (#3, score 23) ranked above poziotinib (score 18)
- **BRAF (4XV2)**: metronidazole (#1, score 24) ranked above lifirafenib (score 22)
- **BRAF (4XV2)**: clopidogrel (#2, score 24) ranked above lifirafenib (score 22)
- **BRAF (4XV2)**: levofloxacin (#3, score 23) ranked above lifirafenib (score 22)
- **HMGCR (1HWK)**: omeprazole (#1, score 24) ranked above mevastatin (score 23)
- **PDE5A (1UDT)**: levofloxacin (#1, score 23) ranked above lodenafil (score 16)
- **PDE5A (1UDT)**: furosemide (#2, score 23) ranked above lodenafil (score 16)

## Notable mis-ranks (docking ΔG baseline, in-rule panel)

- **EGFR (1M17)**: decoy **celecoxib** (ΔG -19.600 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **imatinib** (ΔG -18.110 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **sitagliptin** (ΔG -14.680 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **omeprazole** (ΔG -7.460 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **EGFR (1M17)**: decoy **losartan** (ΔG -6.680 kcal/mol) beat active **gefitinib** (ΔG -5.800)
- **ABL1 (1IEP)**: decoy **losartan** (ΔG -20.520 kcal/mol) beat active **dasatinib** (ΔG -15.060)
- **ABL1 (1IEP)**: decoy **gefitinib** (ΔG -18.450 kcal/mol) beat active **dasatinib** (ΔG -15.060)
- **ABL1 (1IEP)**: decoy **dabrafenib** (ΔG -17.690 kcal/mol) beat active **dasatinib** (ΔG -15.060)

## Interpretation

### In-rule (circular)

On the in-rule panel (10 targets, 30 actives), mean ROC-AUC 1 and top-1 hit rate 100.0% confirm that `TARGET_RULES` lookup behaves as coded — this is a **regression/consistency** check, not evidence of generalization. Docking ΔG baseline (ROC-AUC 0.506, top-1 28.6%) remains near chance and is not part of the 0–100 score.

### Held-out (non-circular)

On the held-out panel (10 targets, 30 actives not in rule lists), mean ROC-AUC 0.352 and top-1 hit rate 40.0% (33.2% random expectation) measure **external** behavior. Unlisted actives typically receive only Lipinski/Veber drug-likeness points (~0–24) unless they match `KINASE_INHIBITOR_RE` / class regexes via `drugClass` (we leave `drugClass` empty in the dataset). Same-family kinase inhibitors in the global regex still get ~12 pt demotion bands when listed in `demotedRe`, but novel chemotypes are scored like generic decoys — so separation collapses toward physicochemical tie-breaks. Docking on held-out pairs: ROC-AUC 0.422, top-1 28.6%. TargetForge can honestly claim **curated-rule coverage for known drug names**, not blind discovery of new chemical matter.
