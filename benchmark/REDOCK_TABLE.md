# Co-crystal redocking

## RMSD definition

Heavy-atom RMSD in the receptor frame with NO Kabsch/superposition. Vina: RCSB chemcomp SMILES + AssignBondOrdersFromTemplate + rdMolAlign.CalcRMS (not GetBestRMS). Native: index-mapped heavy-atom RMSD without alignment (dockingEngine.rmsdBetweenCoords; no symmetry swap).

**Correction:** Earlier drafts used `GetBestRMS` / Kabsch alignment, which **under-reported** placement error (e.g. EGFR ~1.7 Å aligned vs **~5.9 Å** in-place; BRAF ~1.5 Å vs **~0.27 Å** in-place; DPP4 ~1.4 Å vs **~0.86 Å** in-place). All values below use in-place `CalcRMS` only.

Pass threshold: **< 2 Å** (crystal ligand redocked with Vina).

| Target | PDB | Chain | Crystal heavy | Vina RMSD (in-place) | Native RMSD (in-place) | Vina pass | Native pass | Notes |
|---|---|---|---:|---:|---:|:---:|:---:|---|
| egfr | 1M17 | A | 29 | 5.959401356216914 | 9.66 | no | no |  |
| abl1 | 1IEP | A | 37 | 1.0361956932696732 | — | yes | no | no_valid_pose |
| erbb2 | 3PP0 | A | 34 | 0.5357558009704241 | — | yes | no | no_valid_pose |
| braf | 4XV2 | A | 35 | 8.743656570452082 | 11.5 | no | no | BRAF (4XV2): co-crystal ligand P06; same missing har... |
| ptgs2 | 1CX2 | A | 26 | 0.7853407250835029 | — | yes | no | no_valid_pose |
| hmgcr | 1OJ9 | A | 16 | 9.210141556708477 | — | no | no | no_valid_pose |
| pde5a | 1UDT | A | 33 | 1.0909376902111407 | 5.55 | yes | no |  |
| esr1 | 3ERT | A | 29 | 1.1742628323832063 | 8.17 | yes | no |  |
| dpp4 | 4A5S | A | 37 | 0.8412262132204228 | 8.99 | yes | no |  |
| adrb2 | 3SN6 | A | 27 | 8.683546455761022 | — | no | no | no_valid_pose |
| hiv_pr | 1HVR | A | 46 | 6.13709348533732 | 7.13 | no | no |  |
| sars_mpro | 7BQY | C | 13 | 9.306945361936338 | 6.53 | no | no |  |
| hdac1 | 1T69 | A | 19 | 4.241274173723252 | 9.67 | no | no |  |
| jak2 | 4JI9 | A | 36 | 1.6228210932577116 | 8.61 | yes | no |  |
| thrombin | 1PPB | H | 30 | 1.62273025602436 | 8.12 | yes | no |  |
