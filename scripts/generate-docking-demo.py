#!/usr/bin/env python3
"""Run real Vina jobs for static docking demo assets (public/docking-demo/)."""

from __future__ import annotations

import json
import math
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "docking"))

os.environ.setdefault("ENGINE_CONFIG_PATH", str(ROOT / "benchmark" / "docking" / "engine.config.json"))
os.environ["DOCKING_SKIP_VINA"] = "0"

from app.pipeline import (  # noqa: E402
    _parse_pdbqt_poses,
    fetch_pdb_text,
    run_docking_pipeline,
)

OUT_DIR = ROOT / "public" / "docking-demo"
POSE_DIR = OUT_DIR / "poses"
CASE_DIR = OUT_DIR / "cases"

DEMO_CASES = [
    {
        "id": "imatinib-1iep",
        "drug": "Imatinib",
        "target": "ABL1 (c-Abl kinase)",
        "pdbId": "1IEP",
        "ligandCode": "STI",
        "smiles": "CC1=C(C=C(C=C1)NC(=O)C2=CC=C(C=C2)CN3CCN(CC3)C)NC4=NC=CC(=N4)C5=CN=CC=C5",
        "notes": "Co-crystal STI-571 (Gleevec).",
    },
    {
        "id": "erlotinib-1m17",
        "drug": "Erlotinib",
        "target": "EGFR kinase",
        "pdbId": "1M17",
        "ligandCode": "AQ4",
        "smiles": "COCCOC1=C(C=C2C(=C1)C(=NC=N2)NC3=CC=CC(=C3)C#C)OCCOC",
        "notes": "4-anilinoquinazoline inhibitor AQ4.",
    },
    {
        "id": "sitagliptin-4ffw",
        "drug": "Sitagliptin",
        "target": "DPP-4",
        "pdbId": "4FFW",
        "ligandCode": "715",
        "smiles": "C1CN2C(=NN=C2C(F)(F)F)CN1C(=O)CC(CC3=CC(=C(C=C3F)F)F)N",
        "notes": "1X70 is a different beta-amino acid inhibitor; 4FFW is sitagliptin (715).",
    },
    {
        "id": "ruxolitinib-6vgl",
        "drug": "Ruxolitinib",
        "target": "JAK2",
        "pdbId": "6VGL",
        "ligandCode": "RXT",
        "smiles": "C1CCC(C1)C(CC#N)N2C=C(C=N2)C3=C4C=CNC4=NC=N3",
        "notes": "JAK2 JH1 domain with RXT.",
    },
    {
        "id": "carazolol-3p0g",
        "drug": "Carazolol",
        "target": "ADRB2 (β2-adrenergic receptor)",
        "pdbId": "3P0G",
        "ligandCode": "P0G",
        "smiles": "COC1=CC=CC=C1OCCNCC(COC2=CC=CC3=C2C4=CC=CC=C4N3)O",
        "notes": "2RH1 has no bound orthosteric ligand; 3P0G has carazolol (P0G).",
    },
]


def _write_ligand_pdb(pdb_text: str, resname: str, path: Path) -> None:
    lines = []
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        if line[17:20].strip() != resname:
            continue
        lines.append(line)
    if not lines:
        raise RuntimeError(f"No HETATM records for ligand {resname}")
    path.write_text("\n".join(lines) + "\nEND\n", encoding="utf-8")


def _pdbqt_model_to_sdf(pdbqt_path: Path, model_index: int, sdf_path: Path) -> None:
    text = pdbqt_path.read_text(encoding="utf-8")
    models = []
    current = []
    for line in text.splitlines():
        if line.startswith("MODEL"):
            current = []
        elif line.startswith("ENDMDL"):
            models.append("\n".join(current))
            current = []
        elif line.startswith("ATOM") or line.startswith("HETATM"):
            current.append(line)
    if not models:
        raise RuntimeError("No models in output PDBQT")
    block = models[min(model_index, len(models) - 1)]
    tmp = sdf_path.with_suffix(".pdb")
    tmp.write_text(block + "\nEND\n", encoding="utf-8")
    subprocess.run(
        ["obabel", str(tmp), "-O", str(sdf_path), "-h"],
        check=True,
        capture_output=True,
        text=True,
    )
    tmp.unlink(missing_ok=True)


def _heavy_coords_from_ligand_pdb(pdb_path: Path) -> list[list[float]]:
    coords: list[list[float]] = []
    for line in pdb_path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("HETATM"):
            continue
        element = (line[76:78].strip() or line[12:16].strip()[:1]).upper()
        if element == "H":
            continue
        coords.append([float(line[30:38]), float(line[38:46]), float(line[46:54])])
    if not coords:
        raise RuntimeError(f"No heavy atoms in {pdb_path}")
    return coords


def _heavy_coords_from_pose_atoms(atoms: list[dict]) -> list[list[float]]:
    coords = []
    for a in atoms:
        el = str(a.get("element") or "C").upper()
        if el == "H":
            continue
        coords.append([float(a["x"]), float(a["y"]), float(a["z"])])
    if not coords:
        raise RuntimeError("No heavy atoms in docked pose")
    return coords


def _kabsch_rmsd(mobile: list[list[float]], target: list[list[float]]) -> float:
    import numpy as np

    p = np.asarray(mobile, dtype=float)
    q = np.asarray(target, dtype=float)
    if p.shape != q.shape or p.shape[0] < 3:
        raise RuntimeError("RMSD requires matched coordinate sets with at least 3 atoms")
    p -= p.mean(axis=0)
    q -= q.mean(axis=0)
    cov = p.T @ q
    u, _s, vt = np.linalg.svd(cov)
    d = np.sign(np.linalg.det(u @ vt))
    rot = u @ np.diag([1.0, 1.0, d]) @ vt
    p_aligned = p @ rot
    return float(np.sqrt(np.mean(np.sum((p_aligned - q) ** 2, axis=1))))


def _redock_rmsd(crystal_pdb: Path, pose_atoms: list[dict]) -> float:
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    from scipy.spatial.distance import cdist

    crystal = np.asarray(_heavy_coords_from_ligand_pdb(crystal_pdb), dtype=float)
    pose = np.asarray(_heavy_coords_from_pose_atoms(pose_atoms), dtype=float)
    n = min(len(crystal), len(pose))
    if n < 3:
        raise RuntimeError("Not enough heavy atoms for RMSD")
    if len(crystal) != len(pose):
        dist = cdist(pose, crystal)
        row_idx, col_idx = linear_sum_assignment(dist)
        pairs = list(zip(row_idx, col_idx))[:n]
        pose_m = np.asarray([pose[i] for i, _ in pairs], dtype=float)
        crystal_m = np.asarray([crystal[j] for _, j in pairs], dtype=float)
    else:
        pose_m, crystal_m = pose, crystal
    return _kabsch_rmsd(pose_m.tolist(), crystal_m.tolist())


def _compact_pocket(pocket_atoms: list[dict], max_atoms: int = 900) -> list[dict]:
    if len(pocket_atoms) <= max_atoms:
        return pocket_atoms
    step = math.ceil(len(pocket_atoms) / max_atoms)
    return pocket_atoms[::step][:max_atoms]


def _atoms_to_viewer_pose(atoms: list[dict]) -> list[dict]:
    out = []
    for i, a in enumerate(atoms):
        el = (a.get("element") or "C").upper()
        out.append(
            {
                "index": i,
                "symbol": el,
                "element": el,
                "x": a["x"],
                "y": a["y"],
                "z": a["z"],
            }
        )
    return out


def main() -> None:
    work_root = ROOT / ".docking-demo-work"
    work_root.mkdir(exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    POSE_DIR.mkdir(parents=True, exist_ok=True)
    CASE_DIR.mkdir(parents=True, exist_ok=True)

    manifest_cases = []
    for case in DEMO_CASES:
        case_id = case["id"]
        print(f"=== Running {case_id} ===", flush=True)
        work = work_root / case_id
        work.mkdir(parents=True, exist_ok=True)
        pdb_text = fetch_pdb_text(case["pdbId"])
        crystal_pdb = work / f"{case['ligandCode']}_crystal.pdb"
        _write_ligand_pdb(pdb_text, case["ligandCode"], crystal_pdb)

        result = run_docking_pipeline(
            case["pdbId"],
            case["smiles"],
            work,
            ligand_resname=case["ligandCode"],
        )
        poses_pdbqt = work / "poses.pdbqt"
        pose_sdf = POSE_DIR / f"{case_id}.sdf"
        _pdbqt_model_to_sdf(poses_pdbqt, 0, pose_sdf)

        top = result["poses"][0]
        score = float(top["scoreKcalMol"])
        rmsd = _redock_rmsd(crystal_pdb, top.get("atoms") or [])

        pocket = _compact_pocket(result.get("pocketAtoms") or [])
        viewer_payload = {
            "id": case_id,
            "drug": case["drug"],
            "target": case["target"],
            "pdbId": case["pdbId"],
            "ligandCode": case["ligandCode"],
            "scoreKcalMol": round(score, 2),
            "redockRmsdAngstrom": round(rmsd, 2),
            "redockPass2A": rmsd <= 2.0,
            "poseAtoms": _atoms_to_viewer_pose(top.get("atoms") or []),
            "pocketAtoms": pocket,
            "poseFile": f"poses/{case_id}.sdf",
        }
        (CASE_DIR / f"{case_id}.json").write_text(json.dumps(viewer_payload), encoding="utf-8")

        manifest_cases.append(
            {
                **case,
                "scoreKcalMol": round(score, 2),
                "redockRmsdAngstrom": round(rmsd, 2),
                "redockPass2A": rmsd <= 2.0,
                "poseFile": f"poses/{case_id}.sdf",
                "caseFile": f"cases/{case_id}.json",
            }
        )
        print(f"  score={score:.2f} kcal/mol  RMSD={rmsd:.2f} Å", flush=True)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "engine": {"name": "autodock_vina", "version": "1.2.5", "seed": 42},
        "boxSource": "cocrystal_ligand",
        "cases": manifest_cases,
    }
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    total = sum(f.stat().st_size for f in OUT_DIR.rglob("*") if f.is_file())
    print(f"Wrote {OUT_DIR} ({total / 1024:.1f} KiB total)", flush=True)


if __name__ == "__main__":
    main()
