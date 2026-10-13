"""AutoDock Vina 1.2.x via CLI (pinned system binary)."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from rdkit import Chem

from .ligand_prep import write_ligand_pdbqt


def parse_vina_score(pose_pdbqt: str) -> float | None:
    for line in pose_pdbqt.splitlines():
        if line.startswith("REMARK VINA RESULT:"):
            parts = line.split()
            if len(parts) >= 4:
                return float(parts[3])
    return None


def run_vina(
    receptor_pdbqt: Path,
    ligand_mol: Chem.Mol,
    center: list[float],
    box_size: float,
    work_dir: Path,
    exhaustiveness: int = 16,
    seed: int = 42,
    n_poses: int = 1,
    vina_binary: str = "vina",
) -> tuple[str | None, float | None, str | None]:
    work_dir.mkdir(parents=True, exist_ok=True)
    lig_pdbqt = work_dir / "lig.pdbqt"
    out_pdbqt = work_dir / "out.pdbqt"
    conf = work_dir / "vina.conf"

    try:
        write_ligand_pdbqt(ligand_mol, lig_pdbqt)
    except Exception as exc:
        return None, None, f"ligand_prep:{exc}"

    conf.write_text(
        "\n".join(
            [
                f"receptor = {receptor_pdbqt}",
                f"ligand = {lig_pdbqt}",
                f"center_x = {center[0]:.4f}",
                f"center_y = {center[1]:.4f}",
                f"center_z = {center[2]:.4f}",
                f"size_x = {box_size:.2f}",
                f"size_y = {box_size:.2f}",
                f"size_z = {box_size:.2f}",
                f"exhaustiveness = {int(exhaustiveness)}",
                f"seed = {int(seed)}",
                f"num_modes = {int(n_poses)}",
            ]
        )
        + "\n"
    )

    cmd = [vina_binary, "--config", str(conf), "--out", str(out_pdbqt)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        return None, None, "vina_timeout"
    if proc.returncode != 0 or not out_pdbqt.exists():
        err = (proc.stderr or proc.stdout or "")[-800:]
        return None, None, f"vina_failed:{err}"

    pose_text = out_pdbqt.read_text()
    score = parse_vina_score(pose_text)
    return pose_text, score, None
