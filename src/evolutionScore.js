import { calculateAdmeProperties } from "./admeCalculator";
import { pdbIdOf } from "./rankingCache";
import { desirabilityBundle, computeQED } from "./evolution/evolutionDesirability";
import { calculateSaScore, preloadSaAssets } from "./evolution/saScorer";
import { structuralAlerts, passesHardGates } from "./evolution/evolutionGates";
import { checkPainsFast } from "./painsCheck";
import { maxTanimotoToSet } from "./evolution/evolutionFingerprint";
import { loadApprovedDrugs } from "./approvedDrugs";

const MEMORY = new Map();
const STORAGE_KEY = "pocketlink-evo-score-v4";
let sessionLoaded = false;

export function knownInApprovedLibrary(canonicalSmiles) {
  const target = String(canonicalSmiles || "").trim();
  if (!target) return null;
  try {
    const hit = loadApprovedDrugs().find((d) => String(d.smiles || "").trim() === target);
    return hit || null;
  } catch {
    return null;
  }
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
    // optional
  }
  return { known: false };
}

export function noveltyBadge({ smiles, pubchem }) {
  const approved = knownInApprovedLibrary(smiles);
  if (approved) return { kind: "known", label: "Already known", detail: `Matches approved library: ${approved.name}` };
  if (pubchem?.known) return { kind: "known", label: "Already known", detail: `PubChem CID ${pubchem.cid}` };
  return { kind: "novel", label: "Novel", detail: "Not in the local approved-drug library" };
}

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
    const bounded = keys.length > 400 ? Object.fromEntries(keys.slice(-400).map((k) => [k, obj[k]])) : obj;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  } catch {
    // quota
  }
}

export function detectSaScoreSupport() {
  return { saScore: true, reason: "Ported sascorer (folded Morgan + fragment remap), lazy-loaded asset" };
}

export async function scoreEvolvedMolecule({
  smiles,
  parentSmiles,
  parentSmilesB,
  referenceSmiles,
  archiveSmiles = [],
  protein,
  RDKit,
  operator,
  editLabel,
  editId,
}) {
  const canon = String(smiles || "").trim();
  if (!canon) return { ok: false, error: "Empty SMILES" };
  const pdb = pdbIdOf(protein);
  const targetFree = !protein?.id;
  const key = evolutionCacheKey(pdb, canon);
  ensureLoaded();
  if (MEMORY.has(key)) {
    return { ok: true, cached: true, ...MEMORY.get(key) };
  }

  await preloadSaAssets();
  const adme = await calculateAdmeProperties(canon, { name: "Evolved variant" });
  if (!adme?.valid) return { ok: false, error: adme?.error || "ADME parse failed" };

  const props = adme.properties || {};
  const candidate = {
    IsomericSMILES: canon,
    MolecularWeight: props.mw,
    XLogP: props.logp,
    HBondDonorCount: props.hbd,
    HBondAcceptorCount: props.hba,
    RotatableBondCount: props.rotb,
    TPSA: props.tpsa,
  };
  const alerts = structuralAlerts(canon, candidate);
  const heavyAtoms = Number(props.heavyAtoms ?? props.numHeavyAtoms ?? 0);
  const gate = passesHardGates({
    adme,
    alerts,
    heavyAtoms: heavyAtoms || 20,
    rotb: props.rotb ?? 0,
    elements: ["C", "N", "O"],
  });
  if (!gate.ok) return { ok: false, error: gate.reason, gated: true };

  const saRes = await calculateSaScore(RDKit, canon);
  const saScore = saRes.ok ? saRes.saScore : null;

  const refSet = [...new Set([referenceSmiles, parentSmiles, parentSmilesB, ...archiveSmiles].filter(Boolean))];
  const maxTan = RDKit ? maxTanimotoToSet(RDKit, canon, refSet) : 0;
  const novelty = 1 - maxTan;

  const qed = computeQED({
    mw: props.mw,
    logp: props.logp,
    hba: props.hba,
    hbd: props.hbd,
    tpsa: props.tpsa,
    rotb: props.rotb,
    aromaticRings: props.aromaticRings,
    structuralAlerts: alerts.pains + alerts.brenk,
  });

  const fitness = desirabilityBundle(
    {
      qed,
      sa: saScore ?? 5.5,
      novelty,
      mw: props.mw,
      logp: props.logp,
      tpsa: props.tpsa,
      fsp3: props.fractionCsp3 ?? props.fsp3 ?? props.fractionCSP3,
      painsCount: alerts.pains,
      brenkCount: alerts.brenk,
      le: null,
      dAff: 0,
    },
    { targetFree, maxTanimoto: maxTan }
  );

  const payload = {
    smiles: adme.canonicalSmiles || canon,
    score: fitness.displayScore,
    displayScore: fitness.displayScore,
    fitness,
    reasoning: [],
    strengths: [],
    concerns: gate.ok ? [] : [gate.reason],
    source: targetFree ? "heuristic-target-free" : "heuristic-v3-desirability",
    provenance: targetFree ? "Heuristic (no target affinity)" : "Heuristic (target context; no docking)",
    lipinski: adme.druglikeness?.lipinski || null,
    veber: adme.druglikeness?.veber || null,
    admeFlags: {
      lipinskiPass: Boolean(adme.druglikeness?.lipinski?.pass),
      veberPass: Boolean(adme.druglikeness?.veber?.pass),
      gi: adme.pharmacokinetics?.boiledEgg?.giAbsorption || "",
    },
    organFlags: [],
    pains: checkPainsFast(candidate),
    saScore,
    saSupport: detectSaScoreSupport(),
    qed,
    novelty,
    maxTanimoto: maxTan,
    referenceSmiles: referenceSmiles || parentSmiles || canon,
    parentSmiles: parentSmiles || null,
    parentSmilesB: parentSmilesB || null,
    operator: operator || "mutation",
    editId: editId || "",
    editLabel: editLabel || "",
    targetFree,
    gated: false,
  };

  MEMORY.set(key, payload);
  persist();
  return { ok: true, cached: false, ...payload };
}
