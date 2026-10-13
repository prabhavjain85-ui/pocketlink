import os
import time
from collections import defaultdict
from typing import Any, Optional

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

from .config import config_version, load_engine_config
from .jobs import get_job_store

app = FastAPI(title="TargetForge Docking Service", version=config_version())

_hits: dict[str, list[float]] = defaultdict(list)


def _check_api_key(x_api_key: Optional[str]) -> None:
    expected = os.environ.get("DOCKING_API_KEY")
    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


def _rate_limit_ip(ip: str) -> None:
    limit = int(load_engine_config().get("limits", {}).get("rateLimitPerIpPerMinute", 12))
    now = time.time()
    window = 60.0
    recent = [t for t in _hits[ip] if now - t < window]
    if len(recent) >= limit:
        _hits[ip] = recent
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    recent.append(now)
    _hits[ip] = recent


class SubmitJobBody(BaseModel):
    pdbId: str = Field(..., min_length=4, max_length=4)
    smiles: str = Field(..., min_length=1)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engineConfigVersion": config_version(),
        "vinaVersion": load_engine_config().get("engine", {}).get("vinaVersion"),
    }


@app.post("/v1/jobs")
def submit_job(
    body: SubmitJobBody,
    request: Request,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    _check_api_key(x_api_key)
    _rate_limit_ip(request.client.host if request.client else "unknown")
    store = get_job_store()
    try:
        record = store.create(body.pdbId, body.smiles)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "jobId": record.job_id,
        "status": record.status,
        "progress": record.progress,
        "message": record.message,
        "cached": record.status == "completed" and record.message == "Returned from cache",
    }


@app.get("/v1/jobs/{job_id}")
def job_status(
    job_id: str,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    _check_api_key(x_api_key)
    record = get_job_store().get(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "jobId": record.job_id,
        "status": record.status,
        "progress": record.progress,
        "message": record.message,
        "error": record.error,
        "pdbId": record.pdb_id,
    }


@app.get("/v1/jobs/{job_id}/results")
def job_results(
    job_id: str,
    x_api_key: Optional[str] = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    _check_api_key(x_api_key)
    record = get_job_store().get(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Job not found")
    if record.status != "completed":
        raise HTTPException(status_code=409, detail=f"Job not complete (status={record.status})")
    return {"jobId": record.job_id, "result": record.result}
