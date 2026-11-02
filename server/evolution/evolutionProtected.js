import { murckoScaffoldSmiles, subgraphSmilesFromAtomIndices } from "./evolutionMurcko.js";

export function resolveProtectedQuery(RDKit, seedSmiles, { protectedSmarts, protectedAtomIndices } = {}) {
  const custom = String(protectedSmarts || "").trim();
  if (custom) return { ok: true, smarts: custom, source: "user-smarts" };

  const idx = (protectedAtomIndices || []).filter((n) => Number.isFinite(n));
  if (idx.length && RDKit && seedSmiles) {
    const sub = subgraphSmilesFromAtomIndices(RDKit, seedSmiles, idx);
    if (!sub.ok) return sub;
    return { ok: true, smarts: sub.smiles, atomIndices: idx, source: "atom-selection" };
  }

  const murcko = murckoScaffoldSmiles(RDKit, seedSmiles);
  if (!murcko.ok) return murcko;
  return { ok: true, smarts: murcko.smiles, source: "murcko-scaffold", murckoSmiles: murcko.smiles };
}

export function preservesProtectedSubstructure(RDKit, variantSmiles, query) {
  if (!query?.smarts || !RDKit) return { ok: true };
  const smi = String(variantSmiles || "").trim();
  if (!smi) return { ok: false, error: "Empty variant" };
  let mol = null;
  let q = null;
  try {
    mol = RDKit.get_mol(smi);
    q = RDKit.get_qmol(query.smarts);
    if (!mol || !q) return { ok: false, error: "Substructure query parse failed" };
    const match = mol.get_substruct_match(q);
    if (!match) {
      return { ok: false, error: "Protected substructure broken", gated: true };
    }
    return { ok: true };
  } finally {
    mol?.delete?.();
    q?.delete?.();
  }
}
