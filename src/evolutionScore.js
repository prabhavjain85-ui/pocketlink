import { calculateAdmeProperties } from "./admeCalculator";
import { checkPainsFast } from "./painsCheck";
import { loadApprovedDrugs } from "./approvedDrugs";
import { pdbIdOf } from "./rankingCache";

const { scoreOne } = require("./scoreCandidates");

const MEMORY = new Map();
const STORAGE_KEY = "pocketlink-evo-score-v1";
let sessionLoaded = false;

export function evolutionCacheKey(pdbId, smiles) {
  return `${String(pdbId || "NONE").toUpperCase()}_${String(smiles || "").trim()}`;
}

function ensureLoaded() {
  if (sessionLoaded) return;
  sessionLoaded = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
    for (const [k, v] of Object.entries(raw)) {
      if (!MEMORY.has(k)) MEMORY.set(k, v);
    }
  } catch {
    // ignore
  }
}

function persist() {
  if (typeof sessionStorage === "undefined") return;
  try {
    const obj = {};
    for (const [k, v] of MEMORY.entries()) obj[k] = v;
    const keys = Object.keys(obj);
    const bounded = keys.length > 400
      ? Object.fromEntries(keys.slice(-400).map((k) => [k, obj[k]]))
      : obj;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // quota
  }
}

export function detectSaScoreSupport(RDKit) {
  if (!RDKit) return { saScore: false, reason: "RDKit WASM not loaded" };
  const names = ["get_sa_score", "SA_Score", "getSAScore"];
  for (const name of names) {
    if (typeof RDKit[name] === "function") {
      return { saScore: true, reason: `${name} available` };
    }
  }
  return {
    saScore: false,
    reason: "This RDKit-JS build does not ship synthetic-accessibility (SA_Score). Skipping rather than faking it.",
  };
}

function candidateFromAdme(smiles, adme) {
  const p = adme?.properties || {};
  return {
    CID: "",
    cid: "",
    displayName: adme?.compoundName || "Evolved variant",
    name: adme?.compoundName || "Evolved variant",
    IsomericSMILES: smiles,
    CanonicalSMILES: adme?.canonicalSmiles || smiles,
    SMILES: smiles,
    MolecularWeight: p.mw,
    XLogP: p.logp,
    HBondDonorCount: p.hbd,
    HBondAcceptorCount: p.hba,
    RotatableBondCount: p.rotb,
    TPSA: p.tpsa,
  };
}

export function knownInApprovedLibrary(canonicalSmiles) {
  const target = String(canonicalSmiles || "").trim();
  if (!target) return null;
  let drugs;
  try {
    drugs = loadApprovedDrugs();
  } catch {
    return null;
  }
  const hit = drugs.find((d) => String(d.smiles || "").trim() === target);
  return hit || null;
}

export async function lookupPubChemExact(smiles) {
  const raw = String(smiles || "").trim();
  if (!raw) return { known: false };
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(raw)}/cids/JSON`;
    const res = await fetch(url);
    if (!res.ok) return { known: false };
    const data = await res.json();
    const cid = data?.IdentifierList?.CID?.[0];
    if (cid) return { known: true, cid: String(cid), source: "pubchem" };
  } catch {
    // network optional
  }
  return { known: false };
}

export function noveltyBadge({ smiles, pubchem }) {
  const approved = knownInApprovedLibrary(smiles);
  if (approved) {
    return { kind: "known", label: "Already known", detail: `Matches approved library: ${approved.name}` };
  }
  if (pubchem?.known) {
    return { kind: "known", label: "Already known", detail: `PubChem CID ${pubchem.cid}` };
  }
  return { kind: "novel", label: "Novel", detail: "Not in the local approved-drug library" };
}

export async function scoreEvolvedMolecule({ smiles, parentSmiles, referenceSmiles, protein, RDKit }) {
  const canon = String(smiles || "").trim();
  if (!canon) return { ok: false, error: "Empty SMILES" };
  const pdb = pdbIdOf(protein);
  const key = evolutionCacheKey(pdb, canon);
  ensureLoaded();
  if (MEMORY.has(key)) {
    return { ok: true, cached: true, ...MEMORY.get(key) };
  }

  const adme = await calculateAdmeProperties(canon, { name: "Evolved variant" });
  if (!adme?.valid) {
    return { ok: false, error: adme?.error || "ADME parse failed" };
  }

  const candidate = candidateFromAdme(canon, adme);
  const pains = checkPainsFast(candidate);
  candidate.pains = pains;
  const ranked = scoreOne(candidate, protein);
  const sa = detectSaScoreSupport(RDKit);

  const lipinskiPass = adme.druglikeness?.lipinski?.pass;
  const veberPass = adme.druglikeness?.veber?.pass;
  const organFlags = adme.organToxicity?.organs
    ? Object.entries(adme.organToxicity.organs)
        .filter(([, v]) => v && (v.risk === "high" || v.flag || v.alert))
        .map(([k]) => k)
    : [];

  const payload = {
    smiles: adme.canonicalSmiles || canon,
    score: Number(ranked?.score ?? 0),
    reasoning: ranked?.reasoning || [],
    strengths: ranked?.strengths || [],
    concerns: ranked?.concerns || [],
    source: ranked?.source || "heuristic-v2",
    lipinski: adme.druglikeness?.lipinski || null,
    veber: adme.druglikeness?.veber || null,
    admeFlags: {
      lipinskiPass: Boolean(lipinskiPass),
      veberPass: Boolean(veberPass),
      gi: adme.pharmacokinetics?.boiledEgg?.giAbsorption || "",
    },
    organFlags,
    pains,
    saScore: null,
    saSupport: sa,
    referenceSmiles: referenceSmiles || parentSmiles || canon,
    parentSmiles: parentSmiles || null,
  };

  MEMORY.set(key, payload);
  persist();
  return { ok: true, cached: false, ...payload };
}
