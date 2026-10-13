#!/usr/bin/env python3
"""Write REDOCK_MULTISEED_TABLE.md and sync vina_validated_targets.json from multiseed results."""
from __future__ import annotations

import json
from pathlib import Path

BENCH = Path(__file__).resolve().parent
IN_JSON = BENCH / "redock_multiseed_results.json"
OUT_MD = BENCH / "REDOCK_MULTISEED_TABLE.md"
VINA_JSON = BENCH / "vina_validated_targets.json"
CFG = BENCH / "docking_targets.json"


def main():
    data = json.loads(IN_JSON.read_text())
    rows = data.get("rows") or data.get("per_target") or []
    gate = data.get("gate") or {}
    exhaustiveness = gate.get("exhaustiveness") or data.get("exhaustiveness") or 16
    validated = []
    lines = [
        "# Multi-seed redocking gate",
        "",
        f"Exhaustiveness **{exhaustiveness}** (fixed). Pass: spyrmsd < 2 Å in **≥{gate.get('min_passing_seeds', 8)}/10** seeds (no alignment).",
        "",
        "| Target | PDB | Exhaustiveness | Passes/10 | RMSD min | RMSD median | RMSD max | Status |",
        "|---|---|---:|---:|---:|---:|---:|:---:|",
    ]
    per_seed_lines = [
        "",
        "## Per-seed spyrmsd (Å), seeds 42–51",
        "",
    ]
    cfg = json.loads(CFG.read_text())
    meta = {t["target_id"]: t for t in cfg["targets"]}
    for r in rows:
        tid = r.get("target_id") or r.get("target")
        pdb = r.get("pdb_id") or meta.get(tid, {}).get("pdb_id", "—")
        seed_rmsds = r.get("per_seed_spyrmsd") or r.get("per_seed_spyrmsd_angstrom")
        if isinstance(seed_rmsds, dict):
            vals = [v for v in seed_rmsds.values() if v is not None]
        elif isinstance(seed_rmsds, list):
            vals = [v for v in seed_rmsds if v is not None]
        else:
            vals = []
        passes = r.get("pass_count") or r.get("passes_out_of_10") or 0
        status = r.get("status") or ("PASS" if r.get("pass_multiseed") or passes >= 8 else "FAIL")
        rmin = min(vals) if vals else r.get("rmsd_min")
        rmed = sorted(vals)[len(vals) // 2] if vals else r.get("rmsd_median")
        rmax = max(vals) if vals else r.get("rmsd_max")
        lines.append(
            f"| {tid} | {pdb} | {exhaustiveness} | {passes} | {rmin} | {rmed} | {rmax} | {status} |"
        )
        seed_list = r.get("seeds") or list(range(42, 52))
        if isinstance(seed_rmsds, list) and len(seed_rmsds) == len(seed_list):
            per = ", ".join(f"{s}:{seed_rmsds[i]:.3f}" for i, s in enumerate(seed_list))
        elif vals and len(vals) == 10:
            per = ", ".join(f"{seed_list[i]}:{vals[i]:.3f}" for i in range(10))
        else:
            per = "—"
        per_seed_lines.append(f"- **{tid}:** {per}")
        if status == "PASS" or passes >= 8:
            m = meta.get(tid, {})
            entry = {
                "target_id": tid,
                "display_name": m.get("name", tid.upper()),
                "pdb_id": str(pdb).upper(),
                "ligand_resn": m.get("ligand_resn") or r.get("ligand_resn"),
                "ligand_chain": m.get("ligand_chain", "A"),
            }
            if m.get("keep_het_resnames"):
                entry["keep_het_resnames"] = m["keep_het_resnames"]
            validated.append(entry)
    lines.extend(per_seed_lines)
    OUT_MD.write_text("\n".join(lines) + "\n")
    vina_payload = {
        "description": "Server-side Vina allowlist from multi-seed redock gate.",
        "validation_run_note": OUT_MD.read_text().split("\n")[2],
        "rmsd_gate_angstrom": 2.0,
        "rmsd_metric": "spyrmsd no-alignment (symmrmsd minimize=False)",
        "validated": validated,
        "not_validated_message": (
            "Docking not validated for this target. Server-side Vina is only enabled "
            "where multi-seed co-crystal redocking passes the spyrmsd gate."
        ),
    }
    VINA_JSON.write_text(json.dumps(vina_payload, indent=2))
    print(f"Wrote {OUT_MD} and {VINA_JSON} ({len(validated)} validated)")


if __name__ == "__main__":
    main()
