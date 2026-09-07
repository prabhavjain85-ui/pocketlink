import { rankCandidatesBatch, scoreLibraryLocal } from "./aiCandidateRanking";
import { drugToCandidate, loadApprovedDrugs } from "./approvedDrugs";
import { checkPainsLibrary } from "./painsCheck";
import { getCachedScore, pdbIdOf, rememberRanking } from "./rankingCache";
import { rankingCacheKey, targetDisplayName, summarizeTargetData } from "./targetContext";
import { drugLikenessChecks, scoringCapabilities } from "./scoreCandidates";

export const AI_BATCH_SIZE = 25;
export const HIGHLIGHT_COUNT = 20;
export const PAGE_SIZE = 20;
export const DAILY_SCREEN_MS = 24 * 60 * 60 * 1000;
export const EXTREME_MW_CUTOFF = 900;

const DAILY_STORAGE_KEY = "pocketlink-repurpose-daily-v3";

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

function readDailyMap() {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeDailyMap(map) {
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
  if (!pdb) return;
  const map = readDailyMap();
  map[pdb] = { ...payload, pdbId: pdb, at: Date.now() };
  writeDailyMap(map);
}

export function clearDailyScreens() {
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
 * Screen a PDB target against the bundled approved-drug library.
 * Cache-first per `${pdb_id}_${cid}`; skips a full re-screen of the same
 * target for 24 hours.
 */
export async function screenApprovedLibrary(protein, { onProgress, force = false } = {}) {
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

  report({ phase: "prefilter", done: 0, total: drugs.length });

  if (!force) {
    const daily = getDailyScreen(pdb);
    if (daily?.ranking?.length) {
      report({ phase: "cache", done: 0, total: drugs.length, message: `Loading cached screen for ${targetName}…` });
      const painsByCid = await checkPainsLibrary(drugs.map(drugToCandidate), {
        onProgress: ({ done, total }) =>
          report({ phase: "pains", done, total, message: `Loading cached screen for ${targetName}…` }),
      });
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

  report({
    phase: "cache",
    done: 0,
    total: kept.length,
    message: `Screening ${kept.length} approved drugs against ${targetName}... 0% complete`,
  });

  const cachedRows = [];
  const uncached = [];
  for (const drug of kept) {
    const hit = getCachedScore(pdb, drug.cid);
    if (hit) cachedRows.push({ drug, ranked: hit });
    else uncached.push(drug);
  }

  const candidatesForPains = kept.map(drugToCandidate);
  const painsByCid = await checkPainsLibrary(candidatesForPains, {
    onProgress: ({ done, total }) =>
      report({
        phase: "pains",
        done,
        total,
        message: `Checking PAINS flags (${done}/${total}) for ${targetName}…`,
      }),
  });

  let usedLlm = false;
  let source = cachedRows.length && !uncached.length ? "cache" : "heuristic";
  const freshRows = [];
  let aiError = null;

  if (uncached.length) {
    const batches = chunk(uncached, AI_BATCH_SIZE);
    let llmAlive = true;
    let finished = cachedRows.length;

    for (let b = 0; b < batches.length; b += 1) {
      const batch = batches[b];
      const batchCandidates = batch.map((drug) => {
        const candidate = drugToCandidate(drug);
        const pains = painsByCid[String(drug.cid)];
        return pains ? { ...candidate, pains } : candidate;
      });

      let rankedList = [];
      if (llmAlive) {
        const result = await rankCandidatesBatch(batchCandidates, protein, painsByCid);
        if (result?.aiError) {
          aiError = result.aiError;
          llmAlive = false;
        }
        if (result?.source === "llm") {
          usedLlm = true;
          source = "llm";
          rankedList = result.ranking || [];
        } else {
          llmAlive = false;
          source = result?.source === "cache" ? source : result?.source || "heuristic";
          rankedList = result.ranking || [];
        }

        const byCid = new Map(rankedList.map((row) => [String(row.cid), row]));
        for (const drug of batch) {
          const ranked = byCid.get(String(drug.cid));
          if (ranked) freshRows.push({ drug, ranked });
        }

        finished += batch.length;
        report({
          phase: "scoring",
          done: finished,
          total: kept.length,
          message: `Screening ${kept.length} approved drugs against ${targetName}... ${Math.round((finished / kept.length) * 100)}% complete`,
        });
        await yieldUi();
      } else {
        // AI is unavailable or failed: score all remaining uncached drugs locally in one fast vectorized pass
        const remainingDrugs = uncached.slice(finished - cachedRows.length);
        const remainingCandidates = remainingDrugs.map((drug) => {
          const candidate = drugToCandidate(drug);
          const pains = painsByCid[String(drug.cid)];
          return pains ? { ...candidate, pains } : candidate;
        });
        const local = scoreLibraryLocal(remainingCandidates, protein);
        rememberRanking(protein, local);
        const byCid = new Map((local.ranking || []).map((row) => [String(row.cid), row]));
        for (const drug of remainingDrugs) {
          const ranked = byCid.get(String(drug.cid));
          if (ranked) freshRows.push({ drug, ranked });
        }
        finished += remainingDrugs.length;
        report({
          phase: "scoring",
          done: finished,
          total: kept.length,
          message: `Screening ${kept.length} approved drugs against ${targetName}... 100% complete`,
        });
        break;
      }
    }
  }

  const rows = [...cachedRows, ...freshRows].map(({ drug, ranked }) =>
    compactRow(drug, ranked, painsByCid[String(drug.cid)])
  );

  const assembled = assembleResult({
    protein,
    rows,
    excluded,
    source: usedLlm ? "llm" : source,
    fromDailyCache: false,
    usedLlm,
    librarySize: drugs.length,
    scoredCount: rows.length,
    aiError,
  });

  const uniqueScores = new Set(assembled.ranking.map((row) => row.score ?? 0));
  const looksUnscored =
    !assembled.ranking.length ||
    (assembled.ranking.length > 8 && uniqueScores.size <= 1 && (assembled.ranking[0].score ?? 0) <= 1);
  if (looksUnscored) {
    const err = new Error(
      `${INSUFFICIENT_STRUCTURE_ERROR}. Scoring returned no target-specific values${aiError ? ` (${aiError})` : ""}.`
    );
    err.code = "INSUFFICIENT_STRUCTURE";
    throw err;
  }
  if (aiError && assembled.degraded) {
    const err = new Error(`${INSUFFICIENT_STRUCTURE_ERROR}. ${aiError}`);
    err.code = "INSUFFICIENT_STRUCTURE";
    throw err;
  }

  rememberDailyScreen(pdb, {
    ranking: assembled.ranking.map((row) => ({
      cid: row.cid,
      name: row.name,
      score: row.score,
      reasoning: row.reasoning,
      indication: row.indication,
      class: row.class,
      smiles: row.smiles,
    })),
    excluded,
    source: assembled.source,
    usedLlm,
    librarySize: drugs.length,
  });

  report({
    phase: "done",
    done: kept.length,
    total: kept.length,
    percent: 100,
    message: `Screened ${assembled.scoredCount} approved drugs against ${targetName}.`,
  });

  return assembled;
}
