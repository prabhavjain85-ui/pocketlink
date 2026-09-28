/**
 * Medicinal-chemistry style RDKit reaction SMARTS.
 * Generation is RDKit-only — no model-invented SMILES.
 */

export const EVOLUTION_TRANSFORMS = [
  { id: "acid_to_tetrazole", label: "Carboxylic acid → tetrazole", smarts: "[C:1](=[O:2])[OH]>>[C:1]1=NNN=N1" },
  { id: "tetrazole_to_acid", label: "Tetrazole → carboxylic acid", smarts: "[C:1]1=NNN=N1>>[C:1](=[O])O" },
  { id: "amide_to_sulfonamide", label: "Amide → sulfonamide (N-side)", smarts: "[C:1](=[O:2])[N:3]>>[S:1](=[O:2])(=[O])[N:3]" },
  { id: "add_methyl_anilino", label: "Add methyl to aromatic carbon", smarts: "[cH:1]>>[c:1]C" },
  { id: "remove_aryl_methyl", label: "Remove aryl methyl", smarts: "[c:1][CH3]>>[cH:1]" },
  { id: "h_to_f_aryl", label: "Aryl H → F", smarts: "[cH:1]>>[c:1]F" },
  { id: "h_to_cl_aryl", label: "Aryl H → Cl", smarts: "[cH:1]>>[c:1]Cl" },
  { id: "f_to_cl_aryl", label: "Aryl F → Cl", smarts: "[c:1]F>>[c:1]Cl" },
  { id: "cl_to_f_aryl", label: "Aryl Cl → F", smarts: "[c:1]Cl>>[c:1]F" },
  { id: "add_aryl_oh", label: "Add aryl hydroxyl", smarts: "[cH:1]>>[c:1]O" },
  { id: "remove_phenol", label: "Remove phenol OH", smarts: "[c:1][OH]>>[cH:1]" },
  { id: "add_aryl_nh2", label: "Add aryl amine", smarts: "[cH:1]>>[c:1]N" },
  { id: "oh_to_ome", label: "Phenol → methoxy", smarts: "[c:1][OH]>>[c:1]OC" },
  { id: "ome_to_oh", label: "Methoxy → phenol", smarts: "[c:1]OC>>[c:1]O" },
  { id: "piperazine_nme_to_nh", label: "N-methyl piperazine → NH", smarts: "[N:1][CH3]>>[N:1]" },
  { id: "amine_nh_to_nme", label: "Secondary amine → N-methyl", smarts: "[NH:1]>>[N:1]C" },
];

export function detectReactionSupport(RDKit) {
  if (!RDKit) return { reactions: false, reason: "RDKit WASM not loaded" };
  if (typeof RDKit.get_rxn !== "function") {
    return { reactions: false, reason: "This WASM build has no get_rxn()" };
  }
  try {
    const rxn = RDKit.get_rxn("[C:1][OH]>>[C:1]O");
    const ok = Boolean(rxn);
    if (rxn && typeof rxn.delete === "function") rxn.delete();
    return { reactions: ok, reason: ok ? "get_rxn available" : "get_rxn returned empty" };
  } catch (err) {
    return { reactions: false, reason: err?.message || "get_rxn threw" };
  }
}

function sanitizeMol(RDKit, mol) {
  if (!mol) return null;
  try {
    if (typeof mol.is_valid === "function" && !mol.is_valid()) {
      mol.delete();
      return null;
    }
  } catch {
    // older builds have no is_valid
  }
  return mol;
}

export function canonicalizeSmiles(RDKit, smiles) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return "";
  let mol = null;
  try {
    mol = sanitizeMol(RDKit, RDKit.get_mol(raw));
    if (!mol) return "";
    return String(mol.get_smiles() || "").trim();
  } catch {
    return "";
  } finally {
    if (mol && typeof mol.delete === "function") mol.delete();
  }
}

export function molSvg(RDKit, smiles, width = 220, height = 160) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return "";
  let mol = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return "";
    if (typeof mol.get_svg_with_highlights === "function") {
      return mol.get_svg_with_highlights(JSON.stringify({ width, height }));
    }
    return mol.get_svg(width, height);
  } catch {
    return "";
  } finally {
    if (mol && typeof mol.delete === "function") mol.delete();
  }
}

function productsFromReaction(RDKit, smiles, smarts) {
  const products = [];
  let mol = null;
  let rxn = null;
  try {
    mol = RDKit.get_mol(smiles);
    rxn = RDKit.get_rxn(smarts);
    if (!mol || !rxn || typeof rxn.run_reactants !== "function") return products;
    const raw = rxn.run_reactants([mol]);
    const lists = raw || [];
    for (const list of lists) {
      const members = list && typeof list.size === "function"
        ? Array.from({ length: list.size() }, (_, i) => (typeof list.at === "function" ? list.at(i) : list.get(i)))
        : Array.isArray(list) ? list : [];
      for (const prod of members) {
        if (!prod) continue;
        try {
          const smi = String(prod.get_smiles?.() || "").trim();
          if (smi) products.push(smi);
        } catch {
          // ignore
        }
        if (typeof prod.delete === "function") prod.delete();
      }
      if (list && typeof list.delete === "function") list.delete();
    }
  } catch {
    // invalid reaction application
  } finally {
    if (mol && typeof mol.delete === "function") mol.delete();
    if (rxn && typeof rxn.delete === "function") rxn.delete();
  }
  return products;
}

export function generateValidatedVariants(RDKit, parentSmiles, { seen = new Set(), limit = 20 } = {}) {
  const parent = canonicalizeSmiles(RDKit, parentSmiles);
  const discarded = { parseFail: 0, duplicate: 0 };
  const variants = [];
  if (!parent) {
    return { parent: "", variants, discarded: { ...discarded, parseFail: 1 }, reactionSupport: detectReactionSupport(RDKit) };
  }
  seen.add(parent);
  const support = detectReactionSupport(RDKit);
  if (!support.reactions) {
    return { parent, variants, discarded, reactionSupport: support };
  }
  const bag = [];
  for (const transform of EVOLUTION_TRANSFORMS) {
    const products = productsFromReaction(RDKit, parent, transform.smarts);
    for (const raw of products) {
      const canon = canonicalizeSmiles(RDKit, raw);
      if (!canon) {
        discarded.parseFail += 1;
        continue;
      }
      if (seen.has(canon) || canon === parent) {
        discarded.duplicate += 1;
        continue;
      }
      seen.add(canon);
      bag.push({ smiles: canon, parentSmiles: parent, editId: transform.id, editLabel: transform.label });
    }
  }
  const byEdit = new Map();
  for (const row of bag) {
    if (!byEdit.has(row.editId)) byEdit.set(row.editId, []);
    byEdit.get(row.editId).push(row);
  }
  const keys = [...byEdit.keys()];
  let guard = 0;
  while (variants.length < limit && guard < bag.length + 8) {
    let added = false;
    for (const key of keys) {
      const list = byEdit.get(key);
      if (list && list.length && variants.length < limit) {
        variants.push(list.shift());
        added = true;
      }
    }
    if (!added) break;
    guard += 1;
  }
  return { parent, variants, discarded, reactionSupport: support };
}
