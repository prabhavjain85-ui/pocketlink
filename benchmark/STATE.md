# Benchmark state (2026-10-13)

This branch carries **benchmark tooling and committed summary results only** — no docking UI, Vina service, or scoring changes in `src/`.

**Shipped app:** molecular docking is **unvalidated** and **disabled** for users (`DOCKING_ENGINE_ENABLED = false` in `src/featureFlags.js`). Do not interpret redock or Vina screening summaries here as product-ready docking.

## What was decided

1. **Honest reporting split**
   - **In-rule** (`validation_set.json`): actives from `TARGET_RULES` — expect strong separation; documented in [RESULTS.md](./RESULTS.md) (mean ROC-AUC 1.0 on the last full run).
   - **ChEMBL held-out** (`heldout_set.json` / v2 builder): actives absent from rule tables — modest enrichment (last run mean ROC-AUC ~0.34, top-1 ~42%); see [RESULTS.md](./RESULTS.md) and [HELDOUT_RESULTS.md](./HELDOUT_RESULTS.md).
   - **DUD-E cluster split** (3 targets: **DPP4, ADRB2, JAK2**): conservative scaffold-held-out screening with property-matched decoys; scope and limits in [WHAT_THIS_BENCHMARK_CAN_SHOW.md](./WHAT_THIS_BENCHMARK_CAN_SHOW.md) and [DUDE_RESULTS.md](./DUDE_RESULTS.md).

2. **DUD-E decoy pairing**
   - Sequential block order in `decoys_final.mol2.gz` is **invalid** for active–decoy pairing (see pairing verification in [DUDE_RESULTS.md](./DUDE_RESULTS.md)).
   - Headline eval uses **nearest-50 decoys per test active** from the DUD-E pool (repeats allowed) plus a **no-replacement** full-set report.
   - Only three targets pass MW/logP sanity gates for the committed benchmark JSON; others are excluded with documented reasons.

3. **Similarity / combined scores in benchmark mode**
   - Rebuild enforces strict reference fingerprint loading so missing maps fail loudly (fixes false “flat” similarity runs). See [WHAT_THIS_BENCHMARK_CAN_SHOW.md](./WHAT_THIS_BENCHMARK_CAN_SHOW.md).

4. **Docking**
   - **Product docking remains disabled** (`DOCKING_ENGINE_ENABLED = false` in `src/featureFlags.js`).
   - Redocking diagnostics are **separate** from DUD-E ranking headlines; see [REDOCK_TARGET_DIAGNOSIS.md](./REDOCK_TARGET_DIAGNOSIS.md) and [REDOCK_TABLE.md](./REDOCK_TABLE.md).

5. **Repo hygiene (this PR)**
   - Large generated JSON (`dude_benchmark.json`, `heldout_benchmark_v2.json`, `results.json`, full split dumps) are **not** committed; regenerate via [README.md](./README.md) download instructions.
   - Summary tables and markdown reports **are** committed for review.

## Current results (committed summaries)

| Area | Where to look | Headline |
| --- | --- | --- |
| In-rule + legacy held-out | [RESULTS.md](./RESULTS.md) | In-rule perfect; held-out weak on several kinases/GPCR |
| Held-out v2 splits | [HELDOUT_RESULTS.md](./HELDOUT_RESULTS.md), `heldout_split_results.json` | Per-target split metrics + bootstrap |
| DUD-E | [DUDE_RESULTS.md](./DUDE_RESULTS.md), `dude_benchmark_summary.json`, `dude_rf_results.json` | 3-target cluster benchmark; RF baselines per target |
| DUD-E splits | [DUDE_SPLIT_RESULTS.md](./DUDE_SPLIT_RESULTS.md) | Method comparison (legacy / similarity / combined / RF) |
| Redocking | [REDOCK_TABLE.md](./REDOCK_TABLE.md), `redocking_results.json` | 8 targets pass &lt;2 Å in-place gate; EGFR/BRAF fail |
| Vina screening subset | [VINA_SCREENING_RESULTS.md](./VINA_SCREENING_RESULTS.md) | Experimental; not merged into DUD-E headlines |

## What is left (priority order)

1. **Docking fixes for EGFR and BRAF first** (blocking honest structure-based claims)
   - **EGFR** (`1M17`/AQ4): ~6 Å in-place redock — DFG-out / receptor prep; need alternate non-covalent structures or improved prep (see [REDOCK_TARGET_DIAGNOSIS.md](./REDOCK_TARGET_DIAGNOSIS.md)).
   - **BRAF** (`4XV2`/P06): ~8.7 Å in-place — DFG-out pose variance; aligned RMSD previously understated error.
   - Until these pass the &lt;2 Å gate, do not enable server-side Vina for these targets or cite docking AUC for them.

2. **Secondary redock failures** (HDAC1, HIV protease, SARS Mpro, ADRB2) — documented causes; lower priority than EGFR/BRAF.

3. **Regenerate and optionally commit** full `dude_benchmark.json` / split result JSON after local DUD-E download for reproducibility audits.

4. **Re-run** `npm run benchmark:fast` and held-out / DUD-E evaluators after any future change to `src/scoreCandidates.js` (out of scope for this PR).

## Commands

```bash
npm run benchmark:fast
npm run benchmark:heldout
bash benchmark/runDudePipeline.sh   # after dudeLoader.py
```
