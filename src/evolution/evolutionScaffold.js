/** Murcko scaffold bucketing (generic + display). */

export function murckoKeys(RDKit, smiles) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return { generic: "unknown", display: raw };
  let mol = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return { generic: "unknown", display: raw };
    const json = JSON.parse(mol.get_json() || "{}");
    const ext = json?.molecules?.[0]?.extensions?.find((e) => e.name === "rdkitRepresentation");
    const rings = ext?.atomRings || [];
    const ringAtoms = new Set();
    for (const r of rings) for (const a of r) ringAtoms.add(a);
    const generic = ringAtoms.size ? `ring-${[...ringAtoms].sort((a, b) => a - b).join("-")}` : `acyclic-${json.molecules[0].atoms.length}`;
    return { generic, display: raw.slice(0, 48) };
  } catch {
    return { generic: "unknown", display: raw };
  } finally {
    if (mol) mol.delete();
  }
}

export function applyScaffoldQuota(population, maxShare = 0.25) {
  const n = population.length;
  const cap = Math.ceil(maxShare * n);
  const buckets = new Map();
  for (const ind of population) {
    const k = ind.bucket || "unknown";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(ind);
  }
  const out = [];
  for (const [, list] of buckets) {
    const sorted = list.slice().sort((a, b) => (b.crowding ?? 0) - (a.crowding ?? 0) || (b.displayScore ?? 0) - (a.displayScore ?? 0));
    out.push(...sorted.slice(0, cap));
  }
  return out.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || (b.displayScore ?? 0) - (a.displayScore ?? 0));
}
