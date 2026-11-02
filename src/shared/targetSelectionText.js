/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const SCORE_FORMULA_TEXT =
  "Target Selection Score is a 100-point rules-based total (no AI): Resolution 25 · Completeness 25 · Ligand 20 · Pocket 15 · Method 15. Resolution: ≤2.0 Å = 25, ≤2.5 = 20, ≤3.0 = 15, ≤3.5 = 10, worse = 5, missing = 0. Completeness scales linearly (100% = 25). Ligand awards 20 only for a co-crystallized molecule that is not a crystallization additive (glycerol, sulfate, PEG, acetate, DMSO, EDO, GOL, SO4, PO4). Pocket: residues within ~5 Å of a real ligand = 15, unverified = 7, none = 0. Method: X-ray 15, Cryo-EM 12, NMR 8, other 5.";
