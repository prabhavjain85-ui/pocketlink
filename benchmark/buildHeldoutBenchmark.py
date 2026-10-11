#!/usr/bin/env python3
"""
Build held-out benchmark v2: ChEMBL actives (scaffold-split) + property-matched decoys.
Outputs benchmark/heldout_benchmark_v2.json and benchmark/reference_sets.json
"""
from __future__ import annotations

import json
import math
import os
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from rdkit import Chem, DataStructs
from rdkit.Chem import AllChem, Descriptors, Crippen, Lipinski, rdMolDescriptors

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / "benchmark"
CACHE = BENCH / "chembl_cache"
OUT_HELDOUT = BENCH / "heldout_benchmark_v2.json"
OUT_REF = BENCH / "reference_sets.json"
OUT_SUMMARY = BENCH / "benchmark_build_summary.json"

PIC50_MIN = 6.0
MIN_ACTIVES_TEST = 30
MIN_ACTIVES_REF = 40
DECOYS_PER_ACTIVE = 50
MAX_TANIMOTO_DECOY = 0.2
PROP_TOL = {"mw": 0.10, "logp": 0.7, "hbd": 1, "hba": 1, "rot": 1, "charge": 0}

TARGETS = [
    {"id": "egfr", "chembl_target": "CHEMBL203", "pdb_id": "1M17", "name": "EGFR"},
    {"id": "abl1", "chembl_target": "CHEMBL1476", "pdb_id": "1IEP", "name": "ABL1"},
    {"id": "erbb2", "chembl_target": "CHEMBL1824", "pdb_id": "3PP0", "name": "ERBB2"},
    {"id": "braf", "chembl_target": "CHEMBL4005", "pdb_id": "4XV2", "name": "BRAF"},
    {"id": "ptgs2", "chembl_target": "CHEMBL230", "pdb_id": "4COX", "name": "PTGS2"},
    {"id": "hmgcr", "chembl_target": "CHEMBL402", "pdb_id": "1HWK", "name": "HMGCR"},
    {"id": "pde5a", "chembl_target": "CHEMBL1827", "pdb_id": "1UDT", "name": "PDE5A"},
    {"id": "esr1", "chembl_target": "CHEMBL595", "pdb_id": "3ERT", "name": "ESR1"},
    {"id": "dpp4", "chembl_target": "CHEMBL284", "pdb_id": "1X70", "name": "DPP4"},
    {"id": "adrb2", "chembl_target": "CHEMBL210", "pdb_id": "3SN6", "name": "ADRB2"},
    {"id": "hiv_pr", "chembl_target": "CHEMBL244", "pdb_id": "1HVR", "name": "HIV-1 protease"},
    {"id": "sars_mpro", "chembl_target": "CHEMBL4523584", "pdb_id": "7BQY", "name": "SARS-CoV-2 Mpro"},
    {"id": "hdac1", "chembl_target": "CHEMBL325", "pdb_id": "4BKX", "name": "HDAC1"},
    {"id": "jak2", "chembl_target": "CHEMBL2971", "pdb_id": "4JI9", "name": "JAK2"},
    {"id": "thrombin", "chembl_target": "CHEMBL204", "pdb_id": "1DWB", "name": "Thrombin"},
]


def http_get_json(url: str, retries: int = 4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode())
        except Exception as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 ** attempt)
    return None


def murcko_scaffold_smiles(mol):
    try:
        scaf = rdMolDescriptors.GetScaffoldForMol(mol)
        if scaf is None:
            return ""
        return Chem.MolToSmiles(scaf)
    except Exception:
        return ""


def mol_props(mol):
    return {
        "mw": Descriptors.MolWt(mol),
        "logp": Crippen.MolLogP(mol),
        "hbd": Lipinski.NumHDonors(mol),
        "hba": Lipinski.NumHAcceptors(mol),
        "rot": Lipinski.NumRotatableBonds(mol),
        "charge": Chem.GetFormalCharge(mol),
        "tpsa": rdMolDescriptors.CalcTPSA(mol),
    }


def fp_morgan(mol):
    return AllChem.GetMorganFingerprintAsBitVect(mol, 2, nBits=2048)


def load_exclusion_smiles():
    """Canonical SMILES from approved drug library (held-out from benchmark actives)."""
    excluded = set()
    approved = ROOT / "src" / "data" / "approvedDrugs.json"
    if approved.exists():
        data = json.loads(approved.read_text())
        for d in data.get("drugs", []):
            smi = d.get("smiles")
            if not smi:
                continue
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                excluded.add(Chem.MolToSmiles(mol))
    audit_path = BENCH / "rule_smiles_blocklist.json"
    if audit_path.exists():
        for smi in json.loads(audit_path.read_text()).get("smiles", []):
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                excluded.add(Chem.MolToSmiles(mol))
    return excluded


def fetch_chembl_actives(chembl_target: str):
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / f"{chembl_target}_actives.json"
    if cache_file.exists():
        records = json.loads(cache_file.read_text())
        for r in records:
            if "pchembl" in r:
                r["pchembl"] = float(r["pchembl"])
        return records

    url = (
        "https://www.ebi.ac.uk/chembl/api/data/activity.json?"
        + urllib.parse.urlencode(
            {
                "target_chembl_id": chembl_target,
                "standard_type__in": "IC50,Ki",
                "standard_relation": "=",
                "pchembl_value__gte": PIC50_MIN,
                "limit": 1000,
            }
        )
    )
    activities = []
    while url:
        payload = http_get_json(url)
        activities.extend(payload.get("activities", []))
        url = payload.get("page_meta", {}).get("next")
        if url and not url.startswith("http"):
            url = "https://www.ebi.ac.uk" + url
        time.sleep(0.2)

    by_smiles = {}
    for act in activities:
        smi = act.get("canonical_smiles") or act.get("smiles")
        if not smi:
            continue
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            continue
        can = Chem.MolToSmiles(mol)
        pchembl_raw = act.get("pchembl_value")
        if pchembl_raw is None:
            continue
        try:
            pchembl = float(pchembl_raw)
        except (TypeError, ValueError):
            continue
        prev = by_smiles.get(can)
        if prev is None or pchembl > prev["pchembl"]:
            by_smiles[can] = {
                "smiles": can,
                "pchembl": float(pchembl),
                "chembl_id": act.get("molecule_chembl_id"),
                "standard_type": act.get("standard_type"),
            }

    records = list(by_smiles.values())
    cache_file.write_text(json.dumps(records))
    return records


def fetch_decoy_pool():
    cache_file = CACHE / "decoy_pool.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    url = (
        "https://www.ebi.ac.uk/chembl/api/data/molecule.json?"
        + urllib.parse.urlencode(
            {
                "max_phase__gte": 3,
                "molecule_properties__mw_freebase__lte": 550,
                "molecule_properties__mw_freebase__gte": 150,
                "limit": 1000,
            }
        )
    )
    pool = []
    pages = 0
    while url and pages < 25:
        payload = http_get_json(url)
        for mol in payload.get("molecules", []):
            if not mol:
                continue
            structs = mol.get("molecule_structures") or {}
            smi = structs.get("canonical_smiles")
            if not smi:
                continue
            m = Chem.MolFromSmiles(smi)
            if m is None:
                continue
            try:
                Chem.SanitizeMol(m)
            except Exception:
                continue
            can = Chem.MolToSmiles(m)
            pool.append({"smiles": can, "props": mol_props(m), "fp": fp_morgan(m)})
        url = payload.get("page_meta", {}).get("next")
        if url and not url.startswith("http"):
            url = "https://www.ebi.ac.uk" + url
        pages += 1
        time.sleep(0.25)

    slim = []
    for row in pool:
        slim.append(
            {
                "smiles": row["smiles"],
                "props": row["props"],
                "fp": row["fp"].ToBitString(),
            }
        )
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(slim))
    return slim


def props_match(active_props, decoy_props):
    for key, tol in PROP_TOL.items():
        av = active_props[key]
        dv = decoy_props[key]
        if key == "mw":
            if abs(dv - av) > max(25, av * tol):
                return False
        elif key == "logp":
            if abs(dv - av) > tol:
                return False
        elif key == "charge":
            if dv != av:
                return False
        else:
            if abs(dv - av) > tol:
                return False
    return True


def split_scaffolds(records, n_test=MIN_ACTIVES_TEST, n_ref=MIN_ACTIVES_REF):
    """Assign whole Murcko scaffolds to test until n_test actives, remainder to reference."""
    clusters = defaultdict(list)
    for r in records:
        mol = Chem.MolFromSmiles(r["smiles"])
        scaf = murcko_scaffold_smiles(mol) or r["smiles"]
        clusters[scaf].append(r)
    scaffolds = sorted(clusters.keys(), key=lambda s: -len(clusters[s]))
    test, ref = [], []
    for scaf in scaffolds:
        if len(test) < n_test:
            test.extend(clusters[scaf])
        else:
            ref.extend(clusters[scaf])
    test_smiles = {x["smiles"] for x in test}
    ref = [x for x in ref if x["smiles"] not in test_smiles]
    return ref[:n_ref], test[:n_test]


def pick_decoys(active, all_actives_fps, pool, n=DECOYS_PER_ACTIVE):
    mol = Chem.MolFromSmiles(active["smiles"])
    props = mol_props(mol)
    afp = fp_morgan(mol)
    picked = []
    shuffled = list(pool)
    random.shuffle(shuffled)
    for cand in shuffled:
        if cand["smiles"] == active["smiles"]:
            continue
        if not props_match(props, cand["props"]):
            continue
        dfp = DataStructs.CreateFromBitString(cand["fp"])
        if DataStructs.TanimotoSimilarity(afp, dfp) > MAX_TANIMOTO_DECOY:
            continue
        too_close = False
        for afp2 in all_actives_fps:
            if DataStructs.TanimotoSimilarity(dfp, afp2) > MAX_TANIMOTO_DECOY:
                too_close = True
                break
        if too_close:
            continue
        picked.append(cand)
        if len(picked) >= n:
            break
    return picked


def main():
    excluded_canonical = load_exclusion_smiles()
    decoy_pool_raw = fetch_decoy_pool()
    decoy_pool = []
    for row in decoy_pool_raw:
        if row["smiles"] in excluded_canonical:
            continue
        decoy_pool.append(row)

    summary = {"targets": [], "excluded_rule_smiles": len(excluded_canonical)}
    heldout_targets = []
    reference_sets = {"version": 2, "fingerprint": "morgan_r2_2048", "targets": {}}

    for tgt in TARGETS:
        print(f"[build] {tgt['id']} …", flush=True)
        actives = fetch_chembl_actives(tgt["chembl_target"])
        actives = [a for a in actives if Chem.MolToSmiles(Chem.MolFromSmiles(a["smiles"])) not in excluded_canonical]
        if len(actives) < MIN_ACTIVES_TEST + MIN_ACTIVES_REF:
            summary["targets"].append(
                {"id": tgt["id"], "error": f"only {len(actives)} actives after dedup/exclusion"}
            )
            continue

        ref_raw, test_raw = split_scaffolds(actives)
        if len(test_raw) < MIN_ACTIVES_TEST:
            summary["targets"].append(
                {"id": tgt["id"], "error": f"only {len(test_raw)} test actives after scaffold split"}
            )
            continue

        ref_fps = []
        ref_entries = []
        for r in ref_raw:
            m = Chem.MolFromSmiles(r["smiles"])
            ref_fps.append(fp_morgan(m))
            ref_entries.append(
                {
                    "smiles": r["smiles"],
                    "chembl_id": r.get("chembl_id"),
                    "pchembl": r.get("pchembl"),
                    "fp": fp_morgan(m).ToBitString(),
                }
            )

        all_test_fps = [fp_morgan(Chem.MolFromSmiles(t["smiles"])) for t in test_raw]
        compounds = []
        decoy_count = 0
        for active in test_raw:
            props = mol_props(Chem.MolFromSmiles(active["smiles"]))
            compounds.append(
                {
                    "role": "active",
                    "smiles": active["smiles"],
                    "name": active.get("chembl_id") or "active",
                    "chembl_id": active.get("chembl_id"),
                    "pchembl": active.get("pchembl"),
                    "molecularWeight": props["mw"],
                    "xlogp": props["logp"],
                    "hbd": props["hbd"],
                    "hba": props["hba"],
                    "rotatableBonds": props["rot"],
                    "tpsa": props["tpsa"],
                }
            )
            decoys = pick_decoys(active, all_test_fps + ref_fps, decoy_pool, DECOYS_PER_ACTIVE)
            decoy_count += len(decoys)
            for i, d in enumerate(decoys):
                compounds.append(
                    {
                        "role": "decoy",
                        "smiles": d["smiles"],
                        "name": f"decoy_{active.get('chembl_id', 'x')}_{i}",
                        "molecularWeight": d["props"]["mw"],
                        "xlogp": d["props"]["logp"],
                        "hbd": d["props"]["hbd"],
                        "hba": d["props"]["hba"],
                        "rotatableBonds": d["props"]["rot"],
                        "tpsa": d["props"]["tpsa"],
                        "matched_to": active.get("chembl_id"),
                    }
                )

        heldout_targets.append(
            {
                "id": tgt["id"],
                "name": tgt["name"],
                "pdb_id": tgt["pdb_id"],
                "chembl_target": tgt["chembl_target"],
                "protein": {
                    "id": tgt["pdb_id"],
                    "pdb_id": tgt["pdb_id"],
                    "queryName": tgt["name"],
                    "title": f"{tgt['name']} benchmark",
                },
                "compounds": compounds,
            }
        )

        reference_sets["targets"][tgt["id"]] = {
            "chembl_target": tgt["chembl_target"],
            "pdb_id": tgt["pdb_id"],
            "actives": ref_entries,
        }

        summary["targets"].append(
            {
                "id": tgt["id"],
                "test_actives": len(test_raw),
                "reference_actives": len(ref_raw),
                "decoys": decoy_count,
                "decoys_per_active_mean": decoy_count / max(1, len(test_raw)),
            }
        )

    payload = {
        "version": 2,
        "description": "ChEMBL held-out actives (scaffold-split) + property-matched decoys",
        "summary": {
            "target_count": len(heldout_targets),
            "active_count": sum(1 for t in heldout_targets for c in t["compounds"] if c["role"] == "active"),
            "decoy_count": sum(1 for t in heldout_targets for c in t["compounds"] if c["role"] == "decoy"),
        },
        "targets": heldout_targets,
    }

    OUT_HELDOUT.write_text(json.dumps(payload, indent=2))
    OUT_REF.write_text(json.dumps(reference_sets, indent=2))
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2))
    print(f"Wrote {OUT_HELDOUT} ({len(heldout_targets)} targets)")


if __name__ == "__main__":
    main()
