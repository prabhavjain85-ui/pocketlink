#!/usr/bin/env python3
"""
Co-crystal redocking with AutoDock Vina (Meeko prep).
RMSD: in-place, heavy-atom only, symmetry-aware via rdMolAlign.CalcRMS (no superposition).
Bond orders: AssignBondOrdersFromTemplate using RCSB chemical component SMILES.
"""
from __future__ import annotations

import json
import tempfile
import urllib.request
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolAlign

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "benchmark" / "docking_targets.json"
OUT = ROOT / "benchmark" / "redocking_results.json"
CACHE = ROOT / "benchmark" / "pdb_cache"

RMSD_METHOD_DOC = (
    "Heavy-atom RMSD in the receptor frame with NO Kabsch/superposition. "
    "Reference: co-crystal HETATM (single chain/altloc) with bond orders from "
    "RCSB chemcomp SMILES (data.rcsb.org) via AssignBondOrdersFromTemplate. "
    "Probe: Vina pose PDBQT with bond orders assigned from that reference; "
    "RDKit rdMolAlign.CalcRMS(prb, ref) (in-place, symmetry-aware). "
    "Not GetBestRMS / AlignMol."
)


def fetch_pdb(pdb_id: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{pdb_id.upper()}.pdb"
    if not path.exists():
        url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
        with urllib.request.urlopen(url, timeout=120) as resp:
            path.write_text(resp.read().decode())
    return path.read_text()


def fetch_rcsb_smiles(resn: str) -> str | None:
    url = f"https://data.rcsb.org/rest/v1/core/chemcomp/{resn.upper()}"
    try:
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        desc = data.get("rcsb_chem_comp_descriptor") or {}
        return desc.get("SMILES_stereo") or desc.get("SMILES")
    except Exception:
        return None


def ligand_pdb_lines(pdb_text: str, resn: str, chain: str = "A") -> list[str]:
    lines = []
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        rn = line[17:20].strip()
        ch = line[21:22].strip() or "A"
        alt = line[16:17].strip()
        if rn != resn or ch != chain:
            continue
        if alt and alt not in ("A", "1", ""):
            continue
        lines.append(line)
    if lines:
        return lines
    by_chain: dict[str, list[str]] = {}
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        rn = line[17:20].strip()
        if rn != resn:
            continue
        alt = line[16:17].strip()
        if alt and alt not in ("A", "1", ""):
            continue
        ch = line[21:22].strip() or "A"
        by_chain.setdefault(ch, []).append(line)
    if not by_chain:
        return []
    return max(by_chain.values(), key=len)


def mol_from_ligand_pdb(lines: list[str]) -> Chem.Mol | None:
    if not lines:
        return None
    block = "\n".join(lines) + "\nEND\n"
    return Chem.MolFromPDBBlock(block, sanitize=True, removeHs=True)


def reference_mol_from_crystal(
    crystal_mol: Chem.Mol, resn: str, fallback_smiles: str
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


def in_place_calc_rmsd(ref_mol: Chem.Mol, pose_pdbqt_text: str) -> float | None:
    """CalcRMS without prior alignment; heavy atoms only."""
    if ref_mol is None:
        return None
    mob = pose_mol_from_pdbqt(pose_pdbqt_text)
    if mob is None:
        return None
    try:
        prb = AllChem.AssignBondOrdersFromTemplate(ref_mol, mob)
        prb = Chem.RemoveHs(prb)
        ref = Chem.Mol(ref_mol)
        if prb.GetNumAtoms() != ref.GetNumAtoms():
            return None
        return float(rdMolAlign.CalcRMS(prb, ref))
    except Exception:
        return None


def prepare_and_vina(
    receptor_pdb: str,
    ref_mol: Chem.Mol,
    dock_mol: Chem.Mol,
    center: list[float],
    box_size: float,
    work: Path,
) -> tuple[float | None, str | None]:
    try:
        from meeko import MoleculePreparation, PDBQTWriterLegacy
        from meeko import Polymer
        from vina import Vina
    except ImportError as exc:
        return None, f"import_error:{exc}"

    rec_pdbqt = work / "rec.pdbqt"
    lig_pdbqt = work / "lig.pdbqt"
    out_pdbqt = work / "out.pdbqt"

    prep = MoleculePreparation()
    try:
        polymer = Polymer.from_pdb_string(
            receptor_pdb,
            default_altloc="A",
            allow_bad_res=True,
        )
        polymer_pdbqt, _ = PDBQTWriterLegacy.write_from_polymer(polymer)
        rec_pdbqt.write_text(polymer_pdbqt)
    except Exception as exc:
        return None, f"receptor_prep:{exc}"

    lig_h = Chem.AddHs(dock_mol, addCoords=True)
    prep_out = prep.prepare(lig_h)
    prep_mol = prep_out[0] if isinstance(prep_out, list) else prep_out
    lig_written = PDBQTWriterLegacy.write_string(prep_mol)
    lig_str = lig_written[0] if isinstance(lig_written, tuple) else lig_written
    lig_pdbqt.write_text(lig_str)

    v = Vina(sf_name="vina", verbosity=0)
    v.set_receptor(str(rec_pdbqt))
    v.set_ligand_from_file(str(lig_pdbqt))
    v.compute_vina_maps(center=center, box_size=[box_size, box_size, box_size])
    v.dock(exhaustiveness=16, n_poses=5)
    v.write_poses(str(out_pdbqt), n_poses=1, overwrite=True)

    pose_text = out_pdbqt.read_text()
    rmsd = in_place_calc_rmsd(ref_mol, pose_text)
    if rmsd is None:
        return None, "in_place_rmsd_failed"
    return rmsd, None


def strip_ligand_receptor(pdb_text: str, resn: str, chain: str, keep_het: list[str]) -> str:
    keep = {resn} | {h.upper() for h in keep_het}
    out = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM  "):
            ch = line[21:22].strip() or "A"
            alt = line[16:17].strip()
            if ch != chain:
                continue
            if alt and alt not in ("A", "1", ""):
                continue
            out.append(line)
        elif line.startswith("HETATM"):
            rn = line[17:20].strip()
            ch = line[21:22].strip() or "A"
            if rn in keep and ch == chain and rn != resn:
                out.append(line)
    out.append("END")
    return "\n".join(out)


def ligand_center(mol: Chem.Mol) -> list[float]:
    conf = mol.GetConformer()
    xs, ys, zs = [], [], []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    return [sum(xs) / len(xs), sum(ys) / len(ys), sum(zs) / len(zs)]


def box_from_mol(mol: Chem.Mol, padding: float = 8.0) -> float:
    conf = mol.GetConformer()
    xs, ys, zs = [], [], []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    return min(28.0, max(18.0, span + padding * 2))


def main():
    config = json.loads(CFG.read_text())
    rows = []
    for tgt in config["targets"]:
        pdb_id = tgt["pdb_id"]
        resn = tgt["ligand_resn"]
        smiles = tgt["reference_smiles"]
        keep_het = tgt.get("keep_het_resnames", [])
        chain = tgt.get("ligand_chain", "A")

        pdb_text = fetch_pdb(pdb_id)
        lig_lines = ligand_pdb_lines(pdb_text, resn, chain)
        crystal_mol = mol_from_ligand_pdb(lig_lines)
        ref_mol = reference_mol_from_crystal(crystal_mol, resn, smiles)
        heavy = ref_mol.GetNumAtoms() if ref_mol else 0

        row = {
            "target": tgt["target_id"],
            "pdb_id": pdb_id.upper(),
            "ligand_resn": resn,
            "ligand_chain": chain,
            "crystal_heavy_atoms": heavy,
            "vina_rmsd_crystal_ligand": None,
            "vina_rmsd_rdkit_3d": None,
            "pass_vina_crystal": False,
            "rmsd_method": RMSD_METHOD_DOC,
            "failure_reason": None,
        }

        if ref_mol is None:
            row["failure_reason"] = "no_crystal_ligand_in_pdb"
            rows.append(row)
            continue

        center = ligand_center(ref_mol)
        box = box_from_mol(ref_mol)
        vina_keep_het = [h for h in keep_het if h.upper() not in ("HEM", "HEC")]
        receptor = strip_ligand_receptor(pdb_text, resn, chain, vina_keep_het)

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            v_rmsd_c, err_c = prepare_and_vina(receptor, ref_mol, ref_mol, center, box, work)
            row["vina_rmsd_crystal_ligand"] = v_rmsd_c
            if err_c:
                row["failure_reason"] = err_c

            mob = Chem.MolFromSmiles(smiles)
            if mob:
                mob = Chem.AddHs(mob)
                AllChem.EmbedMolecule(mob, randomSeed=42)
                AllChem.MMFFOptimizeMolecule(mob)
                mob = Chem.RemoveHs(mob)
                v_rmsd_r, _ = prepare_and_vina(receptor, ref_mol, mob, center, box, work)
                row["vina_rmsd_rdkit_3d"] = v_rmsd_r
            row["pass_vina_crystal"] = v_rmsd_c is not None and v_rmsd_c < 2.0

        rows.append(row)
        print(f"[redock] {tgt['target_id']} heavy={heavy} vina_c={row['vina_rmsd_crystal_ligand']}", flush=True)

    payload = {
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "rmsd_method": RMSD_METHOD_DOC,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
