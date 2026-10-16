#!/usr/bin/env python3
"""Precompute pose interaction JSON for offline docking demo assets."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "docking"))

from app.interactions import analyze_pose_interactions, evaluate_binding_site_sanity  # noqa: E402
from app.pdb_ligand import select_cocrystal_ligand_instance  # noqa: E402
from app.pipeline import (  # noqa: E402
    _parse_crystal_ligand_atoms,
    _parse_protein_atoms,
    fetch_pdb_text,
)

CASE_DIR = ROOT / "public" / "docking-demo" / "cases"
OUT_DIR = ROOT / "public" / "docking-demo" / "interactions"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for case_path in sorted(CASE_DIR.glob("*.json")):
        case = json.loads(case_path.read_text(encoding="utf-8"))
        case_id = case["id"]
        protein_pocket = case.get("pocketAtoms") or []
        ligand = case.get("poseAtoms") or []

        pdb_text = fetch_pdb_text(case["pdbId"])
        full_protein = _parse_protein_atoms(pdb_text)
        pose_centroid = None
        heavy = [
            a
            for a in ligand
            if str(a.get("element", "C")).upper() not in {"H", "HD"}
        ]
        if heavy:
            pose_centroid = {
                "x": sum(a["x"] for a in heavy) / len(heavy),
                "y": sum(a["y"] for a in heavy) / len(heavy),
                "z": sum(a["z"] for a in heavy) / len(heavy),
            }
        ligand_pick = select_cocrystal_ligand_instance(
            pdb_text, case["ligandCode"], full_protein, pose_centroid=pose_centroid
        )
        crystal_ligand = ligand_pick.get("atoms") or []
        sanity = evaluate_binding_site_sanity(
            full_protein, crystal_ligand, ligand, pdb_id=case["pdbId"]
        )
        sanity["cocrystalLigand"] = ligand_pick.get("instance")
        sanity["cocrystalLigandSelectionReason"] = ligand_pick.get("selectionReason")
        sanity["cocrystalLigandInstanceCount"] = ligand_pick.get("instanceCount")

        analysis = analyze_pose_interactions(
            protein_pocket,
            ligand,
            full_protein_atoms=full_protein,
            crystal_ligand_atoms=crystal_ligand,
            pdb_id=case["pdbId"],
            binding_site_sanity=sanity,
        )

        try:
            crystal = analyze_pose_interactions(full_protein, crystal_ligand)
            crystal_keys = {
                f"{r['type']}|{r['resName']}|{r['resSeq']}|{r['proteinAtom']}|{r['ligandElement']}"
                for r in crystal.get("interactions", [])
            }
            for row in analysis.get("interactions", []):
                row["matchesCrystal"] = (
                    f"{row['type']}|{row['resName']}|{row['resSeq']}|{row['proteinAtom']}|{row['ligandElement']}"
                    in crystal_keys
                )
            analysis["crystalInteractionCount"] = len(crystal.get("interactions", []))
        except Exception as exc:  # noqa: BLE001
            analysis["crystalMatchError"] = str(exc)

        out_path = OUT_DIR / f"{case_id}.json"
        out_path.write_text(json.dumps(analysis, separators=(",", ":")), encoding="utf-8")
        frac = sanity.get("crystalSiteRecoveryFraction")
        print(
            f"Wrote {out_path} ({out_path.stat().st_size} bytes, "
            f"{len(analysis.get('interactions', []))} contacts, site recovery={frac})"
        )


if __name__ == "__main__":
    main()
