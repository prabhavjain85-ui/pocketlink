# Molecular docking benchmark results (TargetForge / pocketlink)

Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),
waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko**,
symmetry-corrected in-place **spyrmsd**. **Exhaustiveness=16**; seeds in `config.json`.

> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`).

Generated: 2026-10-13T13:38:08.611025+00:00

## Redocking validation

**Per target:** best seed spyrmsd <= 2.0 A.
**Panel acceptance:** >=60% of targets pass per-target rule → **10/11 (91%)** — **PASS**.

| Target | PDB | Best RMSD (Å) | Median RMSD (Å) | ≤2 Å | Failure reason |
| --- | --- | --- | --- | --- | --- |
| egfr | 1M17/AQ4 | 1.51 | 5.90 | yes | — |
| braf | 4XV2/P06 | 0.27 | 0.29 | yes | — |
| abl1 | 1IEP/STI | 0.30 | 0.38 | yes | — |
| erbb2 | 3PP0/03Q | 0.50 | 0.52 | yes | — |
| ptgs2 | 1CX2/S58 | 0.78 | 0.79 | yes | — |
| pde5a | 1UDT/VIA | 1.07 | 1.09 | yes | — |
| esr1 | 3ERT/OHT | 1.01 | 1.16 | yes | — |
| dpp4 | 4A5S/N7F | 0.82 | 0.83 | yes | — |
| adrb2 | 3SN6/P0G | 5.80 | 7.95 | no | GPCR fusion construct; pocket definition sensitive to chain/strip choices. |
| jak2 | 4JI9/1M3 | 1.51 | 1.55 | yes | — |
| thrombin | 1PPB/0G6 | 1.05 | 1.81 | yes | — |

## 25 approved drugs (co-crystal redock)

Redock success (native ligand, best seed ≤ 2 Å): **12/25**.

Spearman ρ (inverted Vina score vs ChEMBL pChEMBL median): **-0.545** (95% bootstrap CI -0.791–0.245).

| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Imatinib | ABL1 | 1IEP | 0.2960055688819872 | -13.109 | 6.7 | yes |
| Gefitinib | EGFR | 4I23 | 0.5610946080486491 | -8.183 | 7.64 | yes |
| Erlotinib | EGFR | 1M17 | 5.881488855753779 | -7.068 | 7.52 | no |
| Lapatinib | ERBB2 | 3PP0 | 0.5177458352650501 | -11.414 | 5.025 | yes |
| Vemurafenib | BRAF | 3OG7 | 0.6027878182754643 | -11.471 | 6.44 | yes |
| Ruxolitinib | JAK2 | 4IVB | 0.2644021121752579 | -9.969 | None | yes |
| Sildenafil | PDE5A | 1UDT | 1.0884062615872114 | -9.746 | 8.45 | yes |
| Celecoxib | PTGS2 | 1CX2 | 0.7884867696832052 | -11.056 | 7.13 | yes |
| Tamoxifen (4-OH metabolite) | ESR1 | 3ERT | 1.0733456492660771 | -9.762 | 7.0 | yes |
| Linagliptin | DPP4 | 4A5S | 0.834893372476651 | -11.115 | None | yes |
| Carazolol | ADRB2 | 3P0G | 1.4892904805512692 | -10.77 | None | yes |
| Losartan | AGTR1 | 4ZUD | None | None | 7.875 | no |
| Ritonavir | HIVPR | 1HXW | 10.605056257960976 | -6.924 | None | no |
| Saquinavir | HIVPR | 1HXB | None | None | None | no |
| Atazanavir | HIVPR | 2AQU | None | None | None | no |
| Nirmatrelvir | Mpro | 7VH8 | None | None | None | no |
| Vorinostat (SAHA) | HDAC1 | 1T69 | 4.28562505791226 | -6.851 | 6.89 | no |
| Raloxifene | ESR1 | 2G5O | None | None | 8.74 | no |
| Progesterone | PGR | 1A28 | 0.3471226069348402 | -11.414 | None | yes |
| Dexamethasone | NR3C1 | 1M2Z | 0.28289278844802346 | -12.145 | None | yes |
| Warfarin | VKORC1 | 1QBG | None | None | None | no |
| Methotrexate | DHFR | 1U72 | 5.83694010366946 | -9.35 | 7.7 | no |
| Indinavir | HIVPR | 2BPV | None | None | None | no |
| Dabrafenib | BRAF | 4XV2 | 8.74539079342276 | -9.825 | None | no |
| Osimertinib | EGFR | 4ZAU | 8.7946971209959 | -7.837 | 8.055 | no |

## Enrichment (test split only)

| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |
| --- | --- | --- | --- | --- |
| egfr | 15 | 50 | 0.636 (0.459–0.791) | 0.00 |
| jak2 | 16 | 40 | 0.744 (0.589–0.870) | 3.50 |
| pde5a | 18 | 38 | 0.800 (0.668–0.911) | 0.00 |

## Failures and limitations

- **Redock adrb2** (3SN6): GPCR fusion construct; pocket definition sensitive to chain/strip choices.
- **Erlotinib**: RMSD=5.881488855753779, note=None
- **Losartan**: RMSD=None, note=No reference ligand for 4ZUD/ZLA
- **Ritonavir**: RMSD=10.605056257960976, note=None
- **Saquinavir**: RMSD=None, note=No reference ligand for 1HXB/ROF
- **Atazanavir**: RMSD=None, note=No reference ligand for 2AQU/478
- **Nirmatrelvir**: RMSD=None, note=No reference ligand for 7VH8/N3
- **Vorinostat (SAHA)**: RMSD=4.28562505791226, note=None
- **Raloxifene**: RMSD=None, note=No reference ligand for 2G5O/RAL
- **Warfarin**: RMSD=None, note=No reference ligand for 1QBG/WAR
- **Methotrexate**: RMSD=5.83694010366946, note=None
- **Indinavir**: RMSD=None, note=No reference ligand for 2BPV/MK1
- **Dabrafenib**: RMSD=8.74539079342276, note=None
- **Osimertinib**: RMSD=8.7946971209959, note=None
- Panel and per-drug metrics use the same Vina prep; failures are not tuned away by swapping PDB entries.
- Vina scores are not calibrated affinities; Spearman uses sparse ChEMBL pairings across heterogeneous targets.
- Enrichment decoys are ChEMBL weak binders (train/test split by molecule ID); not DUD-E matched decoys.

## TODO (not blocking merge)

- [ ] Fix co-crystal **ligand resnames** in `approved_25_drugs.json` where PDB extraction failed (losartan, HIV PR set, nirmatrelvir, raloxifene, warfarin, indinavir).
- [ ] Report **multi-seed** redock stats on the 25-drug panel (currently single seed per drug).
- [ ] Re-run enrichment with **property-matched decoys** (e.g. DUD-E) and additional targets beyond EGFR/JAK2/PDE5A.
- [ ] Document EGFR **1M17** seed variance explicitly in the redock table footnote (best ≤2 Å but median ~5.9 Å).
