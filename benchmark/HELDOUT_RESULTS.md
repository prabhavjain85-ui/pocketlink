# Held-out benchmark results

Benchmark ready (MW/logP sanity): **true**

## Per-target decoys and baselines

| Target | Actives | Decoys | Decoys/active | Source | MW AUC | logP AUC |
|---|---:|---:|---:|---|---:|---:|
| adrb2 | 30 | 311 | 10.37 | DUD-E decoys + ChEMBL actives | 0.550 | 0.497 |
| hiv_pr | 30 | 1147 | 38.23 | DUD-E decoys + ChEMBL actives | 0.522 | 0.515 |
| sars_mpro | 30 | 301 | 10.03 | chembl_self (less trustworthy; no DUD-E/LIT-PCBA set) | 0.508 | 0.522 |

## Headline: cluster split (ROC-AUC 95% CI; EF@1%)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|
| adrb2 | 0 | 0.283 | 0.300; EF@1% 0.00 | 0.300; EF@1% 0.00 | 0.300; EF@1% 0.00 | 0.550; EF@1% 11.37 | 0.497; EF@1% 5.68 | 0.489; EF@1% 0.00 |
| hiv_pr | 0 | 0.186 | 0.554; EF@1% 0.00 | 0.554; EF@1% 0.00 | 0.554; EF@1% 0.00 | 0.522; EF@1% 13.08 | 0.515; EF@1% 0.00 | 0.454; EF@1% 0.00 |
| sars_mpro | 0 | 0.611 | 0.574; EF@1% 2.76 | 0.574; EF@1% 2.76 | 0.574; EF@1% 2.76 | 0.508; EF@1% 0.00 | 0.522; EF@1% 0.00 | 0.567; EF@1% 0.00 |

### Overall (macro mean of per-target AUCs)

| Method | Mean AUC |
|---|---:|
| legacy | 0.476 |
| similarity | 0.476 |
| combined | 0.476 |
| mw | 0.527 |
| logp | 0.511 |
| random | 0.504 |

**Combined beats similarity on cluster split:** 0/3 targets (no at majority).

## Hard cutoff (NN Tanimoto ≤ 0.4 to reference actives)

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|
| adrb2 | 0 | 0.283 | 0.300; EF@1% 0.00 | 0.300; EF@1% 0.00 | 0.300; EF@1% 0.00 | 0.550; EF@1% 11.37 | 0.497; EF@1% 5.68 | 0.502; EF@1% 2.84 |
| hiv_pr | 0 | 0.186 | 0.554; EF@1% 0.00 | 0.554; EF@1% 0.00 | 0.554; EF@1% 0.00 | 0.522; EF@1% 13.08 | 0.515; EF@1% 0.00 | 0.353; EF@1% 0.00 |
| sars_mpro | 0 | 0.611 | — | — | — | — | — | — |

## Optimistic upper bound: random split

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|
| adrb2 | 0 | 0.283 | 0.415; EF@1% 0.00 | 0.415; EF@1% 0.00 | 0.415; EF@1% 0.00 | 0.575; EF@1% 12.67 | 0.428; EF@1% 0.00 | 0.582; EF@1% 3.17 |
| hiv_pr | 0 | 0.186 | 0.501; EF@1% 3.07 | 0.501; EF@1% 3.07 | 0.501; EF@1% 3.07 | 0.540; EF@1% 18.40 | 0.335; EF@1% 0.00 | 0.534; EF@1% 0.00 |
| sars_mpro | 0 | 0.611 | 0.434; EF@1% 2.99 | 0.434; EF@1% 2.99 | 0.434; EF@1% 2.99 | 0.508; EF@1% 8.97 | 0.457; EF@1% 2.99 | 0.476; EF@1% 0.00 |
