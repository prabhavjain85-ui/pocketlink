#!/usr/bin/env python3
"""ChEMBL activity fetch funnel per target using API total_count (no full download)."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "benchmark" / "chembl_query_audit.json"

TARGETS = [
    ("egfr", "CHEMBL203"),
    ("abl1", "CHEMBL1862"),
    ("erbb2", "CHEMBL1824"),
    ("braf", "CHEMBL4005"),
    ("ptgs2", "CHEMBL230"),
    ("hmgcr", "CHEMBL402"),
    ("pde5a", "CHEMBL1827"),
    ("esr1", "CHEMBL206"),
    ("dpp4", "CHEMBL284"),
    ("adrb2", "CHEMBL210"),
    ("hiv_pr", "CHEMBL244"),
    ("sars_mpro", "CHEMBL1075104"),
    ("hdac1", "CHEMBL325"),
    ("jak2", "CHEMBL2971"),
    ("thrombin", "CHEMBL204"),
]

PIC50_MIN = 6.0
BASE = "https://www.ebi.ac.uk/chembl/api/data/activity.json"


def count_activities(params: dict) -> int:
    q = {"target_chembl_id": params.pop("target_chembl_id"), "limit": 1, **params}
    url = BASE + "?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=120) as resp:
        payload = json.loads(resp.read().decode())
    return int(payload.get("page_meta", {}).get("total_count", 0))


def audit_target(name: str, chembl_target: str) -> dict:
    steps = []
    params = {"target_chembl_id": chembl_target}

    def add(step, extra, qextra=""):
        nonlocal params
        params = {**params, **extra}
        c = count_activities({**params})
        steps.append(
            {
                "step": step,
                "count": c,
                "query": f"GET /chembl/api/data/activity.json?target_chembl_id={chembl_target}{qextra}&limit=1",
            }
        )
        return c

    add("no_filter", {})
    add("target_type_SINGLE PROTEIN", {"target_type": "SINGLE PROTEIN"}, "&target_type=SINGLE PROTEIN")
    add("confidence_score_gte_7", {"confidence_score__gte": 7}, "&confidence_score__gte=7")
    add("standard_type_IC50_Ki", {"standard_type__in": "IC50,Ki"}, "&standard_type__in=IC50,Ki")
    add("standard_units_nM", {"standard_units__iexact": "nM"}, "&standard_units__iexact=nM")
    add('standard_relation_"="', {"standard_relation": "="}, "&standard_relation==")
    add(
        f"pchembl_gte_{PIC50_MIN}",
        {"pchembl_value__gte": PIC50_MIN},
        f"&pchembl_value__gte={PIC50_MIN}",
    )

    return {
        "target_key": name,
        "chembl_target_id": chembl_target,
        "steps": steps,
        "final_count": steps[-1]["count"],
    }


def main():
    report = {"pic50_min": PIC50_MIN, "targets": [audit_target(n, c) for n, c in TARGETS]}
    OUT.write_text(json.dumps(report, indent=2))
    print(f"Wrote {OUT}")
    for t in report["targets"]:
        print(f"{t['target_key']:12} {t['chembl_target_id']:16} final={t['final_count']:6}")


if __name__ == "__main__":
    main()
