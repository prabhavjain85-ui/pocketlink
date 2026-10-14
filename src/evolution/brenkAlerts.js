/** Lazy Brenk SMARTS matching via RDKit WASM. */

let brenkPatterns = null;

export async function loadBrenkPatterns() {
  if (brenkPatterns) return brenkPatterns;
  const mod = await import("./brenkPatterns.js");
  brenkPatterns = mod.BRENK_PATTERNS || [];
  return brenkPatterns;
}

function countSubstructMatches(RDKit, mol, smarts) {
  try {
    const q = RDKit.get_qmol(smarts);
    if (!q || typeof mol.get_substruct_matches !== "function") return 0;
    const raw = mol.get_substruct_matches(q);
    if (q.delete) q.delete();
    if (!raw) return 0;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length;
        if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
      } catch {
        return 0;
      }
    }
    if (Array.isArray(raw)) return raw.length;
    if (typeof raw === "object") return Object.keys(raw).length;
    return 0;
  } catch {
    return 0;
  }
}

export async function countBrenkAlerts(RDKit, smiles) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return { count: 0, hits: [] };
  const patterns = await loadBrenkPatterns();
  let mol = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return { count: 0, hits: [] };
    const hits = [];
    for (const row of patterns) {
      if (countSubstructMatches(RDKit, mol, row.smarts) > 0) {
        hits.push({ id: row.id, name: row.name, catalog: row.catalog || "Brenk", family: "brenk" });
      }
    }
    return { count: hits.length, hits };
  } finally {
    if (mol) mol.delete();
  }
}

export function getLoadedBrenkPatternCount() {
  return brenkPatterns?.length ?? 0;
}
