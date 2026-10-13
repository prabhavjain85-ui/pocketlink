#!/usr/bin/env python3
"""Multi-seed co-crystal redocking validation."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.ligand_prep import embed_smiles_3d
from lib.rmsd import rmsd_pose_pdbqt_vs_ref
from lib.session import DockingSession, load_config

MANIFEST = ROOT / "manifests" / "redock_targets.json"
OUT = ROOT / "results" / "redock_multiseed.json"


def main() -> None:
    cfg = load_config()
    targets = json.loads(MANIFEST.read_text())["targets"]
    work = ROOT / "cache" / "runs"
    rows = []
    for tgt in targets:
        sess = DockingSession(tgt, work)
        ref = sess.reference_mol()
        dock_mol = ref
        per_seed = []
        passes = 0
        failures = []
        for seed in cfg["redock_seeds"]:
            pose, score, err = sess.dock_mol(
                dock_mol, seed=int(seed), work_subdir=f"redock_seed_{seed}"
            )
            if err or not pose:
                per_seed.append(None)
                failures.append(f"seed{seed}:{err}")
                continue
            rmsd = rmsd_pose_pdbqt_vs_ref(ref, pose)["primary_rmsd_angstrom"]
            per_seed.append(rmsd)
            if rmsd is not None and rmsd <= float(cfg["redock_pass_rmsd_angstrom"]):
                passes += 1
        status = (
            "PASS"
            if passes >= int(cfg["redock_pass_min_seeds"])
            else "FAIL"
        )
        rows.append(
            {
                "target_id": tgt["target_id"],
                "pdb_id": tgt["pdb_id"],
                "ligand_resn": tgt["ligand_resn"],
                "per_seed_spyrmsd_angstrom": per_seed,
                "seeds_passing": passes,
                "seeds_total": len(cfg["redock_seeds"]),
                "status": status,
                "failure_notes": failures[:3],
            }
        )
        print(
            f"[redock] {tgt['target_id']}: {passes}/{len(cfg['redock_seeds'])} seeds < {cfg['redock_pass_rmsd_angstrom']} A -> {status}",
            flush=True,
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "engine": cfg["engine"],
        "exhaustiveness": cfg["exhaustiveness"],
        "receptor_ph": cfg["receptor_ph"],
        "pass_rule": f">={cfg['redock_pass_min_seeds']}/{len(cfg['redock_seeds'])} seeds with spyrmsd <= {cfg['redock_pass_rmsd_angstrom']} A",
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
