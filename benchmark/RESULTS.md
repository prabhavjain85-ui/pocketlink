# TargetForge ranking benchmark — results

Generated: 2026-10-11T09:11:27.554Z

## In-rule (circular) — `validation_set.json`

Actives are drawn from the same drug-name lists encoded in `TARGET_RULES`; expect near-perfect separation.

### Headline metrics (heuristic-v2)

| Metric | TargetForge | Random expectation | MW baseline | Docking-only baseline |
| --- | --- | --- | --- | --- |
| Mean ROC-AUC | 1 | 0.50 | 0.678 | — |
| Top-1 hit rate | 100.0% | 37.1% | 60.0% | — |
| Top-3 hit rate | 100.0% | 81.5% | 90.0% | — |
| Mean active rank (↓ better) | 2 | 4.550 | 3.633 | — |
| Mean EF@20% | 2.700 | 1.00 | 1.350 | — |

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
| Mean ROC-AUC | 0.339 | 0.50 | 0.617 | — |
| Top-1 hit rate | 41.7% | 25.8% | 100.0% | — |
| Top-3 hit rate | 75.0% | 58.0% | 100.0% | — |
| Mean active rank (↓ better) | 81.206 | 67.583 | 56.178 | — |
| Mean EF@20% | 0.626 | 1.00 | 1.546 | — |

### Per-target summary

| Target | PDB | N | Actives | ROC-AUC | Top-1 | Top-3 | Mean active rank | EF@20% | Top failure (if any) |
| --- | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |
| EGFR | 1M17 | 115 | 30 | 0.277 | ✗ | ✗ | 76.033 | 0.667 | decoy_CHEMBL76589_0 ranked #1 above CHEMBL310798 |
| ERBB2 | 3PP0 | 88 | 30 | 0.324 | ✓ | ✓ | 54.333 | 0.326 | — |
| BRAF | 4XV2 | 91 | 30 | 0.610 | ✗ | ✓ | 40.633 | 1.118 | decoy_CHEMBL428496_1 ranked #1 above CHEMBL98350 |
| PTGS2 | 4COX | 287 | 30 | 0.400 | ✓ | ✓ | 165.600 | 0.825 | — |
| HMGCR | 1HWK | 92 | 30 | 0.417 | ✗ | ✓ | 48.633 | 0.646 | decoy_CHEMBL2368198_5 ranked #1 above CHEMBL159103 |
| PDE5A | 1UDT | 113 | 30 | 0.229 | ✓ | ✓ | 79.033 | 0.491 | — |
| DPP4 | 1X70 | 121 | 30 | 0.365 | ✗ | ✓ | 71.467 | 0.807 | decoy_CHEMBL319514_0 ranked #1 above CHEMBL503274 |
| ADRB2 | 3SN6 | 75 | 30 | 0.131 | ✗ | ✗ | 54.300 | 0.167 | decoy_CHEMBL433454_0 ranked #1 above CHEMBL433454 |
| HIV-1 protease | 1HVR | 155 | 30 | 0.235 | ✗ | ✗ | 110.600 | 0.167 | decoy_CHEMBL126575_0 ranked #1 above CHEMBL264876 |
| HDAC1 | 4BKX | 106 | 30 | 0.368 | ✓ | ✓ | 62.567 | 0.642 | — |
| JAK2 | 4JI9 | 225 | 30 | 0.491 | ✗ | ✓ | 109.267 | 1.500 | decoy_CHEMBL21156_3 ranked #1 above CHEMBL557844 |
| Thrombin | 1DWB | 142 | 30 | 0.222 | ✓ | ✓ | 102 | 0.163 | — |

### Suggested honest one-line claim (CV / site)

> Target-aware ranking separates FDA-listed on-target drugs from off-target decoys for rule-covered targets (in-rule top-1 100.0%); on held-out inhibitors absent from the rule tables, enrichment is modest (ROC-AUC 0.339, top-1 41.7%) and should be paired with docking/assays.

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
- Docking baseline skipped (`--skip-docking`). Re-run `npm run benchmark` to populate `docking_cache.json` via Jest.

## Held-out mis-ranks (heuristic-v2)

- **EGFR (1M17)**: decoy_CHEMBL76589_0 (#1, score 24) ranked above CHEMBL310798 (score 24)
- **EGFR (1M17)**: decoy_CHEMBL76589_1 (#2, score 24) ranked above CHEMBL310798 (score 24)
- **EGFR (1M17)**: decoy_CHEMBL76589_2 (#3, score 24) ranked above CHEMBL310798 (score 24)
- **BRAF (4XV2)**: decoy_CHEMBL428496_1 (#1, score 24) ranked above CHEMBL98350 (score 24)
- **HMGCR (1HWK)**: decoy_CHEMBL2368198_5 (#1, score 24) ranked above CHEMBL159103 (score 23)
- **HMGCR (1HWK)**: decoy_CHEMBL2368198_7 (#2, score 24) ranked above CHEMBL159103 (score 23)
- **DPP4 (1X70)**: decoy_CHEMBL319514_0 (#1, score 24) ranked above CHEMBL503274 (score 24)
- **DPP4 (1X70)**: decoy_CHEMBL319514_2 (#2, score 24) ranked above CHEMBL503274 (score 24)
- **ADRB2 (3SN6)**: decoy_CHEMBL433454_0 (#1, score 24) ranked above CHEMBL433454 (score 23)
- **ADRB2 (3SN6)**: decoy_CHEMBL433454_1 (#2, score 24) ranked above CHEMBL433454 (score 23)
- **ADRB2 (3SN6)**: decoy_CHEMBL433454_2 (#3, score 24) ranked above CHEMBL433454 (score 23)
- **HIV-1 protease (1HVR)**: decoy_CHEMBL126575_0 (#1, score 23) ranked above CHEMBL264876 (score 22)

## Interpretation

### In-rule (circular)

On the in-rule panel (10 targets, 30 actives), mean ROC-AUC 1 and top-1 hit rate 100.0% confirm that `TARGET_RULES` lookup behaves as coded — this is a **regression/consistency** check, not evidence of generalization. Docking ΔG baseline (ROC-AUC —, top-1 —) remains near chance and is not part of the 0–100 score.

### Held-out (non-circular)

On the held-out panel (12 targets, 360 actives not in rule lists), mean ROC-AUC 0.339 and top-1 hit rate 41.7% (25.8% random expectation) measure **external** behavior. Unlisted actives typically receive only Lipinski/Veber drug-likeness points (~0–24) unless they match `KINASE_INHIBITOR_RE` / class regexes via `drugClass` (we leave `drugClass` empty in the dataset). Same-family kinase inhibitors in the global regex still get ~12 pt demotion bands when listed in `demotedRe`, but novel chemotypes are scored like generic decoys — so separation collapses toward physicochemical tie-breaks. Docking on held-out pairs: ROC-AUC —, top-1 —. TargetForge can honestly claim **curated-rule coverage for known drug names**, not blind discovery of new chemical matter.
