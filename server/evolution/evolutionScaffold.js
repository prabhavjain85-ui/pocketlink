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

export function mergeElites(survivors, parents, survivorCount) {
  const elites = parents.slice(0, Math.min(2, parents.length));
  const out = survivors.slice();
  const have = new Set(out.map((s) => s.smiles));
  for (const e of elites) {
    if (!have.has(e.smiles)) out.push(e);
  }
  out.sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.crowding ?? 0) - (a.crowding ?? 0) || (b.displayScore ?? 0) - (a.displayScore ?? 0)
  );
  if (out.length <= survivorCount) return out.slice(0, survivorCount);
  const kept = out.slice(0, survivorCount);
  for (const e of elites) {
    if (!kept.find((k) => k.smiles === e.smiles)) {
      kept.pop();
      kept.push(e);
    }
  }
  return kept
    .sort(
      (a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.crowding ?? 0) - (a.crowding ?? 0) || (b.displayScore ?? 0) - (a.displayScore ?? 0)
    )
    .slice(0, survivorCount);
}
