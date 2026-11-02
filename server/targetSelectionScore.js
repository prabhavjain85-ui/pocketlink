/**
 * Target Selection Score — rules-based ranking of PDB structures for
 * docking / design follow-up. Pure functions plus a batched RCSB fetch.
 * No LLM involved.
 */

const GRAPHQL_URL = "https://data.rcsb.org/graphql";
const REST_ENTRY_URL = "https://data.rcsb.org/rest/v1/core/entry";
const REST_NONPOLYMER_URL = "https://data.rcsb.org/rest/v1/core/nonpolymer_entity";
const REST_INSTANCE_URL = "https://data.rcsb.org/rest/v1/core/nonpolymer_entity_instance";

const POCKET_DISTANCE_A = 5;

/** Chem-comp IDs and name tokens from the product spec's additive list. */
const ADDITIVE_COMP_IDS = new Set([
  "EDO",
  "GOL",
  "SO4",
  "PO4",
  "DMS",
  "DMSO",
  "ACT",
  "ACY",
  "PEG",
  "PGE",
  "1PE",
  "2PE",
  "PG4",
  "P6G",
  "PE3",
  "PE4",
  "PE5",
  "PE6",
  "PE8",
  "PG0",
  "1PG",
  "2PG",
  "15P",
  "P33",
  "SUL",
]);

const ADDITIVE_NAME_RE =
  /\b(glycerol|sulfate|acetate|dmso|dimethyl sulfoxide|polyethylene glycol|peg\d*)\b/i;

const SOLVENT_COMP_IDS = new Set(["HOH", "DOD", "WAT", "OH", "OD"]);

const HYDROPHOBIC_RESIDUES = new Set(["ALA", "VAL", "LEU", "ILE", "MET", "PHE", "TRP", "PRO"]);

const LIGAND_GROUP_RULES = [
  { re: /\b(phosphate|phospho|triphosphate|diphosphate|atp|adp|amp)\b/i, label: "phosphate" },
  { re: /\b(adenine|adenosine)\b/i, label: "adenine nucleoside" },
  { re: /\b(indole|indolin)\b/i, label: "indole" },
  { re: /\b(sulfonamide|sulphonamide)\b/i, label: "sulfonamide" },
  { re: /\b(nitrile|cyano)\b/i, label: "nitrile" },
  { re: /\b(pyridine|pyrimidine|purine|quinazoline|quinoline|imidazole)\b/i, label: "nitrogen heterocycle" },
  { re: /\b(carboxyl|carboxylic|benzoate)\b/i, label: "carboxylate" },
  { re: /\b(benzamide|carboxamide|\bamide\b)\b/i, label: "amide" },
  { re: /\b(phenol|hydroxyphenyl)\b/i, label: "phenol" },
  { re: /\b(staurosporine|imatinib|kinase inhibitor)\b/i, label: "kinase-inhibitor-like scaffold" },
  { re: /steroid|androstene|estradi|cholest/i, label: "steroid scaffold" },
];

const WEIGHTS = {
  resolution: 25,
  completeness: 25,
  ligand: 20,
  pocket: 15,
  method: 15,
};

function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * RCSB GraphQL `rcsb_nonpolymer_entity.formula_weight` is in kDa
 * (imatinib ≈ 0.494). REST fixtures and PubChem-style values are already
 * g/mol. Convert the kDa form so size-matching is not 389 vs 0.5.
 */
function ligandWeightDa(raw) {
  const n = num(raw);
  if (n == null || n <= 0) return null;
  if (n < 20) return Math.round(n * 10000) / 10;
  return n;
}

function isCrystallizationAdditive(compId, name) {
  const id = String(compId || "").toUpperCase().trim();
  if (id && ADDITIVE_COMP_IDS.has(id)) return true;
  const n = String(name || "").trim();
  if (n && ADDITIVE_NAME_RE.test(n)) return true;
  return false;
}

function classifyMethod(method) {
  const raw = String(method || "").trim();
  if (!raw || raw === "—" || raw.toUpperCase() === "N/A") {
    return { kind: "unknown", pts: 0, label: "N/A" };
  }
  const m = raw.toUpperCase();
  if (m.includes("X-RAY") || m === "XRAY" || m === "X-RAY") {
    return { kind: "xray", pts: 15, label: "X-ray" };
  }
  if (
    m.includes("ELECTRON MICROSCOPY") ||
    m.includes("CRYO-EM") ||
    m.includes("CRYOEM") ||
    m.includes("ELECTRON CRYSTALLOGRAPHY") ||
    (m.includes("EM") && m.includes("ELECTRON"))
  ) {
    return { kind: "cryoem", pts: 12, label: "Cryo-EM" };
  }
  if (m.includes("NMR")) {
    return { kind: "nmr", pts: 8, label: "NMR" };
  }
  return { kind: "other", pts: 5, label: raw };
}

function scoreResolution(resolutionA) {
  const r = num(resolutionA);
  if (r == null) return { pts: 0, value: null };
  if (r <= 2.0) return { pts: 25, value: r };
  if (r <= 2.5) return { pts: 20, value: r };
  if (r <= 3.0) return { pts: 15, value: r };
  if (r <= 3.5) return { pts: 10, value: r };
  return { pts: 5, value: r };
}

function completenessPercent(info) {
  if (!info || typeof info !== "object") return null;
  const modeled = num(info.deposited_modeled_polymer_monomer_count);
  const deposited = num(info.deposited_polymer_monomer_count);
  const polymer = num(info.polymer_monomer_count);
  const unmodeled = num(info.deposited_unmodeled_polymer_monomer_count);

  let pct = null;
  if (modeled != null && polymer != null && polymer > 0) {
    pct = (100 * modeled) / polymer;
  } else if (deposited != null && polymer != null && polymer > 0) {
    pct = (100 * deposited) / polymer;
  } else if (modeled != null && deposited != null && deposited > 0) {
    pct = (100 * modeled) / deposited;
  } else if (modeled != null && unmodeled != null && modeled + unmodeled > 0) {
    pct = (100 * modeled) / (modeled + unmodeled);
  } else if (deposited != null && unmodeled != null && deposited + unmodeled > 0 && modeled == null) {
    pct = (100 * deposited) / (deposited + unmodeled);
  }
  if (pct == null) return null;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

function scoreCompleteness(pct) {
  const p = num(pct);
  if (p == null) return { pts: 0, value: null };
  return { pts: WEIGHTS.completeness * (p / 100), value: p };
}

function ligandEntitiesFromNonpolymers(nonpolymerEntities) {
  const list = Array.isArray(nonpolymerEntities) ? nonpolymerEntities : [];
  const ligands = [];
  for (const entity of list) {
    const poly = entity?.pdbx_entity_nonpoly || {};
    const meta = entity?.rcsb_nonpolymer_entity || {};
    const ids = entity?.rcsb_nonpolymer_entity_container_identifiers || {};
    const compId = poly.comp_id || ids.nonpolymer_comp_id || ids.chem_ref_def_id || "";
    const name = poly.name || meta.pdbx_description || "";
    if (!compId && !name) continue;
    if (isCrystallizationAdditive(compId, name)) continue;
    if (SOLVENT_COMP_IDS.has(String(compId).toUpperCase())) continue;
    ligands.push({
      compId,
      name,
      formulaWeight: ligandWeightDa(meta.formula_weight),
      instances: Array.isArray(entity.nonpolymer_entity_instances)
        ? entity.nonpolymer_entity_instances
        : entity.instances || [],
    });
  }
  return ligands;
}

function pocketFromLigands(ligands) {
  if (!ligands.length) return "unclear";
  let sawNeighborData = false;
  let nearPolymer = false;
  for (const ligand of ligands) {
    const instances = ligand.instances || [];
    for (const inst of instances) {
      const neighbors = inst.rcsb_target_neighbors || inst.target_neighbors || [];
      if (!Array.isArray(neighbors) || !neighbors.length) continue;
      sawNeighborData = true;
      for (const n of neighbors) {
        const dist = num(n.distance);
        const targetId = String(n.target_comp_id || "").toUpperCase();
        if (dist == null) continue;
        if (dist > POCKET_DISTANCE_A) continue;
        if (SOLVENT_COMP_IDS.has(targetId)) continue;
        nearPolymer = true;
        break;
      }
    }
    if (nearPolymer) break;
  }
  if (nearPolymer) return "detected";
  if (sawNeighborData) return "none";
  return "unclear";
}

function scorePocket(status) {
  if (status === "detected") return { pts: 15, value: status };
  if (status === "unclear") return { pts: 7, value: status };
  if (status === "none") return { pts: 0, value: status };
  return { pts: 7, value: "unclear" };
}

function inferLigandFunctionalGroups(name, compId) {
  const text = `${name || ""} ${compId || ""}`.trim();
  if (!text) return [];
  const groups = [];
  for (const rule of LIGAND_GROUP_RULES) {
    if (rule.re.test(text) && !groups.includes(rule.label)) groups.push(rule.label);
  }
  return groups;
}

/**
 * Derive pocket size / hydrophobicity from already-fetched ligand neighbor
 * residues. No extra RCSB request.
 */
function pocketStatsFromLigands(ligands) {
  const status = pocketFromLigands(ligands);
  const nearby = [];
  for (const ligand of Array.isArray(ligands) ? ligands : []) {
    for (const inst of ligand.instances || []) {
      const neighbors = inst.rcsb_target_neighbors || inst.target_neighbors || [];
      if (!Array.isArray(neighbors)) continue;
      for (const n of neighbors) {
        const dist = num(n.distance);
        const targetId = String(n.target_comp_id || "").toUpperCase();
        if (!targetId || SOLVENT_COMP_IDS.has(targetId)) continue;
        if (dist == null || dist > POCKET_DISTANCE_A) continue;
        nearby.push(targetId);
      }
    }
  }

  if (!nearby.length) {
    return {
      status,
      available: false,
      residueCount: null,
      hydrophobicity: null,
      sizeLabel: null,
      hydrophobicityLabel: null,
    };
  }

  const residueCount = nearby.length;
  const hydrophobicCount = nearby.filter((res) => HYDROPHOBIC_RESIDUES.has(res)).length;
  const hydrophobicity = Math.round((100 * hydrophobicCount) / residueCount) / 100;
  let sizeLabel = "medium";
  if (residueCount <= 8) sizeLabel = "small";
  else if (residueCount >= 17) sizeLabel = "large";
  let hydrophobicityLabel = "mixed";
  if (hydrophobicity >= 0.6) hydrophobicityLabel = "hydrophobic";
  else if (hydrophobicity <= 0.35) hydrophobicityLabel = "polar";

  return {
    status,
    available: true,
    residueCount,
    hydrophobicity,
    sizeLabel,
    hydrophobicityLabel,
  };
}

function formatAngstrom(value) {
  const n = num(value);
  if (n == null) return "N/A";
  const rounded = Math.round(n * 100) / 100;
  let text = rounded.toFixed(2);
  if (text.endsWith(".00")) text = rounded.toFixed(1);
  else if (text.endsWith("0")) text = text.slice(0, -1);
  return `${text} Å`;
}

function formatPct(value) {
  const n = num(value);
  if (n == null) return "N/A";
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

function recommendationReasons(scored) {
  const items = [];
  const r = scored.resolutionValue;
  const resPts = scored.breakdown.resolution;
  if (r != null) {
    if (resPts >= 25) items.push({ rank: 5, text: `Excellent resolution (${formatAngstrom(r)})` });
    else if (resPts >= 20) items.push({ rank: 4, text: `High resolution (${formatAngstrom(r)})` });
    else if (resPts >= 15) items.push({ rank: 3, text: `Good resolution (${formatAngstrom(r)})` });
    else if (resPts >= 10) items.push({ rank: 2, text: `Moderate resolution (${formatAngstrom(r)})` });
    else items.push({ rank: 1, text: `Resolution ${formatAngstrom(r)}` });
  }

  if (scored.hasLigand) {
    items.push({ rank: 4, text: "Co-crystallized ligand present" });
  }

  const c = scored.completeness;
  if (c != null) {
    const label = formatPct(c);
    if (c >= 90) items.push({ rank: 5, text: `High structural completeness (${label})` });
    else if (c >= 80) items.push({ rank: 3, text: `Solid structural completeness (${label})` });
    else items.push({ rank: 1, text: `Structural completeness ${label}` });
  }

  if (scored.pocket === "detected") {
    items.push({ rank: 4, text: "Suitable binding pocket detected" });
  }

  if (scored.methodKind === "xray") {
    items.push({ rank: 3, text: "Experimentally determined via X-ray" });
  } else if (scored.methodKind === "cryoem") {
    items.push({ rank: 3, text: "Experimentally determined via Cryo-EM" });
  } else if (scored.methodKind === "nmr") {
    items.push({ rank: 2, text: "Experimentally determined via NMR" });
  } else if (scored.methodLabel && scored.methodLabel !== "N/A") {
    items.push({ rank: 1, text: `Experimental method: ${scored.methodLabel}` });
  }

  items.sort((a, b) => b.rank - a.rank);
  const unique = [];
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.text)) continue;
    seen.add(it.text);
    unique.push(it.text);
  }

  const fallbacks = [
    scored.hasLigand ? "Co-crystallized ligand present" : null,
    scored.pocket === "detected"
      ? "Suitable binding pocket detected"
      : scored.pocket === "unclear"
        ? "Binding pocket unclear (not claimed absent)"
        : scored.pocket === "none"
          ? "No polymer residues within 5 Å of a bound ligand"
          : null,
    c != null ? `Structural completeness ${formatPct(c)}` : null,
    r != null ? `Resolution ${formatAngstrom(r)}` : "Resolution N/A for this entry",
    scored.methodLabel && scored.methodLabel !== "N/A"
      ? `Experimental method: ${scored.methodLabel}`
      : null,
  ].filter(Boolean);

  for (const text of fallbacks) {
    if (unique.length >= 3) break;
    if (!seen.has(text)) {
      seen.add(text);
      unique.push(text);
    }
  }

  if (unique.length > 5) return unique.slice(0, 5);
  return unique;
}

function scoreTargetFeatures(features) {
  const resolution = scoreResolution(features.resolutionA);
  const completeness = scoreCompleteness(features.completeness);
  const hasLigand = Boolean(features.hasLigand);
  const ligandPts = hasLigand ? WEIGHTS.ligand : 0;
  const pocketStatus = features.pocket || (hasLigand ? "unclear" : "unclear");
  const pocket = scorePocket(pocketStatus);
  const method = classifyMethod(features.method);

  const breakdown = {
    resolution: resolution.pts,
    completeness: completeness.pts,
    ligand: ligandPts,
    pocket: pocket.pts,
    method: method.pts,
  };
  const rawTotal =
    breakdown.resolution +
    breakdown.completeness +
    breakdown.ligand +
    breakdown.pocket +
    breakdown.method;
  const score = Math.round(Math.max(0, Math.min(100, rawTotal)));

  const ligands = features.ligands || [];
  const pocketStats = features.pocketStats || pocketStatsFromLigands(ligands);
  const scored = {
    id: features.id,
    title: features.title || "Untitled entry",
    date: features.date || "—",
    method: features.method || method.label,
    methodKind: method.kind,
    methodLabel: method.label,
    resolution: resolution.value != null ? formatAngstrom(resolution.value) : "N/A",
    resolutionValue: resolution.value,
    completeness: completeness.value,
    completenessLabel: completeness.value != null ? formatPct(completeness.value) : "N/A",
    hasLigand,
    ligandLabel: hasLigand ? "✅" : "❌",
    pocket: pocket.value,
    pocketLabel: pocket.value === "detected" ? "✅" : pocket.value === "none" ? "❌" : "?",
    pocketStats,
    breakdown,
    score,
    ligands,
  };
  scored.reasons = recommendationReasons(scored);
  return scored;
}

function extractFromGraphqlEntry(entry) {
  if (!entry) return null;
  const info = entry.rcsb_entry_info || {};
  const identifiers = entry.rcsb_entry_container_identifiers || {};
  const id = entry.rcsb_id || identifiers.entry_id;
  if (!id) return null;
  const method =
    (entry.exptl && entry.exptl[0] && entry.exptl[0].method) ||
    info.experimental_method ||
    "";
  const resList = info.resolution_combined;
  const resolutionA = Array.isArray(resList) && resList.length ? resList[0] : null;
  const dateRaw =
    (entry.rcsb_accession_info && entry.rcsb_accession_info.initial_release_date) || "";
  const ligands = ligandEntitiesFromNonpolymers(entry.nonpolymer_entities);
  return {
    id,
    title: (entry.struct && entry.struct.title) || "Untitled entry",
    date: dateRaw ? String(dateRaw).slice(0, 4) : "—",
    method,
    resolutionA,
    completeness: completenessPercent(info),
    hasLigand: ligands.length > 0,
    pocket: pocketFromLigands(ligands),
    pocketStats: pocketStatsFromLigands(ligands),
    ligands,
  };
}

function extractFromRestEntry(entry, nonpolymerEntities) {
  if (!entry) return null;
  const info = entry.rcsb_entry_info || {};
  const identifiers = entry.rcsb_entry_container_identifiers || {};
  const id = entry.rcsb_id || identifiers.entry_id;
  if (!id) return null;
  const method =
    (entry.exptl && entry.exptl[0] && entry.exptl[0].method) ||
    info.experimental_method ||
    "";
  const resList = info.resolution_combined;
  const resolutionA = Array.isArray(resList) && resList.length ? resList[0] : null;
  const dateRaw =
    (entry.rcsb_accession_info && entry.rcsb_accession_info.initial_release_date) || "";
  const ligands = ligandEntitiesFromNonpolymers(nonpolymerEntities);
  return {
    id,
    title: (entry.struct && entry.struct.title) || "Untitled entry",
    date: dateRaw ? String(dateRaw).slice(0, 4) : "—",
    method,
    resolutionA,
    completeness: completenessPercent(info),
    hasLigand: ligands.length > 0,
    pocket: pocketFromLigands(ligands),
    pocketStats: pocketStatsFromLigands(ligands),
    ligands,
  };
}

function rankScoredTargets(scoredList) {
  const list = (Array.isArray(scoredList) ? scoredList : []).filter(Boolean);
  return [...list].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = a.resolutionValue;
    const rb = b.resolutionValue;
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id));
  });
}

const GRAPHQL_QUERY = `query($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    struct { title }
    rcsb_accession_info { initial_release_date }
    rcsb_entry_info {
      resolution_combined
      nonpolymer_entity_count
      deposited_polymer_monomer_count
      deposited_modeled_polymer_monomer_count
      deposited_unmodeled_polymer_monomer_count
      experimental_method
    }
    exptl { method }
    rcsb_entry_container_identifiers { entry_id non_polymer_entity_ids }
    nonpolymer_entities {
      pdbx_entity_nonpoly { comp_id name }
      rcsb_nonpolymer_entity { pdbx_description formula_weight }
      rcsb_nonpolymer_entity_container_identifiers { nonpolymer_comp_id }
      nonpolymer_entity_instances {
        rcsb_id
        rcsb_target_neighbors {
          distance
          target_comp_id
        }
      }
    }
  }
}`;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

async function fetchEntriesGraphql(ids) {
  const data = await fetchJson(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: GRAPHQL_QUERY, variables: { ids } }),
  });
  if (data.errors && data.errors.length) {
    throw new Error(data.errors[0].message || "GraphQL error");
  }
  return (data.data && data.data.entries) || [];
}

async function fetchNonpolymerRest(entryId, entityId) {
  try {
    const entity = await fetchJson(`${REST_NONPOLYMER_URL}/${entryId}/${entityId}`);
    const asymIds =
      (entity.rcsb_nonpolymer_entity_container_identifiers &&
        entity.rcsb_nonpolymer_entity_container_identifiers.asym_ids) ||
      [];
    const instances = [];
    const firstAsym = asymIds[0];
    if (firstAsym) {
      try {
        const inst = await fetchJson(`${REST_INSTANCE_URL}/${entryId}/${firstAsym}`);
        instances.push({
          rcsb_id: inst.rcsb_id,
          rcsb_target_neighbors: inst.rcsb_target_neighbors || [],
        });
      } catch (e) {
        // Pocket stays unclear if instance lookup fails.
      }
    }
    return { ...entity, nonpolymer_entity_instances: instances };
  } catch (e) {
    return null;
  }
}

async function fetchEntryRest(id) {
  const entry = await fetchJson(`${REST_ENTRY_URL}/${id}`);
  const npIds =
    (entry.rcsb_entry_container_identifiers &&
      entry.rcsb_entry_container_identifiers.non_polymer_entity_ids) ||
    [];
  const entities = (await Promise.all(npIds.map((eid) => fetchNonpolymerRest(id, eid)))).filter(
    Boolean
  );
  return extractFromRestEntry(entry, entities);
}

/**
 * Fetch RCSB metadata for the given PDB IDs and return scored, ranked rows.
 * Uses one GraphQL request for the whole batch; REST is the fallback.
 */
async function fetchAndScoreTargets(ids) {
  const unique = [...new Set((ids || []).map((id) => String(id).toUpperCase()).filter(Boolean))];
  if (!unique.length) return [];

  try {
    const entries = (await fetchEntriesGraphql(unique)).filter(Boolean);
    const scored = entries
      .map((e) => {
        const features = extractFromGraphqlEntry(e);
        return features ? scoreTargetFeatures(features) : null;
      })
      .filter(Boolean);
    if (scored.length) return rankScoredTargets(scored);
  } catch (e) {
    // Fall through to REST.
  }

  const rest = await Promise.all(
    unique.map(async (id) => {
      try {
        return await fetchEntryRest(id);
      } catch (err) {
        return null;
      }
    })
  );
  return rankScoredTargets(rest.filter(Boolean).map(scoreTargetFeatures));
}

const SCORE_FORMULA_TEXT =
  "Target Selection Score is a 100-point rules-based total (no AI): Resolution 25 · Completeness 25 · Ligand 20 · Pocket 15 · Method 15. Resolution: ≤2.0 Å = 25, ≤2.5 = 20, ≤3.0 = 15, ≤3.5 = 10, worse = 5, missing = 0. Completeness scales linearly (100% = 25). Ligand awards 20 only for a co-crystallized molecule that is not a crystallization additive (glycerol, sulfate, PEG, acetate, DMSO, EDO, GOL, SO4, PO4). Pocket: residues within ~5 Å of a real ligand = 15, unverified = 7, none = 0. Method: X-ray 15, Cryo-EM 12, NMR 8, other 5.";

export {
  WEIGHTS,
  ADDITIVE_COMP_IDS,
  ligandWeightDa,
  isCrystallizationAdditive,
  classifyMethod,
  scoreResolution,
  completenessPercent,
  scoreCompleteness,
  ligandEntitiesFromNonpolymers,
  pocketFromLigands,
  pocketStatsFromLigands,
  inferLigandFunctionalGroups,
  scorePocket,
  scoreTargetFeatures,
  extractFromGraphqlEntry,
  extractFromRestEntry,
  rankScoredTargets,
  recommendationReasons,
  fetchAndScoreTargets,
  formatAngstrom,
  formatPct,
  SCORE_FORMULA_TEXT,
};
