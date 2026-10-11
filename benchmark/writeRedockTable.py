#!/usr/bin/env python3
"""Write benchmark/REDOCK_TABLE.md from redocking_results.json."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / "benchmark" / "redocking_results.json"
OUT = ROOT / "benchmark" / "REDOCK_TABLE.md"

METHOD_DEFAULT = (
    "Heavy-atom RMSD in the receptor frame with **no** Kabsch/superposition. "
    "Reference ligand: co-crystal HETATM (one chain/altloc) with bond orders from "
    "RCSB `chemcomp` SMILES via `AssignBondOrdersFromTemplate`. "
    "Probe: Vina top pose in the same frame; `rdMolAlign.CalcRMS(prb, ref)` "
    "(in-place, symmetry-aware). **Not** `GetBestRMS` / `AlignMol`. "
    "Native column (when present): in-browser engine, index-mapped heavy-atom distance "
    "RMSD without alignment (no symmetry swap); see `rmsdBetweenCoords` in dockingEngine."
)


def main():
    if not INP.exists():
        OUT.write_text("# Redocking\n\nNo results yet.\n")
        return
    data = json.loads(INP.read_text())
    method = data.get("rmsd_method") or METHOD_DEFAULT
    lines = [
        "# Co-crystal redocking",
        "",
        "## RMSD definition",
        "",
        method,
        "",
        "**Correction:** Earlier drafts used `GetBestRMS` / Kabsch alignment, which **under-reported** "
        "placement error (e.g. EGFR ~1.7 Å aligned vs **~5.96 Å** in-place on this run; DPP4 ~1.4 Å aligned vs "
        "**~0.84 Å** in-place). All values below use in-place `CalcRMS` only.",
        "",
        "Pass threshold: **< 2 Å** (crystal ligand redocked with Vina).",
        "",
        "| Target | PDB | Chain | Crystal heavy | CalcRMS | spyrmsd | Native (spyrmsd) | Vina pass | Native pass | Notes |",
        "|---|---|---|---:|---:|---:|---:|:---:|:---:|---|",
    ]
    for row in data.get("rows", []):
        vc = row.get("vina_rmsd_calc_angstrom") or row.get("vina_rmsd_crystal_ligand")
        spy = row.get("vina_rmsd_spyrmsd_angstrom")
        nat = row.get("native_rmsd_spyrmsd_angstrom")
        nat_idx = row.get("native_rmsd_angstrom")
        if nat is None and nat_idx is not None:
            nat = f"{nat_idx}*"
        pass_v = row.get("pass_vina_crystal")
        pass_n = row.get("pass_native") or row.get("pass_native_crystal")
        notes = row.get("failure_reason") or ""
        if notes and len(notes) > 55:
            notes = notes[:52] + "..."
        lines.append(
            f"| {row.get('target')} | {row.get('pdb_id')} | {row.get('ligand_chain','A')} | "
            f"{row.get('crystal_heavy_atoms','—')} | "
            f"{vc if vc is not None else '—'} | {spy if spy is not None else '—'} | "
            f"{nat if nat is not None else '—'} | "
            f"{'yes' if pass_v else 'no'} | {'yes' if pass_n else 'no'} | {notes} |"
        )
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
