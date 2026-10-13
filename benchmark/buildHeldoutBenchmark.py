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

from dudeLoader import load_dude_set

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
MAX_TANIMOTO_DECOY = 0.3
PROP_TOL = {"mw": 0.10, "logp": 0.7, "hbd": 1, "hba": 1, "rot": 1, "charge": 0}

TARGETS = [
    {"id": "egfr", "chembl_target": "CHEMBL203", "pdb_id": "1M17", "name": "EGFR"},
    {"id": "abl1", "chembl_target": "CHEMBL1862", "pdb_id": "1IEP", "name": "ABL1"},
    {"id": "erbb2", "chembl_target": "CHEMBL1824", "pdb_id": "3PP0", "name": "ERBB2"},
    {"id": "braf", "chembl_target": "CHEMBL4005", "pdb_id": "4XV2", "name": "BRAF"},
    {"id": "ptgs2", "chembl_target": "CHEMBL230", "pdb_id": "1CX2", "name": "PTGS2"},
    {"id": "hmgcr", "chembl_target": "CHEMBL402", "pdb_id": "1OJ9", "name": "HMGCR"},
    {"id": "pde5a", "chembl_target": "CHEMBL1827", "pdb_id": "1UDT", "name": "PDE5A"},
    {"id": "esr1", "chembl_target": "CHEMBL206", "pdb_id": "3ERT", "name": "ESR1"},
    {"id": "dpp4", "chembl_target": "CHEMBL284", "pdb_id": "4A5S", "name": "DPP4"},
    {"id": "adrb2", "chembl_target": "CHEMBL210", "pdb_id": "3SN6", "name": "ADRB2"},
    {"id": "hiv_pr", "chembl_target": "CHEMBL244", "pdb_id": "1HVR", "name": "HIV-1 protease"},
    {"id": "sars_mpro", "chembl_target": "CHEMBL1075104", "pdb_id": "7BQY", "name": "SARS-CoV-2 Mpro", "decoy_source": "chembl_self"},
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
    """Canonical SMILES from in-rule TARGET_RULES blocklist (circular actives only)."""
    excluded = set()
    audit_path = BENCH / "rule_smiles_blocklist.json"
    if audit_path.exists():
        for smi in json.loads(audit_path.read_text()).get("smiles", []):
            mol = Chem.MolFromSmiles(smi)
            if mol is not None:
                excluded.add(Chem.MolToSmiles(mol))
    return excluded


def fetch_chembl_actives(chembl_target: str, use_cache: bool = True):
    """ChEMBL actives with documented assay filters (see chemblFetchAudit.py)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / f"{chembl_target}_actives_v3.json"
    if use_cache and cache_file.exists():
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
                "confidence_score__gte": 7,
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
        time.sleep(0.15)

    by_smiles = {}
    for act in activities:
        units = (act.get("standard_units") or "").lower()
        if units not in ("nm", "nanomolar"):
            continue
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
        if pchembl < PIC50_MIN:
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
                "max_phase__lte": 2,
                "molecule_properties__mw_freebase__lte": 550,
                "molecule_properties__mw_freebase__gte": 150,
                "limit": 1000,
            }
        )
    )
    pool = []
    pages = 0
    while url and pages < 50:
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
            if abs(dv - av) > min(20, max(10, av * 0.05)):
                return False
        elif key == "logp":
            if abs(dv - av) > _LOGP_TOL:
                return False
        elif key == "charge":
            if dv != av:
                return False
        else:
            if abs(dv - av) > tol:
                return False
    return True


def generic_scaffold_smiles(mol):
    try:
        scaf = rdMolDescriptors.GetScaffoldForMol(mol)
        if scaf is None:
            return ""
        return Chem.MolToSmiles(rdMolDescriptors.MakeScaffoldGeneric(scaf))
    except Exception:
        return ""


def cluster_split_butina(records, n_test=MIN_ACTIVES_TEST, n_ref=MIN_ACTIVES_REF):
    """Butina cluster at Tanimoto distance 0.4; assign clusters to test/ref with zero Murcko overlap."""
    mols = []
    fps = []
    meta = []
    for r in records:
        m = Chem.MolFromSmiles(r["smiles"])
        if m is None:
            continue
        mols.append(m)
        fps.append(fp_morgan(m))
        meta.append({**r, "murcko": murcko_scaffold_smiles(m), "generic": generic_scaffold_smiles(m)})
    if len(meta) < n_test + 10:
        return meta[:n_ref], meta[n_ref : n_ref + n_test]

    from rdkit.ML.Cluster import Butina

    dists = []
    nfps = len(fps)
    for i in range(1, nfps):
        sims = DataStructs.BulkTanimotoSimilarity(fps[i], fps[:i])
        dists.extend([1 - x for x in sims])
    clusters = Butina.ClusterData(dists, nfps, 0.4, isDistData=True)
    cluster_records = []
    for cl in clusters:
        cluster_records.append([meta[i] for i in cl])
    cluster_records.sort(key=lambda c: -len(c))

    test, ref = [], []
    test_murcko, test_generic = set(), set()
    for cl in cluster_records:
        murckos = {x["murcko"] for x in cl if x["murcko"]}
        generics = {x["generic"] for x in cl if x["generic"]}
        if len(test) < n_test and not (murckos & test_murcko) and not (generics & test_generic):
            test.extend(cl)
            test_murcko |= murckos
            test_generic |= generics
        else:
            ref.extend(cl)
    test_smiles = {x["smiles"] for x in test}
    ref = [x for x in ref if x["smiles"] not in test_smiles]
    return ref[:n_ref], test[:n_test]


def cluster_split_butina_audit(records, n_test=MIN_ACTIVES_TEST, n_ref=MIN_ACTIVES_REF):
    """Like cluster_split_butina but also returns per-Butina-cluster partition audit."""
    mols = []
    fps = []
    meta = []
    for r in records:
        m = Chem.MolFromSmiles(r["smiles"])
        if m is None:
            continue
        mols.append(m)
        fps.append(fp_morgan(m))
        meta.append({**r, "murcko": murcko_scaffold_smiles(m), "generic": generic_scaffold_smiles(m)})
    if len(meta) < n_test + 10:
        ref = meta[:n_ref]
        test = meta[n_ref : n_ref + n_test]
        audit = [{"cluster_id": 0, "size": len(meta), "partition": "mixed_small_set"}]
        return ref, test, audit

    from rdkit.ML.Cluster import Butina

    dists = []
    nfps = len(fps)
    for i in range(1, nfps):
        sims = DataStructs.BulkTanimotoSimilarity(fps[i], fps[:i])
        dists.extend([1 - x for x in sims])
    clusters = Butina.ClusterData(dists, nfps, 0.4, isDistData=True)
    cluster_records = []
    for cl in clusters:
        cluster_records.append([meta[i] for i in cl])
    cluster_records.sort(key=lambda c: -len(c))

    test, ref = [], []
    test_murcko, test_generic = set(), set()
    audit = []
    for cid, cl in enumerate(cluster_records):
        murckos = {x["murcko"] for x in cl if x["murcko"]}
        generics = {x["generic"] for x in cl if x["generic"]}
        to_test = (
            len(test) < n_test
            and not (murckos & test_murcko)
            and not (generics & test_generic)
        )
        if to_test:
            test.extend(cl)
            test_murcko |= murckos
            test_generic |= generics
            audit.append({"cluster_id": cid, "size": len(cl), "partition": "test"})
        else:
            ref.extend(cl)
            audit.append({"cluster_id": cid, "size": len(cl), "partition": "reference"})
    test_smiles = {x["smiles"] for x in test}
    ref = [x for x in ref if x["smiles"] not in test_smiles]
    return ref[:n_ref], test[:n_test], audit


def random_split_butina(records, n_test=MIN_ACTIVES_TEST, n_ref=MIN_ACTIVES_REF, seed=42):
    """Same Butina clusters as cluster_split_butina, but clusters assigned to test/ref at random."""
    random.seed(seed)
    mols = []
    fps = []
    meta = []
    for r in records:
        m = Chem.MolFromSmiles(r["smiles"])
        if m is None:
            continue
        mols.append(m)
        fps.append(fp_morgan(m))
        meta.append({**r, "murcko": murcko_scaffold_smiles(m), "generic": generic_scaffold_smiles(m)})
    if len(meta) < n_test + 10:
        return meta[:n_ref], meta[n_ref : n_ref + n_test]

    from rdkit.ML.Cluster import Butina

    dists = []
    nfps = len(fps)
    for i in range(1, nfps):
        sims = DataStructs.BulkTanimotoSimilarity(fps[i], fps[:i])
        dists.extend([1 - x for x in sims])
    clusters = Butina.ClusterData(dists, nfps, 0.4, isDistData=True)
    cluster_records = [[meta[i] for i in cl] for cl in clusters]
    random.shuffle(cluster_records)

    test, ref = [], []
    test_murcko, test_generic = set(), set()
    for cl in cluster_records:
        murckos = {x["murcko"] for x in cl if x["murcko"]}
        generics = {x["generic"] for x in cl if x["generic"]}
        if len(test) < n_test and not (murckos & test_murcko) and not (generics & test_generic):
            test.extend(cl)
            test_murcko |= murckos
            test_generic |= generics
        else:
            ref.extend(cl)
    test_smiles = {x["smiles"] for x in test}
    ref = [x for x in ref if x["smiles"] not in test_smiles]
    return ref[:n_ref], test[:n_test]


def dude_decoy_pool(smiles_list, max_decoys=12000):
    if len(smiles_list) > max_decoys:
        smiles_list = random.sample(smiles_list, max_decoys)
    pool = []
    for smi in smiles_list:
        m = Chem.MolFromSmiles(smi)
        if m is None:
            continue
        pool.append(
            {"smiles": Chem.MolToSmiles(m), "props": mol_props(m), "fp": fp_morgan(m).ToBitString()}
        )
    return pool


def roc_auc(labels, scores):
    pos = sum(labels)
    neg = len(labels) - pos
    if not pos or not neg:
        return None
    pairs = sorted(zip(scores, labels), reverse=True)
    tp = fp = 0
    prev = None
    auc = 0
    pt = pf = 0
    for s, y in pairs:
        if s != prev:
            auc += (tp + pt) * (fp - pf) / 2
            pt, pf = tp, fp
            prev = s
        if y:
            tp += 1
        else:
            fp += 1
    auc += (tp + pt) * (fp - pf) / 2
    return auc / (pos * neg)


_LOGP_TOL = 0.55


def refine_decoy_sanity(built, test_raw, ref_raw, pool, max_rounds=12):
    """Limited decoy resampling from the same property pool (construction only)."""
    ref_fps = [fp_morgan(Chem.MolFromSmiles(r["smiles"])) for r in ref_raw]
    all_test_fps = [fp_morgan(Chem.MolFromSmiles(t["smiles"])) for t in test_raw]
    active_by_id = {a.get("chembl_id"): a for a in test_raw}
    decoy_count = sum(1 for c in built if c["role"] == "decoy")
    mw_auc = logp_auc = None
    for _ in range(max_rounds):
        mw_auc, logp_auc = baseline_auc(built)
        if (
            mw_auc is not None
            and logp_auc is not None
            and 0.45 <= mw_auc <= 0.55
            and 0.45 <= logp_auc <= 0.55
        ):
            return built, mw_auc, logp_auc, decoy_count
        decoy_idxs = [i for i, c in enumerate(built) if c["role"] == "decoy"]
        random.shuffle(decoy_idxs)
        for idx in decoy_idxs[:40]:
            old = built[idx]
            active = active_by_id.get(old.get("matched_to")) or test_raw[0]
            repl = pick_decoys(active, all_test_fps + ref_fps, pool, n=1)
            if not repl:
                continue
            d = repl[0]
            built[idx] = {
                "role": "decoy",
                "smiles": d["smiles"],
                "name": old["name"],
                "molecularWeight": d["props"]["mw"],
                "xlogp": d["props"]["logp"],
                "hbd": d["props"]["hbd"],
                "hba": d["props"]["hba"],
                "rotatableBonds": d["props"]["rot"],
                "tpsa": d["props"]["tpsa"],
                "matched_to": old.get("matched_to"),
            }
    return built, mw_auc, logp_auc, decoy_count


def baseline_auc(compounds):
    labels = [c["role"] == "active" for c in compounds]
    mw = [c["molecularWeight"] for c in compounds]
    logp = [c["xlogp"] for c in compounds]
    return roc_auc(labels, mw), roc_auc(labels, logp)


def build_test_compounds(test_raw, ref_raw, target_decoy_pool, use_property_match=True):
    ref_fps = [fp_morgan(Chem.MolFromSmiles(r["smiles"])) for r in ref_raw]
    all_test_fps = [fp_morgan(Chem.MolFromSmiles(t["smiles"])) for t in test_raw]
    built = []
    decoy_count = 0
    for active in test_raw:
        amol = Chem.MolFromSmiles(active["smiles"])
        props = mol_props(amol)
        afp = fp_morgan(amol)
        nn_tan = max(DataStructs.BulkTanimotoSimilarity(afp, ref_fps)) if ref_fps else 0.0
        built.append(
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
                "nn_tanimoto_to_ref": round(float(nn_tan), 4),
            }
        )
        decoys = pick_decoys(
            active,
            all_test_fps + ref_fps,
            target_decoy_pool,
            DECOYS_PER_ACTIVE,
            use_property_match=use_property_match,
        )
        decoy_count += len(decoys)
        for i, d in enumerate(decoys):
            built.append(
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
    mw_auc, logp_auc = baseline_auc(built)
    return built, decoy_count, mw_auc, logp_auc


def pick_decoys(active, all_actives_fps, pool, n=DECOYS_PER_ACTIVE, use_property_match=True):
    mol = Chem.MolFromSmiles(active["smiles"])
    props = mol_props(mol)
    afp = fp_morgan(mol)
    picked = []
    shuffled = pool if len(pool) <= 20000 else random.sample(pool, 20000)
    random.shuffle(shuffled)
    for cand in shuffled:
        if cand["smiles"] == active["smiles"]:
            continue
        if use_property_match and not props_match(props, cand["props"]):
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

    split_sets = {"version": 2, "targets": {}}

    for tgt in TARGETS:
        print(f"[build] {tgt['id']} …", flush=True)
        decoy_source = "chembl_property_matched"
        actives = fetch_chembl_actives(tgt["chembl_target"])
        dude = load_dude_set(tgt["id"])
        if dude and dude.get("available"):
            decoy_source = "DUD-E decoys + ChEMBL actives"
            decoy_smiles = [
                d["smiles"] if isinstance(d, dict) else d for d in dude["decoys"]
            ]
            target_decoy_pool = dude_decoy_pool(decoy_smiles)
        else:
            target_decoy_pool = decoy_pool
            if tgt.get("decoy_source") == "chembl_self":
                decoy_source = "chembl_self (less trustworthy; no DUD-E/LIT-PCBA set)"

        actives = [a for a in actives if Chem.MolToSmiles(Chem.MolFromSmiles(a["smiles"])) not in excluded_canonical]
        if len(actives) < MIN_ACTIVES_TEST + MIN_ACTIVES_REF:
            summary["targets"].append(
                {"id": tgt["id"], "error": f"only {len(actives)} actives after dedup/exclusion"}
            )
            continue

        ref_raw, test_raw = cluster_split_butina(actives)
        ref_rand, test_rand = random_split_butina(actives)
        if len(test_raw) < MIN_ACTIVES_TEST:
            summary["targets"].append(
                {"id": tgt["id"], "error": f"only {len(test_raw)} test actives after scaffold split"}
            )
            continue

        ref_entries = []
        for r in ref_raw:
            m = Chem.MolFromSmiles(r["smiles"])
            ref_entries.append(
                {
                    "smiles": r["smiles"],
                    "chembl_id": r.get("chembl_id"),
                    "pchembl": r.get("pchembl"),
                    "fp": fp_morgan(m).ToBitString(),
                }
            )

        ref_murcko = {r.get("murcko") for r in ref_raw if r.get("murcko")}
        test_murcko = {t.get("murcko") for t in test_raw if t.get("murcko")}
        murcko_overlap = len(ref_murcko & test_murcko)

        compounds = None
        decoy_count = 0
        mw_auc = logp_auc = None
        random_compounds = None
        use_property_match = True
        for attempt in range(10):
            _LOGP_TOL = 0.45 + attempt * 0.08
            random.seed(1000 + attempt * 17)
            compounds, decoy_count, mw_auc, logp_auc = build_test_compounds(
                test_raw, ref_raw, target_decoy_pool, use_property_match=use_property_match
            )
            if decoy_count < len(test_raw) * 10:
                target_decoy_pool = decoy_pool
                decoy_source = decoy_source + " (ChEMBL pool fallback)"
                compounds, decoy_count, mw_auc, logp_auc = build_test_compounds(
                    test_raw, ref_raw, target_decoy_pool, use_property_match=use_property_match
                )
            compounds, mw_auc, logp_auc, decoy_count = refine_decoy_sanity(
                compounds, test_raw, ref_raw, target_decoy_pool
            )
            random_compounds, _, _, _ = build_test_compounds(
                test_rand, ref_rand, target_decoy_pool, use_property_match=use_property_match
            )
            random_compounds, _, _, _ = refine_decoy_sanity(
                random_compounds, test_rand, ref_rand, target_decoy_pool
            )
            if (
                mw_auc is not None
                and logp_auc is not None
                and 0.45 <= mw_auc <= 0.55
                and 0.45 <= logp_auc <= 0.55
            ):
                break

        sanity_ok = (
            mw_auc is not None
            and logp_auc is not None
            and 0.45 <= mw_auc <= 0.55
            and 0.45 <= logp_auc <= 0.55
        )
        if murcko_overlap > 0:
            summary["targets"].append(
                {
                    "id": tgt["id"],
                    "error": f"dropped: murcko_scaffold_overlap={murcko_overlap} (cluster split)",
                }
            )
            continue
        if not sanity_ok:
            summary["targets"].append(
                {
                    "id": tgt["id"],
                    "error": "dropped: MW/logP sanity failed",
                    "mw_roc_auc": mw_auc,
                    "logp_roc_auc": logp_auc,
                    "decoys_per_active_mean": decoy_count / max(1, len(test_raw)),
                    "decoy_source": decoy_source,
                }
            )
            continue

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
                "sanity": {
                    "mw_roc_auc": mw_auc,
                    "logp_roc_auc": logp_auc,
                    "murcko_scaffold_overlap": murcko_overlap,
                    "decoy_count": decoy_count,
                    "decoy_source": decoy_source,
                    "decoys_per_active_requested": DECOYS_PER_ACTIVE,
                    "decoys_per_active_mean": decoy_count / max(1, len(test_raw)),
                },
            }
        )
        split_sets["targets"][tgt["id"]] = {
            "cluster_test_smiles": [x["smiles"] for x in test_raw],
            "cluster_ref_smiles": [x["smiles"] for x in ref_raw],
            "random_compounds": random_compounds,
        }

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
                "mw_roc_auc": mw_auc,
                "logp_roc_auc": logp_auc,
                "murcko_scaffold_overlap": murcko_overlap,
                "decoy_source": decoy_source,
                "decoys_per_active_mean": decoy_count / max(1, len(test_raw)),
                "decoys_per_active_requested": DECOYS_PER_ACTIVE,
            }
        )

    all_mw = []
    all_logp = []
    for t in heldout_targets:
        if t.get("sanity"):
            all_mw.append(t["sanity"]["mw_roc_auc"])
            all_logp.append(t["sanity"]["logp_roc_auc"])
    payload = {
        "version": 2,
        "description": "ChEMBL held-out actives (scaffold-split) + property-matched decoys",
        "sanity_overall": {
            "mean_mw_roc_auc": sum(all_mw) / len(all_mw) if all_mw else None,
            "mean_logp_roc_auc": sum(all_logp) / len(all_logp) if all_logp else None,
            "benchmark_ready": len(heldout_targets) >= 3
            and all(
                t.get("sanity", {}).get("mw_roc_auc") is not None
                and 0.45 <= t["sanity"]["mw_roc_auc"] <= 0.55
                and 0.45 <= t["sanity"]["logp_roc_auc"] <= 0.55
                and t.get("sanity", {}).get("murcko_scaffold_overlap", 0) == 0
                for t in heldout_targets
            ),
        },
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
    (BENCH / "split_sets.json").write_text(json.dumps(split_sets, indent=2))
    print(f"Wrote {OUT_HELDOUT} ({len(heldout_targets)} targets)")


if __name__ == "__main__":
    main()
