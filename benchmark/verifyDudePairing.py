#!/usr/bin/env python3
"""Print |MW(active) - median MW(assigned decoys)| distribution per target."""
from __future__ import annotations

import json
import sys
from pathlib import Path

BENCH = Path(__file__).resolve().parent
sys.path.insert(0, str(BENCH))

from buildHeldoutBenchmark import TARGETS, load_exclusion_smiles
from dudeDecoyMatch import assign_decoys_eval_subset, mw_delta_distribution, summarize_deltas
from dudeLoader import DUDE_NAMES, load_dude_set

OUT = BENCH / "dude_pairing_verify.json"


def main():
    excluded = load_exclusion_smiles()
    rows = []
    for tgt in TARGETS:
        tid = tgt["id"]
        if tid not in DUDE_NAMES:
            continue
        dude = load_dude_set(tid)
        if not dude or not dude.get("available"):
            continue
        actives = [r for r in dude["actives"] if r["smiles"] not in excluded]
        decoys = [r for r in dude["decoys"] if r["smiles"] not in excluded]
        assignment = assign_decoys_eval_subset(actives, decoys)
        deltas = mw_delta_distribution(actives, decoys, assignment)
        rows.append({"id": tid, "property_match_eval": summarize_deltas(deltas)})
    OUT.write_text(json.dumps({"targets": rows}, indent=2))
    for r in rows:
        s = r["property_match"]
        print(
            f"{r['id']}: n={s.get('n')} median_dMW={s.get('median'):.2f} "
            f"frac<=25Da={s.get('frac_within_25Da', 0):.2f}"
        )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
