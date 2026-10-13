/**
 * Master switch for production docking (Fly.io Vina service + UI).
 * Keep false until benchmark/docking validation passes.
 */
export const DOCKING_ENABLED = true;

/** Legacy in-browser empirical engine (see src/dockingEngine.js). */
export const DOCKING_ENGINE_ENABLED = true;

export const DOCKING_UNAVAILABLE_NOTICE =
  "Docking is under validation and currently unavailable.";
