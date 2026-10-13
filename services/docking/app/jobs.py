import hashlib
import json
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

from .config import config_version, load_engine_config
from .pipeline import run_docking_pipeline
from .validation import validate_pdb_id, validate_smiles


@dataclass
class JobRecord:
    job_id: str
    pdb_id: str
    smiles: str
    status: str = "queued"
    progress: float = 0.0
    message: str = "Queued"
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    cache_key: Optional[str] = None


class JobStore:
    def __init__(self, work_dir: Path, cache_dir: Path) -> None:
        self.work_dir = work_dir
        self.cache_dir = cache_dir
        self.work_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()
        self._active = 0
        self._queue: list[str] = []
        self._worker_started = False

    def _limits(self) -> dict[str, Any]:
        return load_engine_config().get("limits", {})

    def cache_key_for(self, pdb_id: str, smiles: str) -> str:
        payload = json.dumps(
            {"v": config_version(), "pdb": pdb_id, "smiles": smiles.strip()},
            sort_keys=True,
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.json"

    def read_cache(self, key: str) -> Optional[dict[str, Any]]:
        path = self._cache_path(key)
        if not path.is_file():
            return None
        try:
            with path.open(encoding="utf-8") as fh:
                data = json.load(fh)
            ttl = int(self._limits().get("cacheTtlSeconds", 86400))
            if time.time() - float(data.get("cachedAt", 0)) > ttl:
                return None
            return data.get("result")
        except (OSError, json.JSONDecodeError, TypeError):
            return None

    def write_cache(self, key: str, result: dict[str, Any]) -> None:
        path = self._cache_path(key)
        with path.open("w", encoding="utf-8") as fh:
            json.dump({"cachedAt": time.time(), "result": result}, fh)

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def create(self, pdb_id: str, smiles: str) -> JobRecord:
        pdb_err = validate_pdb_id(pdb_id)
        if pdb_err:
            raise ValueError(pdb_err)
        smi_err = validate_smiles(smiles)
        if smi_err:
            raise ValueError(smi_err)

        max_pending = int(self._limits().get("queueMaxPending", 32))
        with self._lock:
            pending = sum(1 for j in self._jobs.values() if j.status in ("queued", "running"))
            if pending >= max_pending:
                raise RuntimeError("Docking queue is full. Try again shortly.")

        clean_pdb = pdb_id.strip().upper()
        clean_smi = smiles.strip()
        cache_key = self.cache_key_for(clean_pdb, clean_smi)
        cached = self.read_cache(cache_key)
        job_id = str(uuid.uuid4())
        record = JobRecord(
            job_id=job_id,
            pdb_id=clean_pdb,
            smiles=clean_smi,
            cache_key=cache_key,
        )
        if cached:
            record.status = "completed"
            record.progress = 100.0
            record.message = "Returned from cache"
            record.result = cached

        with self._lock:
            self._jobs[job_id] = record
            if record.status == "queued":
                self._queue.append(job_id)

        self._ensure_worker()
        return record

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker_started:
                return
            self._worker_started = True
        thread = threading.Thread(target=self._worker_loop, name="docking-worker", daemon=True)
        thread.start()

    def _worker_loop(self) -> None:
        while True:
            job_id = None
            with self._lock:
                max_concurrent = int(self._limits().get("maxConcurrentJobs", 2))
                if self._queue and self._active < max_concurrent:
                    job_id = self._queue.pop(0)
                    self._active += 1
            if not job_id:
                time.sleep(0.25)
                continue
            try:
                self._run_job(job_id)
            finally:
                with self._lock:
                    self._active = max(0, self._active - 1)

    def _run_job(self, job_id: str) -> None:
        record = self.get(job_id)
        if not record or record.status != "queued":
            return

        timeout_s = int(self._limits().get("jobTimeoutSeconds", 600))
        started = time.time()

        def on_progress(percent: float, message: str) -> None:
            with self._lock:
                rec = self._jobs.get(job_id)
                if not rec:
                    return
                rec.progress = percent
                rec.message = message
                rec.updated_at = time.time()

        with self._lock:
            record.status = "running"
            record.message = "Preparing structures"
            record.updated_at = time.time()

        work_path = self.work_dir / job_id
        work_path.mkdir(parents=True, exist_ok=True)

        try:
            result = run_docking_pipeline(
                pdb_id=record.pdb_id,
                smiles=record.smiles,
                work_dir=work_path,
                on_progress=on_progress,
                deadline=started + timeout_s,
            )
            if time.time() > started + timeout_s:
                raise TimeoutError("Docking job exceeded time limit.")
            self.write_cache(record.cache_key or "", result)
            with self._lock:
                record.status = "completed"
                record.progress = 100.0
                record.message = "Completed"
                record.result = result
                record.updated_at = time.time()
        except Exception as exc:  # noqa: BLE001 — job boundary
            with self._lock:
                record.status = "failed"
                record.error = str(exc)
                record.message = "Failed"
                record.updated_at = time.time()


_store: Optional[JobStore] = None


def get_job_store() -> JobStore:
    global _store
    if _store is None:
        work = Path(os.environ.get("DOCKING_WORK_DIR", "/tmp/docking-jobs"))
        cache = Path(os.environ.get("DOCKING_CACHE_DIR", "/tmp/docking-cache"))
        _store = JobStore(work, cache)
    return _store
