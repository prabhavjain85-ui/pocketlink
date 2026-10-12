# What this benchmark can and cannot show

## What it can show

- **Cluster-held-out screening performance** on three DUD-E targets (DPP4, ADRB2, JAK2) when test actives are Murcko-scaffold disjoint from reference actives, with property-matched decoys assigned independently per test active (nearest-50 from the DUD-E pool; repeats allowed).
- **Relative ranking** of PocketLink-style scores (legacy heuristic, Morgan similarity to reference actives, combined triage, Morgan RF, and a drug-likeness-only property baseline) on the same test compounds, with **paired stratified bootstrap** (1000 resamples, seed 42) so methods are compared on identical resamples.
- **Leakage and split hygiene signals**: canonical SMILES deduplication counts, train/test overlap audits for RF, and NN Tanimoto of test actives to reference actives.
- **Optimistic upper bound**: a **random** (non-cluster) active split with the same decoy assignment machinery, reported with the same paired bootstrap protocol.
- **Sanity checks**: MW/logP ROC-AUC near 0.5 on the eval subset, strict fail-loud when reference fingerprints are missing for similarity/combined in benchmark mode.

## What it cannot show

- **General virtual-screening success** on arbitrary targets, chemistries, or decoy generators; only these three DUD-E sets with analogue-biased property-matched decoys.
- **Prospective hit rates** or clinical relevance; labels are historical actives vs DUD-E decoys, not experimental confirmation on new compounds.
- **Structure-based docking quality** for most targets here; redock/Vina subsets are separate and not merged into these cluster headline numbers.
- **Fair comparison to methods that need train-time actives** without leakage when test molecules are near-duplicates of reference chemistry; cluster split reduces scaffold overlap but not all chemical similarity.
- **Calibration of absolute scores** across targets; AUC and EF@1% are rank-based within each target’s test set only.
- **That high similarity or RF AUC implies the app is “better” in production** without checking score direction, reference coverage, dedup, and whether similarity maps were loaded (this benchmark enforces strict mode to catch missing references).

## How to read headline results

- Treat **cluster split** as the conservative estimate of ranking when scaffolds in test are intentionally held away from reference actives.
- Treat **random split** as an optimistic ceiling if cluster assignment were ignored.
- Compare methods using **paired ΔAUC CIs**; single-target AUC alone is noisy, especially with few actives.
- When legacy ≈ similarity ≈ combined, suspect a **scoring-path bug** (not improved performance); this rebuild fixes missing reference fingerprints in the similarity map.
