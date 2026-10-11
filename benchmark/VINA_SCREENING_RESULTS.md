# Vina screening benchmark (8 redock-validated targets)

**Selection bias:** Targets were pre-selected because an earlier co-crystal redock run reported in-place Vina RMSD &lt; 2 Å. This is **not** an unbiased virtual-screening benchmark.

**Compound sets:** `buildVinaScreeningSets.py` must produce property-matched decoys with MW and logP baseline ROC-AUC in **0.45–0.55** per target. As of the latest build attempt, **0/8** targets passed that gate in `vina_screening_compounds.json` (see `build_summary` — decoy pools still biased for several kinases). **Full Vina ROC-AUC screening was not run** until decoy sanity passes; running anyway would confound affinity ranking with decoy bias.

**Next step:** Reuse the same `refine_decoy_sanity` loop as `buildHeldoutBenchmark.py` (DUD-E + ChEMBL pool) until each validated target passes MW/logP gate, then:

```bash
VINA_SCREEN_MAX_ACTIVES=25 VINA_SCREEN_MAX_DECOYS=100 python3 benchmark/runVinaScreeningBenchmark.py
```

Expected runtime: hours (one Vina dock per compound).
