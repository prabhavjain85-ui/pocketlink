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
    "halogenBondMinCxaAngleDeg": 165.0,
    "stericClashMaxDistanceAngstrom": 3.0,
    "bindingSiteRecoveryMinFraction": 0.25,
}

AROMATIC_RESIDUES = {"PHE", "TYR", "TRP", "HIS"}
HYDROPHOBIC_RESIDUES = {"ALA", "VAL", "LEU", "ILE", "PHE", "TRP", "MET", "PRO", "TYR", "CYS"}
POSITIVE_RESIDUES = {"LYS", "ARG", "HIS"}
NEGATIVE_RESIDUES = {"ASP", "GLU"}
HALOGEN_BOND_DONORS = {"CL", "BR", "I"}
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


def _is_hbond_pair(pa: dict[str, Any], la: dict[str, Any], dist: float) -> bool:
    if dist > METHODOLOGY["hydrogenBondMaxDistanceAngstrom"]:
        return False
    prot_donor = pa.get("isBackbone") and pa.get("atomName") == "N" or pa.get("atomName") in PROTEIN_DONOR
    prot_acc = pa.get("isBackbone") and pa.get("atomName") == "O" or pa.get("atomName") in PROTEIN_ACCEPTOR
    lig_acc = la["element"] in HB_ACCEPTOR
    lig_donor = la["element"] in HB_DONOR
    return (prot_donor and lig_acc) or (lig_donor and prot_acc) or (prot_donor and lig_donor)


def evaluate_binding_site_sanity(
    protein_atoms: list[dict[str, Any]],
    crystal_ligand_atoms: list[dict[str, Any]],
    pose_ligand_atoms: list[dict[str, Any]],
    *,
    pdb_id: Optional[str] = None,
) -> dict[str, Any]:
    crystal_site = find_binding_site_residues(
        protein_atoms, crystal_ligand_atoms, METHODOLOGY["bindingSiteHeavyAtomCutoffAngstrom"]
    )
    pose_site = find_binding_site_residues(
        protein_atoms, pose_ligand_atoms, METHODOLOGY["bindingSiteHeavyAtomCutoffAngstrom"]
    )
    crystal_keys = {_residue_key_from_row(r) for r in crystal_site}
    pose_keys = {_residue_key_from_row(r) for r in pose_site}
    recovered = [k for k in crystal_keys if k in pose_keys]
    fraction = len(recovered) / len(crystal_keys) if crystal_keys else None
    min_frac = METHODOLOGY["bindingSiteRecoveryMinFraction"]
    off_site = bool(crystal_keys) and (fraction or 0) < min_frac
    note = None
    if pdb_id == "4FFW":
        note = (
            "4FFW PDB numbering differs from common DPP-4 literature: "
            "e.g. GLU204≈GLU205, GLU203≈GLU206, TYR663≈TYR662, ARG123≈ARG125, PHE355≈PHE357."
        )
    return {
        "crystalSiteResidueCount": len(crystal_keys),
        "poseSiteResidueCount": len(pose_keys),
        "overlapResidueCount": len(recovered),
        "crystalSiteRecoveryFraction": round(fraction, 3) if fraction is not None else None,
        "poseNotInKnownBindingSite": off_site,
        "unreliableInteractions": off_site,
        "message": "Pose not in the known binding site; interactions unreliable." if off_site else None,
        "pdbLiteratureResidueNote": note,
        "crystalSiteResidues45Angstrom": crystal_site,
        "poseSiteResidues45Angstrom": pose_site,
    }


def _residue_key_from_row(row: dict[str, Any]) -> str:
    return f"{row['resName']}-{row['resSeq']}-{row['chainId']}"


def analyze_pose_interactions(
    protein_atoms: list[dict[str, Any]],
    ligand_atoms: list[dict[str, Any]],
    *,
    full_protein_atoms: Optional[list[dict[str, Any]]] = None,
    crystal_ligand_atoms: Optional[list[dict[str, Any]]] = None,
    pdb_id: Optional[str] = None,
    binding_site_sanity: Optional[dict[str, Any]] = None,
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
    site_keys = {_residue_key_from_row(r) for r in site45}

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

            hb = _is_hbond_pair(pa, la, d)
            if d < METHODOLOGY["stericClashMaxDistanceAngstrom"] and not hb:
                _push({**base, "type": "clash", "subtype": "heavy_atom_too_close", "warning": True})
                continue

            if d <= METHODOLOGY["hydrogenBondMaxDistanceAngstrom"] and hb:
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
                d >= METHODOLOGY["stericClashMaxDistanceAngstrom"]
                and d <= METHODOLOGY["hydrophobicMaxDistanceAngstrom"]
                and la["element"] == "C"
                and pa["element"] == "C"
                and pa["resName"] in HYDROPHOBIC_RESIDUES
            ):
                _push({**base, "type": "hydrophobic", "subtype": "carbon_carbon"})

            if d <= METHODOLOGY["saltBridgeMaxDistanceAngstrom"]:
                pos = pa["resName"] in POSITIVE_RESIDUES and pa.get("atomName") in {
                    "NZ",
                    "NH1",
                    "NH2",
                    "NE",
                    "ND1",
                    "NE2",
                }
                neg = pa["resName"] in NEGATIVE_RESIDUES and pa.get("atomName") in {"OD1", "OD2", "OE1", "OE2"}
                if (pos and la["element"] == "O") or (neg and la["element"] == "N"):
                    _push({**base, "type": "salt_bridge", "subtype": "ionic"})

            if (
                la["element"] in HALOGEN_BOND_DONORS
                and pa["element"] in HB_ACCEPTOR
                and d <= METHODOLOGY["halogenBondMaxDistanceAngstrom"]
            ):
                prot_acc = pa.get("atomName") in PROTEIN_ACCEPTOR or pa["element"] == "N"
                if prot_acc:
                    carbon = _bonded_carbon(la, lig_heavy)
                    if carbon:
                        ang = _angle_deg(carbon, la, pa)
                        if ang >= METHODOLOGY["halogenBondMinCxaAngleDeg"]:
                            _push(
                                {
                                    **base,
                                    "type": "halogen_bond",
                                    "subtype": la["element"],
                                    "halogenAngleDeg": round(ang, 1),
                                }
                            )

    interactions.sort(key=lambda r: (r["resName"], r["resSeq"], r["type"]))

    sanity = binding_site_sanity
    if sanity is None and full_protein_atoms and crystal_ligand_atoms:
        sanity = evaluate_binding_site_sanity(
            full_protein_atoms, crystal_ligand_atoms, ligand_atoms, pdb_id=pdb_id
        )

    disclaimer = (
        "Interactions are inferred from the predicted docked pose geometry; "
        "they are not experimentally confirmed contacts."
    )
    if sanity and sanity.get("poseNotInKnownBindingSite"):
        disclaimer = f"{disclaimer} {sanity['message']}"

    return {
        "methodology": METHODOLOGY,
        "engine": "geometric_v1",
        "prolifAvailable": _HAS_PROLIF,
        "disclaimer": disclaimer,
        "bindingSiteResidues45Angstrom": site45,
        "bindingSiteResidues50Angstrom": site50,
        "bindingSiteSanity": sanity,
        "interactions": interactions,
        "clashCount": sum(1 for r in interactions if r["type"] == "clash"),
    }


def _bonded_carbon(halogen: dict[str, Any], ligand_heavy: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for a in ligand_heavy:
        if a["element"] != "C":
            continue
        if _dist(a, halogen) <= 1.95:
            return a
    return None


def _angle_deg(a: dict[str, float], b: dict[str, float], c: dict[str, float]) -> float:
    def _norm(v: tuple[float, float, float]) -> tuple[float, float, float]:
        m = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
        if m < 1e-8:
            return (0.0, 0.0, 0.0)
        return (v[0] / m, v[1] / m, v[2] / m)

    u = _norm((b["x"] - a["x"], b["y"] - a["y"], b["z"] - a["z"]))
    v = _norm((b["x"] - c["x"], b["y"] - c["y"], b["z"] - c["z"]))
    dot = max(-1.0, min(1.0, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))
    return math.degrees(math.acos(dot))


def attach_interactions_to_pose(
    pose: dict[str, Any],
    protein_atoms: list[dict[str, Any]],
    **kwargs: Any,
) -> dict[str, Any]:
    lig_atoms = pose.get("atoms") or []
    analysis = analyze_pose_interactions(protein_atoms, lig_atoms, **kwargs)
    pose["interactions"] = analysis
    return pose
