"""Download DUD-E actives/decoys (mol2.gz) and extract canonical SMILES."""
from __future__ import annotations

import gzip
import re
import urllib.request
from pathlib import Path

from rdkit import Chem

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "benchmark" / "dude_cache"

# DUD-E directory names (https://dude.docking.org)
DUDE_NAMES = {
    "egfr": "egfr",
    "abl1": "abl1",
    "erbb2": "erbb2",
    "braf": "braf",
    "ptgs2": "cox2",
    "hmgcr": "hmgcr",
    "pde5a": "pde5a",
    "esr1": "er_alpha",
    "dpp4": "dpp4",
    "adrb2": "adrb2",
    "hiv_pr": "hivpr",
    "hdac1": "hdac1",
    "jak2": "jak2",
    "thrombin": "thrombin",
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


def _mol2_blocks(text: str) -> list[str]:
    parts = re.split(r"(?m)^@<TRIPOS>MOLECULE\n", text)
    blocks = []
    for p in parts[1:]:
        blocks.append("@<TRIPOS>MOLECULE\n" + p)
    return blocks


def mol2_to_smiles(block: str) -> str | None:
    mol = Chem.MolFromMol2Block(block, sanitize=True, removeHs=True)
    if mol is None:
        return None
    return Chem.MolToSmiles(mol)


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
    actives = []
    for b in _mol2_blocks(act_text):
        smi = mol2_to_smiles(b)
        if smi:
            actives.append(smi)
    decoys = []
    for b in _mol2_blocks(dec_text):
        smi = mol2_to_smiles(b)
        if smi:
            decoys.append(smi)
    return {
        "available": len(actives) > 0 and len(decoys) > 0,
        "dude_name": dude,
        "source": "DUD-E",
        "actives": actives,
        "decoys": decoys,
    }
