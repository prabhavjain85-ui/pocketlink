"""Protein-ligand interaction fingerprints for docked poses (PLIP/ProLIF-style cutoffs)."""

from __future__ import annotations

import math
from typing import Any, Optional

try:
    import prolif as _prolif  # noqa: F401

    _HAS_PROLIF = True
except ImportError:
    _HAS_PROLIF = False

METHODOLOGY: dict[str, float] = {
    "bindingSiteHeavyAtomCutoffAngstrom": 4.5,
    "bindingSiteExtendedCutoffAngstrom": 5.0,
    "hydrogenBondMaxDistanceAngstrom": 3.5,
    "hydrogenBondMinAngleDeg": 120.0,
    "saltBridgeMaxDistanceAngstrom": 4.0,
    "hydrophobicMaxDistanceAngstrom": 4.0,
    "piPiFaceToFaceCentroidMaxAngstrom": 5.5,
    "piPiFaceToFaceNormalMaxDeg": 30.0,
    "piPiTShapeCentroidMaxAngstrom": 6.0,
    "piPiTShapeNormalMinDeg": 60.0,
    "piPiTShapeNormalMaxDeg": 120.0,
    "cationPiMaxDistanceAngstrom": 6.0,
    "halogenBondMaxDistanceAngstrom": 4.0,
}

AROMATIC_RESIDUES = {"PHE", "TYR", "TRP", "HIS"}
HYDROPHOBIC_RESIDUES = {"ALA", "VAL", "LEU", "ILE", "PHE", "TRP", "MET", "PRO", "TYR", "CYS"}
POSITIVE_RESIDUES = {"LYS", "ARG", "HIS"}
NEGATIVE_RESIDUES = {"ASP", "GLU"}
HALOGENS = {"F", "CL", "BR", "I"}
HB_ACCEPTOR = {"O", "N", "S"}
HB_DONOR = {"N", "O", "S"}
PROTEIN_DONOR = {"N", "NE", "NH1", "NH2", "NZ", "ND1", "ND2", "NE2", "OG", "OG1", "OH"}
PROTEIN_ACCEPTOR = {"O", "OD1", "OD2", "OE1", "OE2", "OG", "OG1", "OH", "ND1", "NE2"}


def _normalize_element(symbol: Optional[str]) -> str:
    if not symbol:
        return "C"
    s = str(symbol).strip().upper()
    mapping = {
        "A": "C",
        "AP": "C",
        "CA": "C",
        "NA": "N",
        "OA": "O",
        "SA": "S",
        "HD": "H",
        "H": "H",
        "CL": "CL",
        "BR": "BR",
    }
    return mapping.get(s, s[:2] if len(s) > 2 else s)


def _is_heavy(element: str) -> bool:
    return _normalize_element(element) != "H"


def _dist(a: dict[str, float], b: dict[str, float]) -> float:
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2 + (a["z"] - b["z"]) ** 2)


def _format_residue(atom: dict[str, Any]) -> str:
    chain = atom.get("chainId") or atom.get("chain") or "A"
    return f"{atom['resName']}{atom['resSeq']} {chain}"


def _residue_key(atom: dict[str, Any]) -> str:
    chain = atom.get("chainId") or atom.get("chain") or "A"
    return f"{atom['resName']}-{atom['resSeq']}-{chain}"


def find_binding_site_residues(
    protein_atoms: list[dict[str, Any]],
    ligand_atoms: list[dict[str, Any]],
    cutoff: float = 4.5,
) -> list[dict[str, Any]]:
    lig_heavy = [a for a in ligand_atoms if _is_heavy(a.get("element", "C"))]
    by_res: dict[str, dict[str, Any]] = {}
    for pa in protein_atoms:
        if not _is_heavy(pa.get("element", "C")):
            continue
        md = min(_dist(pa, la) for la in lig_heavy)
        if md > cutoff:
            continue
        key = _residue_key(pa)
        row = {
            "resName": pa["resName"],
            "resSeq": pa["resSeq"],
            "chainId": pa.get("chainId") or pa.get("chain") or "A",
            "label": _format_residue(pa),
            "minDistanceAngstrom": round(md, 2),
        }
        if key not in by_res or md < by_res[key]["minDistanceAngstrom"]:
            by_res[key] = row
    return sorted(by_res.values(), key=lambda r: r["minDistanceAngstrom"])


def analyze_pose_interactions(
    protein_atoms: list[dict[str, Any]],
    ligand_atoms: list[dict[str, Any]],
) -> dict[str, Any]:
    """Geometric interaction list aligned with the frontend classifier."""
    protein = [
        {
            **a,
            "chainId": a.get("chainId") or a.get("chain") or "A",
            "element": _normalize_element(a.get("element")),
        }
        for a in protein_atoms
    ]
    ligand = []
    for i, a in enumerate(ligand_atoms):
        el = _normalize_element(a.get("element"))
        ligand.append({**a, "index": a.get("index", i), "element": el})

    lig_heavy = [a for a in ligand if _is_heavy(a["element"])]
    site45 = find_binding_site_residues(protein, ligand, METHODOLOGY["bindingSiteHeavyAtomCutoffAngstrom"])
    site50 = find_binding_site_residues(protein, ligand, METHODOLOGY["bindingSiteExtendedCutoffAngstrom"])
    site_keys = {f"{r['resName']}-{r['resSeq']}-{r['chainId']}" for r in site45}

    interactions: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _push(row: dict[str, Any]) -> None:
        key = "|".join(
            [
                row["type"],
                row["resName"],
                str(row["resSeq"]),
                row["chainId"],
                row["proteinAtom"],
                str(row["ligandAtomIndex"]),
            ]
        )
        if key in seen:
            return
        seen.add(key)
        interactions.append(row)

    for la in lig_heavy:
        for pa in protein:
            if not _is_heavy(pa["element"]):
                continue
            if _residue_key(pa) not in site_keys:
                continue
            d = _dist(la, pa)
            base = {
                "resName": pa["resName"],
                "resSeq": pa["resSeq"],
                "chainId": pa["chainId"],
                "residueLabel": _format_residue(pa),
                "proteinAtom": pa.get("atomName", ""),
                "proteinElement": pa["element"],
                "ligandAtomIndex": la["index"],
                "ligandAtom": la.get("atomName") or f"L{la['index'] + 1}",
                "ligandElement": la["element"],
                "distanceAngstrom": round(d, 2),
            }

            prot_donor = pa.get("isBackbone") and pa.get("atomName") == "N" or pa.get("atomName") in PROTEIN_DONOR
            prot_acc = pa.get("isBackbone") and pa.get("atomName") == "O" or pa.get("atomName") in PROTEIN_ACCEPTOR
            lig_acc = la["element"] in HB_ACCEPTOR
            lig_donor = la["element"] in HB_DONOR
            if d <= METHODOLOGY["hydrogenBondMaxDistanceAngstrom"] and (
                (prot_donor and lig_acc) or (lig_donor and prot_acc)
            ):
                _push(
                    {
                        **base,
                        "type": "hydrogen_bond",
                        "subtype": "distance_only",
                        "geometricQuality": "distance-only",
                        "hbondAngleDeg": None,
                    }
                )

            if (
                d <= METHODOLOGY["hydrophobicMaxDistanceAngstrom"]
                and la["element"] == "C"
                and pa["element"] == "C"
                and pa["resName"] in HYDROPHOBIC_RESIDUES
            ):
                _push({**base, "type": "hydrophobic", "subtype": "carbon_carbon"})

            if d <= METHODOLOGY["saltBridgeMaxDistanceAngstrom"]:
                pos = pa["resName"] in POSITIVE_RESIDUES and pa.get("atomName") in {"NZ", "NH1", "NH2", "NE", "ND1", "NE2"}
                neg = pa["resName"] in NEGATIVE_RESIDUES and pa.get("atomName") in {"OD1", "OD2", "OE1", "OE2"}
                if (pos and la["element"] == "O") or (neg and la["element"] == "N"):
                    _push({**base, "type": "salt_bridge", "subtype": "ionic"})

            if la["element"] in HALOGENS and pa["element"] in HB_ACCEPTOR and d <= METHODOLOGY["halogenBondMaxDistanceAngstrom"]:
                if prot_acc or pa["element"] == "N":
                    _push({**base, "type": "halogen_bond", "subtype": la["element"]})

    interactions.sort(key=lambda r: (r["resName"], r["resSeq"], r["type"]))
    return {
        "methodology": METHODOLOGY,
        "engine": "geometric_v1",
        "prolifAvailable": _HAS_PROLIF,
        "disclaimer": (
            "Interactions are inferred from the predicted docked pose geometry; "
            "they are not experimentally confirmed contacts."
        ),
        "bindingSiteResidues45Angstrom": site45,
        "bindingSiteResidues50Angstrom": site50,
        "interactions": interactions,
    }


def attach_interactions_to_pose(
    pose: dict[str, Any],
    protein_atoms: list[dict[str, Any]],
) -> dict[str, Any]:
    lig_atoms = pose.get("atoms") or []
    analysis = analyze_pose_interactions(protein_atoms, lig_atoms)
    pose["interactions"] = analysis
    return pose
