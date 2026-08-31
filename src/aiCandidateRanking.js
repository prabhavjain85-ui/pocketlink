import { compactPainsForRanking } from "./painsCheck";
import { rankCandidatesLocal } from "./scoreCandidates";
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
  const cid = candidate.CID ?? candidate.cid;
  const pains = painsByCid[String(cid)] || candidate.pains || candidate.painsAlerts;
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
    rememberRanking(protein, data);
    return data;
  } catch {
    const fallback = rankCandidatesLocal(withPains(candidates, painsByCid), protein);
    rememberRanking(protein, fallback);
    return fallback;
  }
}

export {
  clearRankingCache,
  getCachedScore,
  pdbIdOf,
  rankingCacheKey,
  rememberRanking,
};
