/**
 * Master switch for production docking (Fly.io Vina service + UI).
 * Keep false until benchmark/docking validation passes.
 */
export const DOCKING_ENABLED = false;

/** Legacy in-browser empirical engine (see src/dockingEngine.js). */
export const DOCKING_ENGINE_ENABLED = false;

export const DOCKING_UNAVAILABLE_NOTICE =
  "Docking is under validation and currently unavailable.";
