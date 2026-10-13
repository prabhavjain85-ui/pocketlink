"""Symmetry-corrected in-place heavy-atom RMSD (spyrmsd + RDKit CalcRMS)."""
from __future__ import annotations

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolAlign

try:
    from spyrmsd.molecule import Molecule as SpyMolecule
    from spyrmsd.rmsd import symmrmsd
except ImportError:
    SpyMolecule = None
    symmrmsd = None


def spyrmsd_in_place(ref_mol: Chem.Mol, prb_mol: Chem.Mol) -> float | None:
    if SpyMolecule is None or symmrmsd is None:
        return None
    ref = Chem.RemoveHs(Chem.Mol(ref_mol))
    prb = Chem.RemoveHs(Chem.Mol(prb_mol))
    if ref.GetNumAtoms() == 0 or prb.GetNumAtoms() == 0:
        return None
    try:
        m_ref = SpyMolecule.from_rdkit(ref)
        m_prb = SpyMolecule.from_rdkit(prb)
        return float(
            symmrmsd(
                m_ref.coordinates,
                m_prb.coordinates,
                m_ref.atomicnums,
                m_prb.atomicnums,
                m_ref.adjacency_matrix,
                m_prb.adjacency_matrix,
                minimize=False,
            )
        )
    except Exception:
        return None


def calc_rms_in_place(ref_mol: Chem.Mol, prb_mol: Chem.Mol) -> float | None:
    ref = Chem.RemoveHs(Chem.Mol(ref_mol))
    prb = Chem.RemoveHs(Chem.Mol(prb_mol))
    if prb.GetNumAtoms() != ref.GetNumAtoms():
        return None
    try:
        return float(rdMolAlign.CalcRMS(prb, ref))
    except Exception:
        return None


def pose_mol_from_pdbqt(pose_pdbqt_text: str) -> Chem.Mol | None:
    from meeko import PDBQTMolecule, RDKitMolCreate

    pq = PDBQTMolecule(pose_pdbqt_text, poses_to_read=1)
    try:
        pose0 = pq[0]
    except (IndexError, KeyError, TypeError):
        return None
    mobs = RDKitMolCreate.from_pdbqt_mol(pose0)
    mob = mobs[0] if isinstance(mobs, list) else mobs
    if mob is None:
        return None
    return Chem.RemoveHs(mob)


def rmsd_pose_pdbqt_vs_ref(ref_mol: Chem.Mol, pose_pdbqt_text: str) -> dict:
    mob = pose_mol_from_pdbqt(pose_pdbqt_text)
    out = {
        "calc_rmsd_angstrom": None,
        "spyrmsd_angstrom": None,
        "primary_rmsd_angstrom": None,
        "rmsd_atom_count_match": False,
    }
    if ref_mol is None or mob is None:
        return out
    try:
        prb = AllChem.AssignBondOrdersFromTemplate(ref_mol, mob)
        prb = Chem.RemoveHs(prb)
        ref = Chem.RemoveHs(Chem.Mol(ref_mol))
        out["rmsd_atom_count_match"] = prb.GetNumAtoms() == ref.GetNumAtoms()
        out["calc_rmsd_angstrom"] = calc_rms_in_place(ref, prb)
        out["spyrmsd_angstrom"] = spyrmsd_in_place(ref, prb)
        out["primary_rmsd_angstrom"] = out["spyrmsd_angstrom"]
        if out["primary_rmsd_angstrom"] is None:
            out["primary_rmsd_angstrom"] = out["calc_rmsd_angstrom"]
    except Exception:
        pass
    return out
