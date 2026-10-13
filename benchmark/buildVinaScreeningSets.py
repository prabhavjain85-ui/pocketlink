#!/usr/bin/env python3
"""Build ChEMBL actives + property-matched decoys for the 8 Vina-validated targets."""
from __future__ import annotations

import json
import sys
from pathlib import Path

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH))

from buildHeldoutBenchmark import (  # noqa: E402
    TARGETS,
    build_test_compounds,
    cluster_split_butina,
    dude_decoy_pool,
    fetch_chembl_actives,
    fetch_decoy_pool,
    load_exclusion_smiles,
    refine_decoy_sanity,
)
from dudeLoader import load_dude_set
from rdkit import Chem

VALIDATED_IDS = {
    t["target_id"]
    for t in json.loads((BENCH / "vina_validated_targets.json").read_text())["validated"]
}
OUT = BENCH / "vina_screening_compounds.json"


def main():
    out_targets = {}
    summary = []
    excluded = load_exclusion_smiles()
    chembl_pool = [r for r in fetch_decoy_pool() if r["smiles"] not in excluded]
    for tgt in TARGETS:
        if tgt["id"] not in VALIDATED_IDS:
            continue
        print(f"[build-vina-sets] {tgt['id']}...", flush=True)
        actives = fetch_chembl_actives(tgt["chembl_target"])
        actives = [
            a
            for a in actives
            if Chem.MolToSmiles(Chem.MolFromSmiles(a["smiles"])) not in excluded
        ]
        dude = load_dude_set(tgt["id"])
        if dude and dude.get("available"):
            decoy_smiles = [
                d["smiles"] if isinstance(d, dict) else d for d in dude["decoys"]
            ]
            pool = dude_decoy_pool(decoy_smiles)
        else:
            pool = chembl_pool
        if len(actives) < 70:
            summary.append({"id": tgt["id"], "error": f"only {len(actives)} ChEMBL actives"})
            continue
        ref_raw, test_raw = cluster_split_butina(actives)
        compounds = None
        mw_auc = logp_auc = None
        import random

        for attempt in range(12):
            random.seed(2000 + attempt * 19)
            compounds, decoy_count, mw_auc, logp_auc = build_test_compounds(
                test_raw, ref_raw, pool, use_property_match=True
            )
            compounds, mw_auc, logp_auc, decoy_count = refine_decoy_sanity(
                compounds, test_raw, ref_raw, pool
            )
            if (
                mw_auc is not None
                and logp_auc is not None
                and 0.45 <= mw_auc <= 0.55
                and 0.45 <= logp_auc <= 0.55
            ):
                break
        if not (
            mw_auc is not None
            and logp_auc is not None
            and 0.45 <= mw_auc <= 0.55
            and 0.45 <= logp_auc <= 0.55
        ):
            summary.append(
                {
                    "id": tgt["id"],
                    "error": "MW/logP sanity failed",
                    "mw_roc_auc": mw_auc,
                    "logp_roc_auc": logp_auc,
                }
            )
            continue
        act = [c["smiles"] for c in compounds if c.get("role") == "active"]
        dec = [c["smiles"] for c in compounds if c.get("role") == "decoy"]
        out_targets[tgt["id"]] = {
            "chembl_target": tgt["chembl_target"],
            "mw_roc_auc": mw_auc,
            "logp_roc_auc": logp_auc,
            "actives": act,
            "decoys": dec,
        }
        summary.append(
            {
                "id": tgt["id"],
                "n_actives": len(act),
                "n_decoys": len(dec),
                "mw_roc_auc": mw_auc,
                "logp_roc_auc": logp_auc,
            }
        )

    OUT.write_text(
        json.dumps(
            {
                "description": "ChEMBL test actives + property-matched decoys for Vina screening (validated targets)",
                "targets": out_targets,
                "build_summary": summary,
            },
            indent=2,
        )
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
