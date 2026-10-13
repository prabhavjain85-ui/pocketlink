"""One-target docking session with cached receptor prep."""
from __future__ import annotations

import json
from pathlib import Path

from rdkit import Chem

from .ligand_prep import (
    box_size_from_mol,
    crystal_reference_from_pdb,
    embed_smiles_3d,
    ligand_center,
)
from .clean_pdb import extract_chain_renumbered
from .pdb_io import fetch_pdb, strip_waters_and_ligand
from .receptor_prep import prepare_receptor_pdbqt
from .vina_dock import run_vina


def load_config() -> dict:
    cfg_path = Path(__file__).resolve().parents[1] / "config.json"
    return json.loads(cfg_path.read_text())


class DockingSession:
    def __init__(self, target: dict, work_root: Path):
        self.target = target
        self.cfg = load_config()
        self.work_root = work_root
        self.pdb_id = target["pdb_id"].upper()
        self._pdb_text: str | None = None
        self._ref_mol: Chem.Mol | None = None
        self._receptor_pdbqt: Path | None = None
        self._center: list[float] | None = None
        self._box: float | None = None

    def _ensure_structure(self) -> None:
        if self._pdb_text is not None:
            return
        self._pdb_text = fetch_pdb(self.pdb_id)
        chain = target_chain(self.target)
        resn = self.target["ligand_resn"]
        smiles = self.target["reference_smiles"]
        self._ref_mol = crystal_reference_from_pdb(self._pdb_text, resn, chain, smiles)
        if self._ref_mol is None:
            raise RuntimeError(f"No reference ligand for {self.pdb_id}/{resn}")
        self._center = ligand_center(self._ref_mol)
        pad = float(self.cfg["box_padding_angstrom"])
        self._box = box_size_from_mol(
            self._ref_mol,
            padding=pad,
            min_size=float(self.cfg["box_min_size_angstrom"]),
            max_size=float(self.cfg["box_max_size_angstrom"]),
        )

    def reference_mol(self) -> Chem.Mol:
        self._ensure_structure()
        return self._ref_mol

    def receptor_pdbqt(self) -> Path:
        self._ensure_structure()
        if self._receptor_pdbqt is not None:
            return self._receptor_pdbqt
        chain = target_chain(self.target)
        stripped = strip_waters_and_ligand(
            self._pdb_text,
            self.target["ligand_resn"],
            chain,
            protein_chains=self.target.get("protein_chains"),
            keep_het=self.target.get("keep_het_resnames", []),
        )
        rec_chain = (self.target.get("protein_chains") or [chain])[0]
        keep_het = {h for h in self.target.get("keep_het_resnames", []) if h.upper() not in ("HOH", "WAT")}
        stripped = extract_chain_renumbered(stripped, rec_chain, keep_het=keep_het)
        cache_key = f"{self.pdb_id}_{self.target['target_id']}_ph{self.cfg['receptor_ph']}"
        work = self.work_root / self.target["target_id"]
        self._receptor_pdbqt = prepare_receptor_pdbqt(
            stripped,
            work,
            ph=float(self.cfg["receptor_ph"]),
            cache_key=cache_key,
        )
        return self._receptor_pdbqt

    def dock_mol(
        self,
        mol: Chem.Mol,
        seed: int,
        work_subdir: str,
    ) -> tuple[str | None, float | None, str | None]:
        self._ensure_structure()
        rec = self.receptor_pdbqt()
        work = self.work_root / self.target["target_id"] / work_subdir
        exhaustiveness = int(
            self.target.get("exhaustiveness", self.cfg["exhaustiveness"])
        )
        return run_vina(
            rec,
            mol,
            self._center,
            self._box,
            work,
            exhaustiveness=exhaustiveness,
            seed=int(seed),
            n_poses=int(self.cfg.get("n_poses", 1)),
            vina_binary=str(self.cfg.get("vina_binary", "vina")),
        )

    def dock_smiles(self, smiles: str, seed: int, work_subdir: str) -> tuple[str | None, float | None, str | None]:
        mol = embed_smiles_3d(smiles, seed=int(self.cfg["ligand_embed_seed"]))
        if mol is None:
            return None, None, "embed_failed"
        return self.dock_mol(mol, seed=seed, work_subdir=work_subdir)


def target_chain(target: dict) -> str:
    return target.get("ligand_chain", "A")
