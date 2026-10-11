#!/usr/bin/env python3
"""Write benchmark/REDOCK_TABLE.md from redocking_results.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / "benchmark" / "redocking_results.json"
OUT = ROOT / "benchmark" / "REDOCK_TABLE.md"


def main():
    if not INP.exists():
        OUT.write_text("# Redocking\n\nNo results yet. Run `python3 benchmark/runRedockValidation.py`.\n")
        return
    data = json.loads(INP.read_text())
    lines = [
        "# Co-crystal redocking (AutoDock Vina reference)",
        "",
        "| Target | PDB | Chain | Crystal heavy | Vina RMSD (crystal ligand) | Vina RMSD (RDKit 3D) | Pass (<2Å) | Notes |",
        "|---|---|---|---:|---:|---:|:---:|---|",
    ]
    for row in data.get("rows", []):
        vc = row.get("vina_rmsd_crystal_ligand")
        vr = row.get("vina_rmsd_rdkit_3d")
        pass_ = row.get("pass_vina_crystal")
        notes = row.get("failure_reason") or ""
        if notes and len(notes) > 80:
            notes = notes[:77] + "..."
        lines.append(
            f"| {row.get('target')} | {row.get('pdb_id')} | {row.get('ligand_chain','A')} | "
            f"{row.get('crystal_heavy_atoms','—')} | "
            f"{vc if vc is not None else '—'} | {vr if vr is not None else '—'} | "
            f"{'yes' if pass_ else 'no'} | {notes} |"
        )
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
