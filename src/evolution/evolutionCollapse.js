import { tanimotoFromUint8, morganUint8 } from "./evolutionFingerprint";

export function meanPairwiseTanimotoDistance(RDKit, smilesList) {
  const fps = [];
  for (const smi of smilesList) {
    const mol = RDKit.get_mol(smi);
    fps.push(morganUint8(mol));
    mol.delete();
  }
  let sum = 0;
  let n = 0;
  for (let i = 0; i < fps.length; i += 1) {
    for (let j = i + 1; j < fps.length; j += 1) {
      sum += 1 - tanimotoFromUint8(fps[i], fps[j]);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

export function collapseMetrics({ population, buckets, seedSmiles, RDKit }) {
  const smiles = population.map((p) => p.smiles);
  const diversity = meanPairwiseTanimotoDistance(RDKit, smiles.slice(0, 40));
  const bucketCounts = {};
  for (const b of buckets) bucketCounts[b] = (bucketCounts[b] || 0) + 1;
  const distinctScaffolds = Object.keys(bucketCounts).length;
  const maxBucketShare = population.length
    ? Math.max(...Object.values(bucketCounts)) / population.length
    : 0;
  let seedSim = 0;
  if (seedSmiles && population.length) {
    const mol = RDKit.get_mol(seedSmiles);
    const sfp = morganUint8(mol);
    mol.delete();
    let acc = 0;
    for (const row of population.slice(0, 10)) {
      const m = RDKit.get_mol(row.smiles);
      acc += tanimotoFromUint8(sfp, morganUint8(m));
      m.delete();
    }
    seedSim = acc / Math.min(10, population.length);
  }
  return {
    diversity: Number(diversity.toFixed(3)),
    distinctScaffolds,
    maxBucketShare: Number(maxBucketShare.toFixed(3)),
    seedSimilarityTop10: Number(seedSim.toFixed(3)),
  };
}

export function needsDiversityRescue(metrics) {
  return (
    metrics.diversity < 0.45 ||
    metrics.distinctScaffolds < 5 ||
    metrics.maxBucketShare > 0.25 ||
    metrics.seedSimilarityTop10 > 0.85
  );
}
