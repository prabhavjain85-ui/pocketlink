#!/usr/bin/env python3
"""RF + descriptor-RF for DUD-E benchmark (cluster + hard-cutoff test sets)."""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import numpy as np
from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem
from sklearn.ensemble import RandomForestClassifier

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH))

from buildHeldoutBenchmark import roc_auc  # noqa: E402

BENCHMARK = BENCH / "dude_benchmark.json"
OUT = BENCH / "dude_rf_split_results.json"
NN_CUTOFF = 0.4
BOOT = 800


def fp_bits(smiles: str) -> np.ndarray | None:
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    fp = AllChem.GetMorganFingerprintAsBitVect(m, 2, nBits=2048)
    arr = np.zeros((2048,), dtype=np.int8)
    DataStructs.ConvertToNumpyArray(fp, arr)
    return arr


def desc_vec(c: dict) -> list[float]:
    return [
        float(c.get("molecularWeight") or 0),
        float(c.get("xlogp") or 0),
        float(c.get("hbd") or 0),
        float(c.get("hba") or 0),
        float(c.get("rotatableBonds") or 0),
        float(c.get("formal_charge") or 0),
    ]


def filter_cutoff(compounds: list[dict]) -> list[dict]:
    actives = [c for c in compounds if c.get("role") == "active"]
    keep = {
        c.get("chembl_id") or c.get("name")
        for c in actives
        if (c.get("nn_tanimoto_to_ref") or 1.0) <= NN_CUTOFF
    }
    out = []
    for c in compounds:
        if c.get("role") == "active":
            if (c.get("chembl_id") or c.get("name")) in keep:
                out.append(c)
        elif c.get("role") == "decoy" and c.get("matched_to") in keep:
            out.append(c)
    return out


def ef_at_pct(labels: list[int], scores: list[float], pct: float = 0.01) -> float:
    n = len(labels)
    k = max(1, int(math.ceil(n * pct)))
    ranked = sorted(range(n), key=lambda i: scores[i], reverse=True)
    hits = sum(labels[i] for i in ranked[:k])
    n_pos = sum(labels)
    expected = n_pos * k / n if n else 0
    return hits / expected if expected > 0 else 0.0


def bootstrap_ci(labels: list[int], scores: list[float], n: int = BOOT) -> tuple[float | None, dict | None]:
    obs = roc_auc(labels, scores)
    if obs is None:
        return None, None
    rng = random.Random(42)
    samples = []
    idx = list(range(len(labels)))
    for _ in range(n):
        draw = [rng.choice(idx) for _ in idx]
        labs = [labels[i] for i in draw]
        scs = [scores[i] for i in draw]
        a = roc_auc(labs, scs)
        if a is not None:
            samples.append(a)
    samples.sort()
    ci = {"low": samples[int(0.025 * n)], "high": samples[int(0.975 * n)]}
    return obs, ci


def fit_predict_rf(X_tr, y_tr, X_te) -> list[float]:
    clf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    clf.fit(X_tr, np.array(y_tr))
    return clf.predict_proba(X_te)[:, 1].tolist()


def eval_mode(train: list[dict], test: list[dict], feature: str) -> dict | None:
    if feature == "morgan":
        X_tr, y_tr, X_te, y_te = [], [], [], []
        for c in train:
            b = fp_bits(c["smiles"])
            if b is None:
                continue
            X_tr.append(b)
            y_tr.append(1 if c["role"] == "active" else 0)
        for c in test:
            b = fp_bits(c["smiles"])
            if b is None:
                continue
            X_te.append(b)
            y_te.append(1 if c["role"] == "active" else 0)
        if sum(y_tr) < 5 or len(y_tr) - sum(y_tr) < 5 or sum(y_te) < 2 or len(y_te) - sum(y_te) < 2:
            return None
        prob = fit_predict_rf(np.stack(X_tr), y_tr, np.stack(X_te))
    else:
        X_tr, y_tr, X_te, y_te = [], [], [], []
        for c in train:
            X_tr.append(desc_vec(c))
            y_tr.append(1 if c["role"] == "active" else 0)
        for c in test:
            X_te.append(desc_vec(c))
            y_te.append(1 if c["role"] == "active" else 0)
        if sum(y_tr) < 5 or len(y_tr) - sum(y_tr) < 5 or sum(y_te) < 2 or len(y_te) - sum(y_te) < 2:
            return None
        prob = fit_predict_rf(np.array(X_tr), y_tr, np.array(X_te))
    auc, ci = bootstrap_ci(y_te, prob)
    return {
        "roc_auc": auc,
        "roc_auc_ci_95": ci,
        "ef_at_1pct": ef_at_pct(y_te, prob),
        "n_test": len(y_te),
        "n_test_actives": sum(y_te),
    }


def leakage_audit(train: list[dict], test: list[dict]) -> dict:
    tr = {c["smiles"] for c in train}
    te = {c["smiles"] for c in test}
    overlap = tr & te
    tr_a = {c["smiles"] for c in train if c["role"] == "active"}
    tr_d = {c["smiles"] for c in train if c["role"] == "decoy"}
    te_a = {c["smiles"] for c in test if c["role"] == "active"}
    te_d = {c["smiles"] for c in test if c["role"] == "decoy"}
    return {
        "train_smiles": len(tr),
        "test_smiles": len(te),
        "smiles_overlap_train_test": len(overlap),
        "test_actives_in_train": len(te_a & tr),
        "test_decoys_in_train": len(te_d & tr),
        "test_actives_in_train_decoys": len(te_a & tr_d),
        "train_on_reference_actives_decoys_only": True,
    }


def main():
    data = json.loads(BENCHMARK.read_text())
    rows = []
    for t in data.get("targets", []):
        train = t.get("train_compounds") or []
        test_cluster = t.get("compounds") or []
        test_cutoff = filter_cutoff(test_cluster)
        audit = leakage_audit(train, test_cluster)
        row = {
            "id": t["id"],
            "inchikey_removed_from_test": t.get("inchikey_removed_from_test", 0),
            "leakage_audit": audit,
            "modes": {
                "cluster": {
                    "rf_morgan": eval_mode(train, test_cluster, "morgan"),
                    "rf_descriptors": eval_mode(train, test_cluster, "descriptors"),
                },
                "cutoff": {
                    "rf_morgan": eval_mode(train, test_cutoff, "morgan"),
                    "rf_descriptors": eval_mode(train, test_cutoff, "descriptors"),
                },
            },
        }
        rows.append(row)
        print(t["id"], "cluster morgan", row["modes"]["cluster"]["rf_morgan"])
    OUT.write_text(json.dumps({"per_target": rows}, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
