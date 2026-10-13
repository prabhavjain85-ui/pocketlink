"""Smoke tests for the docking HTTP service."""

import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault("DOCKING_SKIP_VINA", "1")
os.environ.setdefault("ENGINE_CONFIG_PATH", str(ROOT.parents[1] / "benchmark" / "docking" / "engine.config.json"))

from app.main import app  # noqa: E402
from app.config import load_engine_config  # noqa: E402


@pytest.fixture
def client():
    return TestClient(app)


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["engineConfigVersion"] == load_engine_config()["schemaVersion"]


def test_known_complex_job_completes(client):
    cfg = load_engine_config()["smokeTest"]
    submit = client.post("/v1/jobs", json={"pdbId": cfg["pdbId"], "smiles": cfg["smiles"]})
    assert submit.status_code == 200
    job_id = submit.json()["jobId"]

    deadline = time.time() + 30
    status = "queued"
    while time.time() < deadline:
        poll = client.get(f"/v1/jobs/{job_id}")
        assert poll.status_code == 200
        status = poll.json()["status"]
        if status in ("completed", "failed"):
            break
        time.sleep(0.2)

    assert status == "completed"
    results = client.get(f"/v1/jobs/{job_id}/results")
    assert results.status_code == 200
    poses = results.json()["result"]["poses"]
    assert len(poses) >= 1
    assert poses[0]["scoreKcalMol"] <= float(cfg["maxScoreKcalMol"])
