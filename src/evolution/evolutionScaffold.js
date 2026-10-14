/** Murcko-style scaffold bucketing from RDKit JSON (ring systems + linkers). */

function parseMolGraph(mol) {
  const json = JSON.parse(mol.get_json() || "{}");
  const m = json?.molecules?.[0];
  if (!m) return null;
  const ext = (m.extensions || []).find((e) => e.name === "rdkitRepresentation") || {};
  const atomRings = ext.atomRings || [];
  const inRing = new Set();
  for (const ring of atomRings) for (const a of ring) inRing.add(a);
  const atoms = (m.atoms || []).map((a, idx) => ({
    idx,
    z: a.z ?? 6,
    inRing: inRing.has(idx),
  }));
  const bonds = (m.bonds || []).map((b) => ({ a: b.atoms[0], c: b.atoms[1] }));
  const nbrs = atoms.map(() => []);
  for (const b of bonds) {
    nbrs[b.a].push(b.c);
    nbrs[b.c].push(b.a);
  }
  return { atoms, nbrs, atomRings };
}

function murckoCoreSignature(mol) {
  const g = parseMolGraph(mol);
  if (!g) return { generic: "unknown", display: "" };
  const { atoms, nbrs, atomRings } = g;
  if (!atomRings.length) {
    return { generic: `acyclic-${atoms.length}`, display: "acyclic" };
  }

  const ringAtom = new Set();
  for (const ring of atomRings) for (const a of ring) ringAtom.add(a);

  const isLinker = (idx) => {
    if (ringAtom.has(idx)) return true;
    const ringNbrs = nbrs[idx].filter((j) => ringAtom.has(j));
    return ringNbrs.length >= 2;
  };

  const coreAtoms = atoms.filter((a) => isLinker(a.idx));
  const ringsigs = atomRings.map((ring) => {
    const zs = ring.map((i) => atoms[i]?.z ?? 6).sort((a, b) => a - b);
    return `${ring.length}:${zs.join("")}`;
  });
  ringsigs.sort();
  const coreZs = coreAtoms.map((a) => a.z).sort((a, b) => a - b);
  const generic = `murcko-${ringsigs.join("|")}-core${coreZs.join("")}`;
  const display = ringsigs.slice(0, 2).join(" · ") || generic.slice(0, 32);
  return { generic, display };
}

export function murckoKeys(RDKit, smiles) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return { generic: "unknown", display: raw };
  let mol = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return { generic: "unknown", display: raw };
    return murckoCoreSignature(mol);
  } catch {
    return { generic: "unknown", display: raw };
  } finally {
    if (mol) mol.delete();
  }
}

/**
 * Enforce scaffold quota then fill to `survivorCount` by Pareto rank.
 */
export function applyScaffoldQuota(ranked, survivorCount, maxShare = 0.25) {
  const cap = Math.max(1, Math.ceil(maxShare * survivorCount));
  const buckets = new Map();
  for (const ind of ranked) {
    const k = ind.bucket || "unknown";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(ind);
  }

  const order = ranked.slice().sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.crowding ?? 0) - (a.crowding ?? 0) || (b.displayScore ?? 0) - (a.displayScore ?? 0)
  );

  const selected = [];
  const bucketCounts = new Map();

  for (const ind of order) {
    const k = ind.bucket || "unknown";
    const n = bucketCounts.get(k) || 0;
    if (n < cap) {
      selected.push(ind);
      bucketCounts.set(k, n + 1);
    }
  }

  const selectedSet = new Set(selected.map((s) => s.smiles));
  for (const ind of order) {
    if (selected.length >= survivorCount) break;
    if (!selectedSet.has(ind.smiles)) {
      selected.push(ind);
      selectedSet.add(ind.smiles);
    }
  }

  return selected
    .slice(0, survivorCount)
    .sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.crowding ?? 0) - (a.crowding ?? 0) || (b.displayScore ?? 0) - (a.displayScore ?? 0)
    );
}

function compareSurvivors(a, b) {
  return (
    (a.rank ?? 99) - (b.rank ?? 99) ||
    (b.crowding ?? 0) - (a.crowding ?? 0) ||
    (b.displayScore ?? 0) - (a.displayScore ?? 0)
  );
}

/**
 * Preserve seed, global best, and top parents without evicting better-ranked survivors.
 */
export function mergeElites(survivors, parents, survivorCount, { seedSmiles, globalBestSmiles = [] } = {}) {
  const mandatory = new Set();
  const seed = String(seedSmiles || "").trim();
  if (seed) mandatory.add(seed);
  for (const s of globalBestSmiles) {
    const c = String(s || "").trim();
    if (c) mandatory.add(c);
  }
  for (const p of parents.slice(0, 2)) {
    if (p?.smiles) mandatory.add(p.smiles);
  }

  const pool = [...survivors, ...parents];
  const bySmiles = new Map();
  for (const row of pool) {
    if (!row?.smiles) continue;
    const prev = bySmiles.get(row.smiles);
    if (!prev || compareSurvivors(row, prev) < 0) bySmiles.set(row.smiles, row);
  }

  let kept = survivors
    .slice()
    .sort(compareSurvivors)
    .slice(0, survivorCount);
  const keptSet = new Set(kept.map((k) => k.smiles));

  for (const sm of mandatory) {
    const elite = bySmiles.get(sm);
    if (!elite || keptSet.has(sm)) continue;

    if (kept.length < survivorCount) {
      kept.push(elite);
      keptSet.add(sm);
      continue;
    }

    let replaceIdx = -1;
    let replaceRow = null;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (mandatory.has(kept[i].smiles)) continue;
      replaceIdx = i;
      replaceRow = kept[i];
      break;
    }
    if (replaceIdx < 0 || !replaceRow) continue;
    if (!mandatory.has(sm) && compareSurvivors(elite, replaceRow) >= 0) continue;
    kept[replaceIdx] = elite;
    keptSet.delete(replaceRow.smiles);
    keptSet.add(sm);
  }

  return kept.sort(compareSurvivors).slice(0, survivorCount);
}
