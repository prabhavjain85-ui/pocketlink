/**
 * In-browser SA score (Ertl & Schuffenhauer), sparse Morgan radius-2 counts + fragment remap.
 */

import { getSparseMorganCountFingerprint } from "./morganSparseCount.js";
import { nodeRequire } from "../nodeRequire.js";

const REMAP_URL = `${process.env.PUBLIC_URL || ""}/data/evolution/sa-folded-remap.bin.gz`;
const CALIB_URL = `${process.env.PUBLIC_URL || ""}/data/evolution/sa-calibration.json`;

let remapPromise = null;
let remapCache = null;
let calibCache = null;
let loadError = null;

async function gunzip(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Gzip decompression unavailable (need DecompressionStream or Node zlib)");
  }
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

async function loadRemap() {
  if (remapCache) return remapCache;
  if (loadError) throw loadError;
  if (!remapPromise) {
    remapPromise = (async () => {
      let bytes;
      const useFs =
        typeof process !== "undefined" &&
        (process.env.JEST_WORKER_ID !== undefined || typeof window === "undefined");
      if (useFs) {
        const req = nodeRequire();
        const fs = req("fs");
        const path = req("path");
        const zlib = req("zlib");
        const file = path.join(process.cwd(), "public/data/evolution/sa-folded-remap.bin.gz");
        bytes = zlib.gunzipSync(fs.readFileSync(file));
      } else {
        const res = await fetch(REMAP_URL);
        if (!res.ok) throw new Error(`SA remap asset missing (${res.status})`);
        const raw = new Uint8Array(await res.arrayBuffer());
        bytes = await gunzip(raw);
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const remap = new Float32Array(2048);
      for (let i = 0; i < 2048; i += 1) remap[i] = view.getFloat32(i * 4, true);
      remapCache = remap;
      return remap;
    })().catch((err) => {
      loadError = err;
      remapPromise = null;
      throw err;
    });
  }
  return remapPromise;
}

function parseDescriptors(mol) {
  try {
    return JSON.parse(mol.get_descriptors() || "{}");
  } catch {
    return {};
  }
}

function macrocycleCount(mol) {
  try {
    const json = JSON.parse(mol.get_json() || "{}");
    const rings = json?.molecules?.[0]?.extensions?.find((e) => e.name === "rdkitRepresentation")?.atomRings || [];
    return rings.filter((r) => r.length > 6).length;
  } catch {
    return 0;
  }
}

function complexityPenalty(desc, nf) {
  const nAtoms = Number(desc.NumHeavyAtoms || desc.NumAtoms || 0);
  const nChiral = Number(desc.NumAtomStereoCenters || 0) + Number(desc.NumUnspecifiedAtomStereoCenters || 0);
  const nSpiro = Number(desc.NumSpiroAtoms || 0);
  const nBridge = Number(desc.NumBridgeheadAtoms || 0);
  const nMacrocycles = Number(desc._saMacrocycles || 0);

  const sizePenalty = Math.pow(nAtoms, 1.005) - nAtoms;
  const stereoPenalty = Math.log10(nChiral + 1);
  const spiroPenalty = Math.log10(nSpiro + 1);
  const bridgePenalty = Math.log10(nBridge + 1);
  let macrocyclePenalty = 0;
  if (nMacrocycles > 0) macrocyclePenalty = Math.log10(2);

  let score2 = 0 - sizePenalty - stereoPenalty - spiroPenalty - bridgePenalty - macrocyclePenalty;

  let score3 = 0;
  if (nAtoms > nf && nf > 0) score3 = Math.log(nAtoms / nf) * 0.5;

  return { score2, score3, nAtoms };
}

function fragmentMeanFromSparse(counts, remap) {
  let score1 = 0;
  let nf = 0;
  for (const [bitId, cnt] of counts.entries()) {
    const sc = remap[bitId % 2048];
    score1 += sc * cnt;
    nf += cnt;
  }
  return { score1: score1 / Math.max(1, nf), nf };
}

async function loadCalibration() {
  if (calibCache) return calibCache;
  const useFs =
    typeof process !== "undefined" &&
    (process.env.JEST_WORKER_ID !== undefined || typeof window === "undefined");
  if (useFs) {
    const req = nodeRequire();
    const fs = req("fs");
    const path = req("path");
    calibCache = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "public/data/evolution/sa-calibration.json"), "utf8")
    );
    return calibCache;
  }
  const res = await fetch(CALIB_URL);
  if (!res.ok) throw new Error(`SA calibration missing (${res.status})`);
  calibCache = await res.json();
  return calibCache;
}

function rescaleSa(raw) {
  const min = -4.0;
  const max = 2.5;
  let sascore = 11.0 - ((raw - min + 1) / (max - min)) * 9.0;
  if (sascore > 8.0) sascore = 8.0 + Math.log(sascore + 1.0 - 9.0);
  if (sascore > 10.0) sascore = 10.0;
  else if (sascore < 1.0) sascore = 1.0;
  return sascore;
}

export function normalizeMolForSa(RDKit, smilesOrMol) {
  if (!RDKit) return null;
  let mol = smilesOrMol;
  let owned = false;
  if (typeof smilesOrMol === "string") {
    mol = RDKit.get_mol(smilesOrMol);
    owned = true;
  } else if (mol && typeof mol.copy === "function") {
    mol = mol.copy();
    owned = true;
  }
  if (!mol) return null;
  try {
    if (typeof mol.is_valid === "function" && !mol.is_valid()) {
      if (owned) mol.delete();
      return null;
    }
    if (typeof mol.remove_hs_in_place === "function") mol.remove_hs_in_place();
    const canon = String(mol.get_smiles() || "").trim();
    if (owned) mol.delete();
    if (!canon) return null;
    const normalized = RDKit.get_mol(canon);
    if (!normalized || (typeof normalized.is_valid === "function" && !normalized.is_valid())) {
      normalized?.delete?.();
      return null;
    }
    return normalized;
  } catch {
    if (owned && mol) mol.delete();
    return null;
  }
}

export async function calculateSaScore(RDKit, smilesOrMol) {
  if (!RDKit) return { ok: false, error: "RDKit not loaded" };
  const mol = normalizeMolForSa(RDKit, smilesOrMol);
  const owned = true;
  if (!mol) return { ok: false, error: "Invalid molecule" };
  try {
    const remap = await loadRemap();
    const counts = getSparseMorganCountFingerprint(mol, 2);
    const { score1, nf } = fragmentMeanFromSparse(counts, remap);
    const desc = parseDescriptors(mol);
    desc._saMacrocycles = macrocycleCount(mol);
    const { score2, score3 } = complexityPenalty(desc, nf);
    const raw = score1 + score2 + score3;
    let sa = rescaleSa(raw);
    try {
      const cal = await loadCalibration();
      const a = cal?.rawToSa?.a ?? 0;
      const b = cal?.rawToSa?.b ?? 0;
      if (a || b) {
        const mapped = a * raw + b;
        sa = Math.max(1, Math.min(10, mapped));
      }
    } catch {
      // keep rescaleSa
    }
    return {
      ok: true,
      saScore: Number(sa.toFixed(3)),
      raw: Number(raw.toFixed(4)),
      fragmentMean: Number(score1.toFixed(4)),
      nf,
    };
  } catch (err) {
    return { ok: false, error: err?.message || "SA scoring failed" };
  } finally {
    if (owned && mol && typeof mol.delete === "function") mol.delete();
  }
}

export async function preloadSaAssets() {
  await loadRemap();
  return true;
}

let saSupportChecked = false;
let saSupportOk = false;

export function detectSaScoreSupport() {
  if (saSupportChecked) {
    return saSupportOk
      ? { saScore: true, reason: "Sparse Morgan SA (remap asset loaded)" }
      : { saScore: false, reason: loadError?.message || "SA assets failed to load" };
  }
  return { saScore: false, reason: "SA assets not loaded yet" };
}

export async function probeSaScoreSupport() {
  try {
    await preloadSaAssets();
    saSupportOk = true;
  } catch (err) {
    saSupportOk = false;
    loadError = err;
  }
  saSupportChecked = true;
  return detectSaScoreSupport();
}
