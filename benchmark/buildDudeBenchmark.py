#!/usr/bin/env python3
"""
DUD-E-only held-out benchmark: actives/decoys from DUD-E (no self-built decoys).
Decoy assignment: 50 nearest DUD-E decoys per active by standardized (MW, logP, HBD,
HBA, rotB, net charge), without replacement, seed=42 (mol2 block order is invalid).

Leakage: drop test actives with InChIKey matching reference actives.
Splits: cluster (Murcko overlap 0) + hard NN Tanimoto cutoff 0.4.

Gate: evaluated subset MW and logP ROC-AUC must be in [0.45, 0.55].
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
from dudeDecoyMatch import (  # noqa: E402
    DECOYS_PER_ACTIVE,
    assign_decoys_eval_subset,
    assign_decoys_greedy,
    mw_delta_distribution,
    summarize_deltas,
)
from dudeLoader import DUDE_NAMES, load_dude_set

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
        "dude_active_idx": rec["dude_idx"] if role == "active" else None,
        "dude_decoy_idx": rec["dude_idx"] if role == "decoy" else None,
        "molecularWeight": rec["molecularWeight"],
        "xlogp": rec["xlogp"],
        "hbd": rec.get("hbd", Lipinski.NumHDonors(mol)),
        "hba": rec.get("hba", Lipinski.NumHAcceptors(mol)),
        "rotatableBonds": rec.get("rotatableBonds", Lipinski.NumRotatableBonds(mol)),
        "formal_charge": rec.get("formal_charge", Chem.GetFormalCharge(mol)),
        "tpsa": rdMolDescriptors.CalcTPSA(mol),
        "murcko": murcko_scaffold_smiles(mol),
        "inchikey": inchikey(mol),
        "fp": fp_morgan(mol).ToBitString(),
        "role": role,
    }
    return out


def baseline_mw_logp(compounds: list[dict]) -> tuple[float | None, float | None]:
    labels = [1 if c["role"] == "active" else 0 for c in compounds]
    mw = [c.get("molecularWeight") for c in compounds]
    lp = [c.get("xlogp") for c in compounds]
    return roc_auc(labels, mw), roc_auc(labels, lp)


def mw_logp_pass(mw_auc: float | None, logp_auc: float | None) -> bool:
    if mw_auc is None or logp_auc is None:
        return False
    return MW_LOGP_LOW <= mw_auc <= MW_LOGP_HIGH and MW_LOGP_LOW <= logp_auc <= MW_LOGP_HIGH


def nn_max_to_ref(test_entry: dict, ref_fps: list) -> float:
    tfp = DataStructs.CreateFromBitString(test_entry["fp"])
    best = 0.0
    for rfp in ref_fps:
        best = max(best, DataStructs.TanimotoSimilarity(tfp, rfp))
    return best


def compounds_from_assignment(
    active_entries: list[dict],
    decoys_by_idx: dict[int, dict],
    assignment: dict[int, list[int]],
    ref_fps: list | None = None,
) -> list[dict]:
    compounds: list[dict] = []
    for a in active_entries:
        ai = a["dude_active_idx"]
        row = {k: a[k] for k in a if k != "fp"}
        row["role"] = "active"
        if ref_fps is not None:
            row["nn_tanimoto_to_ref"] = round(nn_max_to_ref(a, ref_fps), 4)
        compounds.append(row)
        for dj in assignment.get(ai, []):
            d = decoys_by_idx.get(dj)
            if not d:
                continue
            compounds.append(
                {
                    **{k: d[k] for k in d if k != "fp"},
                    "role": "decoy",
                    "matched_to": a.get("chembl_id"),
                    "matched_to_active_idx": ai,
                }
            )
    return compounds


def main():
    excluded = load_exclusion_smiles()
    included = []
    dropped = []
    pairing_stats = []
    for tgt in TARGETS:
        tid = tgt["id"]
        if tid not in DUDE_NAMES:
            dropped.append({"id": tid, "reason": "not in DUD-E"})
            continue
        dude = load_dude_set(tid)
        if not dude or not dude.get("available"):
            dropped.append({"id": tid, "reason": "DUD-E download failed"})
            continue

        actives_raw_recs = [r for r in dude["actives"] if r["smiles"] not in excluded]
        decoys_raw_recs = [r for r in dude["decoys"] if r["smiles"] not in excluded]

        actives_by_idx: dict[int, dict] = {}
        for rec in actives_raw_recs:
            e = enrich_dude_record(rec, "active")
            if e:
                e["dude_active_idx"] = rec["dude_idx"]
                actives_by_idx[rec["dude_idx"]] = e

        decoys_by_idx: dict[int, dict] = {}
        for rec in decoys_raw_recs:
            e = enrich_dude_record(rec, "decoy")
            if e:
                decoys_by_idx[rec["dude_idx"]] = e

        actives_raw = list(actives_by_idx.values())
        if len(actives_raw) < MIN_TEST + MIN_REF:
            dropped.append(
                {"id": tid, "reason": f"only {len(actives_raw)} DUD-E actives after filter"}
            )
            continue

        assignment_full = assign_decoys_greedy(actives_raw_recs, decoys_raw_recs)

        all_active_entries = [actives_by_idx[i] for i in sorted(actives_by_idx)]
        full_compounds = compounds_from_assignment(
            all_active_entries, decoys_by_idx, assignment_full, ref_fps=None
        )
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

        test_recs = [r for r in actives_raw_recs if r["dude_idx"] in {t["dude_active_idx"] for t in test_clean}]
        assignment_eval = assign_decoys_eval_subset(test_recs, decoys_raw_recs)
        delta_summary = summarize_deltas(
            mw_delta_distribution(test_recs, decoys_raw_recs, assignment_eval)
        )
        pairing_stats.append({"id": tid, "mw_delta_eval": delta_summary})

        ref_fps = [DataStructs.CreateFromBitString(r["fp"]) for r in ref_raw]
        compounds = compounds_from_assignment(
            test_clean, decoys_by_idx, assignment_eval, ref_fps=ref_fps
        )
        n_eval_decoys = sum(1 for c in compounds if c["role"] == "decoy")
        mw_subset, logp_subset = baseline_mw_logp(compounds)

        if not mw_logp_pass(mw_subset, logp_subset):
            dropped.append(
                {
                    "id": tid,
                    "reason": (
                        f"subset MW/logP gate failed (mw={mw_subset}, logp={logp_subset}; "
                        f"need [{MW_LOGP_LOW},{MW_LOGP_HIGH}])"
                    ),
                }
            )
            print(
                f"[dude] {tid} EXCLUDED gate test={len(test_clean)} "
                f"mw_sub={mw_subset:.3f} logp_sub={logp_subset:.3f} "
                f"mw_delta_med={delta_summary.get('median')}",
                flush=True,
            )
            continue

        ref_entries = [{k: r[k] for k in r if k != "fp"} for r in ref_raw]
        ref_recs = [r for r in actives_raw_recs if r["dude_idx"] in {r0["dude_active_idx"] for r0 in ref_raw}]
        assignment_ref = assign_decoys_eval_subset(ref_recs, decoys_raw_recs)
        train_compounds = compounds_from_assignment(
            ref_raw, decoys_by_idx, assignment_ref, ref_fps=None
        )
        train_stripped = [{k: c[k] for k in c if k != "fp"} for c in train_compounds]
        included.append(
            {
                "id": tid,
                "name": tgt["name"],
                "dude_code": DUDE_NAMES[tid],
                "active_source": dude.get("active_source"),
                "decoy_assignment": (
                    f"DUD-E pool; eval: {DECOYS_PER_ACTIVE} nearest per active (MW then logP/HBD/HBA/rotB/charge); "
                    "full-set: global no-replacement"
                ),
                "property_computation": dude.get("property_note"),
                "mw_delta_summary": delta_summary,
                "murcko_overlap_cluster": murcko_overlap,
                "inchikey_removed_from_test": inchi_removed,
                "mw_roc_auc_full": mw_full,
                "logp_roc_auc_full": logp_full,
                "mw_roc_auc_subset": mw_subset,
                "logp_roc_auc_subset": logp_subset,
                "mw_roc_auc": mw_subset,
                "logp_roc_auc": logp_subset,
                "mw_logp_flag": False,
                "mw_logp_flag_subset": False,
                "n_test_actives": len(test_clean),
                "n_ref_actives": len(ref_raw),
                "n_decoys_eval": n_eval_decoys,
                "n_decoys_full": sum(len(v) for v in assignment_full.values()),
                "decoys_per_active_mean": DECOYS_PER_ACTIVE,
                "compounds": [{k: c[k] for k in c if k != "fp"} for c in compounds],
                "train_compounds": train_stripped,
                "reference_actives": ref_entries,
            }
        )
        print(
            f"[dude] {tid} OK test={len(test_clean)} eval_decoys={n_eval_decoys} "
            f"mw_full={mw_full:.3f} logp_full={logp_full:.3f} "
            f"mw_sub={mw_subset:.3f} logp_sub={logp_subset:.3f} "
            f"mw_delta_med={delta_summary.get('median'):.2f} inchi_rm={inchi_removed}",
            flush=True,
        )

    benchmark_ready = len(included) > 0
    payload = {
        "version": 3,
        "decoy_source": "DUD-E only (property-matched assignment, no self-built decoys)",
        "active_source_note": "DUD-E actives_final.mol2.gz (not ChEMBL API actives).",
        "decoy_pairing_note": (
            "mol2 block order invalid (verified |ΔMW|); per-active nearest-decoy fallback from DUD-E pool."
        ),
        "property_note": "MW/logP from RDKit MolFromMol2Block for both actives and decoys.",
        "dude_analogue_bias_note": "DUD-E decoys are property-matched but retain known analogue bias vs actives.",
        "mw_logp_sanity_band": [MW_LOGP_LOW, MW_LOGP_HIGH],
        "pairing_verification": pairing_stats,
        "benchmark_ready": benchmark_ready,
        "targets": included,
        "excluded": dropped,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    tgt_meta = {x["id"]: x for x in TARGETS}
    heldout_compat = {
        "version": 3,
        "description": "DUD-E benchmark (eval compat)",
        "sanity_overall": {"benchmark_ready": benchmark_ready},
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
                    "mw_roc_auc": t["mw_roc_auc_subset"],
                    "logp_roc_auc": t["logp_roc_auc_subset"],
                    "mw_roc_auc_full": t["mw_roc_auc_full"],
                    "logp_roc_auc_full": t["logp_roc_auc_full"],
                    "decoy_source": "DUD-E",
                    "murcko_scaffold_overlap": t["murcko_overlap_cluster"],
                    "decoys_per_active_mean": t["decoys_per_active_mean"],
                    "inchikey_removed_from_test": t["inchikey_removed_from_test"],
                },
            }
            for t in included
        ],
    }
    (BENCH / "dude_heldout_eval.json").write_text(json.dumps(heldout_compat, indent=2))
    OUT_SUMMARY.write_text(
        json.dumps(
            {
                "benchmark_ready": benchmark_ready,
                "included": [t["id"] for t in included],
                "excluded": dropped,
                "pairing_verification": pairing_stats,
                "per_target": [
                    {
                        "id": t["id"],
                        "dude_code": t["dude_code"],
                        "mw_roc_auc_full": t["mw_roc_auc_full"],
                        "logp_roc_auc_full": t["logp_roc_auc_full"],
                        "mw_roc_auc_subset": t["mw_roc_auc_subset"],
                        "logp_roc_auc_subset": t["logp_roc_auc_subset"],
                        "mw_delta_median": t["mw_delta_summary"].get("median"),
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
    print(f"Wrote {OUT} ({len(included)} targets passed gate)")


if __name__ == "__main__":
    main()
