/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export function detectReactionSupport(RDKit) {
  if (!RDKit) return { reactions: false, reason: "RDKit WASM not loaded" };
  if (typeof RDKit.get_rxn !== "function") {
    return { reactions: false, reason: "This WASM build has no get_rxn()" };
  }
  if (typeof RDKit.MolList !== "function") {
    return { reactions: false, reason: "This WASM build has no MolList (required by run_reactants)" };
  }
  try {
    const rxn = RDKit.get_rxn("[C:1][OH]>>[C:1]O");
    const ok = Boolean(rxn);
    if (rxn && typeof rxn.delete === "function") rxn.delete();
    return { reactions: ok, reason: ok ? "get_rxn + MolList available" : "get_rxn returned empty" };
  } catch (err) {
    return { reactions: false, reason: err?.message || "get_rxn threw" };
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
