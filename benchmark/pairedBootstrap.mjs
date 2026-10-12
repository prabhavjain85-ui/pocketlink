/** Stratified paired bootstrap: resample actives and decoys separately; same indices for all score vectors. */

import { rocAuc, enrichmentFactorAtFraction } from "./bootstrap.mjs";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.floor(p * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
}

/**
 * @param {boolean[]} labels - true = active
 * @param {Record<string, number[]|null>} scoreByMethod - same length as labels
 * @param {{ nBoot?: number, seed?: number }} opts
 */
export function pairedStratifiedBootstrap(labels, scoreByMethod, opts = {}) {
  const nBoot = opts.nBoot ?? 1000;
  const seed = opts.seed ?? 42;
  const methods = Object.keys(scoreByMethod);
  const n = labels.length;
  const activeIdx = [];
  const decoyIdx = [];
  for (let i = 0; i < n; i++) {
    if (labels[i]) activeIdx.push(i);
    else decoyIdx.push(i);
  }

  const point = {};
  for (const m of methods) {
    point[m] = rocAuc(labels, scoreByMethod[m]);
  }

  const rnd = mulberry32(seed);
  const aucSamples = {};
  for (const m of methods) aucSamples[m] = [];

  const diffKeys = [
    ["similarity_minus_legacy", "similarity", "legacy"],
    ["combined_minus_similarity", "combined", "similarity"],
    ["legacy_minus_rf", "legacy", "rf"],
    ["similarity_minus_rf", "similarity", "rf"],
    ["combined_minus_rf", "combined", "rf"],
  ];
  const diffSamples = {};
  for (const [key] of diffKeys) diffSamples[key] = [];

  for (let b = 0; b < nBoot; b++) {
    const idx = [];
    for (let k = 0; k < activeIdx.length; k++) {
      idx.push(activeIdx[Math.floor(rnd() * activeIdx.length)]);
    }
    for (let k = 0; k < decoyIdx.length; k++) {
      idx.push(decoyIdx[Math.floor(rnd() * decoyIdx.length)]);
    }
    const yb = idx.map((i) => labels[i]);
    const aucB = {};
    for (const m of methods) {
      const sb = idx.map((i) => scoreByMethod[m][i]);
      const a = rocAuc(yb, sb);
      aucB[m] = a;
      if (a != null) aucSamples[m].push(a);
    }
    for (const [key, a, bname] of diffKeys) {
      if (aucB[a] != null && aucB[bname] != null) {
        diffSamples[key].push(aucB[a] - aucB[bname]);
      }
    }
  }

  const methodCi = {};
  for (const m of methods) {
    const s = [...aucSamples[m]].sort((x, y) => x - y);
    methodCi[m] = {
      roc_auc: point[m],
      ci_low: percentile(s, 0.025),
      ci_high: percentile(s, 0.975),
      ef_at_1pct: enrichmentFactorAtFraction(labels, scoreByMethod[m], 0.01),
    };
  }

  const diffs = {};
  for (const [key] of diffKeys) {
    const s = [...diffSamples[key]].sort((x, y) => x - y);
    const mean = s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    const lo = percentile(s, 0.025);
    const hi = percentile(s, 0.975);
    diffs[key] = {
      mean_diff: mean,
      ci_low: lo,
      ci_high: hi,
      significant: lo != null && hi != null && (lo > 0 || hi < 0),
    };
  }

  return { methodCi, diffs, n_boot: nBoot, seed };
}
