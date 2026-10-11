# DUD-E held-out benchmark (cluster headline)

Benchmark ready (MW/logP sanity): **true**

## Per-target decoys and baselines

| Target | Actives | Decoys | Decoys/active | Source | MW AUC | logP AUC |
|---|---:|---:|---:|---|---:|---:|
| dpp4 | 30 | 1500 | 50.00 | DUD-E | 0.472 | 0.489 |
| adrb2 | 30 | 1500 | 50.00 | DUD-E | 0.537 | 0.480 |
| jak2 | 30 | 1500 | 50.00 | DUD-E | 0.509 | 0.522 |

> **DUD-E analogue bias:** property-matched decoys may inflate similarity-only methods vs true inactive distributions.

> **Decoy assignment (eval):** independent nearest-50 per test active from the DUD-E decoy pool (repeats allowed across actives). See `DUDE_RESULTS.md`.

## Leakage / split metadata

| Target | InChIKey removed (test) | NN Tanimoto mean (test actives) | NN min | NN max |
|---|---:|---:|---:|---:|
| dpp4 | 0 | 0.105 | 0.088 | 0.120 |
| adrb2 | 0 | 0.230 | 0.161 | 0.288 |
| jak2 | 0 | 0.417 | 0.253 | 0.686 |

## Headline: cluster split (Murcko overlap 0; ROC-AUC 95% CI; EF@1%)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.623; EF@1% 3.19 | 0.623; EF@1% 3.19 | 0.623; EF@1% 3.19 | 0.285 (0.272–0.298); EF@1% 0.00 | 0.472; EF@1% 0.00 | 0.489; EF@1% 0.00 | 0.459; EF@1% 0.00 |
| adrb2 | 0 | 0.230 | 0.758; EF@1% 3.19 | 0.758; EF@1% 3.19 | 0.758; EF@1% 3.19 | 0.998 (0.996–1.000); EF@1% 47.81 | 0.537; EF@1% 3.19 | 0.480; EF@1% 0.00 | 0.558; EF@1% 3.19 |
| jak2 | 0 | 0.417 | 0.562; EF@1% 3.19 | 0.562; EF@1% 3.19 | 0.562; EF@1% 3.19 | 1.000 (1.000–1.000); EF@1% 51.00 | 0.509; EF@1% 6.38 | 0.522; EF@1% 0.00 | 0.403; EF@1% 0.00 |

### Overall (macro mean of per-target AUCs)

| Method | Mean AUC |
|---|---:|
| legacy | 0.648 |
| similarity | 0.648 |
| combined | 0.648 |
| rf | 0.761 |
| mw | 0.506 |
| logp | 0.497 |
| random | 0.473 |

**Combined beats similarity on cluster split:** 0/3 targets (no at majority).

**Legacy (heuristic) beats RF on cluster split:** 1/3 targets (no at majority).

### RF sanity (Morgan RF train=ref actives+decoys; test=cluster/cutoff sets)

| Target | Train/test SMILES overlap | Test actives in train | Descriptor-RF AUC (cluster) | Morgan RF AUC (cluster) |
|---|---:|---:|---:|---:|
| dpp4 | 0 | 0 | 0.693 | 0.285 |
| adrb2 | 5 | 0 | 0.380 | 0.998 |
| jak2 | 189 | 0 | 0.699 | 1.000 |

## Hard cutoff (NN Tanimoto ≤ 0.4 to any reference active)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.623; EF@1% 3.19 | 0.623; EF@1% 3.19 | 0.623; EF@1% 3.19 | 0.285 (0.272–0.298); EF@1% 0.00 | 0.472; EF@1% 0.00 | 0.489; EF@1% 0.00 | 0.443; EF@1% 0.00 |
| adrb2 | 0 | 0.230 | 0.758; EF@1% 3.19 | 0.758; EF@1% 3.19 | 0.758; EF@1% 3.19 | 0.998 (0.996–1.000); EF@1% 47.81 | 0.537; EF@1% 3.19 | 0.480; EF@1% 0.00 | 0.501; EF@1% 3.19 |
| jak2 | 0 | 0.417 | 0.502; EF@1% 0.00 | 0.502; EF@1% 0.00 | 0.502; EF@1% 0.00 | 1.000 (1.000–1.000); EF@1% 51.00 | 0.519; EF@1% 5.67 | 0.571; EF@1% 0.00 | 0.506; EF@1% 0.00 |

## Optimistic upper bound: random split

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | — | — | — | — | — | — | — |
| adrb2 | 0 | 0.230 | 0.415; EF@1% 0.00 | 0.415; EF@1% 0.00 | 0.415; EF@1% 0.00 | — | 0.575; EF@1% 12.67 | 0.428; EF@1% 0.00 | 0.373; EF@1% 0.00 |
| jak2 | 0 | 0.417 | — | — | — | — | — | — | — |
