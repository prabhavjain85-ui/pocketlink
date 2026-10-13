# Redocking failure diagnosis (in-place RMSD; target-by-target)

**Gate:** pass only if primary in-place Vina RMSD &lt; 2 Å (`CalcRMS` / `spyrmsd.symmrmsd`, no alignment).

## Passing (8) — enabled for server-side Vina

| Target | PDB | In-place Vina (prior run) | Notes |
|--------|-----|---------------------------|--------|
| ABL1 | 1IEP/STI | ~1.04 Å | Single-chain STI (37 heavy); prior 74-atom bug was dual-chain extraction |
| HER2 | 3PP0/03Q | ~0.54 Å | |
| COX-2 | 1CX2/S58 | ~0.79 Å | HEM stripped for Vina receptor |
| PDE5A | 1UDT/VIA | ~1.09 Å | |
| ESR1 | 3ERT/OHT | ~1.17 Å | |
| DPP4 | 4A5S/N7F | ~0.84 Å | Prior **aligned** ~1.38 Å overstated quality |
| JAK2 | 4JI9/1M3 | ~1.62 Å | Ligand resn `1M3` (not STU) |
| Thrombin | 1PPB/0G6 chain H | ~1.62 Å | `1DWB`/MQT had no ligand in PDB |

## Failing — diagnosed causes (no fix claimed without &lt;2 Å)

### EGFR (`egfr`, 1M17/AQ4) — **~5.96 Å in-place**

- **Cause:** Erlotinib (AQ4) is **type II / inactive DFG-out** binding; Meeko+Vina receptor from chain A may omit **ordered solvent and second-site contacts**; box centered on ligand still allows **DFG-loop flip** and partial egress of anilino tail in minimization.
- **Tried / next:** Alternative entries `4HJO` (WZ4002, covalent acrylamide — **not comparable** to AQ4), `5UG9` (osimertinib covalent). Non-covalent test: `2ITX` (lapatinib) or `1XKK` (gefitinib) require **separate target config**, not a drop-in fix for 1M17/AQ4.
- **Status:** **Still failing** on 1M17/AQ4 with current prep.

### BRAF (`braf`, 4XV2/P06) — **~8.74 Å in-place** (run-to-run pose variance; aligned metric previously ~1.5 Å)

- **Cause:** Dabrafenib (P06) **DFG-out**; Vina single rigid receptor often places ligand **shifted along gatekeeper pocket** when protomer altloc / missing structural waters. Aligned RMSD **hid** translational error.
- **Tried:** Same PDB; exhaustiveness 16. `1UWJ`/`1UWH` (sorafenib) are different chemotypes.
- **Status:** **Still failing** on 4XV2/P06.

### HDAC1 (`hdac1`) — **~4.24 Å** on 1T69/SHH (SAHA)

- **Cause:** **Zinc** in active site not parameterized in AutoDock Vina; Meeko polymer keeps ZN as hetero but Vina scoring ignores **metal coordination geometry**; hydroxamate oxygen placement drifts.
- **Tried:** 1T69 with SHH; 4BKX had **no ligand** in file.
- **Status:** **Still failing**; needs metal-aware scoring or specialized HDAC protocol.

### HIV protease (`hiv_pr`, 1HVR/XK2) — **~6.14 Å**

- **Cause:** **Flap dynamics** and **structural waters** (e.g. catalytic water network); apo-like 1HVR protomers differ from holo flap closure; large peptidomimetic **XK2** needs wider box + induced-fit not in Vina.
- **Status:** **Still failing**.

### SARS-CoV-2 Mpro (`sars_mpro`, 7BQY/PJE chain C) — **~9.31 Å**

- **Cause:** **PJE** is a **covalent warhead** fragment in many 7BQY depositions; non-covalent Vina cannot reproduce **covalent geometry**; ligand on chain C vs protease chain A **dimer context** — receptor strip may omit protomer interface waters.
- **Status:** **Still failing**; use non-covalent inhibitor structure (e.g. `7L10`/GC376 analog) for honest redock.

### ADRB2 (`adrb2`, 3SN6/P0G) — **~8.68 Å**

- **Cause:** **GPCR** — orthosteric pocket defined by **transmembrane bundle + missing membrane**; carazolol (P0G) requires **correct chain (R) and fusion protein stripping**; default chain A strip leaves **incomplete pocket**.
- **Status:** **Still failing**; needs GPCR-specific PDB (e.g. `3P0G`/`4LDE`) and pocket definition.

### HMGCR (`hmgcr`, 1OJ9/1PB) — **~9.21 Å**

- **Cause:** **Statins bind at dimer interface**; receptor built from **single chain A** misses **partner chain contribution** to the binding cleft; compactin (1PB) is large and extended.
- **Status:** **Still failing**; must include **both monomers** in receptor prep.

## Native engine column

- **Index-mapped** `rmsdBetweenCoords` is **not symmetry-corrected**; Jest bench should call `computeNativeSpyrmsd.py` when pose coords are available and report `native_rmsd_spyrmsd_angstrom` separately.
