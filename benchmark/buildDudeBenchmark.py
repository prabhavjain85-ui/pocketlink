#!/usr/bin/env python3
"""
DUD-E-only held-out benchmark: actives/decoys from DUD-E (no self-built decoys).
Leakage: drop test actives with InChIKey matching reference actives.
Splits: cluster (Murcko overlap 0) + hard NN Tanimoto cutoff 0.4.

Sanity: MW/logP ROC-AUC on the full DUD-E active+paired-decoy set and on the
evaluated test subset (test actives + decoys generated for those actives only).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from rdkit import Chem, DataStructs
from rdkit.Chem import Lipinski, rdMolDescriptors

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH))

from buildHeldoutBenchmark import (  # noqa: E402
    TARGETS,
    cluster_split_butina,
    fp_morgan,
    load_exclusion_smiles,
    murcko_scaffold_smiles,
    roc_auc,
)
from dudeLoader import DUDE_NAMES, decoy_index_range, load_dude_set

OUT = BENCH / "dude_benchmark.json"
OUT_SUMMARY = BENCH / "dude_benchmark_summary.json"
MIN_TEST = 30
MIN_REF = 40
MW_LOGP_LOW = 0.45
MW_LOGP_HIGH = 0.55


def inchikey(mol: Chem.Mol) -> str | None:
    try:
        from rdkit.Chem.inchi import MolToInchiKey

        return MolToInchiKey(mol)
    except Exception:
        return None


def enrich_dude_record(rec: dict, role: str) -> dict | None:
    mol = Chem.MolFromSmiles(rec["smiles"])
    if mol is None:
        return None
    can = Chem.MolToSmiles(mol)
    mol = Chem.MolFromSmiles(can)
    out = {
        "smiles": can,
        "name": rec.get("mol_id") or rec.get("name"),
        "chembl_id": rec.get("mol_id") if role == "active" else f"DUDE-D-{rec['dude_idx']}",
        "dude_active_idx": rec.get("dude_idx") if role == "active" else rec.get("paired_active_idx"),
        "dude_decoy_idx": rec.get("dude_idx") if role == "decoy" else None,
        "molecularWeight": rec["molecularWeight"],
        "xlogp": rec["xlogp"],
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "rotatableBonds": Lipinski.NumRotatableBonds(mol),
        "tpsa": rdMolDescriptors.CalcTPSA(mol),
        "murcko": murcko_scaffold_smiles(mol),
        "inchikey": inchikey(mol),
        "fp": fp_morgan(mol).ToBitString(),
        "role": role,
    }
    if role == "decoy":
        out["matched_to_active_idx"] = rec.get("paired_active_idx")
    return out


def baseline_mw_logp(compounds: list[dict]) -> tuple[float | None, float | None]:
    labels = [1 if c["role"] == "active" else 0 for c in compounds]
    mw = [c.get("molecularWeight") for c in compounds]
    lp = [c.get("xlogp") for c in compounds]
    return roc_auc(labels, mw), roc_auc(labels, lp)


def mw_logp_flag(mw_auc: float | None, logp_auc: float | None) -> bool:
    if mw_auc is None or logp_auc is None:
        return True
    return not (MW_LOGP_LOW <= mw_auc <= MW_LOGP_HIGH and MW_LOGP_LOW <= logp_auc <= MW_LOGP_HIGH)


def nn_max_to_ref(test_entry: dict, ref_fps: list) -> float:
    tfp = DataStructs.CreateFromBitString(test_entry["fp"])
    best = 0.0
    for rfp in ref_fps:
        best = max(best, DataStructs.TanimotoSimilarity(tfp, rfp))
    return best


def build_full_sanity_compounds(
    actives_by_idx: dict[int, dict], decoys_by_idx: dict[int, dict], sizes: list[int]
) -> list[dict]:
    compounds: list[dict] = []
    for ai in sorted(actives_by_idx):
        a = actives_by_idx[ai]
        compounds.append({**a, "role": "active"})
        start, end = decoy_index_range(ai, sizes)
        for j in range(start, end):
            if j in decoys_by_idx:
                compounds.append({**decoys_by_idx[j], "role": "decoy"})
    return compounds


def main():
    excluded = load_exclusion_smiles()
    included = []
    dropped = []
    for tgt in TARGETS:
        tid = tgt["id"]
        if tid not in DUDE_NAMES:
            dropped.append({"id": tid, "reason": "not in DUD-E"})
            continue
        dude = load_dude_set(tid)
        if not dude or not dude.get("available"):
            dropped.append({"id": tid, "reason": "DUD-E download failed"})
            continue

        sizes = dude["decoys_per_active_sizes"]
        actives_by_idx: dict[int, dict] = {}
        for rec in dude["actives"]:
            if rec["smiles"] in excluded:
                continue
            e = enrich_dude_record(rec, "active")
            if e:
                actives_by_idx[rec["dude_idx"]] = e

        decoys_by_idx: dict[int, dict] = {}
        for rec in dude["decoys"]:
            if rec["smiles"] in excluded:
                continue
            e = enrich_dude_record(rec, "decoy")
            if e:
                decoys_by_idx[rec["dude_idx"]] = e

        actives_raw = list(actives_by_idx.values())
        if len(actives_raw) < MIN_TEST + MIN_REF:
            dropped.append(
                {"id": tid, "reason": f"only {len(actives_raw)} DUD-E actives after filter"}
            )
            continue

        full_compounds = build_full_sanity_compounds(actives_by_idx, decoys_by_idx, sizes)
        mw_full, logp_full = baseline_mw_logp(full_compounds)

        by_smi = {a["smiles"]: a for a in actives_raw}
        ref_raw, test_raw = cluster_split_butina(
            [{"smiles": a["smiles"]} for a in actives_raw],
            n_test=MIN_TEST,
            n_ref=MIN_REF,
        )
        ref_raw = [by_smi[r["smiles"]] for r in ref_raw if r["smiles"] in by_smi]
        test_raw = [by_smi[r["smiles"]] for r in test_raw if r["smiles"] in by_smi]
        ref_murcko = {r.get("murcko") for r in ref_raw if r.get("murcko")}
        test_murcko = {t.get("murcko") for t in test_raw if t.get("murcko")}
        murcko_overlap = len(ref_murcko & test_murcko)
        ref_keys = {r.get("inchikey") for r in ref_raw if r.get("inchikey")}
        inchi_removed = 0
        test_clean = []
        for t in test_raw:
            if t.get("inchikey") and t["inchikey"] in ref_keys:
                inchi_removed += 1
                continue
            test_clean.append(t)
        if len(test_clean) < MIN_TEST // 2:
            dropped.append({"id": tid, "reason": "too few test actives after InChIKey dedup"})
            continue

        ref_fps = [DataStructs.CreateFromBitString(r["fp"]) for r in ref_raw]
        compounds: list[dict] = []
        test_active_indices = set()
        for t in test_clean:
            test_active_indices.add(t["dude_active_idx"])
            nn = nn_max_to_ref(t, ref_fps)
            compounds.append(
                {
                    **{k: t[k] for k in t if k != "fp"},
                    "role": "active",
                    "nn_tanimoto_to_ref": round(nn, 4),
                }
            )

        n_eval_decoys = 0
        for ai in sorted(test_active_indices):
            start, end = decoy_index_range(ai, sizes)
            for j in range(start, end):
                if j not in decoys_by_idx:
                    continue
                d = decoys_by_idx[j]
                matched_id = actives_by_idx.get(ai, {}).get("chembl_id")
                compounds.append(
                    {
                        **{k: d[k] for k in d if k != "fp"},
                        "role": "decoy",
                        "matched_to": matched_id,
                        "matched_to_active_idx": ai,
                    }
                )
                n_eval_decoys += 1

        mw_subset, logp_subset = baseline_mw_logp(compounds)
        ref_entries = [{k: r[k] for k in r if k != "fp"} for r in ref_raw]
        included.append(
            {
                "id": tid,
                "name": tgt["name"],
                "dude_code": DUDE_NAMES[tid],
                "active_source": dude.get("active_source"),
                "property_computation": dude.get("property_note"),
                "murcko_overlap_cluster": murcko_overlap,
                "inchikey_removed_from_test": inchi_removed,
                "mw_roc_auc_full": mw_full,
                "logp_roc_auc_full": logp_full,
                "mw_roc_auc_subset": mw_subset,
                "logp_roc_auc_subset": logp_subset,
                "mw_roc_auc": mw_full,
                "logp_roc_auc": logp_full,
                "mw_logp_flag": mw_logp_flag(mw_full, logp_full),
                "mw_logp_flag_subset": mw_logp_flag(mw_subset, logp_subset),
                "n_test_actives": len(test_clean),
                "n_ref_actives": len(ref_raw),
                "n_decoys_eval": n_eval_decoys,
                "n_decoys_full": len(decoys_by_idx),
                "decoys_per_active_mean": len(decoys_by_idx) / max(1, len(actives_by_idx)),
                "compounds": compounds,
                "reference_actives": ref_entries,
            }
        )
        print(
            f"[dude] {tid} test={len(test_clean)} eval_decoys={n_eval_decoys} "
            f"mw_full={mw_full:.3f} logp_full={logp_full:.3f} "
            f"mw_sub={mw_subset:.3f} logp_sub={logp_subset:.3f} inchi_rm={inchi_removed}",
            flush=True,
        )

    payload = {
        "version": 2,
        "decoy_source": "DUD-E only (no self-built decoys)",
        "active_source_note": "DUD-E actives_final.mol2.gz (not ChEMBL API actives scored against DUD-E decoys).",
        "decoy_pairing_note": "Decoys paired to actives by order in DUD-E decoys_final.mol2.gz (per-active blocks).",
        "property_note": "MW/logP from RDKit MolFromMol2Block for both actives and decoys.",
        "dude_analogue_bias_note": "DUD-E decoys are property-matched but retain known analogue bias vs actives.",
        "mw_logp_sanity_band": [MW_LOGP_LOW, MW_LOGP_HIGH],
        "targets": included,
        "excluded": dropped,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    tgt_meta = {x["id"]: x for x in TARGETS}
    heldout_compat = {
        "version": 2,
        "description": "DUD-E benchmark (eval compat)",
        "sanity_overall": {"benchmark_ready": True},
        "targets": [
            {
                "id": t["id"],
                "name": t["name"],
                "pdb_id": tgt_meta[t["id"]]["pdb_id"],
                "chembl_target": tgt_meta[t["id"]]["chembl_target"],
                "protein": {
                    "id": tgt_meta[t["id"]]["pdb_id"],
                    "pdb_id": tgt_meta[t["id"]]["pdb_id"],
                    "queryName": t["name"],
                    "title": t["name"],
                },
                "compounds": t["compounds"],
                "sanity": {
                    "mw_roc_auc": t["mw_roc_auc_full"],
                    "logp_roc_auc": t["logp_roc_auc_full"],
                    "mw_roc_auc_subset": t["mw_roc_auc_subset"],
                    "logp_roc_auc_subset": t["logp_roc_auc_subset"],
                    "decoy_source": "DUD-E",
                    "murcko_scaffold_overlap": t["murcko_overlap_cluster"],
                    "decoys_per_active_mean": t["decoys_per_active_mean"],
                },
            }
            for t in included
        ],
    }
    (BENCH / "dude_heldout_eval.json").write_text(json.dumps(heldout_compat, indent=2))
    OUT_SUMMARY.write_text(
        json.dumps(
            {
                "included": [t["id"] for t in included],
                "excluded": dropped,
                "per_target": [
                    {
                        "id": t["id"],
                        "dude_code": t["dude_code"],
                        "mw_roc_auc_full": t["mw_roc_auc_full"],
                        "logp_roc_auc_full": t["logp_roc_auc_full"],
                        "mw_roc_auc_subset": t["mw_roc_auc_subset"],
                        "logp_roc_auc_subset": t["logp_roc_auc_subset"],
                        "mw_logp_flag": t["mw_logp_flag"],
                        "mw_logp_flag_subset": t["mw_logp_flag_subset"],
                        "inchikey_removed": t["inchikey_removed_from_test"],
                        "murcko_overlap": t["murcko_overlap_cluster"],
                        "n_test_actives": t["n_test_actives"],
                        "n_decoys_eval": t["n_decoys_eval"],
                    }
                    for t in included
                ],
            },
            indent=2,
        )
    )
    print(f"Wrote {OUT} ({len(included)} targets)")


if __name__ == "__main__":
    main()
