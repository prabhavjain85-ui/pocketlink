# TargetForge molecular docking benchmark (offline)

Reproducible **AutoDock Vina 1.2.5** validation for pocketlink. Production docking UI and the Fly.io service are controlled separately via `src/featureFlags.js`; this folder holds offline benchmarks and shared engine config.

## Engine config (shared with production)

`engine.config.json` is the **single versioned source of truth** for AutoDock Vina settings (pinned tool versions, fixed seed, pH 7.4 receptor prep, co-crystal box, allowed PDB IDs, and limits). The production service (`services/docking/`) and Vercel proxy read the same JSON at deploy time. Update it in place when redocking benchmarks pass.

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
python benchmark/docking/scripts/validate_25_pairs.py
```

Summary tables: `RESULTS.md`. Machine-readable summaries: `results/*.json` (including `pair_sanity_checks.json` for UI notices).

## Configuration

`config.json`: exhaustiveness, seeds, box padding, bootstrap iterations. Edit only with a new results run and updated `RESULTS.md`.
