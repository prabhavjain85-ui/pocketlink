"""Binding-site overlap vs co-crystal ligand (demo poses)."""

import json
from pathlib import Path

import pytest

WORKSPACE = Path(__file__).resolve().parents[3]
CASE_DIR = WORKSPACE / "public" / "docking-demo" / "cases"

from app.interactions import evaluate_binding_site_sanity  # noqa: E402
from app.pipeline import _parse_crystal_ligand_atoms, _parse_protein_atoms, fetch_pdb_text  # noqa: E402


@pytest.fixture
def imatinib_case():
    return json.loads((CASE_DIR / "imatinib-1iep.json").read_text(encoding="utf-8"))


def test_imatinib_pose_is_off_crystal_binding_site(imatinib_case):
    pdb = fetch_pdb_text(imatinib_case["pdbId"])
    protein = _parse_protein_atoms(pdb)
    crystal = _parse_crystal_ligand_atoms(
        pdb,
        imatinib_case["ligandCode"],
        protein_atoms=protein,
        pose_ligand_atoms=imatinib_case["poseAtoms"],
    )
    sanity = evaluate_binding_site_sanity(protein, crystal, imatinib_case["poseAtoms"], pdb_id="1IEP")
    assert sanity["poseNotInKnownBindingSite"] is True
    assert sanity["crystalSiteRecoveryFraction"] == 0.0
    crystal_labels = {r["label"] for r in sanity["crystalSiteResidues45Angstrom"]}
    assert "THR315 A" in crystal_labels
    assert "THR315 B" not in crystal_labels
    assert sanity["crystalSiteResidueCount"] == 25


def test_sitagliptin_4ffw_literature_numbering_note():
    case = json.loads((CASE_DIR / "sitagliptin-4ffw.json").read_text(encoding="utf-8"))
    pdb = fetch_pdb_text(case["pdbId"])
    protein = _parse_protein_atoms(pdb)
    crystal = _parse_crystal_ligand_atoms(
        pdb, case["ligandCode"], protein_atoms=protein, pose_ligand_atoms=case["poseAtoms"]
    )
    sanity = evaluate_binding_site_sanity(protein, crystal, case["poseAtoms"], pdb_id="4FFW")
    assert sanity["poseNotInKnownBindingSite"] is True
    assert "GLU204" in (sanity.get("pdbLiteratureResidueNote") or "")
