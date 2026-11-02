/**
 * Structural similarity to the co-crystallised reference ligand.
 *
 * The curated target rules in scoreCandidates.js recognise compounds by NAME,
 * so they say nothing about a molecule that is not already a named drug. This
 * module adds the one target-specific signal that works for any structure:
 * Morgan (ECFP4-style, radius 2, 2048-bit) Tanimoto similarity between the
 * candidate and the ligand co-crystallised in the staged PDB entry.
 *
 * It is a 2D fingerprint comparison, not docking: it says "this molecule looks
 * like the thing that was bound in this structure", never that it binds.
 */
import { getRDKit } from "./rdkitLoader.js";
import { fetchChemComp } from "./rcsbCocrystalSearch.js";

const FP_RADIUS = 2;
const FP_BITS = 2048;
const MAX_CACHED_FINGERPRINTS = 20000;

export const SIMILARITY_METHOD_NOTE =
  "Structural similarity is the Tanimoto coefficient between Morgan fingerprints (radius 2, 2048 bits) of the candidate and the ligand co-crystallised in the staged PDB entry. It measures 2D chemical resemblance only — it is not docking and does not estimate binding.";

/** Popcount for one byte, so Tanimoto is computed over bits, not bytes. */
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i += 1) {
  let count = 0;
  let value = i;
  while (value) {
    count += value & 1;
    value >>= 1;
  }
  POPCOUNT[i] = count;
}

/** Bitwise Tanimoto over packed fingerprints. */
export function tanimotoBits(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    intersection += POPCOUNT[a[i] & b[i]];
    union += POPCOUNT[a[i] | b[i]];
  }
  return union ? intersection / union : 0;
}

const fingerprintCache = new Map();

function fingerprintFor(RDKit, smiles) {
  const key = String(smiles || "").trim();
  if (!key) return null;
  if (fingerprintCache.has(key)) return fingerprintCache.get(key);

  let mol = null;
  let fp = null;
  try {
    mol = RDKit.get_mol(key);
    if (mol) fp = mol.get_morgan_fp_as_uint8array(JSON.stringify({ radius: FP_RADIUS, nBits: FP_BITS }));
  } catch {
    fp = null;
  } finally {
    mol?.delete?.();
  }

  if (fingerprintCache.size >= MAX_CACHED_FINGERPRINTS) fingerprintCache.clear();
  fingerprintCache.set(key, fp || null);
  return fp || null;
}

function candidateSmiles(candidate) {
  return String(candidate?.canonicalSmiles || candidate?.smiles || candidate?.CanonicalSMILES || "").trim();
}

function ligandCompId(protein) {
  const ligand = protein?.ligand || (Array.isArray(protein?.ligands) ? protein.ligands[0] : null);
  const direct = ligand?.compId || ligand?.comp_id || ligand?.id;
  return String(direct || "").trim().toUpperCase();
}

/**
 * SMILES of the structure's co-crystallised ligand. Uses a SMILES already on
 * the ligand record when the caller has one, and only then asks RCSB.
 */
export async function referenceLigandSmiles(protein) {
  const ligand = protein?.ligand || (Array.isArray(protein?.ligands) ? protein.ligands[0] : null);
  const compId = ligandCompId(protein);
  const known = String(ligand?.smiles || ligand?.SMILES || "").trim();
  if (known) return { compId, smiles: known, reason: "" };
  if (!compId) return { compId: "", smiles: "", reason: "No co-crystallised ligand on this structure." };

  const record = await fetchChemComp(compId);
  if (!record) return { compId, smiles: "", reason: `RCSB has no chemical component record for ${compId}.` };

  const descriptor = record.rcsb_chem_comp_descriptor || {};
  let smiles = String(descriptor.SMILES_stereo || descriptor.SMILES || "").trim();
  if (!smiles) {
    const list = Array.isArray(record.pdbx_chem_comp_descriptor) ? record.pdbx_chem_comp_descriptor : [];
    const canonical = list.find((d) => /^SMILES_CANONICAL$/i.test(d?.type)) || list.find((d) => /^SMILES$/i.test(d?.type));
    smiles = String(canonical?.descriptor || "").trim();
  }
  if (!smiles) return { compId, smiles: "", reason: `No SMILES descriptor published for ${compId}.` };
  return { compId, smiles, reason: "" };
}

/**
 * Set `structuralSimilarity` (0–1) on each candidate, in place.
 * Mutates rather than copies so callers can annotate large libraries cheaply.
 *
 * @returns {Promise<{available: boolean, compId: string, referenceSmiles: string, scored: number, reason: string}>}
 */
export async function annotateStructuralSimilarity(candidates, protein) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const miss = (reason, compId = "") => ({ available: false, compId, referenceSmiles: "", scored: 0, reason });

  if (!rows.length) return miss("No candidates to compare.");

  const reference = await referenceLigandSmiles(protein);
  if (!reference.smiles) return miss(reference.reason, reference.compId);

  const RDKit = await getRDKit();
  if (!RDKit) return miss("RDKit WASM did not load, so similarity was skipped.", reference.compId);

  const referenceFp = fingerprintFor(RDKit, reference.smiles);
  if (!referenceFp) {
    return miss(`RDKit could not parse the reference ligand (${reference.compId}).`, reference.compId);
  }

  let scored = 0;
  for (const candidate of rows) {
    const smiles = candidateSmiles(candidate);
    if (!smiles) continue;
    const fp = fingerprintFor(RDKit, smiles);
    const similarity = fp ? tanimotoBits(referenceFp, fp) : null;
    if (similarity === null) continue;
    candidate.structuralSimilarity = similarity;
    candidate.structuralSimilarityRef = reference.compId;
    scored += 1;
  }

  return {
    available: scored > 0,
    compId: reference.compId,
    referenceSmiles: reference.smiles,
    scored,
    reason: scored ? "" : "No candidate SMILES could be parsed.",
  };
}

export const __testing = { fingerprintCache, FP_RADIUS, FP_BITS };
