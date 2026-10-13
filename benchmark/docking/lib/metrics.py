"""ROC-AUC and enrichment metrics."""
from __future__ import annotations

import random


def roc_auc(labels: list[bool], scores: list[float]) -> float | None:
    pairs = list(zip(labels, scores))
    pairs.sort(key=lambda p: p[1], reverse=True)
    n_pos = sum(1 for y, _ in pairs if y)
    n_neg = len(pairs) - n_pos
    if not n_pos or not n_neg:
        return None
    tp = fp = prev_tp = prev_fp = 0
    auc = 0.0
    last = None
    for y, s in pairs:
        if s != last:
            auc += (tp + prev_tp) * (fp - prev_fp) / 2.0
            prev_tp, prev_fp, last = tp, fp, s
        if y:
            tp += 1
        else:
            fp += 1
    auc += (tp + prev_tp) * (fp - prev_fp) / 2.0
    return auc / (n_pos * n_neg)


def bootstrap_auc_ci(
    labels: list[bool], scores: list[float], n_boot: int = 800, seed: int = 42
) -> dict:
    base = roc_auc(labels, scores)
    if base is None:
        return {"auc": None, "ci_low": None, "ci_high": None}
    rng = random.Random(seed)
    n = len(labels)
    samples = []
    for _ in range(n_boot):
        idx = [rng.randrange(n) for _ in range(n)]
        labs = [labels[i] for i in idx]
        scs = [scores[i] for i in idx]
        a = roc_auc(labs, scs)
        if a is not None:
            samples.append(a)
    samples.sort()
    lo = samples[int(0.025 * len(samples))]
    hi = samples[int(0.975 * len(samples))]
    return {"auc": base, "ci_low": lo, "ci_high": hi}


def enrichment_factor(labels: list[bool], scores: list[float], fraction: float = 0.01) -> float | None:
    n = len(labels)
    n_act = sum(labels)
    if not n or not n_act:
        return None
    k = max(1, int(round(n * fraction)))
    ranked = sorted(range(n), key=lambda i: scores[i], reverse=True)
    hits = sum(1 for i in ranked[:k] if labels[i])
    random_rate = n_act / n
    return (hits / k) / random_rate if random_rate > 0 else None
