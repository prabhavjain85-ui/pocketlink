/**
 * Deterministic PAINS + toxicophore checks using RDKit.js (WASM).
 *
 * RDKit-JS MinimalLib does not expose FilterCatalog, so this loads the same
 * official wehi_pains.csv SMARTS that Python RDKit's PAINS_A/B/C catalogs use
 * and matches them with get_qmol + get_substruct_match.
 */

const catalog = require("./painsCatalog.json");

const CACHE = new Map();
let rdkitPromise = null;
let compiledPromise = null;

function wasmPath() {
  return require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
}

function getRDKit() {
  if (!rdkitPromise) {
    const initRDKitModule = require("@rdkit/rdkit");
    rdkitPromise = initRDKitModule({ locateFile: () => wasmPath() });
  }
  return rdkitPromise;
}

function hasSubstructMatch(mol, qmol) {
  if (!mol || !qmol) return false;
  const raw = mol.get_substruct_match(qmol);
  if (!raw || raw === "{}") return false;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.atoms) && parsed.atoms.length > 0;
  } catch {
    return false;
  }
}

function compileRow(RDKit, row) {
  const qmol = RDKit.get_qmol(row.smarts);
  if (!qmol || (typeof qmol.is_valid === "function" && !qmol.is_valid())) {
    if (qmol) qmol.delete();
    return null;
  }
  return { ...row, qmol };
}

function getCompiled() {
  if (!compiledPromise) {
    compiledPromise = getRDKit().then((RDKit) => {
      const pains = [];
      const skipped = [];
      for (const row of catalog.pains) {
        const compiled = compileRow(RDKit, row);
        if (compiled) pains.push(compiled);
        else skipped.push(row.pattern);
      }
      const toxicophores = [];
      for (const row of catalog.toxicophores) {
        const compiled = compileRow(RDKit, {
          family: "toxicophore",
          catalog: "toxicophore",
          pattern: row.smarts,
          ...row,
        });
        if (compiled) toxicophores.push(compiled);
        else skipped.push(row.id);
      }
      return { RDKit, pains, toxicophores, skipped };
    });
  }
  return compiledPromise;
}

function uniqueAlerts(alerts) {
  const seen = new Set();
  const out = [];
  for (const alert of alerts) {
    const key = `${alert.family}::${alert.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alert);
  }
  return out;
}

function unable(smiles, cid, reason) {
  return {
    cid: cid == null ? "" : String(cid).trim(),
    smiles: smiles == null ? "" : String(smiles).trim(),
    status: "unable",
    hasAlerts: false,
    checked: false,
    alerts: [],
    reason: reason || "Unable to check",
  };
}

function toAlert(row) {
  return {
    family: row.family,
    catalog: row.catalog,
    id: row.id,
    name: row.name,
    pattern: row.pattern,
    explanation: row.explanation,
  };
}

async function checkSmiles(smiles, cid = "") {
  const raw = smiles == null ? "" : String(smiles).trim();
  const id = cid == null ? "" : String(cid).trim();
  if (!raw) return unable(raw, id, "Missing SMILES");

  const cacheKey = `${id}::${raw}`;
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const { RDKit, pains, toxicophores } = await getCompiled();
  const mol = RDKit.get_mol(raw);
  if (!mol || (typeof mol.is_valid === "function" && !mol.is_valid())) {
    if (mol) mol.delete();
    const result = unable(raw, id, "Invalid SMILES");
    CACHE.set(cacheKey, result);
    return result;
  }

  const alerts = [];
  try {
    for (const row of pains) {
      if (hasSubstructMatch(mol, row.qmol)) alerts.push(toAlert(row));
    }
    for (const row of toxicophores) {
      if (hasSubstructMatch(mol, row.qmol)) alerts.push(toAlert(row));
    }
  } finally {
    mol.delete();
  }

  const unique = uniqueAlerts(alerts);
  const result = {
    cid: id,
    smiles: raw,
    status: unique.length ? "alert" : "clean",
    hasAlerts: unique.length > 0,
    checked: true,
    alerts: unique,
    reason: null,
  };
  CACHE.set(cacheKey, result);
  return result;
}

async function checkCompounds(compounds) {
  const rows = (Array.isArray(compounds) ? compounds : []).slice(0, 5);
  const results = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") {
      results.push(await checkSmiles("", ""));
      continue;
    }
    const cid = item.cid || item.CID || "";
    const smiles = item.smiles || item.SMILES || item.IsomericSMILES || "";
    results.push(await checkSmiles(smiles, cid));
  }
  return results;
}

async function engineInfo() {
  const { RDKit, pains, toxicophores, skipped } = await getCompiled();
  return {
    engine: "rdkit-js",
    rdkitVersion: RDKit.version(),
    painsPatterns: pains.length,
    toxicophorePatterns: toxicophores.length,
    skippedPatterns: skipped.length,
    wasmBytes: require("fs").statSync(wasmPath()).size,
  };
}

module.exports = {
  checkSmiles,
  checkCompounds,
  engineInfo,
  getCompiled,
  wasmPath,
};
