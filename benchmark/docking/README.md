# TargetForge molecular docking benchmark (offline)

Reproducible **AutoDock Vina 1.2.5** validation for pocketlink. Not wired to the web app (docking feature flag stays off).

## System dependencies

- `autodock-vina` 1.2.5 (`vina` on `PATH`)
- `pdb2pqr` 3.6.x with PROPKA (receptor protonation at pH 7.4)
- Python 3.12+

## Python environment

```bash
cd benchmark/docking
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Pinned versions are listed in `requirements.txt`. Large artifacts (PDB cache, Vina poses, PDB2PQR intermediates) go under `cache/` (gitignored).

## Data sources

| Asset | Source |
| --- | --- |
| Receptor coordinates | RCSB PDB (`https://files.rcsb.org/download/<PDB>.pdb`) |
| Ligand templates / bond orders | RCSB chemical component SMILES (`data.rcsb.org`) |
| Experimental potency | ChEMBL REST (`pchembl_value` for Ki/IC50) |
| 25-drug panel | `manifests/approved_25_drugs.json` (FDA-approved drugs + literature co-crystal PDBs) |
| Redocking panel | `manifests/redock_targets.json` |

## Run pipeline

```bash
export PATH="$PWD/benchmark/docking/.venv/bin:$PATH"
python benchmark/docking/scripts/run_redock_multiseed.py
python benchmark/docking/scripts/run_25_drug_benchmark.py
python benchmark/docking/scripts/run_enrichment.py   # slow; needs network
python benchmark/docking/scripts/generate_results_md.py
```

Summary tables: `RESULTS.md`. Machine-readable summaries: `results/*.json`.

## Configuration

`config.json`: exhaustiveness, seeds, box padding, bootstrap iterations. Edit only with a new results run and updated `RESULTS.md`.
