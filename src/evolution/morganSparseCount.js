/**
 * RDKit Morgan sparse count fingerprint (radius 2, bond types, ring membership).
 * Matches rdFingerprintGenerator.GetMorganGenerator(radius=2) for parity with sascorer.
 */
import { hashCombine, hashVector } from "./gboostHash";

const BOND_AROMATIC = 12;

function parseRdkitJson(mol) {
  const raw = typeof mol.get_json === "function" ? mol.get_json() : "";
  const data = JSON.parse(raw || "{}");
  const m = data?.molecules?.[0];
  if (!m) return null;
  const defaults = data.defaults?.atom || {};
  const bondDefaults = data.defaults?.bond || {};
  const ext = (m.extensions || []).find((e) => e.name === "rdkitRepresentation") || {};
  const aromaticBonds = new Set(ext.aromaticBonds || []);
  const atomRings = ext.atomRings || [];
  const inRing = new Set();
  for (const ring of atomRings) for (const a of ring) inRing.add(a);

  const atoms = (m.atoms || []).map((a, idx) => ({
    idx,
    z: a.z ?? defaults.z ?? 6,
    impHs: a.impHs ?? defaults.impHs ?? 0,
    chg: a.chg ?? defaults.chg ?? 0,
    inRing: inRing.has(idx),
  }));

  const bonds = (m.bonds || []).map((b, idx) => {
    const bo = b.bo ?? bondDefaults.bo ?? 1;
    let bondType = bo;
    if (aromaticBonds.has(idx)) bondType = BOND_AROMATIC;
    return { idx, atoms: b.atoms, bondType };
  });

  const nbrs = atoms.map(() => []);
  for (const b of bonds) {
    const [a, c] = b.atoms;
    nbrs[a].push({ other: c, bondIdx: b.idx, bondType: b.bondType });
    nbrs[c].push({ other: a, bondIdx: b.idx, bondType: b.bondType });
  }
  for (const a of atoms) {
    a.degree = nbrs[a.idx].length + a.impHs;
  }

  const atomInvariants = atoms.map((a) => {
    const components = [a.z >>> 0, a.degree >>> 0, a.impHs >>> 0, a.chg >>> 0, 0];
    if (a.inRing) components.push(1);
    return hashVector(components);
  });
  const bondInvariants = bonds.map((b) => b.bondType >>> 0);

  return { atoms, bonds, nbrs, atomInvariants, bondInvariants };
}

function bondSetKey(set) {
  return [...set].sort((a, b) => a - b).join(",");
}

function unionSets(a, b) {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

/**
 * @returns {Map<number, number>} sparse count fingerprint
 */
export function getSparseMorganCountFingerprint(mol, radius = 2) {
  const parsed = parseRdkitJson(mol);
  if (!parsed) return new Map();
  const { atoms, nbrs, atomInvariants, bondInvariants } = parsed;
  const nAtoms = atoms.length;
  const counts = new Map();

  const addBit = (bitId) => {
    const k = bitId >>> 0;
    counts.set(k, (counts.get(k) || 0) + 1);
  };

  let currentInvariants = atomInvariants.slice();
  const atomNeighborhoods = Array.from({ length: nAtoms }, () => new Set());
  const roundAtomNeighborhoods = atomNeighborhoods.map((s) => new Set(s));
  const deadAtoms = new Set();
  const neighborhoods = new Set();
  const atomOrder = atoms.map((_, i) => i);

  for (let i = 0; i < nAtoms; i += 1) addBit(currentInvariants[i]);

  for (let layer = 0; layer < radius; layer += 1) {
    const allNeighborhoodsThisRound = [];
    const nextLayerInvariants = new Array(nAtoms).fill(0);

    for (const atomIdx of atomOrder) {
      if (deadAtoms.has(atomIdx)) continue;
      if (!nbrs[atomIdx].length) {
        deadAtoms.add(atomIdx);
        continue;
      }

      const neighborhoodInvariants = [];
      for (const nb of nbrs[atomIdx]) {
        roundAtomNeighborhoods[atomIdx].add(nb.bondIdx);
        roundAtomNeighborhoods[atomIdx] = unionSets(
          roundAtomNeighborhoods[atomIdx],
          atomNeighborhoods[nb.other]
        );
        neighborhoodInvariants.push([bondInvariants[nb.bondIdx], currentInvariants[nb.other]]);
      }
      neighborhoodInvariants.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

      let invar = layer >>> 0;
      invar = hashCombine(invar, currentInvariants[atomIdx]);
      for (const [bt, oInv] of neighborhoodInvariants) {
        invar = hashCombine(invar, bt);
        invar = hashCombine(invar, oInv);
      }
      nextLayerInvariants[atomIdx] = invar >>> 0;

      allNeighborhoodsThisRound.push({
        bonds: new Set(roundAtomNeighborhoods[atomIdx]),
        bitId: invar >>> 0,
        atomIdx,
      });
    }

    allNeighborhoodsThisRound.sort((a, b) => {
      const ka = bondSetKey(a.bonds);
      const kb = bondSetKey(b.bonds);
      if (ka !== kb) return ka < kb ? -1 : 1;
      if (a.bitId !== b.bitId) return a.bitId - b.bitId;
      return a.atomIdx - b.atomIdx;
    });

    for (const row of allNeighborhoodsThisRound) {
      const key = bondSetKey(row.bonds);
      if (!neighborhoods.has(key)) {
        addBit(row.bitId);
        neighborhoods.add(key);
        atomNeighborhoods[row.atomIdx] = new Set(row.bonds);
      } else {
        deadAtoms.add(row.atomIdx);
      }
    }

    currentInvariants = nextLayerInvariants.slice();
    for (let i = 0; i < nAtoms; i += 1) {
      atomNeighborhoods[i] = new Set(roundAtomNeighborhoods[i]);
    }
  }

  return counts;
}

export function sparseCountsToObject(map) {
  const obj = {};
  for (const [k, v] of map.entries()) obj[k] = v;
  return obj;
}
