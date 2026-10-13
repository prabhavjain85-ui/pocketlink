# Co-crystal redocking validation (TargetForge native engine)

Engine: **targetforge-native** (`runMolecularDocking` + RDKit WASM). Success criterion: RMSD &lt; 2 Å vs PDB heavy-atom pose. Vina/smina reference not run in this pass.

Generated from `benchmark/redocking_results.json`.

| Target | PDB ID | Redocking RMSD (Å) | Pass (&lt;2 Å) | Notes |
| --- | --- | ---: | --- | --- |
| EGFR | 1M17 | 8.24 | fail | Pose found (ΔG −27) but poor RMSD — coarse MC search, 2D ligand embed |
| ABL1 | 1IEP | 35.36 | fail | Atom-count mismatch (74 crystal vs 37 pose) inflates RMSD |
| ERBB2 | 3PP0 | — | fail | **no_valid_pose** — large kinase ligand (03Q); prior benchmark cache had null ΔG for same reason |
| BRAF | 4XV2 | — | fail | **no_valid_pose** — dabrafenib (P06); steric/clash filter rejected poses |
| PTGS2 | 4COX | — | fail | 4COX structure is heme-complex (no S58); ligand resname mismatch |
| HMGCR | 1HWK | — | fail | SIM statin; no valid pose in native engine |
| PDE5A | 1UDT | — | fail | no_valid_pose |
| ESR1 | 3ERT | — | fail | no_valid_pose |
| DPP4 | 1X70 | — | fail | No small-molecule co-ligand in PDB (glycan/waters only) |
| ADRB2 | 3SN6 | — | fail | no_valid_pose (crystal P0G present) |
| HIV protease | 1HVR | — | fail | no_valid_pose |
| SARS Mpro | 7BQY | — | fail | no_valid_pose |
| HDAC1 | 4BKX | — | fail | empty pocket / ligand detection |
| JAK2 | 4JI9 | — | fail | pose without RMSD (no matched heavy atoms) |
| Thrombin | 1DWB | — | fail | no_valid_pose |

**Docking benchmark policy:** `dockingBench.test.js` skips ΔG caching for PDBs that fail this table until redocking passes.
