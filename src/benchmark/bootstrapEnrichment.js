/** Bootstrap 95% CI for enrichment (evolution hit rate minus null hit rate). */

import { mulberry32 } from "../evolution/evolutionRng";

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/**
 * @param {Array<{ hitRateEvolution: number, hitRateNull: number }>} trials
 * @param {{ nBoot?: number, seed?: number }} opts
 */
export function bootstrapEnrichmentCi(trials, { nBoot = 2000, seed = 42 } = {}) {
  const clean = trials.filter(
    (t) =>
      Number.isFinite(t.hitRateEvolution) &&
      Number.isFinite(t.hitRateNull)
  );
  if (!clean.length) {
    return {
      nTrials: 0,
      meanEnrichment: null,
      ci95: [null, null],
      meanEvolutionHitRate: null,
      meanNullHitRate: null,
    };
  }
  const rng = mulberry32(seed);
  const enrichments = [];
  for (let b = 0; b < nBoot; b += 1) {
    let sumEvo = 0;
    let sumNull = 0;
    for (let i = 0; i < clean.length; i += 1) {
      const pick = clean[Math.floor(rng() * clean.length)];
      sumEvo += pick.hitRateEvolution;
      sumNull += pick.hitRateNull;
    }
    enrichments.push(sumEvo / clean.length - sumNull / clean.length);
  }
  enrichments.sort((a, b) => a - b);
  const meanEvo = clean.reduce((s, t) => s + t.hitRateEvolution, 0) / clean.length;
  const meanNull = clean.reduce((s, t) => s + t.hitRateNull, 0) / clean.length;
  return {
    nTrials: clean.length,
    meanEvolutionHitRate: meanEvo,
    meanNullHitRate: meanNull,
    meanEnrichment: meanEvo - meanNull,
    ci95: [percentile(enrichments, 0.025), percentile(enrichments, 0.975)],
  };
}
