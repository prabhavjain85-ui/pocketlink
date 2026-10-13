#!/usr/bin/env python3
"""25 approved-drug co-crystal redock + Vina score vs ChEMBL pChEMBL."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.chembl import (
    activity_pchembl_for_molecule,
    bootstrap_spearman_ci,
    chembl_id_for_target,
    median_pchembl,
)
from lib.rmsd import rmsd_pose_pdbqt_vs_ref
from lib.session import DockingSession, load_config

MANIFEST = ROOT / "manifests" / "approved_25_drugs.json"
OUT = ROOT / "results" / "approved_25.json"


def main() -> None:
    cfg = load_config()
    drugs = json.loads(MANIFEST.read_text())["drugs"]
    work = ROOT / "cache" / "runs"
    rows = []
    scores_for_corr = []
    pchembl_for_corr = []

    for drug in drugs:
        tgt = {
            "target_id": drug["drug_id"],
            "pdb_id": drug["pdb_id"],
            "ligand_resn": drug["ligand_resn"],
            "ligand_chain": drug.get("ligand_chain", "A"),
            "reference_smiles": drug["smiles"],
        }
        row = {
            "drug_id": drug["drug_id"],
            "name": drug["name"],
            "gene": drug["gene"],
            "class": drug["class"],
            "pdb_id": drug["pdb_id"],
            "redock_rmsd_angstrom": None,
            "vina_score_kcal_mol": None,
            "pchembl_median": None,
            "pass_redock_2A": False,
            "failure": None,
        }
        try:
            sess = DockingSession(tgt, work)
            ref = sess.reference_mol()
            seed = int(cfg["redock_seeds"][0])
            pose, score, err = sess.dock_mol(ref, seed=seed, work_subdir="drug_redock")
            if err or not pose:
                row["failure"] = err or "no_pose"
            else:
                rmsd = rmsd_pose_pdbqt_vs_ref(ref, pose)["primary_rmsd_angstrom"]
                row["redock_rmsd_angstrom"] = rmsd
                row["vina_score_kcal_mol"] = score
                row["pass_redock_2A"] = rmsd is not None and rmsd <= 2.0
        except Exception as exc:
            row["failure"] = str(exc)

        target_id = chembl_id_for_target(drug["gene"])
        mol_id = drug.get("chembl_molecule_id")
        if target_id and mol_id:
            vals = activity_pchembl_for_molecule(mol_id, target_id)
            row["pchembl_median"] = median_pchembl(vals)
            if row["vina_score_kcal_mol"] is not None and row["pchembl_median"] is not None:
                scores_for_corr.append(-float(row["vina_score_kcal_mol"]))
                pchembl_for_corr.append(float(row["pchembl_median"]))

        rows.append(row)
        print(
            f"[drug] {drug['drug_id']}: rmsd={row['redock_rmsd_angstrom']} score={row['vina_score_kcal_mol']}",
            flush=True,
        )

    spearman = bootstrap_spearman_ci(
        scores_for_corr,
        pchembl_for_corr,
        n_boot=int(cfg["bootstrap_n"]),
        seed=int(cfg["bootstrap_seed"]),
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_drugs": len(rows),
        "n_redock_pass_2A": sum(1 for r in rows if r["pass_redock_2A"]),
        "spearman_vina_vs_pchembl": spearman,
        "note": "Vina score sign inverted (-score) so more negative Vina affinity ranks higher.",
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
