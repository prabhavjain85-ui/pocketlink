#!/usr/bin/env python3
"""Refresh benchmark/docking_targets.json reference_smiles from RCSB chemcomp API."""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "benchmark" / "docking_targets.json"

META = [
    ("egfr", "1M17", "AQ4"),
    ("abl1", "1IEP", "STI"),
    ("erbb2", "3PP0", "03Q"),
    ("braf", "4XV2", "P06"),
    ("ptgs2", "4COX", "S58"),
    ("hmgcr", "1HWK", "SIM"),
    ("pde5a", "1UDT", "VIA"),
    ("esr1", "3ERT", "EST"),
    ("dpp4", "1X70", "1X7"),
    ("adrb2", "3SN6", "P0G"),
    ("hiv_pr", "1HVR", "MK1"),
    ("sars_mpro", "7BQY", "N3"),
    ("hdac1", "4BKX", "TSA"),
    ("jak2", "4JI9", "STU"),
    ("thrombin", "1DWB", "MQT"),
]


def fetch_smiles(resn: str) -> str:
    url = f"https://data.rcsb.org/rest/v1/core/chemcomp/{resn}"
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    desc = data.get("rcsb_chem_comp_descriptor") or {}
    return desc.get("SMILES") or desc.get("SMILES_stereo") or ""


def main():
    existing = json.loads(CFG.read_text())
    by_id = {t["target_id"]: t for t in existing.get("targets", [])}
    targets = []
    for tid, pdb, resn in META:
        row = by_id.get(tid, {})
        try:
            smi = fetch_smiles(resn)
        except Exception:
            smi = ""
        targets.append(
            {
                "target_id": tid,
                "pdb_id": pdb,
                "ligand_resn": resn,
                "reference_smiles": smi or row.get("reference_smiles", ""),
                "ligand_name": row.get("ligand_name", resn),
            }
        )
    CFG.write_text(json.dumps({"description": existing.get("description", ""), "targets": targets}, indent=2))
    print(f"Updated {CFG} ({len(targets)} targets)")


if __name__ == "__main__":
    main()
