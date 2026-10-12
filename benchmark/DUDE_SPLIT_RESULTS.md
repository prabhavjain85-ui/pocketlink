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
| dpp4 | 40 | 1042 | 30 | 250 | 0.638 | 0.116 | 0.133 | 0.246 (0.216–0.275) | yes | yes |
| adrb2 | 40 | 1094 | 30 | 546 | 0.729 | 0.907 | 0.921 | 0.990 (0.982–0.995) | no | yes |
| jak2 | 40 | 975 | 30 | 999 | 0.542 | 1.000 | 1.000 | 1.000 (1.000–1.000) | no | no |

> **Scoring paths:** legacy = `rankCandidatesLocal` → `scoreOne` (heuristic-v2, no `rankMode`); similarity = same with `rankMode:"similarity"` + Morgan Tanimoto vs reference actives; combined = `combinedTriageScore` (0.35/0.65). See `src/scoreCandidates.js` and `benchmark/similarityForBench.mjs`.

## Headline: cluster split (Murcko overlap 0; ROC-AUC 95% CI; EF@1%)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.216–0.275); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.465; EF@1% 3.11 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.995); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.452; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.542; EF@1% 3.12 | 1.000; EF@1% 34.30 | 1.000; EF@1% 34.30 | 1.000 (1.000–1.000); EF@1% 34.30 | 0.536; EF@1% 9.35 | 0.515; EF@1% 0.00 | 0.606; EF@1% 3.12 |

### Overall (macro mean of per-target AUCs)

| Method | Mean AUC |
|---|---:|
| legacy | 0.636 |
| similarity | 0.674 |
| combined | 0.685 |
| rf | 0.745 |
| mw | 0.522 |
| logp | 0.492 |
| random | 0.508 |

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
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.216–0.275); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.433; EF@1% 0.00 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.995); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.479; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.480; EF@1% 0.00 | 1.000; EF@1% 30.31 | 1.000; EF@1% 30.31 | 1.000 (1.000–1.000); EF@1% 30.31 | 0.558; EF@1% 6.06 | 0.560; EF@1% 0.00 | 0.453; EF@1% 0.00 |

## Optimistic upper bound: random split

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | — | — | — | — | — | — | — |
| adrb2 | 0 | 0.230 | 0.415; EF@1% 0.00 | 0.883; EF@1% 12.67 | 0.832; EF@1% 12.67 | — | 0.575; EF@1% 12.67 | 0.428; EF@1% 0.00 | 0.383; EF@1% 3.17 |
| jak2 | 0 | 0.417 | — | — | — | — | — | — | — |
