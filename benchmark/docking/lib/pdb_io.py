"""PDB fetch and ligand extraction."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parents[1] / "cache" / "pdb"


def fetch_pdb(pdb_id: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{pdb_id.upper()}.pdb"
    if not path.exists():
        url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
        with urllib.request.urlopen(url, timeout=120) as resp:
            path.write_text(resp.read().decode())
    return path.read_text()


def fetch_rcsb_smiles(resn: str) -> str | None:
    url = f"https://data.rcsb.org/rest/v1/core/chemcomp/{resn.upper()}"
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        desc = data.get("rcsb_chem_comp_descriptor") or {}
        return desc.get("SMILES_stereo") or desc.get("SMILES")
    except Exception:
        return None


def ligand_pdb_lines(pdb_text: str, resn: str, chain: str = "A") -> list[str]:
    lines = []
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        rn = line[17:20].strip()
        ch = line[21:22].strip() or "A"
        alt = line[16:17].strip()
        if rn != resn or ch != chain:
            continue
        if alt and alt not in ("A", "1", ""):
            continue
        lines.append(line)
    if lines:
        return lines
    by_chain: dict[str, list[str]] = {}
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        rn = line[17:20].strip()
        if rn != resn:
            continue
        alt = line[16:17].strip()
        if alt and alt not in ("A", "1", ""):
            continue
        ch = line[21:22].strip() or "A"
        by_chain.setdefault(ch, []).append(line)
    if not by_chain:
        return []
    return max(by_chain.values(), key=len)


def strip_waters_and_ligand(
    pdb_text: str,
    ligand_resn: str,
    ligand_chain: str,
    protein_chains: list[str] | None = None,
    keep_het: list[str] | None = None,
) -> str:
    """Keep protein ATOM records (selected chains) and optional cofactors; drop waters and docked ligand."""
    keep_het_set = {h.upper() for h in (keep_het or [])}
    ligand_resn = ligand_resn.upper()
    chains = set(protein_chains) if protein_chains else None
    out: list[str] = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM  "):
            ch = line[21:22].strip() or "A"
            if chains is not None and ch not in chains:
                continue
            alt = line[16:17].strip()
            if alt and alt not in ("A", "1", ""):
                continue
            out.append(line)
        elif line.startswith("HETATM"):
            rn = line[17:20].strip().upper()
            ch = line[21:22].strip() or "A"
            if rn in ("HOH", "WAT", "DOD"):
                continue
            if rn == ligand_resn and ch == ligand_chain:
                continue
            if rn in keep_het_set:
                if chains is None or ch in chains:
                    out.append(line)
    out.append("END")
    return "\n".join(out)
