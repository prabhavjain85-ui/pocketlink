import { compactPainsForRanking } from "./painsCheck";
import { rankCandidatesLocal, scoreLibraryLocal } from "./scoreCandidates";
import { buildTargetContext } from "./targetContext";
import {
  clearRankingCache,
  getCachedScore,
  hydrateRankingFromCache,
  pdbIdOf,
  rankingCacheKey,
  rememberRanking,
} from "./rankingCache";

function toApiCandidate(candidate, painsByCid = {}) {
  const cid = String(candidate.CID ?? candidate.cid ?? "");
  const pains = painsByCid[cid] || candidate.pains || candidate.painsAlerts;
  const row = {
    name: candidate.displayName || candidate.IUPACName || candidate.name || `CID ${candidate.CID || candidate.cid}`,
    cid,
    smiles: candidate.IsomericSMILES || candidate.CanonicalSMILES || candidate.SMILES || candidate.smiles || "",
    molecularFormula: candidate.MolecularFormula || candidate.molecularFormula,
    molecularWeight: candidate.MolecularWeight ?? candidate.molecularWeight,
    xlogp: candidate.XLogP ?? candidate.xlogp,
    hbd: candidate.HBondDonorCount ?? candidate.hbd,
    hba: candidate.HBondAcceptorCount ?? candidate.hba,
    rotatableBonds: candidate.RotatableBondCount ?? candidate.rotatableBonds,
    tpsa: candidate.TPSA ?? candidate.tpsa,
    class: candidate.drugClass || candidate.class || "",
    indication: candidate.indication || "",
  };
  const compact = compactPainsForRanking(pains);
  if (compact) row.pains = compact;
  return row;
}

function withPains(candidates, painsByCid = {}) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const cid = String(candidate.CID ?? candidate.cid ?? "");
    const pains = painsByCid[cid] || candidate.pains || candidate.painsAlerts;
    return pains ? { ...candidate, pains: compactPainsForRanking(pains) } : candidate;
  });
}

function rankingFromCachedRows(cachedRows, candidates, protein) {
  const nameByCid = new Map(
    (candidates || []).map((c) => [String(c.CID ?? c.cid), c.displayName || c.name || `CID ${c.CID ?? c.cid}`])
  );
  const ranking = [...cachedRows]
    .sort((a, b) => b.score - a.score || String(a.cid).localeCompare(String(b.cid)))
    .map((row, index) => ({
      cid: row.cid,
      rank: index + 1,
      score: row.score,
      reasoning: row.reasoning || [],
      strengths: row.strengths || [],
      concerns: row.concerns || [],
    }));
  const top = ranking[0];
  const ctx = buildTargetContext(protein);
  return {
    target: { name: ctx?.name || "", pdb_id: ctx?.pdb_id || pdbIdOf(protein) },
    candidates: ranking.map((row) => ({
      compound_id: row.cid,
      score: row.score,
      reasoning: row.reasoning,
    })),
    recommended: {
      cid: top.cid,
      score: top.score,
      reason: (top.reasoning || []).join(" ") || `${nameByCid.get(top.cid) || top.cid} is the best fit for this target.`,
    },
    ranking,
    summary: `Cached target-specific scores for ${ctx?.name || "the staged target"} (${pdbIdOf(protein)}).`,
    limitations: [
      "These scores were reused from a previous ranking of the same (compound, PDB structure) pairs.",
      "A score computed for one target is never reused for a different target.",
    ],
    source: "cache",
  };
}

export function tryCachedRanking(candidates, protein) {
  const cachedRows = hydrateRankingFromCache(candidates, protein);
  if (!cachedRows) return null;
  return rankingFromCachedRows(cachedRows, candidates, protein);
}

export async function rankCandidates(candidates, protein, painsByCid = {}) {
  const target = buildTargetContext(protein);
  const payload = {
    candidates: candidates.map((c) => toApiCandidate(c, painsByCid)),
    protein: target,
  };

  const cachedRows = hydrateRankingFromCache(candidates, protein);
  if (cachedRows) {
    return rankingFromCachedRows(cachedRows, candidates, protein);
  }

  try {
    const response = await fetch("/api/rank-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "AI analysis failed.");
    if (!data?.recommended?.cid || !Array.isArray(data.ranking)) {
      throw new Error("The AI returned an incomplete ranking.");
    }
    const local = rankCandidatesLocal(withPains(candidates, painsByCid), protein);
    const merged = overlayLocalScores(data, local);
    if (data?.aiError) merged.aiError = data.aiError;
    rememberRanking(protein, merged);
    return merged;
  } catch (error) {
    const fallback = rankCandidatesLocal(withPains(candidates, painsByCid), protein);
    rememberRanking(protein, fallback);
    return {
      ...fallback,
      aiError: error?.message || "The AI ranking request failed or returned malformed data.",
    };
  }
}

const BATCH_LIMIT = 30;

function overlayLocalScores(result, local) {
  if (!result || !local?.ranking?.length) return result || local;
  const localByCid = new Map(local.ranking.map((row) => [String(row.cid), row]));
  const merged = [];
  const seen = new Set();
  for (const row of result.ranking || []) {
    const cid = String(row.cid);
    const loc = localByCid.get(cid);
    seen.add(cid);
    if (!loc) {
      merged.push(row);
      continue;
    }
    merged.push({
      ...row,
      score: loc.score,
      reasoning: Array.isArray(row.reasoning) && row.reasoning.length ? row.reasoning : loc.reasoning,
      strengths: Array.isArray(row.strengths) && row.strengths.length ? row.strengths : loc.strengths,
      concerns: Array.isArray(row.concerns) && row.concerns.length ? row.concerns : loc.concerns,
    });
  }
  for (const loc of local.ranking) {
    if (!seen.has(String(loc.cid))) merged.push(loc);
  }
  const ranking = merged
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || String(a.cid).localeCompare(String(b.cid)))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const top = ranking[0];
  return {
    ...local,
    ...result,
    ranking,
    candidates: ranking.map((row) => ({
      compound_id: row.cid,
      score: row.score,
      reasoning: row.reasoning,
    })),
    recommended: top
      ? {
          cid: top.cid,
          score: top.score,
          reason: local.recommended?.reason || (top.reasoning || []).join(" "),
        }
      : local.recommended,
    source: local.source,
  };
}

/**
 * Rank a chunk of an approved-drug library (up to 30) with the same
 * target-aware API used by the 5-compound shortlist.
 *
 * Numeric scores always come from the local target-aware model so every
 * 25-compound batch shares one scale. Independent LLM 0–100 scores from
 * separate calls are not comparable and previously let a single highly
 * drug-like molecule (alprazolam) win every target after merge.
 */
export async function rankCandidatesBatch(candidates, protein, painsByCid = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return scoreLibraryLocal([], protein);
  }

  const scored = withPains(list.slice(0, BATCH_LIMIT), painsByCid);
  const local = scoreLibraryLocal(scored, protein);

  if (list.length === 1) {
    rememberRanking(protein, local);
    return local;
  }

  const target = buildTargetContext(protein);
  console.log(
    `[repurposing] batch target context for ${target?.pdb_id || pdbIdOf(protein)} (${target?.name || ""}):\n${JSON.stringify(target, null, 2)}`
  );

  const cachedRows = hydrateRankingFromCache(list, protein);
  if (cachedRows) {
    const reused = overlayLocalScores(rankingFromCachedRows(cachedRows, list, protein), local);
    rememberRanking(protein, reused);
    return reused;
  }

  const payload = {
    mode: "batch",
    candidates: scored.map((c) => toApiCandidate(c, painsByCid)),
    protein: target,
  };

  try {
    const response = await fetch("/api/rank-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "AI analysis failed.");
    if (!Array.isArray(data.ranking) || data.ranking.length !== payload.candidates.length) {
      throw new Error("The AI returned an incomplete ranking.");
    }
    const merged = overlayLocalScores(data, local);
    if (data?.aiError) merged.aiError = data.aiError;
    rememberRanking(protein, merged);
    return merged;
  } catch (error) {
    rememberRanking(protein, local);
    return {
      ...local,
      aiError: error?.message || "The AI ranking request failed or returned malformed data.",
    };
  }
}

export {
  clearRankingCache,
  getCachedScore,
  pdbIdOf,
  rankingCacheKey,
  rememberRanking,
  scoreLibraryLocal,
  overlayLocalScores,
};
