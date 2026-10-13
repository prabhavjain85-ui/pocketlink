# PR #36 deliverables (draft — regenerate after `buildHeldoutBenchmark.py` finishes)

## 1. ChEMBL query counts (after target-ID fix)

See `benchmark/chembl_query_audit.json`. Root cause of zero actives for ABL1 / ESR1 / Mpro was **wrong ChEMBL target IDs** (`CHEMBL186`, `CHEMBL595`, `CHEMBL4523584` return 0 activities). Corrected IDs: **ABL1 → CHEMBL1862**, **ESR1 → CHEMBL206**, **SARS-CoV-2 Mpro → CHEMBL1075104**.

| Target | ChEMBL ID | Final count (filtered funnel) |
|--------|-----------|----------------------------:|
| egfr | CHEMBL203 | 15750 |
| abl1 | CHEMBL1862 | 4489 |
| erbb2 | CHEMBL1824 | 2644 |
| braf | CHEMBL4005 | 7032 |
| ptgs2 | CHEMBL230 | 3792 |
| hmgcr | CHEMBL402 | 215 |
| pde5a | CHEMBL1827 | 1904 |
| esr1 | CHEMBL206 | 5419 |
| dpp4 | CHEMBL284 | 4502 |
| adrb2 | CHEMBL210 | 1006 |
| hiv_pr | CHEMBL244 | 5590 |
| sars_mpro | CHEMBL1075104 | 4949 |
| hdac1 | CHEMBL325 | 7439 |
| jak2 | CHEMBL2971 | 15224 |
| thrombin | CHEMBL204 | 3948 |

Filter stack documented per step in the JSON (`target_type`, `confidence_score≥7`, `IC50/Ki`, `nM`, `relation=`, `pChEMBL≥6`).

## 2–3. Per-target decoys / baselines / split metrics

Run after build completes:

```bash
python3 benchmark/buildHeldoutBenchmark.py
node scripts/buildTargetReferenceBundle.mjs
node benchmark/evaluateHeldoutSplits.mjs
```

Outputs: `benchmark/HELDOUT_RESULTS.md`, `benchmark/heldout_split_results.json`, `benchmark/benchmark_build_summary.json`.

**Note:** Prior build had **&lt;3 decoys/active** and **MW baseline ~0.62** — benchmark was invalid; scoring was gated off. Rebuild uses DUD-E decoys (where available), Tanimoto &lt; 0.3, and reports true decoys/active ratios.

## 4. Redocking table

```bash
python3 benchmark/runRedockValidation.py
python3 benchmark/writeRedockTable.py
```

See `benchmark/REDOCK_TABLE.md`. Vina reference prep uses single-chain ligand extraction (fixes ABL1 74→37 atoms). COX-2 Vina omits heme in receptor prep (Meeko template limitation); native redocking may retain cofactors separately.

## 5. Bundle

Monolithic `src/data/targetReferenceFingerprints.json` removed; per-target files under `public/reference-fp/` (lazy fetch). Item 5 UI label handled in separate PR.
