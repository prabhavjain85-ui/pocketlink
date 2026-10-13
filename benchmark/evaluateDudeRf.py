#!/usr/bin/env python3
"""Morgan FP (radius 2, 2048) random forest baseline on DUD-E benchmark targets."""
from __future__ import annotations

import json
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
OUT = BENCH / "dude_rf_results.json"


def fp_bits(smiles: str) -> np.ndarray | None:
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    fp = AllChem.GetMorganFingerprintAsBitVect(m, 2, nBits=2048)
    arr = np.zeros((2048,), dtype=np.int8)
    DataStructs.ConvertToNumpyArray(fp, arr)
    return arr


def eval_target(train: list[dict], test: list[dict]) -> dict | None:
    X_tr, y_tr = [], []
    for c in train:
        b = fp_bits(c["smiles"])
        if b is None:
            continue
        X_tr.append(b)
        y_tr.append(1 if c["role"] == "active" else 0)
    if sum(y_tr) < 5 or len(y_tr) - sum(y_tr) < 5:
        return None
    X_te, y_te = [], []
    for c in test:
        b = fp_bits(c["smiles"])
        if b is None:
            continue
        X_te.append(b)
        y_te.append(1 if c["role"] == "active" else 0)
    if sum(y_te) < 2 or len(y_te) - sum(y_te) < 2:
        return None
    clf = RandomForestClassifier(
        n_estimators=200, max_depth=None, random_state=42, n_jobs=-1
    )
    clf.fit(np.stack(X_tr), np.array(y_tr))
    prob = clf.predict_proba(np.stack(X_te))[:, 1]
    return {"roc_auc": roc_auc(y_te, prob.tolist()), "n_test": len(y_te)}


def main():
    if not BENCHMARK.exists():
        print("missing dude_benchmark.json")
        sys.exit(1)
    data = json.loads(BENCHMARK.read_text())
    rows = []
    for t in data.get("targets", []):
        train = t.get("train_compounds") or []
        test = t.get("compounds") or []
        res = eval_target(train, test)
        rows.append({"id": t["id"], "rf": res})
        print(t["id"], res)
    OUT.write_text(json.dumps({"per_target": rows}, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
