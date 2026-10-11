#!/usr/bin/env python3
"""Compute in-place spyrmsd between crystal ligand PDB block and docked pose coords (JSON)."""
from __future__ import annotations

import json
import sys

from rdkit import Chem
from rdkit.Chem import AllChem

from rmsd_inplace import calc_rms_in_place, spyrmsd_in_place


def mol_from_coords(smiles: str, coords: list[dict]) -> Chem.Mol | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    mol = Chem.RemoveHs(mol)
    if mol.GetNumAtoms() != len(coords):
        return None
    conf = Chem.Conformer(mol.GetNumAtoms())
    for i, c in enumerate(coords):
        conf.SetAtomPosition(i, (float(c["x"]), float(c["y"]), float(c["z"])))
    mol.AddConformer(conf, assignId=True)
    return mol


def main():
    payload = json.loads(sys.stdin.read())
    ref_block = payload["crystal_pdb_block"]
    smiles = payload["reference_smiles"]
    pose_coords = payload["pose_heavy_coords"]

    crystal = Chem.MolFromPDBBlock(ref_block, sanitize=False, removeHs=True)
    template = Chem.MolFromSmiles(smiles)
    if crystal and template:
        try:
            crystal = Chem.RemoveHs(AllChem.AssignBondOrdersFromTemplate(template, crystal))
        except Exception:
            crystal = Chem.RemoveHs(crystal)
    pose = mol_from_coords(smiles, pose_coords)
    if crystal is None or pose is None:
        print(json.dumps({"calc": None, "spyrmsd": None, "symmetry_corrected": False}))
        return
    try:
        pose = AllChem.AssignBondOrdersFromTemplate(crystal, pose)
        pose = Chem.RemoveHs(pose)
    except Exception:
        pass
    out = {
        "calc": calc_rms_in_place(crystal, pose),
        "spyrmsd": spyrmsd_in_place(crystal, pose),
        "symmetry_corrected": True,
        "native_index_rmsd": payload.get("native_index_rmsd"),
        "native_note": "native_index_rmsd is index-mapped without symmetry; prefer spyrmsd",
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
