#!/usr/bin/env python3
"""Report DUD-E availability for the 15 docking/benchmark targets."""
from __future__ import annotations

import json
from pathlib import Path

from buildHeldoutBenchmark import TARGETS
from dudeLoader import DUDE_NAMES, load_dude_set

OUT_JSON = Path(__file__).resolve().parent / "dude_availability.json"
OUT_MD = Path(__file__).resolve().parent / "DUDE_AVAILABILITY.md"


def main():
    rows = []
    for tgt in TARGETS:
        tid = tgt["id"]
        dude_code = DUDE_NAMES.get(tid)
        if not dude_code:
            rows.append(
                {
                    "target_id": tid,
                    "name": tgt["name"],
                    "in_dude": False,
                    "dude_code": None,
                    "reason": "no DUD-E mapping (not in DUDE_NAMES)",
                }
            )
            continue
        data = load_dude_set(tid)
        if not data or not data.get("available"):
            rows.append(
                {
                    "target_id": tid,
                    "name": tgt["name"],
                    "in_dude": False,
                    "dude_code": dude_code,
                    "reason": (data or {}).get("reason", "unavailable"),
                }
            )
        else:
            rows.append(
                {
                    "target_id": tid,
                    "in_dude": True,
                    "dude_code": dude_code,
                    "n_actives": len(data.get("actives", [])),
                    "n_decoys": len(data.get("decoys", [])),
                }
            )
    OUT_JSON.write_text(json.dumps({"targets": rows}, indent=2))
    lines = [
        "# DUD-E availability (15 benchmark targets)",
        "",
        "| Target | DUD-E code | In DUD-E | Actives | Decoys | Notes |",
        "|---|---|---|:---:|:---:|---|",
    ]
    for r in rows:
        lines.append(
            f"| {r['target_id']} | {r.get('dude_code') or '—'} | "
            f"{'yes' if r.get('in_dude') else 'no'} | "
            f"{r.get('n_actives', '—')} | {r.get('n_decoys', '—')} | "
            f"{r.get('reason', '')} |"
        )
    OUT_MD.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT_JSON} and {OUT_MD}")


if __name__ == "__main__":
    main()
