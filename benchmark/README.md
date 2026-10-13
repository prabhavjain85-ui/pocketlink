# TargetForge ranking benchmark

Retrospective validation of **heuristic-v2** (`rankCandidatesLocal` in `src/scoreCandidates.js`) — the same deterministic engine that powers Staging Bench numeric scores and repurposing batch ranks.

**Docking in the app:** molecular docking is **unvalidated** and **disabled** in production (`DOCKING_ENGINE_ENABLED = false` in `src/featureFlags.js`). Scripts here may run optional docking baselines or redock diagnostics locally; those results do not reflect what end users see in the UI.

## Files

| File | Purpose |
| --- | --- |
| `validation_set.json` | **In-rule (circular)** panel: actives from `TARGET_RULES` drug lists |
| `heldout_set.json` | Legacy small held-out panel |
| `heldout_benchmark_v2.json` | **Held-out v2** (generated): ChEMBL actives + property-matched decoys — see [ChEMBL data](#chembl-held-out-benchmark-data) |
| `reference_sets.json` | ChEMBL reference actives + fingerprints (generated; gitignored — app uses `src/data/targetReferenceFingerprints.json`) |
| `dude_benchmark.json` | Full DUD-E benchmark JSON (generated) — see [DUD-E data](#dude-e-benchmark-data) |
| `redocking_results.json` | Co-crystal redocking RMSD table (native engine) |
| `leakage_report.json` | Scaffold / nearest-neighbour Tanimoto leakage checks |
| `auditRuleLists.mjs` | Grep-backed check against `TARGET_RULES`, `KINASE_INHIBITOR_RE`, `GPCR_LIGAND_RE` |
| `runBenchmark.mjs` | Reproducible Node runner (metrics + optional docking baseline) |
| `docking_cache.json` | Cached ΔG poses (generated locally; not committed in this branch) |
| `RESULTS.md` | Human-readable in-rule / legacy held-out report |
| `results.json` | Machine-readable metrics from `runBenchmark.mjs` (generated) |
| `STATE.md` | Current benchmark status, decisions, and open work |
| `WHAT_THIS_BENCHMARK_CAN_SHOW.md` | Honest scope for DUD-E cluster splits |

Committed **summary** artifacts (tables / aggregates) include `*_summary.json`, `*_split_results.json` (where small), and the `*_RESULTS.md` reports. Large per-compound dumps stay local after download/build.

## Data download

### DUD-E benchmark data

1. Install Python deps used by the pipeline: **RDKit**, **requests**, **numpy** (same versions as your local Python env).
2. From the repo root, run the DUD-E loader (writes under `benchmark/dude_cache/` — gitignored):

   ```bash
   python3 benchmark/dudeLoader.py
   ```

   Targets and availability are listed in `dude_availability.json` and [DUDE_AVAILABILITY.md](./DUDE_AVAILABILITY.md). Archives are fetched from the [DUD-E](http://dude.docking.org/) target pages (`actives_final.mol2.gz`, `decoys_final.mol2.gz` per target code).

3. Verify pairing and build the benchmark JSON:

   ```bash
   python3 benchmark/verifyDudePairing.py
   python3 benchmark/buildDudeBenchmark.py
   # or full pipeline:
   bash benchmark/runDudePipeline.sh
   ```

   Outputs include `dude_benchmark.json`, `dude_benchmark_summary.json`, RF results, and split markdown under `benchmark/`. See [DUDE_RESULTS.md](./DUDE_RESULTS.md) for methodology notes (property-matched decoys; only **dpp4**, **adrb2**, **jak2** pass MW/logP gates for headline JSON).

### ChEMBL held-out benchmark data

1. `buildHeldoutBenchmark.py` queries the **ChEMBL REST API** (`https://www.ebi.ac.uk/chembl/api/data`) for bioactivity-filtered actives per target, then builds property-matched decoys and scaffold splits. Cache responses under `benchmark/chembl_cache/` (gitignored) on repeat runs.

   ```bash
   python3 benchmark/buildHeldoutBenchmark.py
   ```

2. Refresh the in-app reference fingerprint bundle (optional, for similarity benchmarks that read production data):

   ```bash
   node scripts/buildTargetReferenceBundle.mjs
   ```

3. Evaluate held-out splits:

   ```bash
   npm run benchmark:heldout
   ```

   Produces `heldout_split_results.json` and [HELDOUT_RESULTS.md](./HELDOUT_RESULTS.md). Full compound panels: `heldout_benchmark_v2.json` (generated, not committed here).

### PDB structures

Redocking and docking baselines download PDBs into `benchmark/pdb_cache/` (gitignored) via `runBenchmark.mjs`, `runRedockValidation.py`, or `fetchDockingTargets.py`.

## Run

```bash
npm run benchmark          # full run (may fetch PDBs; optional native docking baseline)
npm run benchmark:fast     # heuristic + MW baselines only (~2s)
```

Re-run after changing scoring code **without** editing weights in this benchmark. The runner is **not** part of `npm test` (except `src/benchmark/rocAuc.test.js` for metric helpers).

## See also

- [STATE.md](./STATE.md) — status and next steps
- [RESULTS.md](./RESULTS.md) — latest headline metrics and per-target table
- [WHAT_THIS_BENCHMARK_CAN_SHOW.md](./WHAT_THIS_BENCHMARK_CAN_SHOW.md) — DUD-E cluster benchmark claims
