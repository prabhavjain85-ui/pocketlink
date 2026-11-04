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
  "FMT",
  "NO3",
  "BCT",
  "MLI",
  "TLA",
  "TAR",
  "CIT",
  "TRS",
  "EPE",
  "MES",
  "HEPES",
  "MPD",
  "MRD",
  "IOD",
  "SCN",
  "AZI",
]);

const ADDITIVE_NAME_RE =
  /\b(glycerol|sulfate|acetate|dmso|dimethyl sulfoxide|polyethylene glycol|peg\d*|formate|nitrate|bicarbonate|malonate|tartrate|citrate|tris|hepes|mes buffer|2-methyl-2,4-pentanediol)\b/i;

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
 * Evaluate crystallographic R-free quality (lower is better; >0.30 indicates
 * noisy density or potential overfitting and incurs a small penalty).
 */
function evaluateRFree(rFreeValue) {
  const rf = num(rFreeValue);
  if (rf == null || rf <= 0 || rf >= 1) {
    return { value: null, label: "N/A", quality: null, penalty: 0 };
  }
  const rounded = Math.round(rf * 1000) / 1000;
  if (rounded <= 0.22) {
    return { value: rounded, label: rounded.toFixed(3), quality: "excellent", penalty: 0 };
  }
  if (rounded <= 0.26) {
    return { value: rounded, label: rounded.toFixed(3), quality: "good", penalty: 0 };
  }
  if (rounded <= 0.30) {
    return { value: rounded, label: rounded.toFixed(3), quality: "acceptable", penalty: 0 };
  }
  return { value: rounded, label: rounded.toFixed(3), quality: "poor", penalty: 5 };
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

const TYPE_II_DFG_OUT_COMP_IDS = new Set(["STI", "NIL", "PON", "SOR", "BAX", "0LI", "P30"]);
const TYPE_I_DFG_IN_COMP_IDS = new Set(["AQ4", "IRE", "YY3", "1N1", "STU", "ATP", "ANP", "ACP", "FMM"]);

/**
 * Inspect PDB unobserved residue metadata (`pdbx_unobs_or_zero_occ_residues`)
 * or sequence gaps near the co-crystallized ligand / binding site within 5 Å.
 * Penalizes structures with missing pocket residues by 12 points.
 */
function evaluateMissingPocketResidues(features = {}) {
  if (features.unmodeledNearPocket === true || features.hasMissingPocketResidues === true) {
    return {
      hasMissingPocketResidues: true,
      missingCount: Number(features.missingPocketResidueCount) || 1,
      penalty: 12,
    };
  }

  const unobsList = Array.isArray(features.unobservedResidues)
    ? features.unobservedResidues
    : Array.isArray(features.pdbx_unobs_or_zero_occ_residues)
      ? features.pdbx_unobs_or_zero_occ_residues
      : [];

  const ligands = Array.isArray(features.ligands) ? features.ligands : [];
  const pocketSeqIds = new Set();
  for (const lig of ligands) {
    for (const inst of lig.instances || []) {
      const neighbors = inst.rcsb_target_neighbors || inst.target_neighbors || [];
      for (const n of neighbors) {
        const dist = num(n.distance);
        if (dist != null && dist <= POCKET_DISTANCE_A) {
          const seqId = num(n.target_seq_id ?? n.auth_seq_id ?? n.label_seq_id);
          if (seqId != null) pocketSeqIds.add(seqId);
          if (n.unobserved === true || n.zero_occupancy === true || num(n.occupancy) === 0) {
            return {
              hasMissingPocketResidues: true,
              missingCount: 1,
              penalty: 12,
            };
          }
        }
      }
    }
  }

  if (unobsList.length > 0) {
    let nearPocketCount = 0;
    for (const item of unobsList) {
      if (item && typeof item === "object") {
        const dist = num(item.distanceToLigand ?? item.distance_to_ligand ?? item.pocketDistance);
        if (dist != null && dist <= POCKET_DISTANCE_A) {
          nearPocketCount += 1;
          continue;
        }
        const seqId = num(item.auth_seq_id ?? item.label_seq_id ?? item.seq_id);
        if (seqId != null && pocketSeqIds.size > 0) {
          for (const pSeq of pocketSeqIds) {
            if (Math.abs(seqId - pSeq) <= 2) {
              nearPocketCount += 1;
              break;
            }
          }
        }
      }
    }
    if (nearPocketCount > 0) {
      return {
        hasMissingPocketResidues: true,
        missingCount: nearPocketCount,
        penalty: 12,
      };
    }
  }

  return {
    hasMissingPocketResidues: false,
    missingCount: 0,
    penalty: 0,
  };
}

/**
 * Compute pocket druggability tier, site classification
 * (`Orthosteric / Catalytic`, `Allosteric`, `Shallow / PPI Surface`),
 * and 3D bounding-box centroid `[x, y, z]`.
 */
function classifyPocketDruggabilityAndSite(features = {}, pocketStats = {}, hasMissingPocketResidues = false) {
  const ligands = Array.isArray(features.ligands) ? features.ligands : [];
  const primaryLigand = ligands[0] || null;
  const titleText = `${features.title || ""} ${primaryLigand?.name || ""} ${primaryLigand?.compId || ""}`.trim();

  let pocketCenter = [0, 0, 0];
  if (
    Array.isArray(features.pocketCenter) &&
    features.pocketCenter.length === 3 &&
    features.pocketCenter.every((c) => Number.isFinite(Number(c)))
  ) {
    pocketCenter = features.pocketCenter.map((c) => Math.round(Number(c) * 100) / 100);
  } else if (
    Array.isArray(primaryLigand?.centroid) &&
    primaryLigand.centroid.length === 3 &&
    primaryLigand.centroid.every((c) => Number.isFinite(Number(c)))
  ) {
    pocketCenter = primaryLigand.centroid.map((c) => Math.round(Number(c) * 100) / 100);
  } else {
    const coords = [];
    for (const lig of ligands) {
      for (const inst of lig.instances || []) {
        if (Array.isArray(inst.coordinates) && inst.coordinates.length === 3) {
          coords.push(inst.coordinates.map(Number));
        }
        for (const n of inst.rcsb_target_neighbors || inst.target_neighbors || []) {
          if (Array.isArray(n.coordinates) && n.coordinates.length === 3) {
            coords.push(n.coordinates.map(Number));
          }
        }
      }
    }
    if (coords.length > 0) {
      const sum = coords.reduce(
        (acc, c) => [acc[0] + (c[0] || 0), acc[1] + (c[1] || 0), acc[2] + (c[2] || 0)],
        [0, 0, 0]
      );
      pocketCenter = sum.map((v) => Math.round((v / coords.length) * 100) / 100);
    }
  }

  const residueCount = num(pocketStats?.residueCount);
  const hydrophobicity = num(pocketStats?.hydrophobicity);
  const ligandMw = num(primaryLigand?.formulaWeight) || (features.hasLigand ? 380 : 250);
  const estimatedVolume = Math.round(
    Math.max(160, Math.min(1400, (residueCount != null ? residueCount : 12) * 32 + ligandMw * 0.45))
  );

  let pocketClass = "Orthosteric / Catalytic";
  if (/\b(allosteric|myristoyl|exosite|cryptic|back[- ]pocket|type[- ]iii|type[- ]iv|site\s*2)\b/i.test(titleText)) {
    pocketClass = "Allosteric";
  } else if (
    /\b(protein[- ]protein|ppi\b|interface|shallow|surface|kelch|wd40|sh2 domain|bh3|stapled peptide)\b/i.test(
      titleText
    ) ||
    (pocketStats?.available && residueCount != null && residueCount <= 5 && (hydrophobicity ?? 0.5) < 0.35) ||
    features.pocket === "none"
  ) {
    pocketClass = "Shallow / PPI Surface";
  }

  let druggabilityTier = "Moderate Druggability";
  if (pocketClass === "Shallow / PPI Surface" || features.pocket === "none") {
    druggabilityTier = "Low / Challenging";
  } else if (
    features.hasLigand &&
    (features.pocket === "detected" || (hydrophobicity != null && hydrophobicity >= 0.42)) &&
    !hasMissingPocketResidues
  ) {
    druggabilityTier = "High Druggability";
  } else if (hasMissingPocketResidues && druggabilityTier === "High Druggability") {
    druggabilityTier = "Moderate Druggability";
  }

  return {
    pocketClass,
    druggabilityTier,
    pocketCenter,
    pocketVolume: estimatedVolume,
  };
}

/**
 * Parse PDB title, bound ligand identity, and structural motifs to tag
 * kinase, GPCR, nuclear receptor, and enzyme conformational states.
 */
function classifyConformationTag(features = {}) {
  const ligands = Array.isArray(features.ligands) ? features.ligands : [];
  const compIds = new Set(ligands.map((l) => String(l?.compId || "").toUpperCase()).filter(Boolean));
  const ligNames = ligands.map((l) => l?.name || "").join(" ");
  const text = `${features.title || ""} ${ligNames} ${features.conformationHint || ""}`.trim();

  for (const id of compIds) {
    if (TYPE_II_DFG_OUT_COMP_IDS.has(id)) return "Inactive / DFG-out";
  }
  if (
    /\b(dfg[- ]out|type[- ]ii\b|inactive conformation|imatinib|sorafenib|ponatinib|nilotinib|regorafenib|rebastinib)\b/i.test(
      text
    )
  ) {
    return "Inactive / DFG-out";
  }

  for (const id of compIds) {
    if (TYPE_I_DFG_IN_COMP_IDS.has(id)) return "Active / DFG-in";
  }
  if (
    /\b(dfg[- ]in|type[- ]i\b|active conformation|ac[- ]helix[- ]in|erlotinib|gefitinib|osimertinib|dasatinib|bosutinib|crizotinib|staurosporine|k-252a)\b/i.test(
      text
    )
  ) {
    return "Active / DFG-in";
  }

  if (/\b(agonist[- ]bound|full agonist|partial agonist|active[- ]state gpcr|gs[- ]coupled|gi[- ]coupled)\b/i.test(text)) {
    return "Agonist-bound";
  }

  if (
    /\b(antagonist[- ]bound|inverse agonist|inactive[- ]state gpcr|antagonist complex|tamoxifen|fulvestrant|enzalutamide|bicalutamide|haloperidol|risperidone|carazolol|timolol)\b/i.test(
      text
    )
  ) {
    return "Antagonist-bound";
  }

  if (/\b(kinase)\b/i.test(text)) {
    return features.hasLigand ? "Active / DFG-in" : "Apo / Unliganded";
  }

  return features.hasLigand ? "Closed / Holo" : "Apo / Unliganded";
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

  if (scored.hasMissingPocketResidues) {
    items.push({
      rank: 5,
      text: "Warning: missing/unmodeled residues within 5 Å of binding pocket",
    });
  }

  if (scored.rFree != null) {
    if (scored.rFreeQuality === "excellent" || scored.rFreeQuality === "good") {
      items.push({ rank: 4, text: `Well-refined crystallographic model (R-free ${scored.rFreeLabel})` });
    } else if (scored.rFreeQuality === "poor") {
      items.push({ rank: 2, text: `Elevated R-free (${scored.rFreeLabel}) — inspect electron density` });
    }
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
  const rFreeEval = evaluateRFree(features.rFree);
  const missingPocketEval = evaluateMissingPocketResidues(features);

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
    breakdown.method -
    rFreeEval.penalty -
    missingPocketEval.penalty;
  const score = Math.round(Math.max(0, Math.min(100, rawTotal)));

  const ligands = features.ligands || [];
  const pocketStats = features.pocketStats || pocketStatsFromLigands(ligands);
  const pocketDruggability = classifyPocketDruggabilityAndSite(
    { ...features, hasLigand, pocket: pocket.value, ligands },
    pocketStats,
    missingPocketEval.hasMissingPocketResidues
  );
  const conformationTag = classifyConformationTag({ ...features, hasLigand, ligands });

  const scored = {
    id: features.id,
    title: features.title || "Untitled entry",
    date: features.date || "—",
    method: features.method || method.label,
    methodKind: method.kind,
    methodLabel: method.label,
    resolution: resolution.value != null ? formatAngstrom(resolution.value) : "N/A",
    resolutionValue: resolution.value,
    rFree: rFreeEval.value,
    rFreeLabel: rFreeEval.label,
    rFreeQuality: rFreeEval.quality,
    completeness: completeness.value,
    completenessLabel: completeness.value != null ? formatPct(completeness.value) : "N/A",
    hasLigand,
    ligandLabel: hasLigand ? "✅" : "❌",
    pocket: pocket.value,
    pocketLabel: pocket.value === "detected" ? "✅" : pocket.value === "none" ? "❌" : "?",
    pocketStats,
    pocketClass: pocketDruggability.pocketClass,
    druggabilityTier: pocketDruggability.druggabilityTier,
    conformationTag,
    pocketCenter: pocketDruggability.pocketCenter,
    hasMissingPocketResidues: missingPocketEval.hasMissingPocketResidues,
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
  const rFree =
    (Array.isArray(entry.refine) && entry.refine[0] && entry.refine[0].ls_R_factor_R_free) ??
    null;
  const dateRaw =
    (entry.rcsb_accession_info && entry.rcsb_accession_info.initial_release_date) || "";
  const ligands = ligandEntitiesFromNonpolymers(entry.nonpolymer_entities);
  const unobservedResidues = Array.isArray(entry.pdbx_unobs_or_zero_occ_residues)
    ? entry.pdbx_unobs_or_zero_occ_residues
    : [];
  return {
    id,
    title: (entry.struct && entry.struct.title) || "Untitled entry",
    date: dateRaw ? String(dateRaw).slice(0, 4) : "—",
    method,
    resolutionA,
    rFree,
    completeness: completenessPercent(info),
    hasLigand: ligands.length > 0,
    pocket: pocketFromLigands(ligands),
    pocketStats: pocketStatsFromLigands(ligands),
    ligands,
    unobservedResidues,
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
  const rFree =
    (Array.isArray(entry.refine) && entry.refine[0] && entry.refine[0].ls_R_factor_R_free) ??
    null;
  const dateRaw =
    (entry.rcsb_accession_info && entry.rcsb_accession_info.initial_release_date) || "";
  const ligands = ligandEntitiesFromNonpolymers(nonpolymerEntities);
  const unobservedResidues = Array.isArray(entry.pdbx_unobs_or_zero_occ_residues)
    ? entry.pdbx_unobs_or_zero_occ_residues
    : [];
  return {
    id,
    title: (entry.struct && entry.struct.title) || "Untitled entry",
    date: dateRaw ? String(dateRaw).slice(0, 4) : "—",
    method,
    resolutionA,
    rFree,
    completeness: completenessPercent(info),
    hasLigand: ligands.length > 0,
    pocket: pocketFromLigands(ligands),
    pocketStats: pocketStatsFromLigands(ligands),
    ligands,
    unobservedResidues,
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
    refine {
      ls_R_factor_R_free
      ls_R_factor_R_work
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
  "Target Selection Score evaluates experimental structure quality (resolution, R-free refinement, sequence coverage, bound drug-like ligand presence excluding buffer artifacts, pocket contacts, and experimental method) with automatic AlphaFold DB pLDDT fallback.";

export {
  WEIGHTS,
  ADDITIVE_COMP_IDS,
  ligandWeightDa,
  isCrystallizationAdditive,
  classifyMethod,
  scoreResolution,
  evaluateRFree,
  evaluateMissingPocketResidues,
  classifyPocketDruggabilityAndSite,
  classifyConformationTag,
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
