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

    n_pass = redock.get("n_targets_pass", 0)
    n_total = redock.get("n_targets", len(redock.get("rows", [])))
    panel_ok = redock.get("panel_overall_pass", False)

    lines = [
        "# Molecular docking benchmark results (TargetForge / pocketlink)",
        "",
        "Offline validation using **AutoDock Vina 1.2.5**, receptor protonation at **pH 7.4** (PDB2PQR/PROPKA),",
        "waters and co-crystal ligands stripped, ligands prepared with **RDKit + Meeko**,",
        "symmetry-corrected in-place **spyrmsd**. **Exhaustiveness=16**; seeds in `config.json`.",
        "",
        "> Docking remains **disabled in the app** (`DOCKING_ENGINE_ENABLED=false`).",
        "",
        f"Generated: {redock.get('generated_at', 'n/a')}",
        "",
        "## Redocking validation",
        "",
        f"**Per target:** {redock.get('per_target_pass_rule', 'best seed spyrmsd ≤ 2.0 Å')}.",
        f"**Panel acceptance:** {redock.get('panel_pass_rule', '≥60% targets pass')} → "
        f"**{n_pass}/{n_total} ({100 * redock.get('panel_pass_rate', n_pass / max(1, n_total)):.0f}%)** "
        f"— **{'PASS' if panel_ok else 'FAIL'}**.",
        "",
        "| Target | PDB | Best RMSD (Å) | Median RMSD (Å) | ≤2 Å | Failure reason |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in redock["rows"]:
        best = r.get("best_rmsd_angstrom")
        med = r.get("median_rmsd_angstrom")
        lines.append(
            f"| {r['target_id']} | {r['pdb_id']}/{r['ligand_resn']} | "
            f"{f'{best:.2f}' if best is not None else '—'} | "
            f"{f'{med:.2f}' if med is not None else '—'} | "
            f"{'yes' if r.get('pass_rmsd_2A') else 'no'} | {r.get('failure_reason') or '—'} |"
        )

    lines.extend(
        [
            "",
            "## 25 approved drugs (co-crystal redock)",
            "",
            f"Redock success (native ligand, best seed ≤ 2 Å): **{drugs['n_redock_pass_2A']}/{drugs['n_drugs']}**.",
            "",
        ]
    )
    sp = drugs.get("spearman_vina_vs_pchembl") or {}
    rho = sp.get("rho")
    if rho is not None:
        lines.append(
            f"Spearman ρ (inverted Vina score vs ChEMBL pChEMBL median): **{rho:.3f}** "
            f"(95% bootstrap CI {sp.get('ci_low'):.3f}–{sp.get('ci_high'):.3f})."
        )
    else:
        lines.append("Spearman correlation: insufficient paired measurements.")
    lines.extend(
        [
            "",
            "| Drug | Target | PDB | RMSD (Å) | Vina (kcal/mol) | pChEMBL | Pass |",
            "| --- | --- | --- | --- | --- | --- | --- |",
        ]
    )
    for r in drugs["rows"]:
        lines.append(
            f"| {r['name']} | {r['gene']} | {r['pdb_id']} | {r['redock_rmsd_angstrom']} | "
            f"{r['vina_score_kcal_mol']} | {r['pchembl_median']} | {'yes' if r['pass_redock_2A'] else 'no'} |"
        )

    lines.extend(["", "## Enrichment (test split only)", ""])
    if not enrich.get("targets"):
        lines.append("_Enrichment not run._")
    else:
        lines.append("| Target | Test actives | Test decoys | ROC-AUC (95% CI) | EF@1% |")
        lines.append("| --- | --- | --- | --- | --- |")
        for t in enrich["targets"]:
            ci = t.get("roc_auc_ci_95") or [None, None]
            lines.append(
                f"| {t['target_id']} | {t['n_test_actives']} | {t['n_test_decoys']} | "
                f"{t['roc_auc']:.3f} ({ci[0]:.3f}–{ci[1]:.3f}) | {t['ef1pct']:.2f} |"
            )

    lines.extend(["", "## Failures and limitations", ""])
    for r in redock["rows"]:
        if not r.get("pass_rmsd_2A"):
            lines.append(f"- **Redock {r['target_id']}** ({r['pdb_id']}): {r.get('failure_reason')}")
    for r in drugs["rows"]:
        if not r.get("pass_redock_2A") or r.get("failure"):
            lines.append(
                f"- **{r['name']}**: RMSD={r['redock_rmsd_angstrom']}, note={r.get('failure')}"
            )
    lines.extend(
        [
            "- Panel and per-drug metrics use the same Vina prep; failures are not tuned away by swapping PDB entries.",
            "- Vina scores are not calibrated affinities; Spearman uses sparse ChEMBL pairings across heterogeneous targets.",
            "- Enrichment decoys are ChEMBL weak binders (train/test split by molecule ID); not DUD-E matched decoys.",
        ]
    )

    (ROOT / "RESULTS.md").write_text("\n".join(lines) + "\n")
    print("Wrote RESULTS.md")


if __name__ == "__main__":
    main()
