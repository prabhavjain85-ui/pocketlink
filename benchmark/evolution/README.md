# Molecule evolution rediscovery benchmark

Held-out ChEMBL actives for **EGFR**, **JAK2**, and **PDE5A** use the same target panel and train/test hash split as `benchmark/docking/scripts/run_enrichment.py` (`train_frac = 0.55`, actives with `pchembl ≥ 6`).

## Fixture

- `fixtures/chembl_rediscovery_panel.json` — train/test SMILES per target (regenerate with `node scripts/build-evolution-rediscovery-fixture.mjs`).

## Protocol

1. Pick a **train** active as the evolution seed.
2. Remove from the ligand-reference set all other train actives with Morgan (r=2, 2048) Tanimoto **> 0.4** to the seed.
3. Run target-free evolution (no docking) or the **random-null** control (same edits and hard gates, random survivor selection).
4. Count unique generated structures whose max Tanimoto to any **test** active is **≥ 0.55**.
5. Report enrichment = mean evolution hit rate − mean null hit rate, with bootstrap 95% CIs over seeds × targets.

Implementation: `src/benchmark/evolutionRediscovery.js`. CI runs a smoke subset (`REDISCOVERY_SMOKE=1` or `CI=true` in the bench test).

Full offline run:

```bash
CI=true npm test -- --testPathPattern=evolutionRediscovery.bench --watchAll=false
# or (longer, all train seeds):
node scripts/run-evolution-rediscovery-bench.mjs
```
