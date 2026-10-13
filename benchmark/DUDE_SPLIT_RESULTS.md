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

## Cluster split — drug-likeness-only baseline (scoreOne with protein=null)

| Target | AUC | 95% CI | EF@1% |
|---|---:|---|---:|
| dpp4 | 0.6380 | [0.6100, 0.6680] | 3.11 |
| adrb2 | 0.7289 | [0.6548, 0.7918] | 3.20 |
| jak2 | 0.5470 | [0.4394, 0.6493] | 3.12 |

## Cluster split — drug-likeness paired ΔAUC vs other methods

| Target | Comparison | Mean ΔAUC | 95% CI | Significant |
|---|---|---:|---|:---:|
| dpp4 | druglikeness − legacy | 0.0000 | [0.0000, 0.0000] | no |
| dpp4 | druglikeness − similarity | 0.5215 | [0.4744, 0.5677] | yes |
| dpp4 | druglikeness − combined | 0.5039 | [0.4615, 0.5454] | yes |
| dpp4 | druglikeness − morgan_rf | 0.3917 | [0.3520, 0.4360] | yes |
| adrb2 | druglikeness − legacy | 0.0000 | [0.0000, 0.0000] | no |
| adrb2 | druglikeness − similarity | -0.1805 | [-0.2506, -0.1117] | yes |
| adrb2 | druglikeness − combined | -0.1936 | [-0.2543, -0.1326] | yes |
| adrb2 | druglikeness − morgan_rf | -0.2629 | [-0.3320, -0.1991] | yes |
| jak2 | druglikeness − legacy | 0.0049 | [0.0000, 0.0155] | no |
| jak2 | druglikeness − similarity | -0.4552 | [-0.5606, -0.3507] | yes |
| jak2 | druglikeness − combined | -0.4552 | [-0.5606, -0.3507] | yes |
| jak2 | druglikeness − morgan_rf | -0.4552 | [-0.5606, -0.3507] | yes |

## DPP4 score direction sample (cluster test set)

Verdict: higher score ⇒ more likely active (**true**); benchmark label active = **1** (bootstrap.mjs rocAuc sorts by descending score; labels true=active).

| ID | SMILES | label | legacy | similarity | combined | morgan_rf |
|---|---|---:|---:|---:|---:|---:|
| CHEMBL365661 | C=CC1([C@H](N)C(=O)N2[C@H](C#N)C[C@@H]3C[C@@H]32)CCCC1 | 1 | 24.00 | 9.00 | 14.00 | 0.0000 |
| CHEMBL190803 | C=CC1([C@@H]([NH3+])C(=O)N2[C@@H]3C[C@@H]3C[C@@H]2C#N)CCOCC1 | 1 | 24.00 | 12.00 | 16.00 | 0.0000 |
| CHEMBL190803 | C=CC1([C@@H](N)C(=O)N2[C@@H]3C[C@@H]3C[C@@H]2C#N)CCOCC1 | 1 | 24.00 | 12.00 | 16.00 | 0.0000 |
| CHEMBL190803 | C=CC1([C@@H]([NH3+])C(=O)N2[C@@H](C#N)C[C@@H]3C[C@@H]32)CCOCC1 | 1 | 24.00 | 12.00 | 16.00 | 0.0000 |
| CHEMBL190803 | C=CC1([C@@H](N)C(=O)N2[C@@H](C#N)C[C@@H]3C[C@@H]32)CCOCC1 | 1 | 24.00 | 12.00 | 16.00 | 0.0000 |
| DUDE-D-1852 | Cc1n[nH]cc1Cn1ccc2c1CC(C)(C)C[C@H]2O | 0 | 24.00 | 14.00 | 18.00 | 0.0000 |
| DUDE-D-5715 | CCC1CCN(c2ccc3c(c2)NC(=O)[C@H]3N)CC1 | 0 | 24.00 | 15.00 | 18.00 | 0.0000 |
| DUDE-D-10552 | CCc1nc2cc(N)ccc2n1[C@@H](C)[C@H]1CCCO1 | 0 | 24.00 | 17.00 | 19.00 | 0.0050 |
| DUDE-D-2540 | CC1(C)CC(=O)c2cnc(NC3CCCC3)nc2C1 | 0 | 24.00 | 15.00 | 18.00 | 0.0450 |
| DUDE-D-25528 | Cc1nc(S(=O)(=O)N[C@H]2CCC[NH2+]C2)cn1C | 0 | 22.00 | 18.00 | 19.00 | 0.0000 |

## Max Morgan Tanimoto to reference actives (quartiles)

| Target | Set | min | Q1 | median | Q3 | max | n |
|---|---|---:|---:|---:|---:|---:|---:|
| dpp4 | test_actives | 0.0882 | 0.0990 | 0.1087 | 0.1168 | 0.1196 | 30 |
| dpp4 | test_decoys | 0.0778 | 0.1277 | 0.1429 | 0.1643 | 0.2278 | 250 |
| dpp4 | reference_actives_loo | 0.7083 | 0.8179 | 0.8551 | 1.0000 | 1.0000 | 40 |
| adrb2 | test_actives | 0.1613 | 0.1932 | 0.2194 | 0.2714 | 0.2877 | 30 |
| adrb2 | test_decoys | 0.0659 | 0.1317 | 0.1560 | 0.1807 | 0.2530 | 546 |
| adrb2 | reference_actives_loo | 0.6727 | 0.8396 | 1.0000 | 1.0000 | 1.0000 | 40 |
| jak2 | test_actives | 0.2530 | 0.3686 | 0.3926 | 0.4362 | 0.6857 | 30 |
| jak2 | test_decoys | 0.0909 | 0.1386 | 0.1532 | 0.1686 | 0.2353 | 999 |
| jak2 | reference_actives_loo | 0.6000 | 0.6875 | 0.7689 | 0.8290 | 1.0000 | 40 |

## DPP4 active clusters (Butina Tanimoto 0.4; Murcko-disjoint test assignment)

| cluster_id | size | partition |
|---:|---:|---|
| 0 | 68 | test |
| 1 | 23 | reference |
| 2 | 17 | reference |
| 3 | 16 | reference |
| 4 | 15 | reference |
| 5 | 13 | reference |
| 6 | 13 | reference |
| 7 | 12 | reference |
| 8 | 12 | reference |
| 9 | 12 | reference |
| 10 | 12 | reference |
| 11 | 12 | reference |
| 12 | 12 | reference |
| 13 | 11 | reference |
| 14 | 11 | reference |
| 15 | 11 | reference |
| 16 | 10 | reference |
| 17 | 10 | reference |
| 18 | 9 | reference |
| 19 | 9 | reference |
| 20 | 9 | reference |
| 21 | 9 | reference |
| 22 | 9 | reference |
| 23 | 9 | reference |
| 24 | 8 | reference |
| 25 | 8 | reference |
| 26 | 8 | reference |
| 27 | 8 | reference |
| 28 | 8 | reference |
| 29 | 8 | reference |
| 30 | 8 | reference |
| 31 | 8 | reference |
| 32 | 8 | reference |
| 33 | 8 | reference |
| 34 | 7 | reference |
| 35 | 7 | reference |
| 36 | 7 | reference |
| 37 | 7 | reference |
| 38 | 6 | reference |
| 39 | 6 | reference |
| 40 | 6 | reference |
| 41 | 6 | reference |
| 42 | 6 | reference |
| 43 | 6 | reference |
| 44 | 6 | reference |
| 45 | 6 | reference |
| 46 | 6 | reference |
| 47 | 6 | reference |
| 48 | 6 | reference |
| 49 | 6 | reference |
| 50 | 6 | reference |
| 51 | 6 | reference |
| 52 | 5 | reference |
| 53 | 5 | reference |
| 54 | 5 | reference |
| 55 | 5 | reference |
| 56 | 5 | reference |
| 57 | 5 | reference |
| 58 | 5 | reference |
| 59 | 5 | reference |
| 60 | 5 | reference |
| 61 | 5 | reference |
| 62 | 5 | reference |
| 63 | 5 | reference |
| 64 | 4 | reference |
| 65 | 4 | reference |
| 66 | 4 | reference |
| 67 | 4 | reference |
| 68 | 4 | reference |
| 69 | 4 | reference |
| 70 | 4 | reference |
| 71 | 4 | reference |
| 72 | 4 | reference |
| 73 | 4 | reference |
| 74 | 4 | reference |
| 75 | 4 | reference |
| 76 | 4 | reference |
| 77 | 4 | reference |
| 78 | 4 | reference |
| 79 | 4 | reference |
| 80 | 4 | reference |
| 81 | 4 | reference |
| 82 | 4 | reference |
| 83 | 4 | reference |
| 84 | 4 | reference |
| 85 | 4 | reference |
| 86 | 4 | reference |
| 87 | 4 | reference |
| 88 | 4 | reference |
| 89 | 4 | reference |
| 90 | 4 | reference |
| 91 | 4 | reference |
| 92 | 4 | reference |
| 93 | 4 | reference |
| 94 | 4 | reference |
| 95 | 4 | reference |
| 96 | 4 | reference |
| 97 | 4 | reference |
| 98 | 4 | reference |
| 99 | 3 | reference |
| 100 | 3 | reference |
| 101 | 3 | reference |
| 102 | 3 | reference |
| 103 | 3 | reference |
| 104 | 3 | reference |
| 105 | 3 | reference |
| 106 | 3 | reference |
| 107 | 3 | reference |
| 108 | 3 | reference |
| 109 | 3 | reference |
| 110 | 3 | reference |
| 111 | 3 | reference |
| 112 | 3 | reference |
| 113 | 3 | reference |
| 114 | 3 | reference |
| 115 | 3 | reference |
| 116 | 3 | reference |
| 117 | 3 | reference |
| 118 | 3 | reference |
| 119 | 3 | reference |
| 120 | 3 | reference |
| 121 | 3 | reference |
| 122 | 3 | reference |
| 123 | 3 | reference |
| 124 | 3 | reference |
| 125 | 3 | reference |
| 126 | 3 | reference |
| 127 | 3 | reference |
| 128 | 3 | reference |
| 129 | 3 | reference |
| 130 | 3 | reference |
| 131 | 3 | reference |
| 132 | 3 | reference |
| 133 | 2 | reference |
| 134 | 2 | reference |
| 135 | 2 | reference |
| 136 | 2 | reference |
| 137 | 2 | reference |
| 138 | 2 | reference |
| 139 | 2 | reference |
| 140 | 2 | reference |
| 141 | 2 | reference |
| 142 | 2 | reference |
| 143 | 2 | reference |
| 144 | 2 | reference |
| 145 | 2 | reference |
| 146 | 2 | reference |
| 147 | 2 | reference |
| 148 | 2 | reference |
| 149 | 2 | reference |
| 150 | 2 | reference |
| 151 | 2 | reference |
| 152 | 2 | reference |
| 153 | 2 | reference |
| 154 | 2 | reference |
| 155 | 2 | reference |
| 156 | 2 | reference |
| 157 | 2 | reference |
| 158 | 2 | reference |
| 159 | 2 | reference |
| 160 | 2 | reference |
| 161 | 2 | reference |
| 162 | 2 | reference |
| 163 | 2 | reference |
| 164 | 2 | reference |
| 165 | 2 | reference |
| 166 | 2 | reference |
| 167 | 2 | reference |
| 168 | 2 | reference |
| 169 | 2 | reference |
| 170 | 2 | reference |
| 171 | 2 | reference |
| 172 | 2 | reference |
| 173 | 2 | reference |
| 174 | 2 | reference |
| 175 | 2 | reference |
| 176 | 2 | reference |
| 177 | 2 | reference |
| 178 | 2 | reference |
| 179 | 2 | reference |
| 180 | 2 | reference |
| 181 | 2 | reference |
| 182 | 2 | reference |
| 183 | 2 | reference |
| 184 | 2 | reference |
| 185 | 2 | reference |
| 186 | 2 | reference |
| 187 | 2 | reference |
| 188 | 2 | reference |
| 189 | 2 | reference |
| 190 | 2 | reference |
| 191 | 2 | reference |
| 192 | 2 | reference |
| 193 | 2 | reference |
| 194 | 2 | reference |
| 195 | 2 | reference |
| 196 | 2 | reference |
| 197 | 2 | reference |
| 198 | 2 | reference |
| 199 | 2 | reference |
| 200 | 2 | reference |
| 201 | 2 | reference |
| 202 | 2 | reference |
| 203 | 2 | reference |
| 204 | 1 | reference |
| 205 | 1 | reference |
| 206 | 1 | reference |
| 207 | 1 | reference |
| 208 | 1 | reference |
| 209 | 1 | reference |
| 210 | 1 | reference |
| 211 | 1 | reference |
| 212 | 1 | reference |
| 213 | 1 | reference |
| 214 | 1 | reference |
| 215 | 1 | reference |
| 216 | 1 | reference |
| 217 | 1 | reference |
| 218 | 1 | reference |
| 219 | 1 | reference |
| 220 | 1 | reference |
| 221 | 1 | reference |
| 222 | 1 | reference |
| 223 | 1 | reference |
| 224 | 1 | reference |
| 225 | 1 | reference |
| 226 | 1 | reference |
| 227 | 1 | reference |
| 228 | 1 | reference |
| 229 | 1 | reference |
| 230 | 1 | reference |
| 231 | 1 | reference |
| 232 | 1 | reference |
| 233 | 1 | reference |
| 234 | 1 | reference |
| 235 | 1 | reference |
| 236 | 1 | reference |
| 237 | 1 | reference |
| 238 | 1 | reference |
| 239 | 1 | reference |
| 240 | 1 | reference |
| 241 | 1 | reference |
| 242 | 1 | reference |
| 243 | 1 | reference |
| 244 | 1 | reference |
| 245 | 1 | reference |
| 246 | 1 | reference |
| 247 | 1 | reference |
| 248 | 1 | reference |
| 249 | 1 | reference |
| 250 | 1 | reference |
| 251 | 1 | reference |
| 252 | 1 | reference |
| 253 | 1 | reference |
| 254 | 1 | reference |
| 255 | 1 | reference |
| 256 | 1 | reference |
| 257 | 1 | reference |
| 258 | 1 | reference |
| 259 | 1 | reference |
| 260 | 1 | reference |
| 261 | 1 | reference |
| 262 | 1 | reference |
| 263 | 1 | reference |
| 264 | 1 | reference |
| 265 | 1 | reference |
| 266 | 1 | reference |
| 267 | 1 | reference |
| 268 | 1 | reference |
| 269 | 1 | reference |
| 270 | 1 | reference |
| 271 | 1 | reference |
| 272 | 1 | reference |
| 273 | 1 | reference |
| 274 | 1 | reference |
| 275 | 1 | reference |
| 276 | 1 | reference |
| 277 | 1 | reference |
| 278 | 1 | reference |
| 279 | 1 | reference |
| 280 | 1 | reference |
| 281 | 1 | reference |
| 282 | 1 | reference |
| 283 | 1 | reference |
| 284 | 1 | reference |
| 285 | 1 | reference |
| 286 | 1 | reference |
| 287 | 1 | reference |
| 288 | 1 | reference |
| 289 | 1 | reference |
| 290 | 1 | reference |
| 291 | 1 | reference |
| 292 | 1 | reference |
| 293 | 1 | reference |
| 294 | 1 | reference |
| 295 | 1 | reference |
| 296 | 1 | reference |
| 297 | 1 | reference |
| 298 | 1 | reference |
| 299 | 1 | reference |
| 300 | 1 | reference |
| 301 | 1 | reference |
| 302 | 1 | reference |

## Random split — methods (paired bootstrap 95% CIs; optimistic upper bound)

| Target | Method | AUC | 95% CI | EF@1% |
|---|---|---:|---|---:|
| dpp4 | legacy | 0.5408 | [0.4532, 0.6187] | 3.23 |
| dpp4 | similarity | 0.4878 | [0.3746, 0.6190] | 19.36 |
| dpp4 | combined | 0.5431 | [0.4286, 0.6641] | 19.36 |
| dpp4 | morgan_rf | 0.8188 | [0.7411, 0.8824] | 19.36 |
| dpp4 | druglikeness | 0.5848 | [0.4946, 0.6654] | 3.23 |
| adrb2 | legacy | 0.3867 | [0.3062, 0.4643] | 0.00 |
| adrb2 | similarity | 0.9408 | [0.8965, 0.9731] | 29.90 |
| adrb2 | combined | 0.8855 | [0.8209, 0.9364] | 26.58 |
| adrb2 | morgan_rf | 0.9568 | [0.9307, 0.9778] | 29.90 |
| adrb2 | druglikeness | 0.4130 | [0.3238, 0.5044] | 0.00 |
| jak2 | legacy | 0.4568 | [0.3697, 0.5455] | 3.21 |
| jak2 | similarity | 0.9907 | [0.9759, 1.0000] | 35.33 |
| jak2 | combined | 0.9767 | [0.9372, 1.0000] | 35.33 |
| jak2 | morgan_rf | 0.9826 | [0.9494, 1.0000] | 35.33 |
| jak2 | druglikeness | 0.4594 | [0.3726, 0.5468] | 3.21 |

---

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
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.214–0.276); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.379; EF@1% 3.11 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.996); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.480; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.542; EF@1% 3.12 | 1.000; EF@1% 34.30 | 1.000; EF@1% 34.30 | 1.000 (1.000–1.000); EF@1% 34.30 | 0.536; EF@1% 9.35 | 0.515; EF@1% 0.00 | 0.444; EF@1% 0.00 |

### Overall (macro mean of per-target AUCs)

| Method | Mean AUC |
|---|---:|
| legacy | 0.636 |
| similarity | 0.674 |
| combined | 0.685 |
| rf | 0.745 |
| mw | 0.522 |
| logp | 0.492 |
| random | 0.434 |

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
| dpp4 | 0 | 0.105 | 0.638; EF@1% 3.11 | 0.116; EF@1% 0.00 | 0.133; EF@1% 0.00 | 0.246 (0.216–0.275); EF@1% 0.00 | 0.544; EF@1% 0.00 | 0.504; EF@1% 0.00 | 0.573; EF@1% 0.00 |
| adrb2 | 0 | 0.230 | 0.729; EF@1% 3.20 | 0.907; EF@1% 19.20 | 0.921; EF@1% 19.20 | 0.990 (0.982–0.995); EF@1% 19.20 | 0.487; EF@1% 0.00 | 0.459; EF@1% 0.00 | 0.475; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.480; EF@1% 0.00 | 1.000; EF@1% 30.31 | 1.000; EF@1% 30.31 | 1.000 (1.000–1.000); EF@1% 30.31 | 0.558; EF@1% 6.06 | 0.560; EF@1% 0.00 | 0.342; EF@1% 0.00 |

## Optimistic upper bound: random split

| Target | Murcko overlap | NN Tanimoto (mean) | legacy | similarity | combined | rf | mw | logp | random |
|---|:---:|:---:|:---|:---|:---|:---|:---|:---|:---|
| dpp4 | 0 | 0.105 | 0.541; EF@1% 3.23 | 0.488; EF@1% 19.36 | 0.543; EF@1% 19.36 | 0.819 (0.741–0.882); EF@1% 19.36 | 0.429; EF@1% 0.00 | 0.470; EF@1% 0.00 | 0.588; EF@1% 3.23 |
| adrb2 | 0 | 0.230 | 0.387; EF@1% 0.00 | 0.941; EF@1% 29.90 | 0.886; EF@1% 26.58 | 0.957 (0.931–0.978); EF@1% 29.90 | 0.461; EF@1% 0.00 | 0.411; EF@1% 0.00 | 0.509; EF@1% 0.00 |
| jak2 | 0 | 0.417 | 0.457; EF@1% 3.21 | 0.991; EF@1% 35.33 | 0.977; EF@1% 35.33 | 0.983 (0.949–1.000); EF@1% 35.33 | 0.447; EF@1% 0.00 | 0.628; EF@1% 3.21 | 0.498; EF@1% 0.00 |
