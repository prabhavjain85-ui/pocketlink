# TargetForge ranking benchmark

Retrospective validation of **heuristic-v2** (`rankCandidatesLocal` in `src/scoreCandidates.js`) — the same deterministic engine that powers Staging Bench numeric scores and repurposing batch ranks.

## Files

| File | Purpose |
| --- | --- |
| `validation_set.json` | **In-rule (circular)** panel: actives from `TARGET_RULES` drug lists |
| `heldout_set.json` | Legacy small held-out panel (superseded by v2 when present) |
| `heldout_benchmark_v2.json` | **Held-out v2**: ChEMBL actives (scaffold-split) + property-matched decoys (`buildHeldoutBenchmark.py`) |
| `reference_sets.json` | ChEMBL reference actives + fingerprints (generated; gitignored — use `src/data/targetReferenceFingerprints.json`) |
| `redocking_results.json` | Co-crystal redocking RMSD table (native engine) |
| `leakage_report.json` | Scaffold / nearest-neighbour Tanimoto leakage checks |
| `auditRuleLists.mjs` | Grep-backed check against `TARGET_RULES`, `KINASE_INHIBITOR_RE`, `GPCR_LIGAND_RE` |
| `runBenchmark.mjs` | Reproducible Node runner (metrics + optional docking baseline) |
| `docking_cache.json` | Cached ΔG poses (generated; commit for reproducibility) |
| `../src/benchmark/dockingBench.test.js` | Jest harness for RDKit docking (skipped unless `RUN_DOCKING_BENCH=1`) |
| `RESULTS.md` | Human-readable report (generated) |
| `results.json` | Machine-readable metrics (generated) |

## Run

```bash
npm run benchmark          # full run (fetches PDBs, runs native docking baseline)
npm run benchmark:fast     # heuristic + MW baselines only (~2s)
```

Re-run after changing scoring code **without** editing weights in this benchmark. The runner is **not** part of `npm test`.

## See also

- [RESULTS.md](./RESULTS.md) — latest headline metrics and per-target table
