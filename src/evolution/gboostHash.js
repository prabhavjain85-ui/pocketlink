/** RDKit-compatible gboost hash helpers (32-bit). */

export function hashUint32(v) {
  return v >>> 0;
}

export function hashCombine(seed, v) {
  const h = (typeof v === "number" ? v : 0) >>> 0;
  const s = seed >>> 0;
  const sum = (h + 0x9e3779b9 + ((s << 6) >>> 0) + (s >>> 2)) >>> 0;
  return (s ^ sum) >>> 0;
}

export function hashVector(values) {
  let seed = 0;
  for (const v of values) seed = hashCombine(seed, v >>> 0);
  return seed >>> 0;
}

export function hashPair(pair) {
  let seed = 0;
  seed = hashCombine(seed, pair[0] >>> 0);
  seed = hashCombine(seed, pair[1] >>> 0);
  return seed >>> 0;
}
