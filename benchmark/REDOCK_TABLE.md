# Co-crystal redocking

## RMSD definition

Heavy-atom RMSD in the receptor frame with NO Kabsch/superposition. Reference: co-crystal HETATM (single chain/altloc) with bond orders from RCSB chemcomp SMILES via AssignBondOrdersFromTemplate. Probe: Vina pose (Meeko PDBQT) with bond orders from reference. Metrics: rdMolAlign.CalcRMS and spyrmsd.symmrmsd(minimize=False). Not GetBestRMS / AlignMol.

**Correction:** Earlier drafts used `GetBestRMS` / Kabsch alignment, which **under-reported** placement error (e.g. EGFR ~1.7 Å aligned vs **~5.96 Å** in-place on this run; DPP4 ~1.4 Å aligned vs **~0.84 Å** in-place). All values below use in-place `CalcRMS` only.

Pass threshold: **< 2 Å** (crystal ligand redocked with Vina).

| Target | PDB | Chain | Crystal heavy | CalcRMS | spyrmsd | Native (spyrmsd) | Vina pass | Native pass | Notes |
|---|---|---|---:|---:|---:|---:|:---:|:---:|---|
| egfr | 1M17 | A | 29 | 5.9024573683167985 | 5.9024573683168 | — | no | no |  |
| abl1 | 1IEP | A | 37 | 12.29915096519788 | 12.29915096519788 | — | no | no |  |
| erbb2 | 3PP0 | A | 34 | 0.5779765912182682 | 0.577976591218268 | — | yes | no |  |
| braf | 4XV2 | A | 35 | 8.734643761771899 | 8.734643761771897 | — | no | no |  |
| ptgs2 | 1CX2 | A | 26 | 0.7861399464957588 | 0.7861399464957588 | — | yes | no |  |
| hmgcr | 1OJ9 | A | 16 | 9.167756855940551 | 5.673785304478121 | — | no | no |  |
| pde5a | 1UDT | A | 33 | 1.0874422167088085 | 1.0874422167088085 | — | yes | no |  |
| esr1 | 3ERT | A | 29 | 1.1467841997373256 | 1.1467841997373258 | — | yes | no |  |
| dpp4 | 4A5S | A | 37 | 0.7805588042505988 | 0.7805588042505989 | — | yes | no |  |
| adrb2 | 3SN6 | A | 27 | 7.6093184503858255 | 7.609318450385825 | — | no | no |  |
| hiv_pr | 1HVR | A | 46 | 6.562129567359514 | 6.562129567359514 | — | no | no |  |
| sars_mpro | 7BQY | C | 13 | 9.350318608625134 | 9.350318608625136 | — | no | no |  |
| hdac1 | 1T69 | A | 19 | 4.350087413371109 | 4.35008741337111 | — | no | no |  |
| jak2 | 4JI9 | A | 36 | 2.563693461919629 | 2.563693461919629 | — | no | no |  |
| thrombin | 1PPB | H | 30 | 1.6787143803525175 | 1.678714380352517 | — | yes | no |  |
