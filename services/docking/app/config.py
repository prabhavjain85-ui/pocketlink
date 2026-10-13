import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any


def _default_config_path() -> Path:
    env = os.environ.get("ENGINE_CONFIG_PATH")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[3] / "benchmark" / "docking" / "engine.config.json"


@lru_cache(maxsize=1)
def load_engine_config() -> dict[str, Any]:
    path = _default_config_path()
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def config_version() -> str:
    return str(load_engine_config().get("schemaVersion", "unknown"))
