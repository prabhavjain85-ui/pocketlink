/**
 * Bemis–Murcko framework: ring atoms plus linkers with ≥2 scaffold neighbors.
 * Subgraph is materialized via V2000 molblock trimming, then canonicalized in RDKit WASM.
 */

function parseGraph(mol) {
  const json = JSON.parse(mol.get_json() || "{}");
  const block = json?.molecules?.[0];
  if (!block) return null;
  const ext = (block.extensions || []).find((e) => e.name === "rdkitRepresentation") || {};
  const atomRings = ext.atomRings || [];
  const atoms = block.atoms || [];
  const bonds = (block.bonds || []).map((b) => [b.atoms[0], b.atoms[1], b]);
  const n = atoms.length;
  const nbrs = Array.from({ length: n }, () => []);
  for (const [a, b] of bonds) {
    nbrs[a].push(b);
    nbrs[b].push(a);
  }
  return { n, nbrs, atomRings, atoms, bonds };
}

export function murckoScaffoldAtomIndices(mol) {
  const g = parseGraph(mol);
  if (!g) return [];
  const { n, nbrs, atomRings } = g;
  const scaffold = new Set();
  for (const ring of atomRings) {
    for (const a of ring) scaffold.add(a);
  }
  if (!scaffold.size) return [];

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < n; i += 1) {
      if (scaffold.has(i)) continue;
      let hits = 0;
      for (const j of nbrs[i]) {
        if (scaffold.has(j)) hits += 1;
      }
      if (hits >= 2) {
        scaffold.add(i);
        changed = true;
      }
    }
  }
  return [...scaffold].sort((a, b) => a - b);
}

function padAtomSerial(n) {
  return String(n).padStart(3, " ");
}

function submolBlockFromIndices(molblock, keepIdx) {
  const lines = molblock.split(/\r?\n/);
  if (lines.length < 4) return null;
  const counts = lines[3].trim().split(/\s+/).map(Number);
  const nAtoms = counts[0];
  const nBonds = counts[1];
  const atomLines = lines.slice(4, 4 + nAtoms);
  const bondLines = lines.slice(4 + nAtoms, 4 + nAtoms + nBonds);
  const keep = new Set(keepIdx);
  const map = new Map();
  const newAtomLines = [];
  let newIdx = 0;
  for (let i = 0; i < nAtoms; i += 1) {
    if (!keep.has(i)) continue;
    map.set(i, newIdx);
    newAtomLines.push(atomLines[i]);
    newIdx += 1;
  }
  const newBondLines = [];
  for (const line of bondLines) {
    const a = Number(line.slice(0, 3).trim()) - 1;
    const b = Number(line.slice(3, 6).trim()) - 1;
    if (!keep.has(a) || !keep.has(b)) continue;
    const bo = line.slice(6, 9);
    const tail = line.slice(9);
    const na = padAtomSerial(map.get(a) + 1);
    const nb = padAtomSerial(map.get(b) + 1);
    newBondLines.push(`${na}${nb}${bo}${tail}`);
  }
  const header = lines.slice(0, 3);
  const countLine = `${padAtomSerial(newAtomLines.length)}${padAtomSerial(newBondLines.length)}  0  0  0  0  0  0  0  0999 V2000`;
  return [...header, countLine, ...newAtomLines, ...newBondLines, "M  END"].join("\n");
}

export function subgraphSmilesFromAtomIndices(RDKit, smiles, atomIndices) {
  const raw = String(smiles || "").trim();
  const idx = (atomIndices || []).filter((n) => Number.isFinite(n));
  if (!raw || !RDKit || !idx.length) return { ok: false, error: "Missing subgraph atoms" };
  let mol = null;
  let sub = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return { ok: false, error: "Invalid molecule" };
    const block = submolBlockFromIndices(mol.get_molblock(), idx);
    if (!block) return { ok: false, error: "Subgraph molblock failed" };
    sub = RDKit.get_mol(block);
    if (!sub || (typeof sub.is_valid === "function" && !sub.is_valid())) {
      return { ok: false, error: "Subgraph invalid" };
    }
    return { ok: true, smiles: String(sub.get_smiles() || "").trim(), atomIndices: idx };
  } catch (err) {
    return { ok: false, error: err?.message || "Subgraph failed" };
  } finally {
    sub?.delete?.();
    mol?.delete?.();
  }
}

export function murckoScaffoldSmiles(RDKit, smiles) {
  const raw = String(smiles || "").trim();
  if (!raw || !RDKit) return { ok: false, error: "Missing RDKit or SMILES" };
  let mol = null;
  let sub = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol || (typeof mol.is_valid === "function" && !mol.is_valid())) {
      return { ok: false, error: "Invalid molecule" };
    }
    const idx = murckoScaffoldAtomIndices(mol);
    if (!idx.length) {
      const canon = String(mol.get_smiles() || "").trim();
      return { ok: true, smiles: canon, atomIndices: idx };
    }
    const block = submolBlockFromIndices(mol.get_molblock(), idx);
    if (!block) return { ok: false, error: "Murcko molblock trim failed" };
    sub = RDKit.get_mol(block);
    if (!sub || (typeof sub.is_valid === "function" && !sub.is_valid())) {
      return { ok: false, error: "Murcko subgraph invalid" };
    }
    const out = String(sub.get_smiles() || "").trim();
    if (!out) return { ok: false, error: "Empty Murcko SMILES" };
    return { ok: true, smiles: out, atomIndices: idx };
  } catch (err) {
    return { ok: false, error: err?.message || "Murcko failed" };
  } finally {
    if (sub && typeof sub.delete === "function") sub.delete();
    if (mol && typeof mol.delete === "function") mol.delete();
  }
}
