/** Bootstrap 95% CI for ROC-AUC (paired labels fixed, resample scores with replacement). */

export function rocAuc(labels, scores) {
  const pairs = labels.map((y, i) => ({ y, s: scores[i] }));
  pairs.sort((a, b) => b.s - a.s);
  let nPos = 0;
  let nNeg = 0;
  for (const p of pairs) {
    if (p.y) nPos++;
    else nNeg++;
  }
  if (!nPos || !nNeg) return null;

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let auc = 0;
  let lastScore = null;

  for (const p of pairs) {
    if (p.s !== lastScore) {
      auc += (tp + prevTp) * (fp - prevFp) / 2;
      prevTp = tp;
      prevFp = fp;
      lastScore = p.s;
    }
    if (p.y) tp++;
    else fp++;
  }
  auc += (tp + prevTp) * (fp - prevFp) / 2;
  return auc / (nPos * nNeg);
}

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

export function bootstrapAucCi(labels, scores, nBoot = 400, seed = 42) {
  const base = rocAuc(labels, scores);
  if (base == null) return { auc: null, ci_low: null, ci_high: null };
  const rnd = mulberry32(seed);
  const n = labels.length;
  const samples = [];
  for (let b = 0; b < nBoot; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rnd() * n));
    const yb = idx.map((i) => labels[i]);
    const sb = idx.map((i) => scores[i]);
    const a = rocAuc(yb, sb);
    if (a != null) samples.push(a);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(0.025 * samples.length)] ?? null;
  const hi = samples[Math.floor(0.975 * samples.length)] ?? null;
  return { auc: base, ci_low: lo, ci_high: hi };
}

export function enrichmentFactorAtFraction(labels, scores, fraction = 0.01) {
  const n = labels.length;
  const nAct = labels.filter(Boolean).length;
  if (!nAct || !n) return null;
  const pairs = labels.map((y, i) => ({ y, s: scores[i] }));
  pairs.sort((a, b) => b.s - a.s);
  const topN = Math.max(1, Math.ceil(n * fraction));
  const activesInTop = pairs.slice(0, topN).filter((p) => p.y).length;
  const randomRate = nAct / n;
  return randomRate > 0 ? (activesInTop / topN) / randomRate : null;
}
