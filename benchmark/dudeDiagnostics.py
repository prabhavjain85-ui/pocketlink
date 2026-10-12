#!/usr/bin/env python3
"""DUD-E diagnostic stats: max-Tanimoto quartiles (written to dude_diagnostic.json)."""
from __future__ import annotations

import json
import statistics
from pathlib import Path

from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem

BENCH = Path(__file__).resolve().parent
BENCHMARK = BENCH / "dude_benchmark.json"
OUT = BENCH / "dude_diagnostic.json"


def fp_bits(smiles: str):
    m = Chem.MolFromSmiles(smiles)
    if m is None:
        return None
    return AllChem.GetMorganFingerprintAsBitVect(m, 2, nBits=2048)


def max_tanimoto(query_fp, ref_fps: list) -> float:
    if not ref_fps or query_fp is None:
        return 0.0
    return max(DataStructs.TanimotoSimilarity(query_fp, r) for r in ref_fps)


def quartiles(vals: list[float]) -> dict:
    if not vals:
        return {"min": None, "q1": None, "median": None, "q3": None, "max": None, "n": 0}
    s = sorted(vals)
    n = len(s)

    def pct(p: float) -> float:
        i = (n - 1) * p
        lo = int(i)
        hi = min(lo + 1, n - 1)
        w = i - lo
        return s[lo] * (1 - w) + s[hi] * w

    return {
        "min": s[0],
        "q1": pct(0.25),
        "median": statistics.median(s),
        "q3": pct(0.75),
        "max": s[-1],
        "n": n,
    }


def main():
    data = json.loads(BENCHMARK.read_text())
    out = {"per_target": {}}
    for t in data.get("targets", []):
        tid = t["id"]
        ref = t.get("reference_actives") or []
        test = t.get("compounds") or []
        ref_fps_all = []
        for r in ref:
            fp = fp_bits(r["smiles"])
            if fp is not None:
                ref_fps_all.append(fp)

        test_actives = [c for c in test if c.get("role") == "active"]
        test_decoys = [c for c in test if c.get("role") == "decoy"]

        act_sims = []
        for c in test_actives:
            q = fp_bits(c["smiles"])
            act_sims.append(max_tanimoto(q, ref_fps_all))

        dec_sims = []
        for c in test_decoys:
            q = fp_bits(c["smiles"])
            dec_sims.append(max_tanimoto(q, ref_fps_all))

        ref_loo = []
        for i, r in enumerate(ref):
            q = fp_bits(r["smiles"])
            others = [ref_fps_all[j] for j in range(len(ref_fps_all)) if j != i]
            ref_loo.append(max_tanimoto(q, others))

        out["per_target"][tid] = {
            "max_tanimoto_to_reference": {
                "test_actives": quartiles(act_sims),
                "test_decoys": quartiles(dec_sims),
                "reference_actives_loo": quartiles(ref_loo),
            },
            "cluster_active_groups": t.get("cluster_active_groups") or [],
            "n_reference_actives_kept": t.get("n_ref_actives"),
            "n_test_actives": t.get("n_test_actives"),
            "n_test_decoys": sum(1 for c in test if c.get("role") == "decoy"),
        }
    OUT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
