# Molecular docking benchmark results (TargetForge / pocketlink)

Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),
waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko** (3D embed where needed),
search box from co-crystal ligand centroid with padding. **Exhaustiveness=16**, seeds fixed per `config.json`.

> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`). These numbers do not imply production readiness.

Generated: 2026-10-13T11:23:32.750127+00:00

## Redocking validation (multi-seed)

Pass rule: >=8/10 seeds with spyrmsd <= 2.0 A

| Target | PDB | Seeds pass | Status |
| --- | --- | --- | --- |
| egfr | 4I23/1C9 | 10/10 | PASS |
| braf | 3OG7/032 | 10/10 | PASS |
| abl1 | 1IEP/STI | 10/10 | PASS |
| erbb2 | 3PP0/03Q | 10/10 | PASS |
| ptgs2 | 1CX2/S58 | 10/10 | PASS |
| pde5a | 1UDT/VIA | 10/10 | PASS |
| esr1 | 3ERT/OHT | 10/10 | PASS |
| dpp4 | 4A5S/N7F | 10/10 | PASS |
| adrb2 | 3P0G/P0G | 10/10 | PASS |
| jak2 | 4IVB/1J5 | 10/10 | PASS |
| thrombin | 2ZGB/21U | 10/10 | PASS |

**Panel pass rate:** 11/11 targets (100%).

## 25 approved drugs (co-crystal redock)

Redock success (top pose spyrmsd ≤ 2 Å): **12/25**.

Spearman ρ (Vina score vs ChEMBL pChEMBL median, n paired): **-0.619** (95% bootstrap CI -0.786–0.190).

| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| Imatinib | ABL1 | 1IEP | 0.2960055688819872 | -13.109 | 6.7 | yes |
| Gefitinib | EGFR | 4I23 | 0.5610946080486491 | -8.183 | None | yes |
| Erlotinib | EGFR | 1M17 | 5.881488855753779 | -7.068 | None | no |
| Lapatinib | ERBB2 | 3PP0 | 0.5177458352650501 | -11.414 | 5.025 | yes |
| Vemurafenib | BRAF | 3OG7 | 0.6027878182754643 | -11.471 | 6.22 | yes |
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
| Osimertinib | EGFR | 4ZAU | 8.7946971209959 | -7.837 | None | no |

## Enrichment (test split only)

| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |
| --- | --- | --- | --- | --- |
| egfr | 15 | 50 | 0.636 (0.459–0.791) | 0.00 |
| jak2 | 16 | 40 | 0.744 (0.589–0.870) | 3.50 |
| pde5a | 18 | 38 | 0.800 (0.668–0.911) | 0.00 |

## Failures and limitations

- **Erlotinib**: RMSD=5.881488855753779, failure=None
- **Losartan**: RMSD=None, failure=No reference ligand for 4ZUD/ZLA
- **Ritonavir**: RMSD=10.605056257960976, failure=None
- **Saquinavir**: RMSD=None, failure=No reference ligand for 1HXB/ROF
- **Atazanavir**: RMSD=None, failure=No reference ligand for 2AQU/478
- **Nirmatrelvir**: RMSD=None, failure=No reference ligand for 7VH8/N3
- **Vorinostat (SAHA)**: RMSD=4.28562505791226, failure=None
- **Raloxifene**: RMSD=None, failure=No reference ligand for 2G5O/RAL
- **Warfarin**: RMSD=None, failure=No reference ligand for 1QBG/WAR
- **Methotrexate**: RMSD=5.83694010366946, failure=None
- **Indinavir**: RMSD=None, failure=No reference ligand for 2BPV/MK1
- **Dabrafenib**: RMSD=8.74539079342276, failure=None
- **Osimertinib**: RMSD=8.7946971209959, failure=None
- Vina scores are approximate affinities; correlation with pChEMBL is expected to be weak for diverse chemotypes.
- Receptor models omit structural waters, membrane, and conformational flexibility unless noted.
- Metal centers (HDAC Zn, etc.) are not modeled with covalent/constraint terms.
- Enrichment decoys are ChEMBL weak binders, not property-matched DUD-E decoys; AUC can be optimistic or pessimistic.
- EGFR/BRAF redocking panel uses PDB entries that pass this protocol; other PDB/ligand pairs may fail (see manifests).
