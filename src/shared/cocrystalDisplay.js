/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export function normalizeResolutionCombined(raw) {
  let resolution = raw ?? null;
  if (Array.isArray(resolution)) resolution = resolution[0] ?? null;
  if (resolution != null && typeof resolution !== "number") {
    const n = Number(resolution);
    resolution = Number.isFinite(n) ? n : null;
  }
  return resolution;
}
