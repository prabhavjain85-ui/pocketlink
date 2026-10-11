import { rankCandidatesBatch, scoreLibraryLocal } from "./aiCandidateRanking";
import { drugToCandidate, ensureApprovedDrugsLoaded, loadApprovedDrugs } from "./approvedDrugs";
import { checkPainsFast } from "./painsCheck";
import { getCachedScore, pdbIdOf, rememberScores } from "./rankingCache";
import { rankingCacheKey, targetDisplayName, summarizeTargetData, buildTargetContext } from "./targetContext";
import {
  drugLikenessChecks,
  scoringCapabilities,
  resolveTargetRule,
  rankCandidatesLocal,
  targetFamily,
  KINASE_INHIBITOR_RE,
  GPCR_LIGAND_RE,
} from "./scoreCandidates";

export const AI_BATCH_SIZE = 25;
export const AI_SHORTLIST_SIZE = 200;
export const HIGHLIGHT_COUNT = 20;
export const PAGE_SIZE = 20;
export const DAILY_SCREEN_MS = 24 * 60 * 60 * 1000;
export const EXTREME_MW_CUTOFF = 900;

const DAILY_STORAGE_KEY = "pocketlink-repurpose-daily-v4";

/**
 * Scoring 200–500 compounds through one Vercel invocation would exceed the
 * 30s maxDuration on /api/rank-candidates (Hobby/Pro). Client-side chunks of
 * 25 keep each function call inside that budget. A background queue
 * (Inngest, Vercel Workflows, or a worker + KV) would be the next step if
 * the full library must be LLM-scored server-side.
 */
export const INSUFFICIENT_STRUCTURE_ERROR =
  "Unable to score against this target — insufficient structural data";
export const SERVERLESS_TIMEOUT_NOTE =
  "Full-library LLM scoring is batched in the browser (25 drugs per /api/rank-candidates call, 30s Vercel limit each). A single serverless function cannot score hundreds of compounds before timeout — use a background job/queue if this screen must run entirely on the server.";

let dailyMemoryMap = null;

function readDailyMap() {
  if (dailyMemoryMap) return dailyMemoryMap;
  if (typeof localStorage === "undefined") {
    dailyMemoryMap = {};
    return dailyMemoryMap;
  }
  try {
    dailyMemoryMap = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || "{}") || {};
  } catch {
    dailyMemoryMap = {};
  }
  return dailyMemoryMap;
}

function writeDailyMap(map) {
  dailyMemoryMap = map;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / private mode
  }
}

export function getDailyScreen(pdbId) {
  const pdb = String(pdbId || "").toUpperCase();
  if (!pdb) return null;
  const entry = readDailyMap()[pdb];
  if (!entry || !entry.at) return null;
  if (Date.now() - Number(entry.at) > DAILY_SCREEN_MS) return null;
  return entry;
}

export function rememberDailyScreen(pdbId, payload) {
  const pdb = String(pdbId || "").toUpperCase();
  if (!pdb || !payload) return;
  const map = { ...readDailyMap() };
  const compactRanking = (payload.ranking || []).map((r) => ({
    cid: String(r.cid),
    name: r.name,
    score: r.score,
    reasoning: Array.isArray(r.reasoning) ? r.reasoning.slice(0, 3) : [],
    indication: r.indication,
    class: r.class,
    smiles: r.smiles,
  }));
  map[pdb] = { ...payload, ranking: compactRanking, pdbId: pdb, at: Date.now() };
  writeDailyMap(map);
}

export function clearDailyScreens() {
  dailyMemoryMap = {};
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(DAILY_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function prefilterApprovedDrug(drug) {
  const smiles = String(drug?.smiles || "").trim();
  if (!smiles) {
    return { keep: false, reason: "Missing SMILES — unable to screen" };
  }
  const mw = drug.mw == null ? null : Number(drug.mw);
  if (mw != null && Number.isFinite(mw) && mw > EXTREME_MW_CUTOFF) {
    return {
      keep: false,
      reason: `Molecular weight ${mw.toFixed(0)} g/mol exceeds the ${EXTREME_MW_CUTOFF} g/mol small-molecule cutoff`,
    };
  }
  const checks = drugLikenessChecks(drugToCandidate(drug));
  const fails = checks.filter((c) => !c.pass).length;
  if (fails >= 5) {
    return {
      keep: false,
      reason: `Fails ${fails}/6 Lipinski–Veber checks (excluded as clearly non-drug-like before AI scoring)`,
    };
  }
  return { keep: true, reason: null };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function compactRow(drug, ranked, pains) {
  const reasoning = Array.isArray(ranked?.reasoning) ? ranked.reasoning.slice(0, 6) : [];
  return {
    cid: String(drug.cid),
    drugId: String(drug.id || drug.cid),
    name: drug.name,
    score: ranked?.score ?? 0,
    reasoning,
    strengths: ranked?.strengths || [],
    concerns: ranked?.concerns || [],
    indication: drug.indication,
    class: drug.class,
    smiles: drug.smiles,
    pains: pains || { status: "pending" },
    cacheKey: null,
  };
}

function fitBlurb(row, targetName) {
  const first = (row.reasoning || []).find(Boolean) || "target-aware physicochemical scoring";
  const fit =
    row.score >= 70 ? "strong" : row.score >= 50 ? "moderate" : "limited";
  return `Originally approved for ${row.indication}, shows ${fit} structural fit for ${targetName} due to ${first.replace(/\.$/, "")}.`;
}

function assembleResult({
  protein,
  rows,
  excluded,
  source,
  fromDailyCache,
  usedLlm,
  librarySize,
  scoredCount,
  aiError,
}) {
  const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.name).localeCompare(String(b.name)));
  const ranked = sorted.map((row, index) => ({ ...row, rank: index + 1 }));
  const pdb = pdbIdOf(protein);
  const targetName = targetDisplayName(protein) || pdb;
  const caps = scoringCapabilities(protein);
  const withBlurbs = ranked.map((row) => ({
    ...row,
    blurb: fitBlurb(row, targetName),
    cacheKey: rankingCacheKey(pdb, row.cid),
  }));
  let warning = null;
  if (caps.missingStructure && caps.recognizedFamily) {
    warning =
      "No co-crystallized ligand and/or pocket geometry on this structure. Ranking uses known pharmacology and drug-likeness only — geometric fit was not assessed.";
  }
  return {
    target: { name: targetName, pdb_id: pdb },
    ranking: withBlurbs,
    recommended: withBlurbs[0]
      ? { cid: withBlurbs[0].cid, score: withBlurbs[0].score, name: withBlurbs[0].name }
      : null,
    excluded,
    source,
    fromDailyCache: Boolean(fromDailyCache),
    usedLlm: Boolean(usedLlm),
    librarySize,
    scoredCount,
    highlightCount: Math.min(HIGHLIGHT_COUNT, withBlurbs.length),
    timeoutNote: SERVERLESS_TIMEOUT_NOTE,
    family: caps.family,
    hasLigand: caps.hasLigand,
    hasPocket: caps.hasPocket,
    dataGaps: caps.dataGaps,
    degraded: Boolean(caps.degraded),
    warning,
    aiError: aiError || null,
    summary: caps.degraded
      ? `Screened ${scoredCount} approved drugs against ${targetName} (${pdb}), but this structure has no ligand/pocket and is not a recognized target family. Ranking is general drug-likeness only — not a target-specific repurposing result.`
      : `Screened ${scoredCount} approved drugs against ${targetName} (${pdb}). Top hits are computational repurposing candidates — not evidence of activity.`,
  };
}

function hydrateDaily(entry, protein, drugs, painsByCid) {
  const byCid = new Map((entry.ranking || []).map((row) => [String(row.cid), row]));
  const rows = [];
  for (const drug of drugs) {
    const cached = byCid.get(String(drug.cid)) || getCachedScore(pdbIdOf(protein), drug.cid);
    if (!cached) continue;
    rows.push({
      ...compactRow(drug, cached, painsByCid[String(drug.cid)]),
      score: cached.score,
      reasoning: cached.reasoning || [],
    });
  }
  return assembleResult({
    protein,
    rows,
    excluded: entry.excluded || [],
    source: entry.source || "cache",
    fromDailyCache: true,
    usedLlm: Boolean(entry.usedLlm),
    librarySize: entry.librarySize || drugs.length,
    scoredCount: rows.length,
  });
}

async function yieldUi() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Fast, deterministic pre-filtering and qualification pass on all 2,900+ drugs before AI scoring.
 * Gathers:
 * 1. Lipinski & Veber compliance (Ro5 / Veber violations)
 * 2. PAINS and reactive toxicophore flags (in-memory regex, zero network overhead)
 * 3. Target pocket dimensions and hydrophobicity ranges (if pocket stats available)
 * 4. Reference ligand molecular weight matching (if co-crystallized ligand available)
 * 5. Pharmacological target class alignment
 *
 * Runs scoreLibraryLocal to score all 2,900+ compounds (~120ms), evaluates the multi-factor
 * qualification score, and extracts the top 100-300 candidates (default 200) for deep AI reasoning.
 */
export function prequalifyCandidatesForAi(keptDrugs, protein, { maxAiCandidates = AI_SHORTLIST_SIZE } = {}) {
  const candidates = keptDrugs.map(drugToCandidate);
  const localResult = scoreLibraryLocal(candidates, protein);
  const localMap = new Map((localResult?.ranking || []).map((row) => [String(row.cid), row]));

  const pocketStats = protein?.pocketStats || {};
  const isSmallPocket =
    pocketStats.sizeLabel === "small" ||
    (pocketStats.residueCount != null && pocketStats.residueCount < 12);
  const isLargePocket =
    pocketStats.sizeLabel === "large" ||
    (pocketStats.residueCount != null && pocketStats.residueCount > 24);
  const isHydrophobic =
    pocketStats.hydrophobicityLabel === "hydrophobic" ||
    (pocketStats.hydrophobicity != null && pocketStats.hydrophobicity > 0.6);
  const isHydrophilic =
    pocketStats.hydrophobicityLabel === "hydrophilic" ||
    (pocketStats.hydrophobicity != null && pocketStats.hydrophobicity < 0.4);

  let refLigandMw = null;
  const boundLigand = protein?.ligands?.[0] || protein?.ligand;
  if (boundLigand?.formulaWeight) {
    const rawFw = Number(boundLigand.formulaWeight);
    refLigandMw = rawFw < 10 ? rawFw * 1000 : rawFw;
  } else if (boundLigand?.mw) {
    refLigandMw = Number(boundLigand.mw);
  }

  const scoredEntries = [];
  for (const drug of keptDrugs) {
    const cid = String(drug.cid);
    const local = localMap.get(cid);
    const baseScore = local?.score ?? 50;
    let qualScore = baseScore;

    // A. Lipinski & Veber compliance
    const candidate = drugToCandidate(drug);
    const checks = drugLikenessChecks(candidate);
    const fails = checks.filter((c) => !c.pass).length;
    if (fails > 2) qualScore -= 25;
    else if (fails === 0) qualScore += 5;

    // B. Fast deterministic PAINS & toxicophore check
    const pains = checkPainsFast(candidate);
    if (pains?.hasAlerts) qualScore -= 30;

    // C. Pocket geometry constraints
    const mw = Number(drug.mw) || 0;
    const rot = Number(drug.rot) || 0;
    const xlogp = Number(drug.xlogp) || 0;
    const tpsa = Number(drug.tpsa) || 0;

    if (isSmallPocket) {
      if (mw > 450 || rot > 8) qualScore -= 25;
    } else if (isLargePocket) {
      if (mw < 160) qualScore -= 20;
    }

    if (isHydrophobic) {
      if (tpsa > 130 || xlogp < 0) qualScore -= 15;
      else if (xlogp >= 2.0 && xlogp <= 5.0) qualScore += 5;
    } else if (isHydrophilic) {
      if (xlogp > 4.5) qualScore -= 15;
      else if (tpsa >= 70 && tpsa <= 140) qualScore += 5;
    }

    // D. Reference ligand size match
    if (refLigandMw && refLigandMw > 100) {
      const ratio = mw / refLigandMw;
      if (ratio >= 0.5 && ratio <= 1.6) qualScore += 10;
      else if (ratio < 0.3 || ratio > 2.5) qualScore -= 15;
    }

    // E. Target family match bonus (prioritizes known on-target chemotypes)
    const reasoningText = (local?.reasoning || []).join(" ");
    if (
      /kinase-inhibitor|GPCR ligand|protease inhibitor|statin|NSAID|nuclear-receptor|ACE inhibitor/i.test(
        reasoningText
      )
    ) {
      qualScore += 30;
    }

    scoredEntries.push({
      drug,
      local,
      pains,
      qualScore,
    });
  }

  scoredEntries.sort(
    (a, b) => b.qualScore - a.qualScore || (b.local?.score ?? 0) - (a.local?.score ?? 0)
  );

  const targetCount = Math.max(100, Math.min(300, maxAiCandidates));
  const shortlistedEntries = scoredEntries.slice(0, targetCount);
  const remainingEntries = scoredEntries.slice(targetCount);

  return {
    shortlisted: shortlistedEntries.map((e) => e.drug),
    remaining: remainingEntries.map((e) => e.drug),
    localMap,
    painsMap: Object.fromEntries(scoredEntries.map((e) => [String(e.drug.cid), e.pains])),
  };
}

export const KNOWN_GENE_DRUGS = {
  ABL1: ["imatinib", "dasatinib", "nilotinib", "bosutinib", "ponatinib", "asciminib"],
  ABL: ["imatinib", "dasatinib", "nilotinib", "bosutinib", "ponatinib", "asciminib"],
  EGFR: ["gefitinib", "erlotinib", "afatinib", "osimertinib", "dacomitinib", "neratinib", "lapatinib"],
  ERBB2: ["lapatinib", "neratinib", "tucatinib", "afatinib"],
  HER2: ["lapatinib", "neratinib", "tucatinib", "afatinib"],
  BRAF: ["vemurafenib", "dabrafenib", "encorafenib"],
  KRAS: ["sotorasib", "adagrasib"],
  ALK: ["crizotinib", "alectinib", "ceritinib", "brigatinib", "lorlatinib"],
  BTK: ["ibrutinib", "acalabrutinib", "zanubrutinib"],
  JAK1: ["ruxolitinib", "tofacitinib", "baricitinib", "upadacitinib"],
  JAK2: ["ruxolitinib", "fedratinib", "pacritinib"],
  JAK3: ["tofacitinib"],
  CFTR: ["ivacaftor", "lumacaftor", "tezacaftor", "elexacaftor"],
  PARP1: ["olaparib", "rucaparib", "niraparib", "talazoparib"],
  CDK4: ["palbociclib", "ribociclib", "abemaciclib"],
  CDK6: ["palbociclib", "ribociclib", "abemaciclib"],
  KDR: ["sunitinib", "sorafenib", "pazopanib", "axitinib", "cabozantinib", "lenvatinib"],
  VEGFR2: ["sunitinib", "sorafenib", "pazopanib", "axitinib", "cabozantinib", "lenvatinib"],
  ACHE: ["donepezil", "rivastigmine", "galantamine"],
  ESR1: ["tamoxifen", "fulvestrant", "raloxifene", "toremifene"],
  AR: ["enzalutamide", "bicalutamide", "apalutamide", "darolutamide"],
  HMGCR: ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "fluvastatin", "lovastatin"],
  PTGS1: ["aspirin", "ibuprofen", "naproxen", "indomethacin"],
  PTGS2: ["celecoxib", "etodolac", "meloxicam", "diclofenac"],
  COX2: ["celecoxib", "etodolac", "meloxicam", "diclofenac"],
  ADRB2: ["salbutamol", "albuterol", "salmeterol", "formoterol", "propranolol", "atenolol", "metoprolol", "carvedilol"],
  DPP4: ["sitagliptin", "saxagliptin", "linagliptin", "alogliptin"],
  MET: ["crizotinib", "capmatinib", "tepotinib", "cabozantinib"],
  RET: ["selpercatinib", "pralsetinib", "cabozantinib"],
  FLT3: ["midostaurin", "gilteritinib", "sorafenib"],
  KIT: ["imatinib", "sunitinib", "regorafenib", "ripretinib"],
  FGFR1: ["erdafitinib", "pemigatinib"],
  FGFR2: ["pemigatinib", "futibatinib"],
  FGFR3: ["erdafitinib"],
  PIK3CA: ["alpelisib"],
  HDAC1: ["vorinostat", "panobinostat", "belinostat", "romidepsin"],
  PDE5A: ["sildenafil", "tadalafil", "vardenafil", "avanafil"],
  SLC5A2: ["canagliflozin", "dapagliflozin", "empagliflozin", "ertugliflozin", "sotagliflozin", "bexagliflozin"],
  SGLT2: ["canagliflozin", "dapagliflozin", "empagliflozin", "ertugliflozin", "sotagliflozin", "bexagliflozin"],
  "SGLT-2": ["canagliflozin", "dapagliflozin", "empagliflozin", "ertugliflozin", "sotagliflozin", "bexagliflozin"],
};

/**
 * Build a shortlist of approved drugs for the 4-step Autonomous Research Agent:
 * - Canonical on-target drugs for the resolved gene and target rule (e.g. ABL1 -> imatinib, EGFR -> gefitinib)
 * - Same-family drugs (to allow adversarial and on-target vs same-family reasoning)
 * - Co-crystallized ligand matching drug if present
 * - Diverse sample of approved small molecules
 */
export function buildAgentShortlist(allDrugs, proteinContext, activeTarget) {
  const fullContext = buildTargetContext(proteinContext) || proteinContext;
  const targetGene = String(
    activeTarget?.symbol || proteinContext?.gene || proteinContext?.symbol || ""
  ).trim().toUpperCase();
  const rule = resolveTargetRule(fullContext);
  const shortlistMap = new Map();

  const addDrug = (drug) => {
    if (!drug || !drug.cid) return;
    const key = String(drug.cid);
    if (!shortlistMap.has(key)) {
      shortlistMap.set(key, drug);
    }
  };

  // 1. Curated on-target approved drugs for the target gene
  const knownDrugs = KNOWN_GENE_DRUGS[targetGene] || [];
  for (const name of knownDrugs) {
    const d = allDrugs.find((drug) => String(drug.name || "").toLowerCase() === name.toLowerCase());
    if (d) addDrug(d);
  }

  // 2. Target rule canonical on-target drugs (e.g. imatinib for ABL, gefitinib for EGFR, etc.)
  if (rule?.onTargetDrugs) {
    for (const name of rule.onTargetDrugs) {
      const d = allDrugs.find((drug) => String(drug.name || "").toLowerCase() === name.toLowerCase());
      if (d) addDrug(d);
    }
  }
  if (rule?.onTargetRe) {
    for (const drug of allDrugs) {
      if (rule.onTargetRe.test(drug.name)) addDrug(drug);
    }
  }

  // 3. Co-crystal ligand match
  const ligandName = String(
    proteinContext?.ligand?.name || fullContext?.ligand?.name || ""
  ).trim().toLowerCase();
  if (ligandName) {
    for (const drug of allDrugs) {
      if (String(drug.name || "").toLowerCase() === ligandName) addDrug(drug);
    }
  }

  // 4. Drugs mentioning target gene in name, indication, or mechanism
  if (targetGene && targetGene.length >= 3) {
    const geneRe = new RegExp(`\\b${targetGene}\\b`, "i");
    for (const drug of allDrugs) {
      if (
        geneRe.test(drug.name) ||
        geneRe.test(drug.indication || "") ||
        geneRe.test(drug.class || "")
      ) {
        addDrug(drug);
      }
    }
  }

  // 5. Same-family drugs for the resolved gene/family
  if (rule?.demotedRe) {
    for (const drug of allDrugs) {
      if (rule.demotedRe.test(drug.name)) addDrug(drug);
    }
  }

  const family = fullContext.family || targetFamily(fullContext);
  if (family === "kinase") {
    let count = 0;
    for (const drug of allDrugs) {
      if (KINASE_INHIBITOR_RE.test(drug.name) || String(drug.class || "").toLowerCase().includes("kinase")) {
        addDrug(drug);
        count++;
        if (count >= 15) break;
      }
    }
  } else if (family === "gpcr") {
    let count = 0;
    for (const drug of allDrugs) {
      if (GPCR_LIGAND_RE.test(drug.name) || String(drug.class || "").toLowerCase().includes("receptor")) {
        addDrug(drug);
        count++;
        if (count >= 15) break;
      }
    }
  }

  // 6. Supplement with qualified drug-likeness approved compounds (up to ~50 total)
  let sampleCount = 0;
  for (const drug of allDrugs) {
    if (shortlistMap.size >= 50) break;
    const mw = Number(drug.mw || drug.MolecularWeight || 0);
    if (mw > 180 && mw < 550 && !shortlistMap.has(String(drug.cid))) {
      addDrug(drug);
      sampleCount++;
      if (sampleCount >= 30) break;
    }
  }

  return Array.from(shortlistMap.values());
}

/**
 * Screen a PDB target against the bundled approved-drug library.
 * Scales effortlessly to 2,900+ compounds via:
 * 1. Aggressive deterministic pre-filtering (Lipinski Ro5, PAINS, pocket geometry)
 * 2. Pre-qualifying top candidates (100-300) for deep AI reasoning
 * 3. Asynchronous non-blocking batch execution yielding UI frame rendering
 * 4. Multi-level caching (daily snapshot + per-target-per-drug session cache)
 */
export async function screenApprovedLibrary(
  protein,
  {
    onProgress,
    force = false,
    maxAiCandidates = AI_SHORTLIST_SIZE,
    shortlistOnly = false,
    activeTarget = null,
    signal = null,
  } = {}
) {
  await ensureApprovedDrugsLoaded();
  const drugs = loadApprovedDrugs();
  const pdb = pdbIdOf(protein);
  const targetName = targetDisplayName(protein) || pdb;
  const structural = summarizeTargetData(protein);
  const caps = scoringCapabilities(protein);
  console.log(
    `[repurposing] structural data for ${targetName} (${pdb}): family=${caps.family} ligand=${caps.hasLigand} pocket=${caps.hasPocket} degraded=${caps.degraded}`
  );
  console.log(`[repurposing] ligand: ${JSON.stringify(structural.ligand)}`);
  console.log(`[repurposing] pocket: ${JSON.stringify(structural.pocket)}`);
  console.log(`[repurposing] dataGaps: ${JSON.stringify(structural.dataGaps)}`);

  if (caps.degraded) {
    const err = new Error(
      `${INSUFFICIENT_STRUCTURE_ERROR}. This structure has no co-crystallized ligand or pocket, and the target family could not be recognized.`
    );
    err.code = "INSUFFICIENT_STRUCTURE";
    throw err;
  }

  // 4-step Agent fast-path: score targeted shortlist using heuristic-v2 with full protein context
  if (shortlistOnly) {
    if (signal?.aborted) {
      const err = new Error("Agent run was cancelled by user.");
      err.name = "AbortError";
      throw err;
    }

    if (typeof onProgress === "function") {
      onProgress({
        percent: 25,
        message: `Assembling targeted approved-drug shortlist for ${targetName}...`,
      });
    }

    const fullContext = buildTargetContext(protein) || protein;
    const shortlist = buildAgentShortlist(drugs, protein, activeTarget);

    if (typeof onProgress === "function") {
      onProgress({
        percent: 60,
        message: `Scoring ${shortlist.length} candidate drugs against ${targetName} using heuristic-v2...`,
      });
    }

    if (signal?.aborted) {
      const err = new Error("Agent run was cancelled by user.");
      err.name = "AbortError";
      throw err;
    }

    const candidates = shortlist.map((d) => drugToCandidate(d));
    const scoredResult = rankCandidatesLocal(candidates, fullContext, {
      maxCandidates: candidates.length,
      minCandidates: 1,
    });

    const rankedRows = scoredResult.ranking || [];

    if (typeof onProgress === "function") {
      onProgress({
        percent: 100,
        message: `Ranked ${rankedRows.length} candidates for ${targetName}.`,
      });
    }

    return {
      target: { name: fullContext.name, pdb_id: fullContext.pdb_id },
      summary: `Screened canonical on-target, same-family, and approved sample shortlist (${rankedRows.length} compounds) against ${fullContext.name} (${fullContext.pdb_id}) using heuristic-v2`,
      librarySize: drugs.length,
      scoredCount: rankedRows.length,
      shortlistSize: rankedRows.length,
      recommended: rankedRows[0] || null,
      ranking: rankedRows,
      top5: rankedRows.slice(0, 5),
      source: "heuristic-v2",
      limitations: scoredResult.limitations || [],
      selectedStructure: protein,
    };
  }

  const report = (partial) => {
    if (typeof onProgress === "function") {
      const done = partial.done ?? 0;
      const total = partial.total || drugs.length;
      const pct = total ? Math.min(99, Math.round((done / total) * 100)) : 0;
      onProgress({
        ...partial,
        percent: pct,
        message:
          partial.message ||
          `Screening ${drugs.length} approved drugs against ${targetName}... ${pct}% complete`,
      });
    }
  };

  report({
    phase: "prefilter",
    done: 0,
    total: drugs.length,
    message: `Filtering ${drugs.length} approved drugs by Lipinski compliance, PAINS & pocket geometry...`,
  });

  if (!force) {
    const daily = getDailyScreen(pdb);
    if (daily?.ranking?.length) {
      report({
        phase: "cache",
        done: drugs.length,
        total: drugs.length,
        message: `Reusing cached daily screen for ${targetName}…`,
      });
      const painsByCid = {};
      for (const drug of drugs) {
        painsByCid[String(drug.cid)] = checkPainsFast(drug);
      }
      return hydrateDaily(daily, protein, drugs, painsByCid);
    }
  }

  const kept = [];
  const excluded = [];
  for (const drug of drugs) {
    const gate = prefilterApprovedDrug(drug);
    if (gate.keep) kept.push(drug);
    else excluded.push({ cid: String(drug.cid), name: drug.name, reason: gate.reason, indication: drug.indication });
  }

  await yieldUi();

  // 1. Aggressive pre-qualification for AI shortlist (cuts down 2,900+ drugs to top 100-300 candidates)
  const { shortlisted, remaining, localMap, painsMap } = prequalifyCandidatesForAi(kept, protein, {
    maxAiCandidates,
  });

  report({
    phase: "prequalified",
    done: 0,
    total: shortlisted.length,
    message: `Pre-qualified top ${shortlisted.length} candidates from ${kept.length} drugs (cut library by ${Math.round((1 - shortlisted.length / kept.length) * 100)}%)`,
  });
  await yieldUi();

  // 2. Check caching for shortlisted candidates
  const cachedShortlist = [];
  const uncachedShortlist = [];
  for (const drug of shortlisted) {
    const hit = getCachedScore(pdb, drug.cid);
    if (hit) cachedShortlist.push({ drug, ranked: hit });
    else uncachedShortlist.push(drug);
  }

  let usedLlm = false;
  let source = cachedShortlist.length && !uncachedShortlist.length ? "cache" : "heuristic-v2";
  const freshRows = [];
  let aiError = null;

  // 3. Background / async scoring of the pre-qualified shortlist in chunks of 25
  if (uncachedShortlist.length) {
    const batches = chunk(uncachedShortlist, AI_BATCH_SIZE);
    let llmAlive = true;
    let finished = cachedShortlist.length;

    for (let b = 0; b < batches.length; b += 1) {
      const batch = batches[b];
      const batchCandidates = batch.map((drug) => {
        const candidate = drugToCandidate(drug);
        const pains = painsMap[String(drug.cid)];
        return pains ? { ...candidate, pains } : candidate;
      });

      if (llmAlive) {
        const pct = Math.round((finished / shortlisted.length) * 100);
        report({
          phase: "scoring",
          done: finished,
          total: shortlisted.length,
          message: `Scoring top ${shortlisted.length} candidates with AI... ${pct}% complete (batch ${b + 1} of ${batches.length})`,
        });
        await yieldUi();

        let result = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            result = await rankCandidatesBatch(batchCandidates, protein, painsMap);
            if (!result?.aiError) break;
            lastErr = result.aiError;
            console.error(
              `[repurposing] AI scoring attempt ${attempt}/3 failed for ${targetName} (${pdb}): ${result.aiError}`
            );
          } catch (err) {
            lastErr = err?.message || String(err);
            console.error(
              `[repurposing] AI scoring attempt ${attempt}/3 threw for ${targetName} (${pdb}): ${lastErr}`
            );
            result = { aiError: lastErr, source: "heuristic-v2", ranking: [] };
          }
          if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
        }
        if (result?.aiError) {
          aiError = result.aiError;
          llmAlive = false;
          console.error(
            `[repurposing] falling back to heuristic-v2 for remaining batches. target=${targetName} pdb=${pdb} reason=${result.aiError}`
          );
        }
        if (result?.source === "llm") {
          usedLlm = true;
          source = "llm";
          rememberScores(pdb, result.ranking || []);
          const byCid = new Map((result.ranking || []).map((row) => [String(row.cid), row]));
          for (const drug of batch) {
            const ranked = byCid.get(String(drug.cid));
            if (ranked) freshRows.push({ drug, ranked });
          }
        } else {
          llmAlive = false;
          source = result?.source === "cache" ? source : result?.source || "heuristic-v2";
          const byCid = new Map((result?.ranking || []).map((row) => [String(row.cid), row]));
          for (const drug of batch) {
            const ranked = byCid.get(String(drug.cid)) || localMap.get(String(drug.cid));
            if (ranked) freshRows.push({ drug, ranked });
          }
        }

        finished += batch.length;
        await yieldUi();
      } else {
        console.error(
          `[repurposing] LLM path disabled; using heuristic scores for remaining shortlist. target=${targetName} pdb=${pdb} reason=${aiError || "non-llm source"}`
        );
        const remainingBatchDrugs = uncachedShortlist.slice(finished - cachedShortlist.length);
        for (const drug of remainingBatchDrugs) {
          const ranked = localMap.get(String(drug.cid));
          if (ranked) freshRows.push({ drug, ranked });
        }
        finished += remainingBatchDrugs.length;
        break;
      }
    }
  }

  // 4. Shortlist rows + Remaining rows from full library
  const shortlistRows = [...cachedShortlist, ...freshRows].map(({ drug, ranked }) =>
    compactRow(drug, ranked, painsMap[String(drug.cid)])
  );

  const remainingRows = remaining.map((drug) =>
    compactRow(drug, localMap.get(String(drug.cid)), painsMap[String(drug.cid)])
  );

  const allRows = [...shortlistRows, ...remainingRows];

  const assembled = assembleResult({
    protein,
    rows: allRows,
    excluded,
    source: usedLlm ? "llm" : source,
    fromDailyCache: false,
    usedLlm,
    librarySize: drugs.length,
    scoredCount: allRows.length,
    aiError,
  });

  const uniqueScores = new Set(assembled.ranking.map((row) => row.score ?? 0));
  const looksUnscored =
    !assembled.ranking.length ||
    (assembled.ranking.length > 8 && uniqueScores.size <= 1 && (assembled.ranking[0].score ?? 0) <= 1);
  const topNames = assembled.ranking.slice(0, 12).map((r) => String(r.name || ""));
  const alpha = [...topNames].sort((a, b) => a.localeCompare(b));
  const alphabetical = topNames.join("|") === alpha.join("|") && topNames.length >= 8;
  const spread = (assembled.ranking[0]?.score ?? 0) - (assembled.ranking[Math.min(11, assembled.ranking.length - 1)]?.score ?? 0);
  const onTargetHit = assembled.ranking.slice(0, 8).some((r) =>
    /canagliflozin|dapagliflozin|empagliflozin|ertugliflozin|sotagliflozin|imatinib|gefitinib|erlotinib|atorvastatin|sitagliptin|celecoxib/i.test(r.name || "")
    || /on-target|primary target match/i.test((r.reasoning || []).join(" "))
  );
  if (looksUnscored || (alphabetical && spread < 3 && !onTargetHit)) {
    console.error(
      `[repurposing] refusing alphabetical/flat ranking for ${targetName} (${pdb}). spread=${spread} aiError=${aiError || "none"} family=${caps.family} rule=${caps.rule}`
    );
    const err = new Error(
      `Scoring failed for ${targetName}. Results were not target-specific (flat or alphabetical approved-drug order)${aiError ? ` — ${aiError}` : ""}. No ranked list was returned.`
    );
    err.code = "SCORING_FAILED";
    throw err;
  }
  if (aiError && assembled.degraded) {
    const err = new Error(`${INSUFFICIENT_STRUCTURE_ERROR}. ${aiError}`);
    err.code = "INSUFFICIENT_STRUCTURE";
    throw err;
  }

  // 5. Cache snapshots
  rememberDailyScreen(pdb, assembled);
  rememberScores(pdb, assembled.ranking);

  report({
    phase: "done",
    done: shortlisted.length,
    total: shortlisted.length,
    percent: 100,
    message: `Screening complete: ${drugs.length} drugs evaluated, top leads ranked`,
  });

  return assembled;
}
