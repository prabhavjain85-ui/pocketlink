/** Morgan Tanimoto (ECFP4, 2048) via RDKit WASM. */

export function morganUint8(mol, radius = 2, nBits = 2048) {
  if (!mol || typeof mol.get_morgan_fp_as_uint8array !== "function") return null;
  try {
    return mol.get_morgan_fp_as_uint8array(JSON.stringify({ radius, nBits }));
  } catch {
    return null;
  }
}

export function tanimotoFromUint8(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] & b[i]) inter += 1;
    if (a[i] | b[i]) union += 1;
  }
  return union ? inter / union : 0;
}

export function maxTanimotoToSet(RDKit, smiles, others = []) {
  let mol = null;
  try {
    mol = RDKit.get_mol(smiles);
    const fp = morganUint8(mol);
    if (!fp) return 0;
    let max = 0;
    for (const o of others) {
      if (!o || o === smiles) continue;
      const om = RDKit.get_mol(o);
      const ofp = morganUint8(om);
      if (ofp) max = Math.max(max, tanimotoFromUint8(fp, ofp));
      om.delete();
    }
    return max;
  } finally {
    if (mol) mol.delete();
  }
}

export function noveltyDistances(RDKit, smiles, { seedSmiles, populationSmiles = [] }) {
  const maxSeed =
    seedSmiles && seedSmiles !== smiles ? maxTanimotoToSet(RDKit, smiles, [seedSmiles]) : 0;
  const pop = populationSmiles.filter((s) => s && s !== smiles);
  const maxPop = pop.length ? maxTanimotoToSet(RDKit, smiles, pop) : 0;
  return { maxTanSeed: maxSeed, maxTanPopulation: maxPop };
}
