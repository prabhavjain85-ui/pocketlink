"""Ligand 3D embed, protonation (Meeko), and PDBQT export."""
from __future__ import annotations

from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem

from .pdb_io import fetch_rcsb_smiles, ligand_pdb_lines


def mol_from_ligand_pdb(lines: list[str]) -> Chem.Mol | None:
    if not lines:
        return None
    block = "\n".join(lines) + "\nEND\n"
    return Chem.MolFromPDBBlock(block, sanitize=True, removeHs=True)


def reference_mol_from_crystal(
    crystal_mol: Chem.Mol | None, resn: str, fallback_smiles: str
) -> Chem.Mol | None:
    if crystal_mol is None:
        return None
    smi = fetch_rcsb_smiles(resn) or fallback_smiles
    template = Chem.MolFromSmiles(smi) if smi else None
    if template is None:
        return Chem.RemoveHs(Chem.Mol(crystal_mol))
    try:
        ordered = AllChem.AssignBondOrdersFromTemplate(template, crystal_mol)
        return Chem.RemoveHs(ordered)
    except Exception:
        return Chem.RemoveHs(Chem.Mol(crystal_mol))


def ligand_center(mol: Chem.Mol) -> list[float]:
    conf = mol.GetConformer()
    xs, ys, zs = [], [], []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    n = len(xs) or 1
    return [sum(xs) / n, sum(ys) / n, sum(zs) / n]


def box_size_from_mol(mol: Chem.Mol, padding: float, min_size: float, max_size: float) -> float:
    conf = mol.GetConformer()
    xs, ys, zs = [], [], []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    return min(max_size, max(min_size, span + padding * 2))


def embed_smiles_3d(smiles: str, seed: int = 42) -> Chem.Mol | None:
    mob = Chem.MolFromSmiles(smiles)
    if mob is None:
        return None
    mob = Chem.AddHs(mob)
    params = AllChem.ETKDGv3()
    params.randomSeed = int(seed)
    code = AllChem.EmbedMolecule(mob, params)
    if code != 0:
        code = AllChem.EmbedMolecule(mob, randomSeed=int(seed))
    if code != 0:
        return None
    AllChem.MMFFOptimizeMolecule(mob)
    return Chem.RemoveHs(mob)


def write_ligand_pdbqt(mol: Chem.Mol, path: Path) -> None:
    from meeko import MoleculePreparation, PDBQTWriterLegacy

    prep = MoleculePreparation()
    lig_h = Chem.AddHs(mol, addCoords=True)
    prep_out = prep.prepare(lig_h)
    prep_mol = prep_out[0] if isinstance(prep_out, list) else prep_out
    lig_written = PDBQTWriterLegacy.write_string(prep_mol)
    lig_str = lig_written[0] if isinstance(lig_written, tuple) else lig_written
    path.write_text(lig_str)


def crystal_reference_from_pdb(
    pdb_text: str, resn: str, chain: str, fallback_smiles: str
) -> Chem.Mol | None:
    lines = ligand_pdb_lines(pdb_text, resn, chain)
    crystal = mol_from_ligand_pdb(lines)
    return reference_mol_from_crystal(crystal, resn, fallback_smiles)
