import { getRDKit } from "./rdkitLoader";
import { calculateAdmeProperties } from "./admeCalculator";
import { pdbIdOf } from "./rankingCache";
import { desirabilityBundle, computeNovelty } from "./evolution/evolutionDesirability";
import { calculateSaScore, preloadSaAssets, probeSaScoreSupport, detectSaScoreSupport as detectSaSupportSync } from "./evolution/saScorer";
import { structuralAlerts, passesHardGates, elementSymbolsFromSmiles } from "./evolution/evolutionGates";
import { checkPainsFast } from "./painsCheck";
import { noveltyDistances } from "./evolution/evolutionFingerprint";
import { computeQEDFromSmilesAsync, preloadQedAlerts } from "./evolution/qedFromRdkit";
import { countBrenkAlerts } from "./evolution/brenkAlerts";
import { loadApprovedDrugs } from "./approvedDrugs";
import {
  getCachedAffinity,
  ligandEfficiency,
  affinityLogPAdjusted,
} from "./evolution/evolutionDocking";
import { OnlineSurrogate, featurizeRow } from "./evolution/evolutionSurrogate";
import { morganUint8 } from "./evolution/evolutionFingerprint";

const MEMORY = new Map();
const STORAGE_KEY = "pocketlink-evo-score-v5";
let sessionLoaded = false;

const surrogateByTarget = new Map();

export function getSurrogateForTarget(pdbId) {
  const key = String(pdbId || "NONE").toUpperCase();
  if (!surrogateByTarget.has(key)) surrogateByTarget.set(key, new OnlineSurrogate());
  return surrogateByTarget.get(key);
}

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

export { probeSaScoreSupport };

export function detectSaScoreSupport() {
  return detectSaSupportSync();
}

function morganBitIndices(RDKit, smiles) {
  const mol = RDKit.get_mol(smiles);
  if (!mol) return [];
  try {
    const fp = morganUint8(mol);
    if (!fp) return [];
    const bits = [];
    for (let i = 0; i < fp.length; i += 1) {
      if (fp[i]) bits.push(i);
    }
    return bits;
  } finally {
    mol.delete();
  }
}

export async function scoreEvolvedMolecule({
  smiles,
  parentSmiles,
  parentSmilesB,
  referenceSmiles,
  seedSmiles,
  populationSmiles = [],
  archiveSmiles = [],
  protein,
  RDKit,
  operator,
  editLabel,
  editId,
  affinityRow = null,
  seedSimilarityFloor = 0.3,
}) {
  const canon = String(smiles || "").trim();
  if (!canon) return { ok: false, error: "Empty SMILES" };
  const pdb = pdbIdOf(protein);
  const targetFree = !protein?.id;
  const key = evolutionCacheKey(pdb, canon);
  ensureLoaded();
  if (MEMORY.has(key) && !affinityRow) {
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
  const brenkRdkit = RDKit ? await countBrenkAlerts(RDKit, canon) : { count: 0, hits: [] };
  const alerts = structuralAlerts(canon, candidate, {
    brenkExtra: brenkRdkit.count,
    brenkNamesExtra: brenkRdkit.hits.map((h) => h.name),
  });
  const heavyAtoms = Number(props.heavyAtoms ?? props.numHeavyAtoms ?? 0);
  const elements = elementSymbolsFromSmiles(canon, RDKit);
  const gate = passesHardGates({
    adme,
    alerts,
    heavyAtoms,
    rotb: props.rotb ?? 0,
    elements,
  });
  if (!gate.ok) return { ok: false, error: gate.reason, gated: true };

  const saRes = await calculateSaScore(RDKit, canon);
  const saScore = saRes.ok ? saRes.saScore : null;
  if (!saRes.ok) return { ok: false, error: saRes.error || "SA score unavailable" };

  const seedRef = seedSmiles || referenceSmiles || parentSmiles;
  const popRefs = [...new Set([...populationSmiles, ...archiveSmiles, parentSmiles, parentSmilesB].filter(Boolean))];
  const { maxTanSeed, maxTanPopulation } = RDKit
    ? noveltyDistances(RDKit, canon, { seedSmiles: seedRef, populationSmiles: popRefs })
    : { maxTanSeed: 0, maxTanPopulation: 0 };
  const novelty = computeNovelty({ maxTanSeed, maxTanPopulation });

  if (
    targetFree &&
    seedRef &&
    canon !== String(seedRef).trim() &&
    maxTanSeed < seedSimilarityFloor
  ) {
    return {
      ok: false,
      gated: true,
      error: `Seed similarity ${maxTanSeed.toFixed(2)} below floor ${seedSimilarityFloor}`,
    };
  }

  await preloadQedAlerts();
  const qed =
    (await computeQEDFromSmilesAsync(RDKit, adme.canonicalSmiles || canon)) ??
    props.qed ??
    0.5;

  let deltaG = null;
  let leMeasured = null;
  let lePredicted = null;
  let leIsPredicted = false;
  let affinityLogPAdj = null;
  let affinityProvenance = targetFree ? "n/a" : "surrogate";
  let docked = false;

  const cachedAff = !targetFree ? getCachedAffinity(pdb, adme.canonicalSmiles || canon) : null;
  const aff = affinityRow || cachedAff;
  if (!targetFree && aff?.ok && Number.isFinite(aff.deltaG)) {
    deltaG = aff.deltaG;
    leMeasured = ligandEfficiency(deltaG, heavyAtoms);
    affinityLogPAdj = affinityLogPAdjusted(deltaG, props.logp);
    docked = Boolean(aff.docked);
    affinityProvenance = docked ? "Vina 1.2.5 (unvalidated)" : "surrogate";
  } else if (!targetFree) {
    const surrogate = getSurrogateForTarget(pdb);
    const features = featurizeRow({
      mw: props.mw,
      logp: props.logp,
      tpsa: props.tpsa,
      hbd: props.hbd,
      hba: props.hba,
      rotb: props.rotb,
      fsp3: props.fractionCsp3 ?? 0,
      heavyAtoms,
      morganBits: morganBitIndices(RDKit, canon),
    });
    const pred = surrogate.predict(features);
    if (pred.trained && pred.yhat != null && Number.isFinite(pred.yhat)) {
      lePredicted = pred.yhat;
      leIsPredicted = true;
    }
    affinityProvenance = pred.trained ? "Surrogate (unvalidated)" : "Surrogate cold-start";
  }

  const fitness = desirabilityBundle(
    {
      qed,
      sa: saScore,
      novelty,
      maxTanSeed,
      maxTanPopulation,
      mw: props.mw,
      logp: props.logp,
      tpsa: props.tpsa,
      fsp3: props.fractionCsp3 ?? props.fsp3 ?? props.fractionCSP3,
      painsCount: alerts.pains,
      brenkCount: alerts.brenk,
      leMeasured,
      lePredicted,
      leIsPredicted,
    },
    { targetFree, seedSimilarityFloor }
  );

  const payload = {
    smiles: adme.canonicalSmiles || canon,
    score: fitness.displayScore,
    displayScore: fitness.displayScore,
    fitness,
    reasoning: [],
    strengths: [],
    concerns: [],
    source: targetFree ? "chemistry-quality-filter" : "target-aware-v4",
    provenance: targetFree
      ? "Chemistry-quality filter (not potency)"
      : affinityProvenance,
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
    saSupport: await probeSaScoreSupport(),
    qed,
    novelty,
    maxTanimoto: Math.max(maxTanSeed, maxTanPopulation),
    maxTanSeed,
    maxTanPopulation,
    deltaG,
    le: leMeasured ?? lePredicted,
    leMeasured,
    lePredicted,
    leIsPredicted,
    affinityLogPAdj,
    docked,
    heavyAtoms,
    mw: props.mw,
    logp: props.logp,
    tpsa: props.tpsa,
    hbd: props.hbd,
    hba: props.hba,
    rotb: props.rotb,
    fsp3: props.fractionCsp3 ?? props.fsp3 ?? 0,
    referenceSmiles: referenceSmiles || parentSmiles || canon,
    parentSmiles: parentSmiles || null,
    parentSmilesB: parentSmilesB || null,
    operator: operator || "mutation",
    editId: editId || "",
    editLabel: editLabel || "",
    targetFree,
    gated: false,
    surrogateYhat: lePredicted,
    surrogateSigma: targetFree ? 0 : getSurrogateForTarget(pdb).predict(
      featurizeRow({
        mw: props.mw,
        logp: props.logp,
        tpsa: props.tpsa,
        hbd: props.hbd,
        hba: props.hba,
        rotb: props.rotb,
        fsp3: props.fractionCsp3 ?? 0,
        heavyAtoms,
        morganBits: morganBitIndices(RDKit, canon),
      })
    ).sigma,
  };

  MEMORY.set(key, payload);
  persist();
  return { ok: true, cached: false, ...payload };
}

/** Same batch scoring path used by the evolution web worker. */
export async function scoreEvolutionBatch(variants, ctx = {}) {
  const RDKit = ctx.RDKit || (await getRDKit());
  const results = [];
  for (const variant of variants) {
    const scored = await scoreEvolvedMolecule({ ...variant, ...ctx, RDKit });
    results.push(scored);
  }
  return results;
}

export function trainSurrogateFromDocked(pdbId, rows) {
  const surrogate = getSurrogateForTarget(pdbId);
  for (const row of rows) {
    if (!Number.isFinite(row.le)) continue;
    const features = featurizeRow({
      mw: row.mw,
      logp: row.logp,
      tpsa: row.tpsa,
      hbd: row.hbd,
      hba: row.hba,
      rotb: row.rotb,
      fsp3: row.fsp3 ?? 0,
      heavyAtoms: row.heavyAtoms,
      morganBits: row.morganBits || [],
    });
    surrogate.addSample(features, row.le);
  }
}
