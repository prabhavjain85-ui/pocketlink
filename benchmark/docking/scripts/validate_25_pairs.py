#!/usr/bin/env python3
"""Sanity-check 25 drug–receptor pairs (PDB ligand, Vina score band, RMSD)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.ligand_prep import crystal_reference_from_pdb, embed_smiles_3d
from lib.pdb_io import fetch_pdb, ligand_pdb_lines

MANIFEST = ROOT / "manifests" / "approved_25_drugs.json"
BENCH = ROOT / "results" / "approved_25.json"
OUT = ROOT / "results" / "pair_sanity_checks.json"

VINA_MIN, VINA_MAX = -14.0, -5.0


def het_resnames(pdb_text: str) -> dict[str, set[str]]:
    m: dict[str, set[str]] = {}
    for line in pdb_text.splitlines():
        if not line.startswith("HETATM"):
            continue
        rn = line[17:20].strip()
        ch = line[21:22].strip() or "A"
        if rn in ("HOH", "WAT"):
            continue
        m.setdefault(rn, set()).add(ch)
    return m


def main() -> None:
    drugs = json.loads(MANIFEST.read_text())["drugs"]
    bench_rows = {r["drug_id"]: r for r in json.loads(BENCH.read_text())["rows"]}
    checks = []
    for d in drugs:
        did = d["drug_id"]
        pdb_id = d["pdb_id"].upper()
        resn = d["ligand_resn"]
        chain = d.get("ligand_chain", "A")
        issues = []
        reliable = True

        try:
            pdb = fetch_pdb(pdb_id)
        except Exception as exc:
            issues.append(f"pdb_fetch:{exc}")
            reliable = False
            pdb = ""

        het = het_resnames(pdb) if pdb else {}
        lig_lines = ligand_pdb_lines(pdb, resn, chain) if pdb else []
        if pdb and not lig_lines:
            reliable = False
            alt = het.get(resn)
            if alt:
                issues.append(f"ligand_wrong_chain:resn_{resn}_on_chains_{sorted(alt)}_not_{chain}")
            elif resn not in het:
                similar = [k for k in het if k.startswith(resn[:2]) or resn in k][:8]
                issues.append(
                    f"ligand_missing:resn_{resn}_not_in_pdb;het_examples={list(het.keys())[:12]}"
                )
            else:
                issues.append(f"ligand_missing:resn_{resn}_chain_{chain}")

        ref = None
        if lig_lines:
            try:
                ref = crystal_reference_from_pdb(pdb, resn, chain, d["smiles"])
            except Exception as exc:
                issues.append(f"ref_mol:{exc}")
                reliable = False
            if ref is None:
                issues.append("ref_mol_unresolved")
                reliable = False

        mob = embed_smiles_3d(d["smiles"], seed=42)
        if mob is None:
            issues.append("smiles_embed_failed")
            reliable = False

        br = bench_rows.get(did, {})
        score = br.get("vina_score_kcal_mol")
        rmsd = br.get("redock_rmsd_angstrom")
        if score is None:
            issues.append("no_vina_score_in_benchmark")
            reliable = False
        elif score > VINA_MAX or score < VINA_MIN:
            issues.append(f"vina_score_out_of_band:{score}_expected_{VINA_MIN}_to_{VINA_MAX}")
            reliable = False
        if rmsd is not None and rmsd > 2.0:
            issues.append(f"redock_rmsd_above_2A:{rmsd:.2f}")
            reliable = False
        if br.get("failure"):
            issues.append(f"run_failure:{br['failure']}")
            reliable = False

        checks.append(
            {
                "drug_id": did,
                "name": d["name"],
                "pdb_id": pdb_id,
                "ligand_resn": resn,
                "ligand_chain": chain,
                "ligand_atoms_in_pdb": len(lig_lines),
                "vina_score_kcal_mol": score,
                "redock_rmsd_angstrom": rmsd,
                "reliable_for_benchmark": reliable,
                "issues": issues,
            }
        )
        flag = "OK" if reliable else "UNRELIABLE"
        print(f"{did:16} {flag:12} {issues[:2]}")

    n_ok = sum(1 for c in checks if c["reliable_for_benchmark"])
    payload = {
        "vina_score_band_kcal_mol": [VINA_MIN, VINA_MAX],
        "n_reliable": n_ok,
        "n_total": len(checks),
        "checks": checks,
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"Wrote {OUT} ({n_ok}/{len(checks)} reliable)")


if __name__ == "__main__":
    main()
