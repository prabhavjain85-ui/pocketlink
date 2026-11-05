import { scoreAssociatedRows, normalizeCustomWeights } from "./noveltyScore.js";
import { getCachedTargets, rememberTargets } from "./targetDiscoveryCache.js";

export const OT_GQL = "https://api.platform.opentargets.org/api/v4/graphql";
export const ASSOCIATION_PAGE_SIZE = 50;
export const SEARCH_PAGE_SIZE = 8;

const DOWNTIME_MSG =
  "Couldn't reach the Open Targets Platform. Check your connection and try again, or try again in a few minutes if the service is down.";

const SEARCH_QUERY = `
query DiseaseSearch($q: String!, $size: Int!) {
  search(queryString: $q, entityNames: ["disease"], page: { index: 0, size: $size }) {
    hits { id name entity description }
  }
}
`;

export const ASSOCIATED_QUERY = `
query DiseaseAssociatedTargets($efoId: String!, $size: Int!) {
  disease(efoId: $efoId) {
    id
    name
    associatedTargets(page: { index: 0, size: $size }, orderByScore: "score desc") {
      count
      rows {
        score
        datatypeScores { id score }
        datasourceScores { id score }
        target {
          id
          approvedSymbol
          approvedName
          biotype
          functionDescriptions
          isEssential
          geneticConstraint {
            constraintType
            exp
            obs
            score
            oe
            oeLower
            oeUpper
          }
          homologues {
            speciesId
            speciesName
            homologyType
            targetGeneId
            targetGeneSymbol
            queryPercentageIdentity
            targetPercentageIdentity
          }
          drugAndClinicalCandidates { count }
          tractability {
            label
            modality
            value
          }
          safetyLiabilities {
            event
            biosamples {
              tissueLabel
            }
          }
          proteinIds {
            id
            source
          }
        }
      }
    }
  }
}
`;

export const ASSOCIATED_QUERY_CORE = `
query DiseaseAssociatedTargetsCore($efoId: String!, $size: Int!) {
  disease(efoId: $efoId) {
    id
    name
    associatedTargets(page: { index: 0, size: $size }, orderByScore: "score desc") {
      count
      rows {
        score
        datatypeScores { id score }
        datasourceScores { id score }
        target {
          id
          approvedSymbol
          approvedName
          biotype
          isEssential
          drugAndClinicalCandidates { count }
          tractability {
            label
            modality
            value
          }
          safetyLiabilities {
            event
            biosamples {
              tissueLabel
            }
          }
          proteinIds {
            id
            source
          }
        }
      }
    }
  }
}
`;

export async function otGraphql(query, variables, { signal, retries = 1 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(OT_GQL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "TargetForge/1.0",
        },
        body: JSON.stringify({ query, variables }),
        signal,
      });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const error = new Error(DOWNTIME_MSG);
      error.cause = err;
      throw error;
    }

    let body = null;
    if (typeof res.json === "function") {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    if (body?.errors?.length) {
      const msg = body.errors.map((e) => e.message).filter(Boolean).join("; ");
      throw new Error(msg || DOWNTIME_MSG);
    }
    if (!res.ok || !body) {
      if (attempt < retries && (res?.status >= 500 || res?.status === 429)) {
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      throw new Error(DOWNTIME_MSG);
    }
    return body?.data;
  }
  const error = new Error(DOWNTIME_MSG);
  if (lastErr) error.cause = lastErr;
  throw error;
}

export function noDiseaseMatchMessage(query) {
  return `Open Targets has no disease matching "${query}". Try a more specific name (e.g. "pancreatic cancer" or "chronic myeloid leukemia").`;
}

export function pickDiseaseHit(hits, query) {
  const list = Array.isArray(hits) ? hits.filter((h) => h && h.id) : [];
  if (!list.length) return null;
  const q = String(query || "").trim().toLowerCase();
  if (!q) return list[0];
  const exact = list.find((h) => String(h.name || "").toLowerCase() === q);
  if (exact) return exact;
  const starts = list.find((h) => {
    const name = String(h.name || "").toLowerCase();
    if (!name.startsWith(q)) return false;
    const suffix = name.slice(q.length).trim();
    if (suffix.startsWith(",") || (!q.includes("susceptibility") && name.includes("susceptibility"))) {
      return false;
    }
    return true;
  });
  return starts || list[0];
}

export async function searchDiseases(queryString, { size = SEARCH_PAGE_SIZE, signal } = {}) {
  const q = String(queryString || "").trim();
  if (!q) return [];
  const data = await otGraphql(SEARCH_QUERY, { q, size }, { signal });
  return (data?.search?.hits || []).filter((h) => h && h.id && h.entity === "disease");
}

export async function fetchAssociatedTargets(efoId, { size = ASSOCIATION_PAGE_SIZE, signal } = {}) {
  const id = String(efoId || "").trim();
  if (!id) throw new Error("Missing disease ID.");
  let data;
  try {
    data = await otGraphql(ASSOCIATED_QUERY, { efoId: id, size }, { signal });
  } catch (err) {
    if (err?.name === "AbortError" || err?.message === DOWNTIME_MSG) throw err;
    data = await otGraphql(ASSOCIATED_QUERY_CORE, { efoId: id, size }, { signal });
  }
  const disease = data?.disease;
  if (!disease) {
    throw new Error(`Open Targets has no disease with ID "${id}".`);
  }
  return {
    id: disease.id,
    name: disease.name,
    count: Number(disease.associatedTargets?.count) || 0,
    rows: disease.associatedTargets?.rows || [],
  };
}

export async function runTargetDiscovery(
  queryString,
  { skipCache = false, diseaseHint = null, profile = "novel_discovery", customWeights = null, signal } = {}
) {
  const q = String(queryString || "").trim();
  const normalizedCustom = normalizeCustomWeights(customWeights);
  const profileKey = normalizedCustom
    ? "custom"
    : profile === "repurposing"
      ? "repurposing"
      : "novel_discovery";
  let disease = diseaseHint && diseaseHint.id ? diseaseHint : null;
  if (!disease) {
    if (!q) {
      return { error: "", hits: [], disease: null, novelty: [], established: [], all: [], evidenceProfile: profileKey };
    }
    const hits = await searchDiseases(q, { signal });
    if (!hits.length) {
      return {
        error: noDiseaseMatchMessage(q),
        hits: [],
        disease: null,
        novelty: [],
        established: [],
        all: [],
        fetchedCount: 0,
        evidenceProfile: profileKey,
      };
    }
    disease = pickDiseaseHit(hits, q);
  }

  const customSuffix = normalizedCustom
    ? `:${Object.values(normalizedCustom)
        .map((v) => v.toFixed(2))
        .join(",")}`
    : "";
  const cacheKey =
    profileKey === "novel_discovery" ? disease.id : `${disease.id}:${profileKey}${customSuffix}`;
  if (!skipCache) {
    const cached = getCachedTargets(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true, error: "" };
    }
  }

  const raw = await fetchAssociatedTargets(disease.id, { signal });
  const scored = scoreAssociatedRows(raw.rows, {
    profile: profileKey === "repurposing" ? "repurposing" : "novel_discovery",
    customWeights: normalizedCustom,
  });
  const payload = {
    disease: {
      id: raw.id,
      name: raw.name,
      description: disease.description || "",
      associationCount: raw.count,
    },
    fetchedCount: raw.rows.length,
    all: scored.all,
    novelty: scored.novelty,
    established: scored.established,
    evidenceProfile: scored.evidenceProfile,
    fromCache: false,
    error: "",
  };
  rememberTargets(cacheKey, payload);
  return payload;
}

