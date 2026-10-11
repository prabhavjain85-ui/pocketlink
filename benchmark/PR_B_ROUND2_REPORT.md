# PR B round 2 — status report (draft)

## DUD-E pairing

- **Confirmed:** mol2 block-order pairing is wrong (EGFR: 84% actives with block ΔMW > 25 Da).
- **Fallback:** nearest-50 from DUD-E decoy pool per active (see `DUDE_RESULTS.md`).
- **Benchmark targets passing MW+logP gate:** dpp4, adrb2, jak2.

## Multi-seed redocking (in progress)

`runRedockMultiSeed.py` — exhaustiveness 16, seeds 42–51, pass ≥8/10 spyrmsd < 2 Å (no alignment).  
Partial log: abl1, erbb2, ptgs2, pde5a, esr1, dpp4 pass; egfr/braf/hmgcr/adrb2 fail early seeds.

## Vina screening

Pending: intersection of multiseed-validated targets with DUD-E benchmark targets (`runVinaScreeningBenchmark.py`).

## Scoring / RF

- `evaluateDudeRf.py` complete (`dude_rf_results.json`).
- `evaluateDudeSplits.mjs` → cluster headline + cutoff (may take >10 min for similarity maps).

## Rebase onto `main`

Pending force-push after rebase (keep main `MethodologyPage.jsx` / `DockingPage.jsx` copy).

## Readiness

**Not merge-ready:** DUD-E coverage limited to 3 gated targets; multiseed allowlist and Vina screening incomplete; split eval tables may be pending.

See `PR_B_MERGE_CHECKLIST.md`.
