import re
from typing import Optional

from .config import load_engine_config

_PDB_RE = re.compile(r"^[A-Z0-9]{4}$")


def normalize_pdb_id(raw: str) -> str:
    return str(raw or "").strip().upper()


def validate_pdb_id(pdb_id: str) -> Optional[str]:
    clean = normalize_pdb_id(pdb_id)
    if not _PDB_RE.match(clean):
        return "PDB ID must be exactly four alphanumeric characters."
    allowed = set(load_engine_config().get("allowedPdbIds") or [])
    if allowed and clean not in allowed:
        return f"PDB ID {clean} is not in the allowed validation set."
    return None


def validate_smiles(smiles: str) -> Optional[str]:
    clean = str(smiles or "").strip()
    if not clean:
        return "SMILES is required."
    max_len = int(load_engine_config().get("limits", {}).get("maxSmilesLength", 2000))
    if len(clean) > max_len:
        return f"SMILES exceeds maximum length of {max_len} characters."
    return None
