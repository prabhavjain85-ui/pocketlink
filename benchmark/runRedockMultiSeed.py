#!/usr/bin/env python3
"""
Multi-seed co-crystal redocking (Vina exhaustiveness=16, seeds 42..51).
Pass: top pose spyrmsd (no alignment) < 2 Å in >= 8/10 seeds.
Updates benchmark/redock_multiseed_results.json and vina_validated_targets.json.
"""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

_BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(_BENCH))

from runRedockValidation import (  # noqa: E402
    CFG,
    RMSD_METHOD_DOC,
    box_from_mol,
    fetch_pdb,
    ligand_center,
    ligand_pdb_lines,
    mol_from_ligand_pdb,
    pose_mol_from_pdbqt,
    reference_mol_from_crystal,
    strip_ligand_receptor,
)
from rmsd_inplace import spyrmsd_in_place  # noqa: E402

OUT = _BENCH / "redock_multiseed_results.json"
VINA_JSON = _BENCH / "vina_validated_targets.json"
EXHAUSTIVENESS = 16
SEEDS = list(range(42, 52))
PASS_THRESHOLD = 2.0
PASS_MIN_SEEDS = 8


def prepare_and_vina_seed(
    receptor_pdb: str,
    ref_mol,
    dock_mol,
    center: list[float],
    box_size: float,
    work: Path,
    seed: int,
) -> tuple[str | None, str | None]:
    try:
        from meeko import MoleculePreparation, PDBQTWriterLegacy, Polymer
        from vina import Vina
    except ImportError as exc:
        return None, f"import_error:{exc}"

    from rdkit import Chem

    rec_pdbqt = work / "rec.pdbqt"
    lig_pdbqt = work / "lig.pdbqt"
    out_pdbqt = work / "out.pdbqt"

    prep = MoleculePreparation()
    try:
        polymer = Polymer.from_pdb_string(receptor_pdb, default_altloc="A", allow_bad_res=True)
        polymer_pdbqt, _ = PDBQTWriterLegacy.write_from_polymer(polymer)
        rec_pdbqt.write_text(polymer_pdbqt)
    except Exception as exc:
        return None, f"receptor_prep:{exc}"

    lig_h = Chem.AddHs(dock_mol, addCoords=True)
    prep_out = prep.prepare(lig_h)
    prep_mol = prep_out[0] if isinstance(prep_out, list) else prep_out
    lig_written = PDBQTWriterLegacy.write_string(prep_mol)
    lig_str = lig_written[0] if isinstance(lig_written, tuple) else lig_written
    lig_pdbqt.write_text(lig_str)

    v = Vina(sf_name="vina", verbosity=0)
    v.set_receptor(str(rec_pdbqt))
    v.set_ligand_from_file(str(lig_pdbqt))
    v.compute_vina_maps(center=center, box_size=[box_size, box_size, box_size])
    if hasattr(v, "_seed"):
        v._seed = int(seed)
    v.dock(exhaustiveness=EXHAUSTIVENESS, n_poses=1)
    v.write_poses(str(out_pdbqt), n_poses=1, overwrite=True)
    return out_pdbqt.read_text(), None


def spyrmsd_pose(ref_mol, pose_text: str) -> float | None:
    from runRedockValidation import pose_mol_from_pdbqt

    pose_mol = pose_mol_from_pdbqt(pose_text)
    if pose_mol is None:
        return None
    return spyrmsd_in_place(ref_mol, pose_mol)


def main():
    config = json.loads(CFG.read_text())
    rows = []
    validated = []
    for tgt in config["targets"]:
        tid = tgt["target_id"]
        pdb_id = tgt["pdb_id"]
        resn = tgt["ligand_resn"]
        smiles = tgt["reference_smiles"]
        keep_het = tgt.get("keep_het_resnames", [])
        chain = tgt.get("ligand_chain", "A")

        pdb_text = fetch_pdb(pdb_id)
        lig_lines = ligand_pdb_lines(pdb_text, resn, chain)
        crystal_mol = mol_from_ligand_pdb(lig_lines)
        ref_mol = reference_mol_from_crystal(crystal_mol, resn, smiles)

        row = {
            "target_id": tid,
            "pdb_id": pdb_id.upper(),
            "ligand_resn": resn,
            "ligand_chain": chain,
            "seeds": SEEDS,
            "exhaustiveness": EXHAUSTIVENESS,
            "per_seed_spyrmsd": {},
            "pass_count": 0,
            "pass_multiseed": False,
            "failure_reason": None,
        }

        if ref_mol is None:
            row["failure_reason"] = "no_crystal_ligand"
            rows.append(row)
            continue

        center = ligand_center(ref_mol)
        box = box_from_mol(ref_mol)
        vina_keep_het = [h for h in keep_het if h.upper() not in ("HEM", "HEC")]
        receptor = strip_ligand_receptor(pdb_text, resn, chain, vina_keep_het)

        passes = 0
        for seed in SEEDS:
            with tempfile.TemporaryDirectory() as td:
                work = Path(td)
                pose, err = prepare_and_vina_seed(
                    receptor, ref_mol, ref_mol, center, box, work, seed
                )
                if err or not pose:
                    row["per_seed_spyrmsd"][str(seed)] = None
                    continue
                rmsd = spyrmsd_pose(ref_mol, pose)
                row["per_seed_spyrmsd"][str(seed)] = rmsd
                if rmsd is not None and rmsd < PASS_THRESHOLD:
                    passes += 1
        row["pass_count"] = passes
        row["pass_multiseed"] = passes >= PASS_MIN_SEEDS
        if row["pass_multiseed"]:
            validated.append(
                {
                    "target_id": tid,
                    "display_name": tgt.get("name", tid.upper()),
                    "pdb_id": pdb_id.upper(),
                    "ligand_resn": resn,
                    "ligand_chain": chain,
                    **({"keep_het_resnames": keep_het} if keep_het else {}),
                }
            )
        rows.append(row)
        print(
            f"[multiseed] {tid} pass={passes}/{len(SEEDS)} "
            f"{'OK' if row['pass_multiseed'] else 'FAIL'}",
            flush=True,
        )

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rmsd_method": RMSD_METHOD_DOC,
        "gate": {
            "metric": "spyrmsd_symmrmsd_minimize_false",
            "threshold_angstrom": PASS_THRESHOLD,
            "min_passing_seeds": PASS_MIN_SEEDS,
            "n_seeds": len(SEEDS),
            "exhaustiveness": EXHAUSTIVENESS,
        },
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2))

    vina_payload = {
        "description": "Server-side Vina allowlist from multi-seed redock gate.",
        "validation_run_note": (
            f"exhaustiveness={EXHAUSTIVENESS}, seeds {SEEDS[0]}–{SEEDS[-1]}, "
            f"pass if >={PASS_MIN_SEEDS}/{len(SEEDS)} seeds spyrmsd < {PASS_THRESHOLD} Å."
        ),
        "rmsd_gate_angstrom": PASS_THRESHOLD,
        "rmsd_metric": "spyrmsd no-alignment (symmrmsd minimize=False)",
        "validated": validated,
        "not_validated_message": (
            "Docking not validated for this target. Server-side Vina is only enabled "
            "where multi-seed co-crystal redocking passes the spyrmsd gate."
        ),
    }
    VINA_JSON.write_text(json.dumps(vina_payload, indent=2))
    print(f"Wrote {OUT} and {VINA_JSON} ({len(validated)} validated)")


if __name__ == "__main__":
    main()
