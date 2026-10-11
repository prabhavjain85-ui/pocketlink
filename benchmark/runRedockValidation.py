#!/usr/bin/env python3
"""
Co-crystal redocking: crystal ligand 3D vs RDKit 3D embed; AutoDock Vina reference + optional native engine JSON merge.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolAlign

ROOT = Path(__file__).resolve().parents[1]
CFG = ROOT / "benchmark" / "docking_targets.json"
OUT = ROOT / "benchmark" / "redocking_results.json"
CACHE = ROOT / "benchmark" / "pdb_cache"


def fetch_pdb(pdb_id: str) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{pdb_id.upper()}.pdb"
    if not path.exists():
        url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
        with urllib.request.urlopen(url, timeout=120) as resp:
            path.write_text(resp.read().decode())
    return path.read_text()


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
    return lines


def mol_from_ligand_pdb(lines: list[str]) -> Chem.Mol | None:
    if not lines:
        return None
    block = "\n".join(lines) + "\nEND\n"
    mol = Chem.MolFromPDBBlock(block, sanitize=True, removeHs=True)
    return mol


def rmsd_best(mol_ref: Chem.Mol, mol_mob: Chem.Mol) -> float | None:
    if mol_ref is None or mol_mob is None:
        return None
    try:
        return float(rdMolAlign.GetBestRMS(mol_mob, mol_ref))
    except Exception:
        return None


def prepare_and_vina(
    receptor_pdb: str,
    ligand_mol: Chem.Mol,
    center: list[float],
    box_size: float,
    work: Path,
) -> tuple[float | None, str | None]:
    try:
        from meeko import MoleculePreparation, PDBQTWriterLegacy
        from meeko import RDKitMolCreate
        from vina import Vina
    except ImportError as exc:
        return None, f"import_error:{exc}"

    rec_path = work / "rec.pdb"
    rec_path.write_text(receptor_pdb)

    # Receptor PDBQT via obabel fallback if meeko fails on protein
    rec_pdbqt = work / "rec.pdbqt"
    lig_pdbqt = work / "lig.pdbqt"
    out_pdbqt = work / "out.pdbqt"

    prep = MoleculePreparation()
    try:
        from meeko import Polymer, PDBQTWriterLegacy

        polymer = Polymer.from_pdb_string(
            receptor_pdb,
            default_altloc="A",
            allow_bad_res=True,
        )
        polymer_pdbqt, _ = PDBQTWriterLegacy.write_from_polymer(polymer)
        rec_pdbqt.write_text(polymer_pdbqt)
    except Exception as exc:
        return None, f"receptor_prep:{exc}"

    lig_h = Chem.AddHs(ligand_mol, addCoords=True)
    prep_out = prep.prepare(lig_h)
    prep_mol = prep_out[0] if isinstance(prep_out, list) else prep_out
    lig_written = PDBQTWriterLegacy.write_string(prep_mol)
    lig_str = lig_written[0] if isinstance(lig_written, tuple) else lig_written
    lig_pdbqt.write_text(lig_str)

    half = box_size / 2.0
    v = Vina(sf_name="vina", verbosity=0)
    v.set_receptor(str(rec_pdbqt))
    v.set_ligand_from_file(str(lig_pdbqt))
    v.compute_vina_maps(center=center, box_size=[box_size, box_size, box_size])
    v.dock(exhaustiveness=16, n_poses=5)
    v.write_poses(str(out_pdbqt), n_poses=1, overwrite=True)

    pose_text = out_pdbqt.read_text()
    mob = Chem.MolFromPDBBlock(pose_text, sanitize=False, removeHs=False)
    ref = Chem.AddHs(ligand_mol, addCoords=True)
    if mob is None:
        return None, "vina_pose_parse_failed"
    rmsd = rmsd_best(ref, mob)
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


def box_from_mol(mol: Chem.Mol, padding: float = 5.0) -> float:
    conf = mol.GetConformer()
    xs, ys, zs = [], [], []
    for i in range(mol.GetNumAtoms()):
        p = conf.GetAtomPosition(i)
        xs.append(p.x)
        ys.append(p.y)
        zs.append(p.z)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    return min(36.0, max(18.0, span + padding * 2))


def run_native_row(pdb_id: str, smiles: str, resn: str, chain: str) -> dict:
    script = ROOT / "benchmark" / "redockNativeOne.mjs"
    if not script.exists():
        return {}
    proc = subprocess.run(
        ["node", str(script), pdb_id, smiles, resn, chain],
        cwd=str(ROOT),
        env={**dict(subprocess.os.environ), "NODE_ENV": "test"},
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        return {"native_error": proc.stderr[-500:]}
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {"native_error": "bad_json"}


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
        heavy = crystal_mol.GetNumAtoms() if crystal_mol else 0

        row = {
            "target": tgt["target_id"],
            "pdb_id": pdb_id.upper(),
            "ligand_resn": resn,
            "ligand_chain": chain,
            "crystal_heavy_atoms": heavy,
            "vina_rmsd_crystal_ligand": None,
            "vina_rmsd_rdkit_3d": None,
            "native_rmsd_crystal_ligand": None,
            "native_rmsd_rdkit_3d": None,
            "pass_vina_crystal": False,
            "pass_native_crystal": False,
            "failure_reason": None,
        }

        if crystal_mol is None:
            row["failure_reason"] = "no_crystal_ligand_in_pdb"
            rows.append(row)
            continue

        center = ligand_center(crystal_mol)
        box = box_from_mol(crystal_mol)
        # Vina/Meeko: omit heme and other cofactors that break template prep (native engine may retain them).
        vina_keep_het = [h for h in keep_het if h.upper() not in ("HEM", "HEC")]
        receptor = strip_ligand_receptor(pdb_text, resn, chain, vina_keep_het)

        with tempfile.TemporaryDirectory() as td:
            work = Path(td)
            v_rmsd_c, err_c = prepare_and_vina(receptor, crystal_mol, center, box, work)
            row["vina_rmsd_crystal_ligand"] = v_rmsd_c
            if err_c:
                row["failure_reason"] = err_c
            elif v_rmsd_c is None:
                row["failure_reason"] = row.get("failure_reason") or "vina_failed"

            mob = Chem.MolFromSmiles(smiles)
            if mob:
                mob = Chem.AddHs(mob)
                AllChem.EmbedMolecule(mob, randomSeed=42)
                AllChem.MMFFOptimizeMolecule(mob)
                mob = Chem.RemoveHs(mob)
                v_rmsd_r, _ = prepare_and_vina(receptor, mob, center, box, work)
                row["vina_rmsd_rdkit_3d"] = v_rmsd_r
            row["pass_vina_crystal"] = v_rmsd_c is not None and v_rmsd_c < 2.0

        rows.append(row)
        print(f"[redock] {tgt['target_id']} heavy={heavy} vina_c={row['vina_rmsd_crystal_ligand']}", flush=True)

    payload = {"generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z", "rows": rows}
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
