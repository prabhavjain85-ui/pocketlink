"""
FastAPI stub for server-side Vina docking.
Deploy: docker build -t vina-dock . && fly deploy / render / cloud run
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
VALIDATED = ROOT / "benchmark" / "vina_validated_targets.json"

app = FastAPI(title="TargetForge Vina Dock", version="0.1.0")


class DockRequest(BaseModel):
    target_id: str
    smiles: str
    exhaustiveness: int = Field(default=8, ge=1, le=32)


def _validated_map() -> dict:
    data = json.loads(VALIDATED.read_text())
    return {t["target_id"]: t for t in data.get("validated", [])}


@app.get("/v1/health")
def health():
    return {"status": "ok", "engine": "autodock-vina"}


@app.post("/v1/dock")
def dock(req: DockRequest):
    targets = _validated_map()
    if req.target_id not in targets:
        raise HTTPException(
            status_code=400,
            detail=targets.get("not_validated_message")
            or json.loads(VALIDATED.read_text()).get("not_validated_message"),
        )
    # Import heavy stack only inside worker process
    from rdkit import Chem
    from rdkit.Chem import AllChem

    from benchmark.runRedockValidation import (
        fetch_pdb,
        ligand_pdb_lines,
        mol_from_ligand_pdb,
        reference_mol_from_crystal,
        strip_ligand_receptor,
        ligand_center,
        box_from_mol,
        prepare_and_vina,
    )

    tgt = targets[req.target_id]
    cfg_path = ROOT / "benchmark" / "docking_targets.json"
    cfg = json.loads(cfg_path.read_text())
    full = next((t for t in cfg["targets"] if t["target_id"] == req.target_id), None)
    if not full:
        raise HTTPException(400, "target config missing in docking_targets.json")

    pdb_text = fetch_pdb(full["pdb_id"])
    lig_lines = ligand_pdb_lines(
        pdb_text, full["ligand_resn"], full.get("ligand_chain", "A")
    )
    crystal = mol_from_ligand_pdb(lig_lines)
    ref_mol = reference_mol_from_crystal(
        crystal, full["ligand_resn"], full["reference_smiles"]
    )
    if ref_mol is None:
        raise HTTPException(500, "reference ligand unavailable")

    mob = Chem.MolFromSmiles(req.smiles)
    if mob is None:
        raise HTTPException(400, "invalid SMILES")
    mob = Chem.RemoveHs(mob)
    AllChem.EmbedMolecule(mob, randomSeed=42)
    AllChem.MMFFOptimizeMolecule(mob)

    center = ligand_center(ref_mol)
    box = box_from_mol(ref_mol)
    keep = [h for h in full.get("keep_het_resnames", []) if h.upper() not in ("HEM", "HEC")]
    receptor = strip_ligand_receptor(
        pdb_text, full["ligand_resn"], full.get("ligand_chain", "A"), keep
    )

    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        # prepare_and_vina returns RMSD only; extend later to return score + pose
        pose, err = prepare_and_vina(receptor, ref_mol, mob, center, box, work)
        if err:
            raise HTTPException(500, err)
        pose = pose or (work / "out.pdbqt").read_text()
        # Vina score from REMARK in pdbqt (first pose)
        score = None
        for line in pose.splitlines():
            if line.startswith("REMARK VINA RESULT:"):
                parts = line.split()
                if len(parts) >= 4:
                    score = float(parts[3])
                break

    return {
        "target_id": req.target_id,
        "vina_score_kcal_mol": score,
        "pose_pdbqt": pose,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
