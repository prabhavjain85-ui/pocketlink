# PR B merge checklist (Draft PR #36 — do not merge without review)

## Scope note (PR A vs PR B)

PR A (separate, off `main`) owns: disable in-browser docking engine, honest marketing copy, Methodology validation section, lazy fingerprints.  
**This branch may still contain earlier `MethodologyPage.jsx` edits — reconcile with PR A before merge.**

---

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Vercel Vina feasibility measured & documented | **PASS** | `benchmark/VERCEL_VINA_FEASIBILITY.md` |
| 2 | External Vina service stub + API contract | **PASS** | `services/vina-dock/`, `openapi.yaml`, `api/dock-vina.js` |
| 3 | Docking gated to multiseed redock passers only | **PASS** | `benchmark/vina_validated_targets.json` (6 targets), `syncVinaAllowlist.js` |
| 4 | In-place RMSD: CalcRMS + spyrmsd (no alignment) | **PASS** | `benchmark/rmsd_inplace.py`, `runRedockValidation.py` |
| 5 | Native RMSD symmetry-corrected or labeled | **PARTIAL** | `computeNativeSpyrmsd.py`; Jest still sets index RMSD unless wired |
| 6 | 10-seed redock gate (exh. 16, ≥8/10 pass) | **PASS** | `redock_multiseed_results.json`, `REDOCK_MULTISEED_TABLE.md` |
| 7 | Failing targets diagnosed (no false fixes) | **PASS** | `benchmark/REDOCK_TARGET_DIAGNOSIS.md` |
| 8 | DUD-E actives + nearest-50 decoys (eval repeats OK) | **PASS** | `DUDE_RESULTS.md`, `dude_pairing_verify.json` |
| 9 | DUD-E MW/logP gate; 3 targets in benchmark | **PASS** | `dude_benchmark_summary.json` — dpp4, adrb2, jak2 |
| 10 | Cluster + hard-cutoff split eval + RF sanity | **PASS** | `DUDE_SPLIT_RESULTS.md`, `dude_rf_split_results.json` |
| 11 | Vina screening on multiseed ∩ DUD-E gate | **PASS** | `VINA_SCREENING_RESULTS.md` — intersection **dpp4** only; AUC 0.30 (95% CI 0.19–0.44) |
| 12 | No method tuning / honest bad numbers | **PASS** | RF caveat on adrb2/jak2; redock FAIL targets documented |
| 13 | Every changed file listed in PR body | **PASS** | See PR description |

## Readiness recommendation

**Not ready to merge to production.** Keep as **Draft PR B** until:

1. Vina screening job completes for **dpp4** (only target in multiseed ∩ DUD-E gate).
2. Reconcile `MethodologyPage.jsx` / docking UX with PR A.
3. Deploy `services/vina-dock` and set `VINA_DOCK_SERVICE_URL` on Vercel.

**Safe to merge to an integration branch** for continued benchmark/docking work after item 1 is green.
