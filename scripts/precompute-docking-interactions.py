#!/usr/bin/env python3
"""Precompute pose interaction JSON for offline docking demo assets."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "docking"))

from app.interactions import analyze_pose_interactions  # noqa: E402
from app.pipeline import _parse_ligand_atoms, _parse_protein_atoms, fetch_pdb_text  # noqa: E402

CASE_DIR = ROOT / "public" / "docking-demo" / "cases"
OUT_DIR = ROOT / "public" / "docking-demo" / "interactions"


def _crystal_ligand_atoms(pdb_text: str, ligand_code: str) -> list[dict]:
    atoms, _ = _parse_ligand_atoms(pdb_text, ligand_resname=ligand_code)
    out = []
    for i, a in enumerate(atoms):
        out.append(
            {
                "index": i,
                "x": a["x"],
                "y": a["y"],
                "z": a["z"],
                "element": "C",
                "atomName": f"C{i + 1}",
            }
        )
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for case_path in sorted(CASE_DIR.glob("*.json")):
        case = json.loads(case_path.read_text(encoding="utf-8"))
        case_id = case["id"]
        protein = case.get("pocketAtoms") or []
        ligand = case.get("poseAtoms") or []
        analysis = analyze_pose_interactions(protein, ligand)

        try:
            pdb_text = fetch_pdb_text(case["pdbId"])
            full_protein = _parse_protein_atoms(pdb_text)
            crystal_lig = _crystal_ligand_atoms(pdb_text, case["ligandCode"])
            if crystal_lig:
                crystal = analyze_pose_interactions(full_protein, crystal_lig)
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
        except Exception as exc:  # noqa: BLE001 — demo precompute should not fail the batch
            analysis["crystalMatchError"] = str(exc)

        out_path = OUT_DIR / f"{case_id}.json"
        out_path.write_text(json.dumps(analysis, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {out_path} ({out_path.stat().st_size} bytes, {len(analysis.get('interactions', []))} contacts)")


if __name__ == "__main__":
    main()
