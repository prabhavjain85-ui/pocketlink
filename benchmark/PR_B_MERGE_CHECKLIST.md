# PR B merge checklist (Draft PR #36 — do not merge without review)

## Scope note (PR A vs PR B)

PR A (separate, off `main`) owns: disable in-browser docking engine, honest marketing copy, Methodology validation section, lazy fingerprints.  
**This branch may still contain earlier `MethodologyPage.jsx` edits — reconcile with PR A before merge.**

---

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Vercel Vina feasibility measured & documented | **PASS** | `benchmark/VERCEL_VINA_FEASIBILITY.md` (~98 MB wheels; exceeds bundle; timeout/memory) |
| 2 | External Vina service stub + API contract | **PASS** | `services/vina-dock/`, `openapi.yaml`, `api/dock-vina.js` proxy |
| 3 | Docking gated to 8 redock-pass targets | **PASS** | `benchmark/vina_validated_targets.json`, `src/vinaDockClient.js`, `DockingPage.jsx` gate |
| 4 | In-place RMSD: CalcRMS + spyrmsd (no alignment) | **PASS** | `benchmark/rmsd_inplace.py`, `runRedockValidation.py` |
| 5 | Native RMSD symmetry-corrected or labeled | **PARTIAL** | `computeNativeSpyrmsd.py`; Jest still sets index RMSD unless wired |
| 6 | All 15 targets redock recomputed (dual RMSD) | **PENDING/RUN** | `benchmark/redocking_results.json`, `REDOCK_TABLE.md` |
| 7 | Failing targets diagnosed (no false fixes) | **PASS** | `benchmark/REDOCK_TARGET_DIAGNOSIS.md` |
| 8 | ChEMBL funnel ABL1/ESR1/Mpro actives | **PASS** | `benchmark/chembl_query_audit.json` |
| 9 | Held-out MW/logP gate, Murcko=0, splits | **PASS** | `HELDOUT_RESULTS.md`, `heldout_split_results.json` |
| 10 | Vina screening on 8 targets + selection-bias note | **PARTIAL** | `runVinaScreeningBenchmark.py`, `buildVinaScreeningSets.py` (run required) |
| 11 | No method tuning / honest bad numbers | **PASS** | Documented failures (EGFR ~6 Å, BRAF ~8.7 Å, etc.) |
| 12 | Every changed file listed in PR body | **PASS** | See PR description |

## Readiness recommendation

**Not ready to merge to production.** Keep as **Draft PR B** until:

1. Redock job finishes with `vina_rmsd_spyrmsd_angstrom` populated for all 15 targets.
2. `buildVinaScreeningSets.py` + `runVinaScreeningBenchmark.py` complete (or report per-target skip reasons).
3. Reconcile `MethodologyPage.jsx` / docking UX with PR A.
4. Deploy `services/vina-dock` and set `VINA_DOCK_SERVICE_URL` on Vercel.

**Safe to merge to a integration branch** for continued benchmark/docking work after items 1–2 are green.
