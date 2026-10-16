"""Interaction classifier tests (1M17 erlotinib hinge MET769)."""

import json
from pathlib import Path

import pytest

WORKSPACE = Path(__file__).resolve().parents[3]
CASE = WORKSPACE / "public" / "docking-demo" / "cases" / "erlotinib-1m17.json"

from app.interactions import analyze_pose_interactions  # noqa: E402


@pytest.fixture
def erlotinib_case():
    return json.loads(CASE.read_text(encoding="utf-8"))


def test_erlotinib_hinge_hbond_met769(erlotinib_case):
    analysis = analyze_pose_interactions(erlotinib_case["pocketAtoms"], erlotinib_case["poseAtoms"])
    hinge = [
        r
        for r in analysis["interactions"]
        if r["type"] == "hydrogen_bond" and r["resName"] == "MET" and r["resSeq"] == 769 and r["proteinAtom"] == "N"
    ]
    assert hinge, "Expected hinge H-bond to MET769 backbone N"
    assert hinge[0]["distanceAngstrom"] <= 3.5
