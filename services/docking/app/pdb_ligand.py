"""Co-crystal ligand instance selection from PDB text (author chain + resSeq)."""

from __future__ import annotations

import math
from typing import Any, Optional

CRYSTALLOGRAPHY_ADDITIVES = {
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


def _dist(a: dict[str, float], b: dict[str, float]) -> float:
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)


def _centroid(atoms: list[dict[str, Any]]) -> dict[str, float]:
    if not atoms:
        return {"x": 0.0, "y": 0.0, "z": 0.0}
    sx = sum(a["x"] for a in atoms)
    sy = sum(a["y"] for a in atoms)
    sz = sum(a["z"] for a in atoms)
    n = len(atoms)
    return {"x": sx / n, "y": sy / n, "z": sz / n}


def group_hetatm_ligand_instances(pdb_text: str, ligand_code: str) -> list[dict[str, Any]]:
    code = (ligand_code or "").strip().upper()
    if not code:
        return []
    by_key: dict[str, dict[str, Any]] = {}
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        res_name = line[17:20].strip()
        if res_name != code or res_name in CRYSTALLOGRAPHY_ADDITIVES:
            continue
        try:
            atom_name = line[12:16].strip()
            chain_id = line[21:22].strip() or "A"
            res_seq = int(line[22:26])
            element = (line[76:78].strip() or atom_name[0]).upper()
            if element == "H":
                continue
            key = f"{code}|{chain_id}|{res_seq}"
            if key not in by_key:
                by_key[key] = {
                    "ligandCode": code,
                    "chainId": chain_id,
                    "resSeq": res_seq,
                    "instanceKey": key,
                    "atoms": [],
                }
            idx = len(by_key[key]["atoms"])
            by_key[key]["atoms"].append(
                {
                    "index": idx,
                    "atomName": atom_name,
                    "resName": res_name,
                    "resSeq": res_seq,
                    "chainId": chain_id,
                    "x": float(line[30:38]),
                    "y": float(line[38:46]),
                    "z": float(line[46:54]),
                    "element": element,
                }
            )
        except (ValueError, IndexError):
            continue
    return [g for g in by_key.values() if g["atoms"]]


def count_binding_site_residues(
    protein_atoms: list[dict[str, Any]], ligand_atoms: list[dict[str, Any]], cutoff: float = 4.5
) -> int:
    lig_heavy = [a for a in ligand_atoms if a.get("element", "C") != "H"]
    keys: set[str] = set()
    for pa in protein_atoms:
        if pa.get("element", "C") == "H":
            continue
        for la in lig_heavy:
            if _dist(pa, la) <= cutoff:
                keys.add(f"{pa['resName']}-{pa['resSeq']}-{pa.get('chainId') or 'A'}")
                break
    return len(keys)


def select_cocrystal_ligand_instance(
    pdb_text: str,
    ligand_code: str,
    protein_atoms: list[dict[str, Any]],
    *,
    preferred_chain_id: Optional[str] = None,
    pose_centroid: Optional[dict[str, float]] = None,
    cutoff_angstrom: float = 4.5,
) -> dict[str, Any]:
    instances = group_hetatm_ligand_instances(pdb_text, ligand_code)
    if not instances:
        return {"instance": None, "atoms": [], "selectionReason": "no_instance", "instanceCount": 0}

    best = None
    best_score = -1
    best_pose_dist = float("inf")

    for inst in instances:
        if preferred_chain_id and inst["chainId"] != preferred_chain_id:
            continue
        score = count_binding_site_residues(protein_atoms, inst["atoms"], cutoff_angstrom)
        c = _centroid(inst["atoms"])
        pose_dist = 0.0
        if pose_centroid:
            pose_dist = math.sqrt(
                (c["x"] - pose_centroid["x"]) ** 2
                + (c["y"] - pose_centroid["y"]) ** 2
                + (c["z"] - pose_centroid["z"]) ** 2
            )
        if score > best_score or (score == best_score and pose_centroid and pose_dist < best_pose_dist):
            best = inst
            best_score = score
            best_pose_dist = pose_dist

    if best is None and preferred_chain_id:
        return select_cocrystal_ligand_instance(
            pdb_text,
            ligand_code,
            protein_atoms,
            preferred_chain_id=None,
            pose_centroid=pose_centroid,
            cutoff_angstrom=cutoff_angstrom,
        )

    if best is None:
        best = instances[0]
        best_score = count_binding_site_residues(protein_atoms, best["atoms"], cutoff_angstrom)

    reason = "single_copy" if len(instances) == 1 else "max_pocket_contacts"
    if pose_centroid and len(instances) > 1:
        reason = "max_pocket_contacts_pose_tiebreak"

    return {
        "instance": {
            "ligandCode": best["ligandCode"],
            "chainId": best["chainId"],
            "resSeq": best["resSeq"],
            "instanceKey": best["instanceKey"],
            "heavyAtomCount": len(best["atoms"]),
            "pocketResidueCount": best_score,
        },
        "atoms": best["atoms"],
        "selectionReason": reason,
        "instanceCount": len(instances),
    }


def parse_crystal_ligand_atoms(
    pdb_text: str,
    ligand_resname: Optional[str] = None,
    protein_atoms: Optional[list[dict[str, Any]]] = None,
    pose_ligand_atoms: Optional[list[dict[str, Any]]] = None,
    preferred_chain_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Return heavy atoms for the bound co-crystal ligand copy (not all symmetry copies)."""
    if not ligand_resname:
        return []
    pose_centroid = None
    if pose_ligand_atoms:
        heavy = [
            a
            for a in pose_ligand_atoms
            if str(a.get("element", "C")).upper() not in {"H", "HD"}
        ]
        if heavy:
            pose_centroid = _centroid(heavy)
    protein = protein_atoms or []
    picked = select_cocrystal_ligand_instance(
        pdb_text,
        ligand_resname,
        protein,
        preferred_chain_id=preferred_chain_id,
        pose_centroid=pose_centroid,
    )
    return picked.get("atoms") or []
