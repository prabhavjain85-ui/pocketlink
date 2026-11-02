/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;

export function targetDisplayName(protein) {
  if (!protein) return "";
  const q = String(protein.queryName || protein.name || "").trim();
  if (q && !PDB_ID_RE.test(q)) return q;
  const title = String(protein.title || "").trim();
  if (title && title.length <= 80) return title;
  if (title) return `${title.slice(0, 77)}…`;
  return String(protein.id || protein.pdb_id || "");
}
