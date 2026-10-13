#!/usr/bin/env python3
"""Multi-seed co-crystal redocking validation."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.rmsd import rmsd_pose_pdbqt_vs_ref
from lib.session import DockingSession, load_config

MANIFEST = ROOT / "manifests" / "redock_targets.json"
OUT = ROOT / "results" / "redock_multiseed.json"


def main() -> None:
    cfg = load_config()
    targets = json.loads(MANIFEST.read_text())["targets"]
    work = ROOT / "cache" / "runs"
    threshold = float(cfg["redock_pass_rmsd_angstrom"])
    panel_frac = float(cfg["redock_panel_pass_fraction"])
    rows = []
    for tgt in targets:
        sess = DockingSession(tgt, work)
        ref = sess.reference_mol()
        per_seed = []
        failures = []
        for seed in cfg["redock_seeds"]:
            pose, _score, err = sess.dock_mol(
                ref, seed=int(seed), work_subdir=f"redock_seed_{seed}"
            )
            if err or not pose:
                per_seed.append(None)
                failures.append(f"seed{seed}:{err}")
                continue
            rmsd = rmsd_pose_pdbqt_vs_ref(ref, pose)["primary_rmsd_angstrom"]
            per_seed.append(rmsd)

        valid = [r for r in per_seed if r is not None]
        best = min(valid) if valid else None
        med = median(valid) if valid else None
        target_pass = best is not None and best <= threshold
        rationale = tgt.get("known_failure_rationale")
        if not target_pass and rationale:
            failure_reason = rationale
        elif not valid:
            failure_reason = failures[0] if failures else "no_valid_poses"
        elif best is not None and best > threshold:
            failure_reason = f"best_seed_spyrmsd_{best:.2f}A_above_{threshold}A"
        else:
            failure_reason = None

        rows.append(
            {
                "target_id": tgt["target_id"],
                "pdb_id": tgt["pdb_id"],
                "ligand_resn": tgt["ligand_resn"],
                "per_seed_spyrmsd_angstrom": per_seed,
                "best_rmsd_angstrom": best,
                "median_rmsd_angstrom": med,
                "pass_rmsd_2A": target_pass,
                "failure_reason": failure_reason,
                "failure_notes": failures[:3],
            }
        )
        print(
            f"[redock] {tgt['target_id']}: best={best} A pass={target_pass}",
            flush=True,
        )

    n_pass = sum(1 for r in rows if r["pass_rmsd_2A"])
    n_total = len(rows)
    panel_rate = n_pass / n_total if n_total else 0.0
    panel_pass = panel_rate >= panel_frac

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engine": cfg["engine"],
        "exhaustiveness": cfg["exhaustiveness"],
        "receptor_ph": cfg["receptor_ph"],
        "per_target_pass_rule": f"best seed spyrmsd <= {threshold} A",
        "panel_pass_rule": f">={panel_frac * 100:.0f}% of targets pass per-target rule",
        "panel_pass_rate": panel_rate,
        "panel_overall_pass": panel_pass,
        "n_targets_pass": n_pass,
        "n_targets": n_total,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(
        f"Panel: {n_pass}/{n_total} ({panel_rate * 100:.0f}%) overall_pass={panel_pass}",
        flush=True,
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
