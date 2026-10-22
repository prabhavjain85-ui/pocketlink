/**
 * Client-side drug / CCD / PDB → co-crystal PDB entry discovery (RCSB Search + Data APIs).
 */

import { CRYSTALLOGRAPHY_ADDITIVES } from "./pdbStructure";

function isCrystallizationAdditive(compId, name) {
  const id = String(compId || "").trim().toUpperCase();
  if (CRYSTALLOGRAPHY_ADDITIVES.has(id)) return true;
  const n = String(name || "").toLowerCase();
  return /glycerol|sulfate|phosphate|acetate|dimethyl|dmso|ethanol|peg|nitrate|mes|benzamidine/.test(n);
}

const SEARCH_URL = "https://search.rcsb.org/rcsbsearch/v2/query";
const CHEMCOMP_URL = "https://data.rcsb.org/rest/v1/core/chemcomp";
const GRAPHQL_URL = "https://data.rcsb.org/graphql";

/** Common INN/generic names → CCD (verified against RCSB chemcomp). */
export const DRUG_NAME_TO_CCD = {
  imatinib: "STI",
  gleevec: "STI",
  glivec: "STI",
  /** PDB 1M17 and related EGFR structures: AQ4 = erlotinib (not gefitinib; gefitinib CCD is IRE). */
  erlotinib: "AQ4",
  tarceva: "AQ4",
  gefitinib: "IRE",
  iressa: "IRE",
  sitagliptin: "715",
  januvia: "715",
  ruxolitinib: "RXT",
  jakafi: "RXT",
  carazolol: "P0G",
  celecoxib: "CLX",
  celebrex: "CLX",
  sildenafil: "VIA",
  viagra: "VIA",
  tamoxifen: "TA1",
  "4-hydroxytamoxifen": "OHT",
  "hydroxytamoxifen": "OHT",
  atorvastatin: "117",
  lipitor: "117",
  oseltamivir: "OTV",
  tamiflu: "OTV",
};

const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;
const CCD_RE = /^[A-Z0-9]{1,3}$/i;

const memoryCache = new Map();

/** RCSB GraphQL may return resolution_combined as a number or single-element array. */
export function normalizeResolutionCombined(raw) {
  let resolution = raw ?? null;
  if (Array.isArray(resolution)) resolution = resolution[0] ?? null;
  if (resolution != null && typeof resolution !== "number") {
    const n = Number(resolution);
    resolution = Number.isFinite(n) ? n : null;
  }
  return resolution;
}

function cacheGet(key) {
  const row = memoryCache.get(key);
  if (!row) return null;
  if (Date.now() > row.expires) {
    memoryCache.delete(key);
    return null;
  }
  return row.value;
}

function cacheSet(key, value, ttlMs = 10 * 60 * 1000) {
  memoryCache.set(key, { value, expires: Date.now() + ttlMs });
}

export async function parseRcsbSearchResponse(res) {
  if (res.status === 204) return { result_set: [], total_count: 0 };
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RCSB search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const text = await res.text();
  if (!text.trim()) return { result_set: [], total_count: 0 };
  return JSON.parse(text);
}

export async function rcsbSearch(body) {
  const cacheKey = `search:${JSON.stringify(body)}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseRcsbSearchResponse(res);
  cacheSet(cacheKey, data);
  return data;
}

export function looksLikePdbId(query) {
  return PDB_ID_RE.test(String(query || "").trim());
}

export function looksLikeChemCompId(query) {
  const s = String(query || "").trim();
  if (!CCD_RE.test(s)) return false;
  if (looksLikePdbId(s)) return false;
  return true;
}

export async function fetchChemComp(compId) {
  const id = String(compId || "").trim().toUpperCase();
  if (!id) return null;
  const cacheKey = `chemcomp:${id}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;
  try {
    const res = await fetch(`${CHEMCOMP_URL}/${id}`);
    if (!res.ok) {
      cacheSet(cacheKey, null, 60_000);
      return null;
    }
    const data = await res.json();
    cacheSet(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

export async function pubchemSynonymsForName(name) {
  const q = encodeURIComponent(String(name).trim());
  if (!q) return [];
  const cacheKey = `pubchem:${q.toLowerCase()}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;
  try {
    const res = await fetch(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${q}/synonyms/JSON`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      cacheSet(cacheKey, [], 60_000);
      return [];
    }
    const data = await res.json();
    const list = data?.InformationList?.Information?.[0]?.Synonym || [];
    cacheSet(cacheKey, list.slice(0, 30));
    return list.slice(0, 30);
  } catch {
    return [];
  }
}

const ENTRY_LIGANDS_QUERY = `query($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    nonpolymer_entities {
      pdbx_entity_nonpoly { comp_id name }
      rcsb_nonpolymer_entity { pdbx_description }
      rcsb_nonpolymer_entity_container_identifiers { nonpolymer_comp_id }
    }
  }
}`;

const ENTRY_SUMMARY_QUERY = `query($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    struct { title }
    rcsb_entry_info {
      resolution_combined
      experimental_method
    }
    exptl { method }
    polymer_entities {
      rcsb_polymer_entity { pdbx_description }
      rcsb_entity_source_organism { ncbi_scientific_name }
    }
  }
}`;

async function fetchGraphql(query, variables) {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.errors?.length) return null;
    return data.data;
  } catch {
    return null;
  }
}

function fallbackEntrySummaries(entryIds) {
  return (entryIds || [])
    .map((id) => String(id || "").trim().toUpperCase())
    .filter(Boolean)
    .map((pdbId) => ({
      pdbId,
      title: pdbId,
      resolution: null,
      proteinName: "—",
      organism: "—",
      method: "—",
    }));
}

function scoreCompMatch(compId, name, description, query, synonyms) {
  const q = query.toLowerCase();
  const tokens = [q, ...synonyms.map((s) => String(s).toLowerCase())];
  let score = 0;
  const blob = `${compId} ${name || ""} ${description || ""}`.toLowerCase();
  for (const t of tokens) {
    if (!t || t.length < 3) continue;
    if (t === compId.toLowerCase()) score += 50;
    if (blob.includes(t)) score += 10;
  }
  if (isCrystallizationAdditive(compId, name)) score -= 100;
  return score;
}

export async function discoverChemCompCandidates(query) {
  const raw = String(query || "").trim();
  if (!raw) return { candidates: [], message: "Enter a drug name, CCD code, or PDB ID." };

  const lower = raw.toLowerCase();
  const candidates = [];
  const seen = new Set();

  const addCandidate = (compId, name, source, score = 0) => {
    const id = String(compId || "").trim().toUpperCase();
    if (!id || seen.has(id) || isCrystallizationAdditive(id, name)) return;
    seen.add(id);
    candidates.push({ compId: id, name: name || id, source, score });
  };

  if (DRUG_NAME_TO_CCD[lower]) {
    const ccd = DRUG_NAME_TO_CCD[lower];
    const meta = await fetchChemComp(ccd);
    addCandidate(ccd, meta?.chem_comp?.name, "curated_alias", 100);
  }

  if (looksLikeChemCompId(raw)) {
    const meta = await fetchChemComp(raw);
    if (meta?.chem_comp) addCandidate(raw, meta.chem_comp.name, "ccd_input", 90);
  }

  const synonyms = await pubchemSynonymsForName(raw);

  if (!looksLikePdbId(raw)) {
    const ft = await rcsbSearch({
      query: { type: "terminal", service: "full_text", parameters: { value: raw } },
      return_type: "entry",
      request_options: { paginate: { start: 0, rows: 12 } },
    });
    const ids = (ft.result_set || []).map((r) => r.identifier);
    if (ids.length) {
      const data = await fetchGraphql(ENTRY_LIGANDS_QUERY, { ids });
      for (const entry of data?.entries || []) {
        for (const ent of entry.nonpolymer_entities || []) {
          const compId =
            ent.pdbx_entity_nonpoly?.comp_id ||
            ent.rcsb_nonpolymer_entity_container_identifiers?.nonpolymer_comp_id;
          const name = ent.pdbx_entity_nonpoly?.name || ent.rcsb_nonpolymer_entity?.pdbx_description;
          const score = scoreCompMatch(compId, name, name, raw, synonyms);
          if (score > 0) addCandidate(compId, name, "entry_full_text", score);
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates,
    synonyms: synonyms.slice(0, 5),
    message: candidates.length ? null : `No chemical component (CCD) match for "${raw}". Try a CCD code (e.g. STI) or PDB ID.`,
  };
}

export async function searchPdbEntriesForChemComp(compId, { start = 0, rows = 25 } = {}) {
  const id = String(compId || "").trim().toUpperCase();
  const data = await rcsbSearch({
    query: {
      type: "terminal",
      service: "text",
      parameters: {
        attribute: "rcsb_nonpolymer_entity_container_identifiers.nonpolymer_comp_id",
        operator: "exact_match",
        value: id,
      },
    },
    return_type: "entry",
    request_options: {
      paginate: { start, rows },
      sort: [{ sort_by: "rcsb_entry_info.resolution_combined", direction: "asc" }],
    },
  });
  const ids = (data.result_set || []).map((r) => r.identifier);
  const enriched = await enrichEntrySummaries(ids);
  return {
    totalCount: data.total_count ?? ids.length,
    entries: enriched,
    compId: id,
  };
}

export async function enrichEntrySummaries(entryIds) {
  const ids = [...new Set((entryIds || []).map((i) => String(i).toUpperCase()).filter(Boolean))];
  if (!ids.length) return [];
  const cacheKey = `entries:${ids.join(",")}`;
  const hit = cacheGet(cacheKey);
  if (hit) return hit;

  const data = await fetchGraphql(ENTRY_SUMMARY_QUERY, { ids });
  if (!data?.entries) {
    const rows = fallbackEntrySummaries(ids);
    cacheSet(cacheKey, rows);
    return rows;
  }
  const rows = (data.entries || []).filter(Boolean).map((e) => {
    const polymer = e.polymer_entities?.[0];
    const organism =
      polymer?.rcsb_entity_source_organism?.[0]?.ncbi_scientific_name ||
      polymer?.rcsb_entity_source_organism?.ncbi_scientific_name ||
      "—";
    const proteinName = polymer?.rcsb_polymer_entity?.pdbx_description || "—";
    const method =
      e.rcsb_entry_info?.experimental_method ||
      e.exptl?.[0]?.method ||
      "—";
    return {
      pdbId: e.rcsb_id,
      title: e.struct?.title || e.rcsb_id,
      resolution: normalizeResolutionCombined(e.rcsb_entry_info?.resolution_combined),
      proteinName,
      organism,
      method,
    };
  });
  rows.sort((a, b) => {
    const ra = a.resolution ?? 999;
    const rb = b.resolution ?? 999;
    return ra - rb;
  });
  cacheSet(cacheKey, rows);
  return rows;
}

export async function listDrugLikeLigandsInEntry(pdbId) {
  const data = await fetchGraphql(ENTRY_LIGANDS_QUERY, { ids: [pdbId.toUpperCase()] });
  const entry = data?.entries?.[0];
  if (!entry) return [];
  const out = [];
  for (const ent of entry.nonpolymer_entities || []) {
    const compId =
      ent.pdbx_entity_nonpoly?.comp_id ||
      ent.rcsb_nonpolymer_entity_container_identifiers?.nonpolymer_comp_id;
    const name = ent.pdbx_entity_nonpoly?.name || ent.rcsb_nonpolymer_entity?.pdbx_description;
    if (!compId || isCrystallizationAdditive(compId, name)) continue;
    out.push({ compId: String(compId).toUpperCase(), name: name || compId });
  }
  return out;
}

/**
 * Resolve user query to chem comp(s) or direct PDB entry mode.
 */
export async function resolveCocrystalSearchQuery(query) {
  const raw = String(query || "").trim();
  if (!raw) {
    return { mode: "empty", candidates: [], entries: [], message: "Enter a drug name, CCD code, or PDB ID." };
  }

  if (looksLikePdbId(raw)) {
    const pdbId = raw.toUpperCase();
    const ligands = await listDrugLikeLigandsInEntry(pdbId);
    const entries = await enrichEntrySummaries([pdbId]);
    return {
      mode: "pdb_entry",
      pdbId,
      ligands,
      entries,
      candidates: ligands.map((l) => ({ compId: l.compId, name: l.name, source: "pdb_entry" })),
      message: ligands.length ? null : `PDB ${pdbId} has no drug-like co-crystallized ligand in the annotated non-polymer entities.`,
    };
  }

  const { candidates, message, synonyms } = await discoverChemCompCandidates(raw);
  if (!candidates.length) {
    return { mode: "failed", candidates: [], entries: [], message, synonyms };
  }

  const primary = candidates[0];
  const { entries, totalCount } = await searchPdbEntriesForChemComp(primary.compId);
  return {
    mode: "chem_comp",
    selectedCompId: primary.compId,
    candidates,
    entries,
    totalCount,
    synonyms,
    message: entries.length
      ? null
      : `CCD ${primary.compId} is known, but no PDB entries contain this ligand in RCSB.`,
  };
}
