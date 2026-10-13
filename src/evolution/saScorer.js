/**
 * In-browser SA score (Ertl & Schuffenhauer), aligned with RDKit sascorer.py.
 * Fragment contributions use a folded Morgan count FP (radius 2, 2048 bits) + remap table
 * built from fpscores.pkl.gz (see scripts/build-sa-folded-remap.mjs).
 */

const REMAP_URL = `${process.env.PUBLIC_URL || ""}/data/evolution/sa-folded-remap.bin.gz`;
const CALIB_URL = `${process.env.PUBLIC_URL || ""}/data/evolution/sa-calibration.json`;
let remapPromise = null;
let remapCache = null;
let calibCache = null;

async function loadRemap() {
  if (remapCache) return remapCache;
  if (!remapPromise) {
    remapPromise = (async () => {
      let bytes;
      const useFs =
        typeof process !== "undefined" &&
        (process.env.JEST_WORKER_ID !== undefined || typeof window === "undefined");
      if (useFs) {
        // eslint-disable-next-line no-eval
        const req = eval("require");
        const fs = req("fs");
        const path = req("path");
        const zlib = req("zlib");
        const file = path.join(process.cwd(), "public/data/evolution/sa-folded-remap.bin.gz");
        bytes = zlib.gunzipSync(fs.readFileSync(file));
      } else {
        const res = await fetch(REMAP_URL);
        if (!res.ok) throw new Error(`SA remap asset missing (${res.status})`);
        const raw = await res.arrayBuffer();
        bytes = new Uint8Array(raw);
        if (typeof DecompressionStream !== "undefined") {
          bytes = await gunzip(bytes);
        }
      }
      const decompressed = bytes;
      const view = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);
      const remap = new Float32Array(2048);
      for (let i = 0; i < 2048; i += 1) remap[i] = view.getFloat32(i * 4, true);
      remapCache = remap;
      return remap;
    })();
  }
  return remapPromise;
}

async function gunzip(bytes) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

function parseDescriptors(mol) {
  try {
    return JSON.parse(mol.get_descriptors() || "{}");
  } catch {
    return {};
  }
}

function complexityPenalty(desc) {
  const nAtoms = Number(desc.NumHeavyAtoms || desc.NumAtoms || 0);
  const nChiral = Number(desc.NumAtomStereoCenters || 0) + Number(desc.NumUnspecifiedAtomStereoCenters || 0);
  const nSpiro = Number(desc.NumSpiroAtoms || 0);
  const nBridge = Number(desc.NumBridgeheadAtoms || 0);
  const nRings = Number(desc.NumRings || 0);
  let nMacrocycles = 0;
  if (nRings > 0 && nAtoms > 45) nMacrocycles = 1;

  const sizePenalty = Math.pow(nAtoms, 1.005) - nAtoms;
  const stereoPenalty = Math.log10(nChiral + 1);
  const spiroPenalty = Math.log10(nSpiro + 1);
  const bridgePenalty = Math.log10(nBridge + 1);
  let macrocyclePenalty = 0;
  if (nMacrocycles > 0) macrocyclePenalty = Math.log10(2);

  let score2 = 0 - sizePenalty - stereoPenalty - spiroPenalty - bridgePenalty - macrocyclePenalty;

  let score3 = 0;
  const numBits = Number(desc._saNumBits || 0);
  if (nAtoms > numBits && numBits > 0) score3 = Math.log(nAtoms / numBits) * 0.5;

  return { score2, score3, nAtoms };
}

function foldedCountFingerprint(mol) {
  const fp = mol.get_morgan_fp(JSON.stringify({ radius: 2, nBits: 2048 }));
  const counts = new Map();
  let nf = 0;
  for (let i = 0; i < fp.length; i += 1) {
    if (fp[i] === "1") {
      counts.set(i, 1);
      nf += 1;
    }
  }
  return { counts, nf };
}

async function loadCalibration() {
  if (calibCache) return calibCache;
  const useFs =
    typeof process !== "undefined" &&
    (process.env.JEST_WORKER_ID !== undefined || typeof window === "undefined");
  if (useFs) {
    // eslint-disable-next-line no-eval
    const req = eval("require");
    const fs = req("fs");
    const path = req("path");
    calibCache = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/evolution/sa-calibration.json"), "utf8"));
    return calibCache;
  }
  const res = await fetch(CALIB_URL);
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

export async function calculateSaScore(RDKit, smilesOrMol) {
  if (!RDKit) return { ok: false, error: "RDKit not loaded" };
  let mol = smilesOrMol;
  let owned = false;
  if (typeof smilesOrMol === "string") {
    mol = RDKit.get_mol(smilesOrMol);
    owned = true;
  }
  if (!mol) return { ok: false, error: "Invalid molecule" };
  try {
    const remap = await loadRemap();
    const { counts, nf } = foldedCountFingerprint(mol);
    let score1 = 0;
    for (const [bit, cnt] of counts.entries()) {
      score1 += remap[bit % 2048] * cnt;
    }
    score1 /= Math.max(1, nf);

    const desc = parseDescriptors(mol);
    desc._saNumBits = counts.size;
    const { score2, score3 } = complexityPenalty(desc);
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
      // keep rescaleSa fallback
    }
    return { ok: true, saScore: Number(sa.toFixed(3)), raw: Number(raw.toFixed(4)), fragmentMean: Number(score1.toFixed(4)) };
  } catch (err) {
    return { ok: false, error: err?.message || "SA scoring failed" };
  } finally {
    if (owned && mol && typeof mol.delete === "function") mol.delete();
  }
}

export function preloadSaAssets() {
  return loadRemap().catch(() => null);
}
