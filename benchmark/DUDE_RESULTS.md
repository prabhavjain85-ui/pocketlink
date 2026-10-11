# DUD-E benchmark sanity (PR B)

## Pipeline bug (fixed)

**Symptom:** EGFR MW ROC-AUC ≈ **0.96** / logP ≈ **0.87**; ABL1 MW ≈ **0.95** — implausible for property-matched DUD-E pairs.

**Root cause:** After the cluster split, evaluation used ~**30 test actives** but appended **all** target decoys (~35k for EGFR), with `matched_to` assigned via `i % len(test_actives)`. MW/logP AUC compared a small, cluster-selected active set to decoys property-matched to **other** actives across the full library.

**Fix:** Pair decoys to actives using DUD-E `decoys_final.mol2.gz` block order (~`n_decoys / n_actives` per active). The evaluated set is **test actives + decoys from those actives only**.

## (a) Actives source

- Actives are **`actives_final.mol2.gz`** from DUD-E (titles are ChEMBL IDs, e.g. `CHEMBL144760`), **not** ChEMBL API actives scored against DUD-E decoys.
- `actives_final.ism` exists on the server but has fewer lines than mol2 actives; mol2 is the pairing reference for decoy blocks.

## (b) Decoy pairing

- Decoys are read from **`decoys_final.mol2.gz`** in archive order.
- Block sizes: `base = n_decoys // n_actives`, first `n_decoys % n_actives` actives receive `base+1` decoys (EGFR: 498×43 + 334×42 = 35442).

## (c) MW / logP computation

- Both actives and decoys: **RDKit `MolFromMol2Block`** → `Descriptors.MolWt` / `Crippen.MolLogP` on the same mol object (preserves charged ZINC states in decoys).
- Fingerprints and splits still use canonical SMILES derived from that mol.

## MW / logP ROC-AUC (full DUD-E set vs evaluated subset)

Sanity band for **full** set: 0.45–0.55 (flag if outside). **Subset** AUC can diverge when test actives are a tight cluster but decoys are still per-active property-matched — reported for transparency, not used as the primary gate.

| Target | DUD-E code | MW AUC (full) | logP AUC (full) | MW AUC (subset) | logP AUC (subset) | Full flag |
|--------|------------|---------------|-----------------|-----------------|-------------------|-----------|
| egfr | egfr | 0.553 | 0.615 | 0.974 | 0.885 | outside (logP) |
| abl1 | abl1 | 0.625 | 0.620 | 0.936 | 0.653 | outside |
| braf | braf | 0.564 | 0.729 | 0.880 | 0.800 | outside (logP) |
| ptgs2 | pgh2 | 0.527 | 0.510 | 0.817 | 0.344 | OK |
| pde5a | pde5a | 0.543 | 0.504 | 0.735 | 0.859 | OK |
| esr1 | esr1 | 0.554 | 0.631 | 0.785 | 0.747 | outside (logP) |
| dpp4 | dpp4 | 0.535 | 0.474 | 0.044 | 0.255 | OK (logP low) |
| adrb2 | adrb2 | 0.553 | 0.500 | 0.124 | 0.260 | OK |
| hiv_pr | hivpr | 0.681 | 0.604 | 0.610 | 0.748 | outside |
| jak2 | jak2 | 0.500 | 0.641 | 0.724 | 0.566 | outside (logP) |
| thrombin | thrb | 0.766 | 0.363 | 0.957 | 0.323 | outside |

**11 / 15** targets included. **Excluded (expected):** `erbb2`, `hmgcr`, `hdac1` (DUD-E download 404), `sars_mpro` (no DUD-E mapping). No `hdac8` substitute.

## Files

- `dudeLoader.py` — download, mol2 parse, decoy block pairing
- `buildDudeBenchmark.py` — splits + full/subset sanity metrics
- `dude_benchmark.json`, `dude_benchmark_summary.json`
