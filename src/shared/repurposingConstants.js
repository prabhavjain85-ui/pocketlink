/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const HIGHLIGHT_COUNT = 20;

export const PAGE_SIZE = 20;

export const APPROVED_DRUG_LIBRARY_COUNT = 2983;

export const INSUFFICIENT_STRUCTURE_ERROR =
  "Unable to score against this target — insufficient structural data";

export const SERVERLESS_TIMEOUT_NOTE =
  "Full-library scoring runs on the TargetForge server in batches of 25 drugs within a single 300 s Vercel function. Very large LLM-scored screens may need a background job/queue instead.";
