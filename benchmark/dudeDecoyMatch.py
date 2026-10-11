"""Assign DUD-E decoys to actives when mol2 block order is invalid."""
from __future__ import annotations

import math
import statistics
from typing import Iterable

PROP_KEYS = ("xlogp", "hbd", "hba", "rotatableBonds", "formal_charge")

DECOYS_PER_ACTIVE = 50
MATCH_SEED = 42


def prop_vector(entry: dict) -> list[float]:
    return [float(entry[k]) for k in PROP_KEYS]


def _standardize(rows: list[dict]) -> list[list[float]]:
    if not rows:
        return []
    cols = list(zip(*(prop_vector(r) for r in rows)))
    means = [statistics.fmean(c) for c in cols]
    stds = []
    for c, m in zip(cols, means):
        if len(c) < 2:
            stds.append(1.0)
            continue
        v = statistics.pvariance(c, m)
        stds.append(math.sqrt(v) if v > 1e-12 else 1.0)
    zrows = []
    for r in rows:
        pv = prop_vector(r)
        zrows.append([(pv[i] - means[i]) / stds[i] for i in range(len(PROP_KEYS))])
    return zrows


def _dist(z_a: list[float], z_b: list[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(z_a, z_b)))


def _rank_decoys_for_active(act: dict, decoys: list[dict], decoy_z: list[list[float]], z_a: list[float]):
    mw_a = act["molecularWeight"]
    lp_a = act["xlogp"]
    return sorted(
        range(len(decoys)),
        key=lambda di: (
            abs(decoys[di]["molecularWeight"] - mw_a),
            abs(decoys[di]["xlogp"] - lp_a),
            _dist(z_a, decoy_z[di]),
            decoys[di]["dude_idx"],
        ),
    )


def assign_decoys_greedy(
    actives: list[dict],
    decoys: list[dict],
    per_active: int = DECOYS_PER_ACTIVE,
    seed: int = MATCH_SEED,
) -> dict[int, list[int]]:
    """
    Full-target assignment without replacement (dude_idx order).
    Used for full-set MW/logP reporting only.
    """
    if not actives or not decoys:
        return {}
    decoy_z = _standardize(decoys)
    active_sorted = sorted(actives, key=lambda a: a["dude_idx"])
    active_z = _standardize(active_sorted)
    unused = set(range(len(decoys)))
    out: dict[int, list[int]] = {}
    for ai, act in enumerate(active_sorted):
        ranked = [di for di in _rank_decoys_for_active(act, decoys, decoy_z, active_z[ai]) if di in unused]
        chosen = ranked[:per_active]
        for di in chosen:
            unused.discard(di)
        out[act["dude_idx"]] = [decoys[di]["dude_idx"] for di in chosen]
    return out


def assign_decoys_eval_subset(
    actives: list[dict],
    decoys: list[dict],
    per_active: int = DECOYS_PER_ACTIVE,
) -> dict[int, list[int]]:
    """
    Eval-subset assignment: per active, 50 nearest decoys from the full DUD-E pool.
    Decoys may repeat across actives (DUD-E per-active sets overlap in property space;
    global no-replacement biases pooled MW AUC when test actives cluster).
    """
    if not actives or not decoys:
        return {}
    decoy_z = _standardize(decoys)
    active_z = _standardize(actives)
    out: dict[int, list[int]] = {}
    for act, z_a in zip(actives, active_z):
        ranked = _rank_decoys_for_active(act, decoys, decoy_z, z_a)
        chosen = ranked[:per_active]
        out[act["dude_idx"]] = [decoys[di]["dude_idx"] for di in chosen]
    return out


def mw_delta_distribution(
    actives: list[dict],
    decoys: list[dict],
    assignment: dict[int, list[int]],
) -> list[float]:
    dec_map = {d["dude_idx"]: d for d in decoys}
    deltas = []
    for act in actives:
        aids = assignment.get(act["dude_idx"], [])
        if not aids:
            continue
        dmws = [dec_map[j]["molecularWeight"] for j in aids if j in dec_map]
        if not dmws:
            continue
        deltas.append(abs(act["molecularWeight"] - statistics.median(dmws)))
    return deltas


def summarize_deltas(deltas: Iterable[float]) -> dict:
    xs = list(deltas)
    if not xs:
        return {"n": 0}
    xs_sorted = sorted(xs)
    n = len(xs)
    return {
        "n": n,
        "median": statistics.median(xs),
        "mean": statistics.fmean(xs),
        "p90": xs_sorted[int(0.9 * (n - 1))],
        "max": max(xs),
        "frac_within_25Da": sum(1 for x in xs if x <= 25) / n,
    }
