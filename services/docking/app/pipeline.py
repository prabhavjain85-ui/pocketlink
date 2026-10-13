"""AutoDock Vina docking pipeline (RDKit + Meeko + Open Babel)."""

from __future__ import annotations

import re
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Optional
from urllib.request import urlopen

from .config import load_engine_config

ProgressFn = Callable[[float, str], None]

SKIP_VINA = __import__("os").environ.get("DOCKING_SKIP_VINA") == "1"

WATER_AND_IONS = {
    "HOH",
    "WAT",
    "SO4",
    "PO4",
    "NA",
    "CL",
    "MG",
    "CA",
    "ZN",
    "EDO",
    "DMS",
    "GOL",
}


def _engine() -> dict[str, Any]:
    return load_engine_config().get("engine", {})


def _box_defaults() -> dict[str, Any]:
    return load_engine_config().get("box", {})


def fetch_pdb_text(pdb_id: str) -> str:
    url = f"https://files.rcsb.org/download/{pdb_id}.pdb"
    with urlopen(url, timeout=60) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    if len(text) < 100:
        raise RuntimeError(f"Empty PDB response for {pdb_id}")
    return text


def _parse_ligand_atoms(pdb_text: str) -> tuple[list[dict[str, float]], Optional[str]]:
    atoms: list[dict[str, float]] = []
    resname: Optional[str] = None
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        name = line[17:20].strip()
        if name in WATER_AND_IONS:
            continue
        if resname is None:
            resname = name
        if name != resname:
            continue
        try:
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
        except ValueError:
            continue
        atoms.append({"x": x, "y": y, "z": z})
    return atoms, resname


def _box_from_ligand(ligand_atoms: list[dict[str, float]]) -> dict[str, float]:
    if not ligand_atoms:
        raise RuntimeError("No co-crystal ligand found for binding box.")
    xs = [a["x"] for a in ligand_atoms]
    ys = [a["y"] for a in ligand_atoms]
    zs = [a["z"] for a in ligand_atoms]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    min_z, max_z = min(zs), max(zs)
    size = _box_defaults().get("defaultSizeAngstrom", 20.0)
    return {
        "center_x": (min_x + max_x) / 2.0,
        "center_y": (min_y + max_y) / 2.0,
        "center_z": (min_z + max_z) / 2.0,
        "size_x": size,
        "size_y": size,
        "size_z": size,
    }


def _write_receptor_pdb(pdb_text: str, path: Path) -> None:
    keep: list[str] = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM  "):
            keep.append(line)
        elif line.startswith("TER"):
            keep.append(line)
    path.write_text("\n".join(keep) + "\n", encoding="utf-8")


def _protonate_receptor_pdb(receptor_pdb: Path, ph: float) -> Path:
    """Protonate receptor at target pH using reduce (Richardson lab)."""
    out = receptor_pdb.with_suffix(".h.pdb")
    cmd = ["reduce", "-Quiet", "-FLIP", f"-DB{ph:.1f}", str(receptor_pdb)]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not proc.stdout.strip():
        # Fall back to unprepared receptor if reduce is unavailable.
        return receptor_pdb
    out.write_text(proc.stdout, encoding="utf-8")
    return out


def _prepare_receptor_pdbqt(receptor_pdb: Path) -> Path:
    pdbqt_path = receptor_pdb.with_suffix(".pdbqt")
    cmd = ["obabel", str(receptor_pdb), "-O", str(pdbqt_path), "-xr"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not pdbqt_path.is_file():
        raise RuntimeError(f"Open Babel receptor prep failed: {proc.stderr or proc.stdout}")
    return pdbqt_path


def _prepare_ligand_pdbqt(smiles: str, work_dir: Path) -> Path:
    from meeko import MoleculePreparation, PDBQTWriterLegacy
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("RDKit could not parse SMILES.")
    mol = Chem.AddHs(mol)
    AllChem.EmbedMolecule(mol, AllChem.ETKDGv3())
    AllChem.MMFFOptimizeMolecule(mol)

    preparer = MoleculePreparation()
    prep = preparer.prepare(mol)
    writer = PDBQTWriterLegacy()
    pdbqt = writer.write_string(prep)
    out = work_dir / "ligand.pdbqt"
    out.write_text(pdbqt, encoding="utf-8")
    return out


def _run_vina(
    receptor_pdbqt: Path,
    ligand_pdbqt: Path,
    box: dict[str, float],
    out_pdbqt: Path,
    log_path: Path,
) -> list[dict[str, Any]]:
    eng = _engine()
    cmd = [
        eng.get("vinaBinary", "vina"),
        "--receptor",
        str(receptor_pdbqt),
        "--ligand",
        str(ligand_pdbqt),
        "--center_x",
        str(box["center_x"]),
        "--center_y",
        str(box["center_y"]),
        "--center_z",
        str(box["center_z"]),
        "--size_x",
        str(box["size_x"]),
        "--size_y",
        str(box["size_y"]),
        "--size_z",
        str(box["size_z"]),
        "--exhaustiveness",
        str(eng.get("exhaustiveness", 8)),
        "--num_modes",
        str(eng.get("numModes", 9)),
        "--energy_range",
        str(eng.get("energyRange", 3.0)),
        "--seed",
        str(eng.get("seed", 42)),
        "--out",
        str(out_pdbqt),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    log_path.write_text((proc.stdout or "") + "\n" + (proc.stderr or ""), encoding="utf-8")
    if proc.returncode != 0:
        raise RuntimeError(f"Vina failed: {proc.stderr or proc.stdout}")

    scores: list[dict[str, Any]] = []
    for line in (proc.stdout or "").splitlines():
        m = re.match(r"\s*(\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)", line)
        if m:
            scores.append(
                {
                    "mode": int(m.group(1)),
                    "affinityKcalMol": float(m.group(2)),
                    "rmsdLb": float(m.group(3)),
                    "rmsdUb": float(m.group(4)),
                }
            )
    if not scores and out_pdbqt.is_file():
        scores.append({"mode": 1, "affinityKcalMol": 0.0, "rmsdLb": 0.0, "rmsdUb": 0.0})
    return scores


def _parse_pdbqt_poses(pdbqt_text: str) -> list[list[dict[str, Any]]]:
    poses: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    for line in pdbqt_text.splitlines():
        if line.startswith("MODEL"):
            current = []
        elif line.startswith("ENDMDL"):
            if current:
                poses.append(current)
            current = []
        elif line.startswith("ATOM") or line.startswith("HETATM"):
            try:
                x = float(line[30:38])
                y = float(line[38:46])
                z = float(line[46:54])
                element = line[77:79].strip() or line[12:16].strip()[0]
            except (ValueError, IndexError):
                continue
            current.append({"x": x, "y": y, "z": z, "element": element})
    if current:
        poses.append(current)
    return poses


def _extract_pocket_atoms(pdb_text: str, center: dict[str, float], radius: float = 12.0) -> list[dict[str, Any]]:
    pocket: list[dict[str, Any]] = []
    cx, cy, cz = center["center_x"], center["center_y"], center["center_z"]
    for line in pdb_text.splitlines():
        if not line.startswith("ATOM  "):
            continue
        try:
            atom_name = line[12:16].strip()
            res_name = line[17:20].strip()
            res_seq = int(line[22:26])
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            element = (line[76:78].strip() or atom_name[0]).upper()
        except (ValueError, IndexError):
            continue
        dist = ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) ** 0.5
        if dist <= radius:
            pocket.append(
                {
                    "atomName": atom_name,
                    "resName": res_name,
                    "resSeq": res_seq,
                    "x": x,
                    "y": y,
                    "z": z,
                    "element": element,
                    "isBackbone": atom_name in {"N", "CA", "C", "O"},
                }
            )
    return pocket


def _mock_pipeline(pdb_id: str, smiles: str) -> dict[str, Any]:
    """Deterministic stub for CI without Vina binaries."""
    return {
        "engineConfigVersion": load_engine_config().get("schemaVersion"),
        "pdbId": pdb_id,
        "smiles": smiles,
        "box": {"center_x": 0, "center_y": 0, "center_z": 0, "size_x": 20, "size_y": 20, "size_z": 20},
        "poses": [
            {
                "rank": 1,
                "scoreKcalMol": -8.2,
                "rmsdLb": 0.0,
                "rmsdUb": 0.0,
                "atoms": [{"x": 0.1, "y": 0.2, "z": 0.3, "element": "C"}],
            }
        ],
        "pocketAtoms": [],
        "disclaimer": "Computational binding scores are estimates only.",
    }


def run_docking_pipeline(
    pdb_id: str,
    smiles: str,
    work_dir: Path,
    on_progress: Optional[ProgressFn] = None,
    deadline: Optional[float] = None,
) -> dict[str, Any]:
    if SKIP_VINA:
        if on_progress:
            on_progress(100.0, "Skipped Vina (DOCKING_SKIP_VINA)")
        return _mock_pipeline(pdb_id, smiles)

    def tick(pct: float, msg: str) -> None:
        if deadline and time.time() > deadline:
            raise TimeoutError("Docking job exceeded time limit.")
        if on_progress:
            on_progress(pct, msg)

    tick(5.0, "Downloading PDB")
    pdb_text = fetch_pdb_text(pdb_id)

    tick(15.0, "Deriving search box from co-crystal ligand")
    lig_atoms, lig_name = _parse_ligand_atoms(pdb_text)
    box = _box_from_ligand(lig_atoms)

    tick(25.0, "Preparing receptor at pH 7.4")
    receptor_raw = work_dir / "receptor.pdb"
    _write_receptor_pdb(pdb_text, receptor_raw)
    ph = float(load_engine_config().get("chemistry", {}).get("receptorPh", 7.4))
    receptor_h = _protonate_receptor_pdb(receptor_raw, ph)

    tick(40.0, "Building receptor PDBQT")
    receptor_pdbqt = _prepare_receptor_pdbqt(receptor_h)

    tick(55.0, "Preparing ligand with Meeko")
    ligand_pdbqt = _prepare_ligand_pdbqt(smiles, work_dir)

    tick(70.0, "Running AutoDock Vina")
    out_pdbqt = work_dir / "poses.pdbqt"
    log_path = work_dir / "vina.log"
    scores = _run_vina(receptor_pdbqt, ligand_pdbqt, box, out_pdbqt, log_path)

    tick(90.0, "Parsing poses")
    pose_models = _parse_pdbqt_poses(out_pdbqt.read_text(encoding="utf-8"))
    poses = []
    for idx, atoms in enumerate(pose_models):
        score_row = scores[idx] if idx < len(scores) else scores[0] if scores else {}
        poses.append(
            {
                "rank": idx + 1,
                "scoreKcalMol": score_row.get("affinityKcalMol", 0.0),
                "rmsdLb": score_row.get("rmsdLb", 0.0),
                "rmsdUb": score_row.get("rmsdUb", 0.0),
                "atoms": atoms,
            }
        )

    pocket_atoms = _extract_pocket_atoms(
        pdb_text,
        box,
        radius=float(box.get("size_x", 20)) / 2.0 + 2.0,
    )

    tick(100.0, "Done")
    return {
        "engineConfigVersion": load_engine_config().get("schemaVersion"),
        "pdbId": pdb_id,
        "smiles": smiles,
        "cocrystalLigand": lig_name,
        "box": box,
        "poses": poses,
        "pocketAtoms": pocket_atoms,
        "vinaLog": log_path.read_text(encoding="utf-8")[:4000],
        "disclaimer": "Computational binding scores are estimates only; not experimental affinities.",
    }
