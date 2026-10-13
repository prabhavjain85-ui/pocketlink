#!/usr/bin/env python3
"""
Actives vs decoys enrichment on held-out test compounds (train/test split by ChEMBL ID hash).
Train split is used only when subsampling decoys; metrics reported on test split only.
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.metrics import bootstrap_auc_ci, enrichment_factor, roc_auc
from lib.session import DockingSession, load_config

OUT = ROOT / "results" / "enrichment.json"

ENRICHMENT_PANEL = [
    {"target_id": "egfr", "gene": "EGFR", "pdb_id": "4I23", "ligand_resn": "1C9", "ligand_chain": "A", "reference_smiles": "COc1cc2ncnc(Nc3ccc(F)cc3Cl)c2cc1OCCCN1CCOCC1"},
    {"target_id": "jak2", "gene": "JAK2", "pdb_id": "4IVB", "ligand_resn": "1J5", "ligand_chain": "A", "reference_smiles": "Cc1cnc(nc1Nc2cccc(c2)S(=O)(=O)NC(C)(C)C)Nc3ccc(cc3)N4CCN(CC4)C"},
    {"target_id": "pde5a", "gene": "PDE5A", "pdb_id": "1UDT", "ligand_resn": "VIA", "ligand_chain": "A", "reference_smiles": "CCCc1c2c(n(n1)C)C(=O)NC(=N2)c3cc(ccc3OCC)S(=O)(=O)N4CCN(CC4)C"},
]

MAX_ACTIVES = 18
MAX_DECOYS = 50
TRAIN_FRAC = 0.55


def _get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.loads(resp.read().decode())


def target_chembl_id(gene: str) -> str | None:
    q = urllib.parse.urlencode({"pref_name__icontains": gene, "limit": 10})
    url = f"https://www.ebi.ac.uk/chembl/api/data/target.json?{q}"
    data = _get_json(url)
    for t in data.get("targets") or []:
        if gene.upper() in (t.get("pref_name") or "").upper():
            return t.get("target_chembl_id")
    targets = data.get("targets") or []
    return targets[0].get("target_chembl_id") if targets else None


def fetch_compounds(target_chembl: str, active: bool) -> list[dict]:
    threshold = "pchembl_value__gte" if active else "pchembl_value__lt"
    val = "6" if active else "5"
    q = urllib.parse.urlencode(
        {
            "target_chembl_id": target_chembl,
            "standard_type__in": "Ki,IC50",
            "standard_relation": "=",
            threshold: val,
            "pchembl_value__isnull": "false",
            "limit": 250,
        }
    )
    url = f"https://www.ebi.ac.uk/chembl/api/data/activity.json?{q}"
    data = _get_json(url)
    seen = set()
    out = []
    for act in data.get("activities") or []:
        mid = act.get("molecule_chembl_id")
        if not mid or mid in seen:
            continue
        smi = act.get("canonical_smiles")
        if not smi:
            continue
        seen.add(mid)
        out.append({"chembl_id": mid, "smiles": smi, "pchembl": act.get("pchembl_value")})
    return out


def train_test_split(items: list[dict], train_frac: float = 0.65) -> tuple[list[dict], list[dict]]:
    train, test = [], []
    for it in items:
        h = int(hashlib.md5(it["chembl_id"].encode()).hexdigest(), 16) % 100
        if h < int(train_frac * 100):
            train.append(it)
        else:
            test.append(it)
    return train, test


def main() -> None:
    cfg = load_config()
    work = ROOT / "cache" / "runs"
    results = []
    for panel in ENRICHMENT_PANEL:
        tid = target_chembl_id(panel["gene"])
        if not tid:
            print(f"skip {panel['target_id']}: no ChEMBL target", flush=True)
            continue
        actives = fetch_compounds(tid, active=True)[:MAX_ACTIVES * 2]
        decoys = fetch_compounds(tid, active=False)[:MAX_DECOYS * 2]
        act_train, act_test = train_test_split(actives, train_frac=TRAIN_FRAC)
        dec_train, dec_test = train_test_split(decoys, train_frac=TRAIN_FRAC)
        act_test = act_test[:MAX_ACTIVES]
        dec_test = dec_test[:MAX_DECOYS]
        if len(act_test) < 6 or len(dec_test) < 12:
            print(f"skip {panel['target_id']}: insufficient test compounds", flush=True)
            continue

        sess = DockingSession(panel, work)
        test_active_ids = {c["chembl_id"] for c in act_test}
        labels: list[bool] = []
        scores: list[float] = []
        for compound in act_test + dec_test:
            is_active = compound["chembl_id"] in test_active_ids
            pose, score, err = sess.dock_smiles(
                compound["smiles"],
                seed=int(cfg["redock_seeds"][0]),
                work_subdir=f"enrich_{compound['chembl_id']}",
            )
            if score is None:
                continue
            labels.append(is_active)
            scores.append(-float(score))

        auc_ci = bootstrap_auc_ci(labels, scores, n_boot=int(cfg["bootstrap_n"]), seed=int(cfg["bootstrap_seed"]))
        ef1 = enrichment_factor(labels, scores, fraction=0.01)
        results.append(
            {
                "target_id": panel["target_id"],
                "gene": panel["gene"],
                "chembl_target": tid,
                "n_test_actives": sum(labels),
                "n_test_decoys": len(labels) - sum(labels),
                "n_train_actives": len(act_train),
                "n_train_decoys": len(dec_train),
                "roc_auc": auc_ci["auc"],
                "roc_auc_ci_95": [auc_ci["ci_low"], auc_ci["ci_high"]],
                "ef1pct": ef1,
            }
        )
        print(f"[enrich] {panel['target_id']} AUC={auc_ci['auc']:.3f} EF1%={ef1}", flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {"generated_at": datetime.now(timezone.utc).isoformat(), "targets": results},
            indent=2,
        )
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
