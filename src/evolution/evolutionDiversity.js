import { morganUint8, tanimotoFromUint8 } from "./evolutionFingerprint";

function fpForSmiles(RDKit, smiles, cache) {
  if (cache.has(smiles)) return cache.get(smiles);
  const mol = RDKit.get_mol(smiles);
  const fp = morganUint8(mol);
  mol.delete();
  cache.set(smiles, fp);
  return fp;
}

function minDistanceToSet(fp, selectedFps) {
  if (!selectedFps.length) return 1;
  let minTan = 1;
  for (const s of selectedFps) {
    minTan = Math.min(minTan, tanimotoFromUint8(fp, s));
  }
  return 1 - minTan;
}

/**
 * MaxMin diversity picking on Morgan (r=2, 2048) fingerprints.
 */
export function maxMinPick(RDKit, candidates, k, { rng = Math.random, seedSmiles = null } = {}) {
  if (!candidates?.length || k <= 0) return [];
  const pool = candidates.slice();
  const cache = new Map();
  const picked = [];
  const pickedFps = [];

  if (seedSmiles) {
    const seedFp = fpForSmiles(RDKit, seedSmiles, cache);
    pickedFps.push(seedFp);
  }

  while (picked.length < k && pool.length) {
    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < pool.length; i += 1) {
      const fp = fpForSmiles(RDKit, pool[i].smiles, cache);
      const score = minDistanceToSet(fp, pickedFps);
      const tie = rng();
      if (score > bestScore || (score === bestScore && tie > 0.5)) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const [choice] = pool.splice(bestIdx, 1);
    picked.push(choice);
    pickedFps.push(fpForSmiles(RDKit, choice.smiles, cache));
  }
  return picked;
}

/**
 * Butina-style leader clustering: pick cluster centroids by maxMin on leaders.
 */
export function butinaPick(RDKit, candidates, k, { rng = Math.random, threshold = 0.6 } = {}) {
  if (!candidates?.length || k <= 0) return [];
  const cache = new Map();
  const fps = candidates.map((c) => fpForSmiles(RDKit, c.smiles, cache));
  const clusters = [];
  const assigned = new Array(candidates.length).fill(false);

  for (let i = 0; i < candidates.length && clusters.length < k; i += 1) {
    if (assigned[i]) continue;
    let isDuplicate = false;
    for (const c of clusters) {
      if (tanimotoFromUint8(fps[i], fps[c]) >= threshold) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;
    clusters.push(i);
    for (let j = 0; j < candidates.length; j += 1) {
      if (tanimotoFromUint8(fps[i], fps[j]) >= threshold) assigned[j] = true;
    }
  }

  const leaders = clusters.map((i) => candidates[i]);
  if (leaders.length >= k) return leaders.slice(0, k);
  const rest = candidates.filter((_, i) => !clusters.includes(i));
  return [...leaders, ...maxMinPick(RDKit, rest, k - leaders.length, { rng })];
}

export function pickDiverseSurvivors(RDKit, ranked, survivorCount, { method = "maxmin", rng, seedSmiles } = {}) {
  const poolSize = Math.min(ranked.length, Math.max(survivorCount * 4, survivorCount));
  const pool = ranked.slice(0, poolSize);
  if (method === "butina") return butinaPick(RDKit, pool, survivorCount, { rng });
  return maxMinPick(RDKit, pool, survivorCount, { rng, seedSmiles });
}
