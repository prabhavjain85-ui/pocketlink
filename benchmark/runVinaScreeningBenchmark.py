#!/usr/bin/env python3
"""
Vina score screening on the 8 redock-validated targets only.

**Selection bias:** targets were included because co-crystal redocking passed (<2 Å).
Uses ChEMBL actives + property-matched decoys from heldout_benchmark_v2 when present;
otherwise builds a minimal set via buildHeldoutBenchmark helpers.

Scores: Vina top-pose affinity (kcal/mol, higher is better when negated as -score).
Metrics: ROC-AUC with 95% bootstrap CI (800 resamples), EF@1%.
"""
from __future__ import annotations

import json
import math
import os
import random
import tempfile
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / "benchmark"
VALIDATED = json.loads((BENCH / "vina_validated_targets.json").read_text())["validated"]
HELDOUT = BENCH / "heldout_benchmark_v2.json"
OUT_JSON = BENCH / "vina_screening_results.json"
OUT_MD = BENCH / "VINA_SCREENING_RESULTS.md"

MAX_ACTIVES = int(os.environ.get("VINA_SCREEN_MAX_ACTIVES", "25"))
MAX_DECOYS = int(os.environ.get("VINA_SCREEN_MAX_DECOYS", "100"))
BOOT = int(os.environ.get("BOOTSTRAP_N", "800"))


def roc_auc(labels, scores):
    from buildHeldoutBenchmark import roc_auc as _auc

    return _auc(labels, scores)


def bootstrap_auc(labels, scores, n=800, seed=42):
    rng = random.Random(seed)
    n_pos = sum(labels)
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None, None, None
    obs = roc_auc(labels, scores)
    samples = []
    idx = list(range(len(labels)))
    for _ in range(n):
        draw = [rng.choice(idx) for _ in idx]
        labs = [labels[i] for i in draw]
        scs = [scores[i] for i in draw]
        samples.append(roc_auc(labs, scs))
    samples.sort()
    lo = samples[int(0.025 * n)]
    hi = samples[int(0.975 * n)]
    return obs, lo, hi


def ef_at_pct(labels, scores, pct=0.01):
    n = len(labels)
    k = max(1, int(math.ceil(n * pct)))
    ranked = sorted(range(n), key=lambda i: scores[i], reverse=True)
    hits = sum(labels[i] for i in ranked[:k])
    n_pos = sum(labels)
    expected = n_pos * k / n if n else 0
    return hits / expected if expected > 0 else 0.0


def vina_score_for_smiles(target_cfg, full_tgt, smiles: str) -> float | None:
    from runRedockValidation import (
        fetch_pdb,
        ligand_pdb_lines,
        mol_from_ligand_pdb,
        reference_mol_from_crystal,
        strip_ligand_receptor,
        ligand_center,
        box_from_mol,
        prepare_and_vina,
    )

    pdb_text = fetch_pdb(full_tgt["pdb_id"])
    lig_lines = ligand_pdb_lines(
        pdb_text, full_tgt["ligand_resn"], full_tgt.get("ligand_chain", "A")
    )
    crystal = mol_from_ligand_pdb(lig_lines)
    ref_mol = reference_mol_from_crystal(
        crystal, full_tgt["ligand_resn"], full_tgt["reference_smiles"]
    )
    if ref_mol is None:
        return None
    mob = Chem.MolFromSmiles(smiles)
    if mob is None:
        return None
    mob = Chem.RemoveHs(mob)
    AllChem.EmbedMolecule(mob, randomSeed=42)
    AllChem.MMFFOptimizeMolecule(mob)
    center = ligand_center(ref_mol)
    box = box_from_mol(ref_mol)
    keep = [h for h in full_tgt.get("keep_het_resnames", []) if h.upper() not in ("HEM", "HEC")]
    receptor = strip_ligand_receptor(
        pdb_text, full_tgt["ligand_resn"], full_tgt.get("ligand_chain", "A"), keep
    )
    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        pose, err = prepare_and_vina(receptor, ref_mol, mob, center, box, work)
        if err or not pose:
            return None
        for line in pose.splitlines():
            if line.startswith("REMARK VINA RESULT:"):
                return -float(line.split()[3])  # higher = better for ranking
    return None


def load_compounds(target_id: str):
    dude_path = BENCH / "dude_benchmark.json"
    if dude_path.exists():
        data = json.loads(dude_path.read_text())
        for t in data.get("targets", []):
            if t.get("id") != target_id:
                continue
            act = [c["smiles"] for c in t.get("compounds", []) if c.get("role") == "active"]
            dec = [c["smiles"] for c in t.get("compounds", []) if c.get("role") == "decoy"]
            if act and dec:
                return act[:MAX_ACTIVES], dec[:MAX_DECOYS]
    sets_path = BENCH / "vina_screening_compounds.json"
    if sets_path.exists():
        data = json.loads(sets_path.read_text())
        block = data.get("targets", {}).get(target_id)
        if block:
            return block.get("actives", [])[:MAX_ACTIVES], block.get("decoys", [])[:MAX_DECOYS]
    if not HELDOUT.exists():
        return [], []
    data = json.loads(HELDOUT.read_text())
    for t in data.get("targets", []):
        if t.get("id") != target_id:
            continue
        act = [c["smiles"] for c in t.get("compounds", []) if c.get("role") == "active"]
        dec = [c["smiles"] for c in t.get("compounds", []) if c.get("role") == "decoy"]
        return act[:MAX_ACTIVES], dec[:MAX_DECOYS]
    return [], []


def main():
    docking_cfg = json.loads((BENCH / "docking_targets.json").read_text())
    by_id = {t["target_id"]: t for t in docking_cfg["targets"]}
    rows = []
    for vt in VALIDATED:
        tid = vt["target_id"]
        full = by_id.get(tid)
        if not full:
            continue
        act, dec = load_compounds(tid)
        if not act or not dec:
            rows.append(
                {
                    "target_id": tid,
                    "skipped": True,
                    "reason": "no held-out actives/decoys in heldout_benchmark_v2 (ChEMBL gate may have dropped target)",
                }
            )
            continue
        labels = []
        scores = []
        failures = 0
        for smi in act:
            s = vina_score_for_smiles(vt, full, smi)
            if s is None:
                failures += 1
                continue
            labels.append(1)
            scores.append(s)
        for smi in dec:
            s = vina_score_for_smiles(vt, full, smi)
            if s is None:
                failures += 1
                continue
            labels.append(0)
            scores.append(s)
        auc, lo, hi = bootstrap_auc(labels, scores, n=BOOT)
        rows.append(
            {
                "target_id": tid,
                "n_scored": len(labels),
                "dock_failures": failures,
                "roc_auc": auc,
                "roc_auc_ci_95": [lo, hi],
                "ef_at_1pct": ef_at_pct(labels, scores, 0.01),
                "selection_bias_note": "Target included because redocking passed <2 Å",
            }
        )
        print(f"[vina-screen] {tid} n={len(labels)} auc={auc}", flush=True)

    payload = {
        "selection_bias": "Targets chosen by redocking success (<2 Å in-place Vina). Retrospective Vina ROC-AUC is optimistic.",
        "max_actives": MAX_ACTIVES,
        "max_decoys": MAX_DECOYS,
        "rows": rows,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2))
    lines = [
        "# Vina screening benchmark (redock-validated targets only)",
        "",
        payload["selection_bias"],
        "",
        f"Caps: {MAX_ACTIVES} actives, {MAX_DECOYS} decoys per target.",
        "",
        "| Target | N scored | ROC-AUC | 95% CI | EF@1% | Dock failures |",
        "|---|---:|---:|---|---:|---:|",
    ]
    for r in rows:
        if r.get("skipped"):
            lines.append(f"| {r['target_id']} | — | — | — | — | {r.get('reason','')} |")
            continue
        ci = r.get("roc_auc_ci_95") or [None, None]
        lines.append(
            f"| {r['target_id']} | {r['n_scored']} | {r.get('roc_auc')} | "
            f"[{ci[0]}, {ci[1]}] | {r.get('ef_at_1pct')} | {r.get('dock_failures')} |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT_JSON} and {OUT_MD}")


if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(BENCH))
    main()
