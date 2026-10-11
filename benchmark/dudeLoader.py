"""Download DUD-E actives/decoys (mol2.gz) and extract canonical SMILES + pairing."""
from __future__ import annotations

import gzip
import re
import urllib.request
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "benchmark" / "dude_cache"

# DUD-E directory names (https://dude.docking.org)
DUDE_NAMES = {
    "egfr": "egfr",
    "abl1": "abl1",
    "erbb2": "erbb2",
    "braf": "braf",
    "ptgs2": "pgh2",
    "hmgcr": "hmgcr",
    "pde5a": "pde5a",
    "esr1": "esr1",
    "dpp4": "dpp4",
    "adrb2": "adrb2",
    "hiv_pr": "hivpr",
    "hdac1": "hdac1",
    "jak2": "jak2",
    "thrombin": "thrb",
}


def _fetch(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 100:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=120) as resp:
            dest.write_bytes(resp.read())
        return True
    except Exception:
        return False


def _mol2_blocks(text: str) -> list[tuple[str, str]]:
    """Return (molecule_name, full_block) for each @<TRIPOS>MOLECULE."""
    parts = re.split(r"(?m)^@<TRIPOS>MOLECULE\n", text)
    out: list[tuple[str, str]] = []
    for p in parts[1:]:
        name = p.split("\n", 1)[0].strip()
        out.append((name, "@<TRIPOS>MOLECULE\n" + p))
    return out


def mol2_block_to_record(block: str, mol_id: str, dude_idx: int) -> dict | None:
    """Parse mol2 with RDKit; MW/logP from the same mol object (charged ZINC states preserved)."""
    mol = Chem.MolFromMol2Block(block, sanitize=True, removeHs=True)
    if mol is None:
        return None
    try:
        smiles = Chem.MolToSmiles(mol)
    except Exception:
        return None
    return {
        "dude_idx": dude_idx,
        "mol_id": mol_id,
        "smiles": smiles,
        "molecularWeight": float(Descriptors.MolWt(mol)),
        "xlogp": float(Crippen.MolLogP(mol)),
    }


def decoy_block_sizes(n_actives: int, n_decoys: int) -> list[int]:
    """DUD-E decoys_final.mol2.gz lists decoys in active order (variable blocks)."""
    if n_actives <= 0:
        return []
    base, rem = divmod(n_decoys, n_actives)
    return [base + 1 if i < rem else base for i in range(n_actives)]


def decoy_index_range(active_idx: int, sizes: list[int]) -> tuple[int, int]:
    start = sum(sizes[:active_idx])
    return start, start + sizes[active_idx]


def load_dude_set(target_key: str) -> dict | None:
    dude = DUDE_NAMES.get(target_key)
    if not dude:
        return None
    base = f"https://dude.docking.org/targets/{dude}"
    act_gz = CACHE / f"{dude}_actives_final.mol2.gz"
    dec_gz = CACHE / f"{dude}_decoys_final.mol2.gz"
    ok_a = _fetch(f"{base}/actives_final.mol2.gz", act_gz)
    ok_d = _fetch(f"{base}/decoys_final.mol2.gz", dec_gz)
    if not (ok_a and ok_d):
        return {"available": False, "dude_name": dude, "reason": "download_failed"}

    act_text = gzip.decompress(act_gz.read_bytes()).decode(errors="ignore")
    dec_text = gzip.decompress(dec_gz.read_bytes()).decode(errors="ignore")
    act_blocks = _mol2_blocks(act_text)
    dec_blocks = _mol2_blocks(dec_text)

    actives: list[dict] = []
    for i, (name, block) in enumerate(act_blocks):
        rec = mol2_block_to_record(block, name, i)
        if rec:
            rec["source_file"] = "actives_final.mol2.gz"
            actives.append(rec)

    decoys: list[dict] = []
    for j, (name, block) in enumerate(dec_blocks):
        rec = mol2_block_to_record(block, name, j)
        if rec:
            rec["source_file"] = "decoys_final.mol2.gz"
            decoys.append(rec)

    sizes = decoy_block_sizes(len(act_blocks), len(dec_blocks))
    if sizes and sum(sizes) != len(dec_blocks):
        return {
            "available": False,
            "dude_name": dude,
            "reason": "decoy_block_size_mismatch",
        }

    # Map each decoy to its source active index (order in DUD-E archives).
    decoy_active_idx: list[int] = []
    for ai, sz in enumerate(sizes):
        decoy_active_idx.extend([ai] * sz)
    for j, pai in enumerate(decoy_active_idx):
        if j < len(decoys):
            decoys[j]["paired_active_idx"] = pai

    return {
        "available": len(actives) > 0 and len(decoys) > 0,
        "dude_name": dude,
        "source": "DUD-E",
        "active_source": "actives_final.mol2.gz (DUD-E actives, not ChEMBL API)",
        "decoy_source": "decoys_final.mol2.gz",
        "property_note": "MW/logP from RDKit MolFromMol2Block (same path for actives and decoys; ZINC charged states).",
        "actives": actives,
        "decoys": decoys,
        "decoys_per_active_sizes": sizes,
        "n_actives_mol2": len(act_blocks),
        "n_decoys_mol2": len(dec_blocks),
    }


def legacy_smiles_lists(data: dict) -> tuple[list[str], list[str]]:
    """Backward-compatible flat SMILES lists."""
    return [a["smiles"] for a in data.get("actives", [])], [d["smiles"] for d in data.get("decoys", [])]
