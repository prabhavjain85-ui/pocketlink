# DUD-E held-out benchmark (cluster headline)

Benchmark ready (MW/logP sanity): **true**

## Per-target decoys and baselines

| Target | Actives | Decoys | Decoys/active | Source | MW AUC | logP AUC |
|---|---:|---:|---:|---|---:|---:|
| dpp4 | 30 | 250 | 50.00 | DUD-E | 0.544 | 0.504 |
| adrb2 | 30 | 546 | 50.00 | DUD-E | 0.487 | 0.459 |
| jak2 | 30 | 999 | 50.00 | DUD-E | 0.536 | 0.515 |

> **DUD-E analogue bias:** property-matched decoys may inflate similarity-only methods vs true inactive distributions.

> **Decoy assignment (eval):** independent nearest-50 per test active from the DUD-E decoy pool (repeats allowed across actives). See `DUDE_RESULTS.md`.

> **Paired bootstrap:** 1000 stratified resamples (actives and decoys separately), seed **42**; same indices for legacy, similarity, combined, and Morgan RF.

## Cluster split — compound counts (after canonical dedup)

| Target | Reference actives kept | Test actives | Test decoys |
|---|---:|---:|---:|
| dpp4 | 40 | 30 | 250 |
| adrb2 | 40 | 30 | 546 |
| jak2 | 40 | 30 | 999 |

## Cluster split — methods (paired bootstrap 95% CIs)

| Target | Method | AUC | 95% CI | EF@1% |
|---|---|---:|---|---:|
| dpp4 | legacy | 0.6380 | [0.6100, 0.6680] | 3.11 |
| dpp4 | similarity | 0.1157 | [0.0787, 0.1596] | 0.00 |
| dpp4 | combined | 0.1334 | [0.0950, 0.1777] | 0.00 |
| dpp4 | morgan_rf | 0.2460 | [0.2140, 0.2760] | 0.00 |
| adrb2 | legacy | 0.7289 | [0.6548, 0.7918] | 3.20 |
| adrb2 | similarity | 0.9072 | [0.8614, 0.9466] | 19.20 |
| adrb2 | combined | 0.9207 | [0.8772, 0.9568] | 19.20 |
| adrb2 | morgan_rf | 0.9897 | [0.9823, 0.9957] | 19.20 |
| jak2 | legacy | 0.5421 | [0.4342, 0.6424] | 3.12 |
| jak2 | similarity | 1.0000 | [1.0000, 1.0000] | 34.30 |
| jak2 | combined | 1.0000 | [1.0000, 1.0000] | 34.30 |
| jak2 | morgan_rf | 1.0000 | [1.0000, 1.0000] | 34.30 |

## Cluster split — paired AUC differences (95% CI; significant if CI excludes 0)

| Target | Comparison | Mean ΔAUC | 95% CI | Significant |
|---|---|---:|---|:---:|
| dpp4 | similarity − legacy | -0.5215 | [-0.5675, -0.4743] | yes |
| dpp4 | combined − similarity | 0.0176 | [0.0041, 0.0316] | yes |
| dpp4 | legacy − morgan_rf | 0.3917 | [0.3520, 0.4360] | yes |
| dpp4 | similarity − morgan_rf | -0.1298 | [-0.1760, -0.0845] | yes |
| dpp4 | combined − morgan_rf | -0.1122 | [-0.1575, -0.0633] | yes |
| adrb2 | similarity − legacy | 0.1805 | [0.1126, 0.2529] | yes |
| adrb2 | combined − similarity | 0.0131 | [-0.0009, 0.0276] | no |
| adrb2 | legacy − morgan_rf | -0.2629 | [-0.3320, -0.1991] | yes |
| adrb2 | similarity − morgan_rf | -0.0824 | [-0.1264, -0.0458] | yes |
| adrb2 | combined − morgan_rf | -0.0692 | [-0.1107, -0.0353] | yes |
| jak2 | similarity − legacy | 0.4601 | [0.3577, 0.5660] | yes |
| jak2 | combined − similarity | 0.0000 | [0.0000, 0.0000] | no |
| jak2 | legacy − morgan_rf | -0.4601 | [-0.5658, -0.3576] | yes |
| jak2 | similarity − morgan_rf | 0.0000 | [0.0000, 0.0000] | no |
| jak2 | combined − morgan_rf | 0.0000 | [0.0000, 0.0000] | no |

## Canonical SMILES deduplication (test wins over reference/train)

| Target | Test actives removed | Test decoys removed | Train actives removed | Train decoys removed | Reference actives removed | Train∩test removed |
|---|---:|---:|---:|---:|---:|---:|
| dpp4 | 0 | 1250 | 0 | 958 | 0 | 0 |
| adrb2 | 0 | 954 | 0 | 906 | 0 | 5 |
| jak2 | 0 | 501 | 0 | 1025 | 0 | 408 |

## Leakage / split metadata

| Target | InChIKey removed (test) | NN Tanimoto mean (test actives) | NN min | NN max |
|---|---:|---:|---:|---:|
| dpp4 | 0 | 0.105 | 0.088 | 0.120 |
| adrb2 | 0 | 0.230 | 0.161 | 0.288 |
| jak2 | 0 | 0.417 | 0.253 | 0.686 |

## Cluster split (headline): train/test sizes and ROC-AUC

| Target | Train actives | Train decoys | Test actives | Test decoys | Legacy AUC (95% CI) | Similarity | Combined | Morgan RF | Legacy>RF | Combined>Sim |
|---|---:|---:|---:|---:|---:|---:|---:|---:|:---:|:---:|
| dpp4 | 40 | 1042 | 30 | 250 | 0.638 | 0.116 | 0.133 | 0.246 (0.214–0.276) | yes | yes |
| adrb2 | 40 | 1094 | 30 | 546 | 0.729 | 0.907 | 0.921 | 0.990 (0.982–0.996) | no | yes |
| jak2 | 40 | 975 | 30 | 999 | 0.542 | 1.000 | 1.000 | 1.000 (1.000–1.000) | no | no |

> **Scoring paths:** legacy = `rankCandidatesLocal` → `scoreOne` (heuristic-v2, no `rankMode`); similarity = same with `rankMode:"similarity"` + Morgan Tanimoto vs reference actives; combined = `combinedTriageScore` (0.35/0.65). See `src/scoreCandidates.js` and `benchmark/similarityForBench.mjs`.

## Headline: cluster split (Murcko overlap 0; ROC-AUC 95% CI; EF@1%)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.214–0.276); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.401; EF@1% 3.11 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.996); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.477; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.542; EF@1% 3.12 | 1.000; EF@1% 34.30 | 1.000; EF@1% 34.30 | 1.000 (1.000–1.000); EF@1% 34.30 | 0.536; EF@1% 9.35 | 0.515; EF@1% 0.00 | 0.560; EF@1% 3.12 |

### Overall (macro mean of per-target AUCs)

| Method | Mean AUC |
|---|---:|
| legacy | 0.636 |
| similarity | 0.674 |
| combined | 0.685 |
| rf | 0.745 |
| mw | 0.522 |
| logp | 0.492 |
| random | 0.479 |

**Combined beats similarity on cluster split:** 2/3 targets (yes at majority).

**Legacy (heuristic) beats RF on cluster split:** 1/3 targets (no at majority).

### RF sanity (Morgan RF train=ref actives+decoys; test=cluster/cutoff sets)

| Target | Train/test SMILES overlap | Test actives in train | Descriptor-RF AUC (cluster) | Morgan RF AUC (cluster) |
|---|---:|---:|---:|---:|
| dpp4 | 0 | 0 | 0.674 | 0.246 |
| adrb2 | 0 | 0 | 0.348 | 0.990 |
| jak2 | 0 | 0 | 0.632 | 1.000 |

## Hard cutoff (NN Tanimoto ≤ 0.4 to any reference active)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.216–0.275); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.444; EF@1% 3.11 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.995); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.570; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.480; EF@1% 0.00 | 1.000; EF@1% 30.31 | 1.000; EF@1% 30.31 | 1.000 (1.000–1.000); EF@1% 30.31 | 0.558; EF@1% 6.06 | 0.560; EF@1% 0.00 | 0.623; EF@1% 0.00 |

## Optimistic upper bound: random split

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | — | — | — | — | — | — | — |
| adrb2 | 0 | 0.230 | 0.415; EF@1% 0.00 | 0.883; EF@1% 12.67 | 0.832; EF@1% 12.67 | — | 0.575; EF@1% 12.67 | 0.428; EF@1% 0.00 | 0.454; EF@1% 0.00 |
| jak2 | 0 | 0.417 | — | — | — | — | — | — | — |
