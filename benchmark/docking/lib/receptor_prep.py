"""Receptor: strip waters/ligands, protonate at pH 7.4 (PDB2PQR), Meeko polymer → PDBQT."""
from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path


def _element_from_atom_name(atom_name: str) -> str:
    name = atom_name.strip()
    if not name:
        return "C"
    if len(name) >= 2 and name[0].isalpha() and name[1].isalpha() and name[1].islower():
        return name[:2].title()
    return name[0].upper()


def fix_pdb_element_columns(pdb_text: str) -> str:
    """Ensure columns 77-78 contain element symbols (PDB2PQR omits them)."""
    out = []
    for line in pdb_text.splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            if len(line) < 78:
                line = line.ljust(78)
            elem = line[76:78].strip()
            if not elem or not re.match(r"^[A-Za-z]{1,2}$", elem):
                atom_name = line[12:16]
                elem = _element_from_atom_name(atom_name)
                line = line[:76] + f"{elem:>2}" + line[78:]
        out.append(line)
    return "\n".join(out) + "\n"


def protonate_pdb2pqr(pdb_text: str, ph: float = 7.4) -> str:
    """Return PDB with hydrogens at requested pH via PDB2PQR + PROPKA."""
    with tempfile.TemporaryDirectory() as td:
        inp = Path(td) / "in.pdb"
        out_pdb = Path(td) / "out.pdb"
        inp.write_text(pdb_text)
        cmd = [
            "pdb2pqr",
            "--ff",
            "AMBER",
            "--with-ph",
            str(ph),
            "--drop-water",
            str(inp),
            str(out_pdb),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if proc.returncode != 0 or not out_pdb.exists():
            raise RuntimeError(f"pdb2pqr failed: {proc.stderr[-500:]}")
        return fix_pdb_element_columns(out_pdb.read_text())


def receptor_pdbqt_from_pdb(protonated_pdb: str, out_path: Path) -> None:
    from meeko import PDBQTWriterLegacy, Polymer

    polymer = Polymer.from_pdb_string(
        protonated_pdb,
        default_altloc="A",
        allow_bad_res=True,
    )
    polymer_pdbqt, _ = PDBQTWriterLegacy.write_from_polymer(polymer)
    out_path.write_text(polymer_pdbqt)


def prepare_receptor_pdbqt(
    stripped_pdb: str,
    work_dir: Path,
    ph: float = 7.4,
    cache_key: str | None = None,
) -> Path:
    cache_dir = work_dir / "receptor_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    if cache_key:
        cached = cache_dir / f"{cache_key}.pdbqt"
        if cached.exists():
            return cached

    protonated = protonate_pdb2pqr(stripped_pdb, ph=ph)
    rec_pdbqt = work_dir / "receptor.pdbqt"
    receptor_pdbqt_from_pdb(protonated, rec_pdbqt)
    if cache_key:
        cached.write_text(rec_pdbqt.read_text())
        return cached
    return rec_pdbqt
