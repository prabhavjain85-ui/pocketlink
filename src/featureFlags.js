/**
 * Master switch for production docking (Fly.io Vina service + UI).
 * Keep false until benchmark/docking validation passes.
 */
export const DOCKING_ENABLED = true;

/** Legacy in-browser empirical engine (see src/dockingEngine.js). */
export const DOCKING_ENGINE_ENABLED = true;

export const DOCKING_UNAVAILABLE_NOTICE =
  "Docking is under validation and currently unavailable.";

/** Offline 25-drug benchmark: many PDB pairs failed sanity checks — never treat as validated poses. */
export const DOCKING_BENCHMARK_PAIRS_NOTICE =
  "The 25-drug co-crystal benchmark includes pairs flagged unreliable in benchmark/docking/RESULTS.md (wrong ligand, high RMSD, or missing co-crystal). Those results are not shown here.";
