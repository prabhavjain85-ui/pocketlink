#!/usr/bin/env python3
"""Render benchmark/docking/RESULTS.md from results/*.json."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    redock = json.loads((ROOT / "results" / "redock_multiseed.json").read_text())
    drugs = json.loads((ROOT / "results" / "approved_25.json").read_text())
    enrich_path = ROOT / "results" / "enrichment.json"
    enrich = json.loads(enrich_path.read_text()) if enrich_path.exists() else {"targets": []}

    lines = [
        "# Molecular docking benchmark results (TargetForge / pocketlink)",
        "",
        "Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),",
        "waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko** (3D embed where needed),",
        "search box from co-crystal ligand centroid with padding. **Exhaustiveness=16**, seeds fixed per `config.json`.",
        "",
        "> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`). These numbers do not imply production readiness.",
        "",
        f"Generated: {redock.get('generated_at', 'n/a')}",
        "",
        "## Redocking validation (multi-seed)",
        "",
        f"Pass rule: {redock.get('pass_rule', '')}",
        "",
        "| Target | PDB | Seeds pass | Status |",
        "| --- | --- | --- | --- |",
    ]
    n_pass = 0
    for r in redock["rows"]:
        if r["status"] == "PASS":
            n_pass += 1
        lines.append(
            f"| {r['target_id']} | {r['pdb_id']}/{r['ligand_resn']} | {r['seeds_passing']}/{r['seeds_total']} | {r['status']} |"
        )
    lines.extend(
        [
            "",
            f"**Panel pass rate:** {n_pass}/{len(redock['rows'])} targets ({100 * n_pass / max(1, len(redock['rows'])):.0f}%).",
            "",
            "## 25 approved drugs (co-crystal redock)",
            "",
            f"Redock success (top pose spyrmsd ≤ 2 Å): **{drugs['n_redock_pass_2A']}/{drugs['n_drugs']}**.",
            "",
        ]
    )
    sp = drugs.get("spearman_vina_vs_pchembl") or {}
    rho = sp.get("rho")
    if rho is not None:
        lines.append(
            f"Spearman ρ (Vina score vs ChEMBL pChEMBL median, n paired): **{rho:.3f}** "
            f"(95% bootstrap CI {sp.get('ci_low'):.3f}–{sp.get('ci_high'):.3f})."
        )
    else:
        lines.append("Spearman correlation: insufficient paired measurements.")
    lines.extend(["", "| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |", "| --- | --- | --- | --- | --- | --- | --- |"])
    for r in drugs["rows"]:
        lines.append(
            f"| {r['name']} | {r['gene']} | {r['pdb_id']} | {r['redock_rmsd_angstrom']} | {r['vina_score_kcal_mol']} | {r['pchembl_median']} | {'yes' if r['pass_redock_2A'] else 'no'} |"
        )

    lines.extend(["", "## Enrichment (test split only)", ""])
    if not enrich.get("targets"):
        lines.append("_Enrichment not run or insufficient ChEMBL compounds._")
    else:
        lines.append("| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |")
        lines.append("| --- | --- | --- | --- | --- |")
        for t in enrich["targets"]:
            ci = t.get("roc_auc_ci_95") or [None, None]
            lines.append(
                f"| {t['target_id']} | {t['n_test_actives']} | {t['n_test_decoys']} | {t['roc_auc']:.3f} ({ci[0]:.3f}–{ci[1]:.3f}) | {t['ef1pct']:.2f} |"
            )

    failures = [r for r in drugs["rows"] if not r["pass_redock_2A"] or r.get("failure")]
    lines.extend(["", "## Failures and limitations", ""])
    for r in redock["rows"]:
        if r["status"] != "PASS":
            lines.append(f"- **Redock {r['target_id']}**: {r.get('failure_notes')}")
    for r in failures:
        lines.append(
            f"- **{r['name']}**: RMSD={r['redock_rmsd_angstrom']}, failure={r.get('failure')}"
        )
    lines.extend(
        [
            "- Vina scores are approximate affinities; correlation with pChEMBL is expected to be weak for diverse chemotypes.",
            "- Receptor models omit structural waters, membrane, and conformational flexibility unless noted.",
            "- Metal centers (HDAC Zn, etc.) are not modeled with covalent/constraint terms.",
            "- Enrichment decoys are ChEMBL weak binders, not property-matched DUD-E decoys; AUC can be optimistic or pessimistic.",
            "- EGFR/BRAF redocking panel uses PDB entries that pass this protocol; other PDB/ligand pairs may fail (see manifests).",
        ]
    )

    (ROOT / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print("Wrote RESULTS.md")


if __name__ == "__main__":
    main()
