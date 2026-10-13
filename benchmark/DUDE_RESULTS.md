# DUD-E benchmark (PR B round 2)

## Pairing verification (block order **invalid**)

For EGFR, assuming sequential blocks in `decoys_final.mol2.gz` assigns decoys to actives with **698/832** actives having |MW(active) − median(decoys)| **> 25 Da** (median block-order ΔMW ≈ 78 Da). This explains subset MW AUC ≈ 0.97 under the earlier bug (all decoys vs few test actives) and invalidates mol2-order pairing.

## Fallback assignment (DUD-E pool only)

Because no reliable active→decoy map exists in the published archives:

- **Eval subset:** per test active, **50 nearest** decoys from that target’s full DUD-E pool ranked by (|ΔMW|, |ΔlogP|, z(HBD,HBA,rotB,charge)).
- Decoys **may repeat across actives** in the eval subset so pooled MW/logP AUC is not biased by global no-replacement depletion when test actives cluster (verified: no-replacement gave MW AUC ≈ 0.78 with median per-active ΔMW ≈ 14 Da; independent nearest-neighbor gives MW AUC ≈ 0.51).
- **Full-set report:** global **no-replacement** assignment in `dude_idx` order (same ranking).

Actives: `actives_final.mol2.gz` (ChEMBL IDs in titles). Properties: RDKit `MolFromMol2Block` for actives and decoys.

## MW / logP gate (subset 0.45–0.55)

| Target | MW AUC (subset) | logP AUC (subset) | |ΔMW| median (eval) | Gate |
|--------|-----------------|-------------------|-------------------|------|
| dpp4 | 0.472 | 0.489 | 0.00 | **pass** |
| adrb2 | 0.537 | 0.480 | 0.04 | **pass** |
| jak2 | 0.509 | 0.522 | 0.03 | **pass** |
| egfr | 0.511 | 0.601 | 0.46 | fail (logP) |
| abl1 | 0.511 | 0.564 | 0.30 | fail (logP) |
| braf | 0.542 | 0.639 | 3.16 | fail (logP) |
| ptgs2 | 0.516 | 0.230 | 0.09 | fail (logP) |
| pde5a | 0.494 | 0.747 | 0.01 | fail (logP) |
| esr1 | 0.503 | 0.734 | 0.02 | fail (logP) |
| hiv_pr | 0.524 | 0.651 | 0.06 | fail (logP) |
| thrombin | 0.521 | 0.257 | 3.59 | fail (logP) |

**Included in benchmark JSON:** dpp4, adrb2, jak2 (3 targets).  
**Excluded:** erbb2, hmgcr, hdac1 (no DUD-E download), sars_mpro (unmapped); others fail logP and/or MW gate.

## Leakage / splits

- InChIKey overlap removed from test vs reference actives (counts in `dude_benchmark.json` per target).
- **Headline:** cluster split, Murcko overlap 0 between ref/test clusters.
- **Hard cutoff:** NN Morgan Tanimoto to reference actives ≤ 0.4 (decoys kept only for actives passing cutoff).

## RF baseline (Morgan r=2, 2048, train on ref actives + paired decoys)

| Target | RF ROC-AUC (test) |
|--------|-------------------|
| dpp4 | 0.285 |
| adrb2 | 0.998 |
| jak2 | 1.000 |

See `dude_rf_results.json`. Split scoring vs legacy/similarity/combined: run `node evaluateDudeSplits.mjs` → `DUDE_SPLIT_RESULTS.md` (long-running).

## Scripts

- `verifyDudePairing.py` — ΔMW distribution
- `buildDudeBenchmark.py` — builds `dude_benchmark.json`
- `runDudePipeline.sh` — verify → build → RF → splits
