/**
 * Compact target context for candidate ranking.
 * Built from the already-scored PDB row — never re-fetches RCSB.
 */

const { inferLigandFunctionalGroups, ligandWeightDa } = require("./targetSelectionScore");

const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;

const TARGET_SPECIFIC_INSTRUCTION =
  "This score reflects fit for this specific target only — do not give a high score based on general drug-likeness alone; the compound must show genuine relevance to this target's pocket to score highly, and the same compound should score differently against different targets.";

function targetDisplayName(protein) {
  if (!protein) return "";
  const q = String(protein.queryName || protein.name || "").trim();
  if (q && !PDB_ID_RE.test(q)) return q;
  const title = String(protein.title || "").trim();
  if (title && title.length <= 80) return title;
  if (title) return `${title.slice(0, 77)}…`;
  return String(protein.id || protein.pdb_id || "");
}

function rankingCacheKey(pdbId, cid) {
  const pdb = String(pdbId || "none").toUpperCase();
  const compound = String(cid ?? "").trim();
  return `${pdb}_${compound}`;
}

/** Deterministic string hash for stable per-target shuffles and tie-breaks. */
function stableHashString(str) {
  let hash = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const DISEASE_STOP_WORDS = new Set([
  "disease",
  "disorder",
  "syndrome",
  "cancer",
  "carcinoma",
  "tumor",
  "tumour",
  "neoplasm",
  "malignant",
  "primary",
  "secondary",
  "acute",
  "chronic",
  "type",
  "stage",
  "cell",
  "cells",
]);

/**
 * Extract searchable disease/indication keywords from agent disease context.
 */
function extractDiseaseKeywords(diseaseContext) {
  const parts = [diseaseContext?.name, diseaseContext?.query].filter(Boolean);
  const keywords = new Set();
  const fullText = parts.join(" ").toLowerCase();

  for (const part of parts) {
    const tokens = String(part)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !DISEASE_STOP_WORDS.has(t));
    tokens.forEach((t) => keywords.add(t));
  }

  // Preserve clinically meaningful short tokens when present in the query.
  const shortHints = [
    "cml",
    "aml",
    "cll",
    "hiv",
    "hbv",
    "hcv",
    "copd",
    "adhd",
    "als",
    "ms",
    "ra",
    "ibd",
    "ckd",
    "t1d",
    "t2d",
  ];
  for (const hint of shortHints) {
    if (fullText.includes(hint)) keywords.add(hint);
  }
  if (fullText.includes("diabet")) keywords.add("diabet");
  if (fullText.includes("alzheimer")) keywords.add("alzheimer");
  if (fullText.includes("parkinson")) keywords.add("parkinson");
  if (fullText.includes("pancreat")) keywords.add("pancreat");
  if (fullText.includes("breast")) keywords.add("breast");
  if (fullText.includes("prostat")) keywords.add("prostat");
  if (fullText.includes("melanoma")) keywords.add("melanoma");
  if (fullText.includes("leukemia") || fullText.includes("leukaemia")) keywords.add("leukemia");
  if (fullText.includes("lymphoma")) keywords.add("lymphoma");

  return [...keywords];
}

function drugTextBlob(drug) {
  return [drug?.name, drug?.indication, drug?.class, drug?.mechanism]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function drugMatchesDiseaseKeywords(drug, keywords) {
  if (!Array.isArray(keywords) || !keywords.length || !drug) return false;
  const hay = drugTextBlob(drug);
  return keywords.some((kw) => kw.length >= 3 && hay.includes(kw));
}

const SKIP_REFERENCE_IDS = new Set([
  "NAG",
  "NDG",
  "BMA",
  "MAN",
  "FUC",
  "GAL",
  "GLC",
  "SIA",
  "NAN",
  "XYL",
  "HEM",
  "HEA",
  "HEB",
  "HEC",
]);
const SKIP_REFERENCE_NAME_RE =
  /\b(glucopyranose|mannopyranose|fucopyranose|n-acetylglucosamine|protoporphyrin|heme)\b/i;

function isWeakReferenceLigand(ligand) {
  const id = String(ligand?.compId || ligand?.comp_id || "").toUpperCase();
  if (SKIP_REFERENCE_IDS.has(id)) return true;
  return SKIP_REFERENCE_NAME_RE.test(String(ligand?.name || ""));
}

function ligandList(protein) {
  if (Array.isArray(protein?.ligands) && protein.ligands.length) return protein.ligands;
  if (protein?.ligand && typeof protein.ligand === "object" && protein.ligand.present !== false) {
    return [protein.ligand];
  }
  return [];
}

function primaryLigand(protein) {
  const list = ligandList(protein);
  if (!list.length) return null;
  const preferred = list.filter((ligand) => !isWeakReferenceLigand(ligand));
  const pool = preferred.length ? preferred : list;
  let best = pool[0];
  let bestPts = -1;
  for (const ligand of pool) {
    const mw = ligandWeightDa(ligand.formulaWeight ?? ligand.mw ?? ligand.molecularWeight);
    let pts = isWeakReferenceLigand(ligand) ? 0 : 15;
    if (mw != null && mw >= 150 && mw <= 900) pts += 20;
    else if (mw != null && mw >= 80 && mw <= 1200) pts += 8;
    if (pts > bestPts) {
      bestPts = pts;
      best = ligand;
    }
  }
  return best;
}

function compactLigand(protein) {
  const hasLigand = Boolean(protein?.hasLigand || protein?.ligand?.present || primaryLigand(protein));
  const ligand = primaryLigand(protein);
  if (!hasLigand || !ligand) {
    return { present: false };
  }
  const name = ligand.name || "";
  const compId = ligand.compId || ligand.comp_id || "";
  const groupsFromData = Array.isArray(ligand.functionalGroups) ? ligand.functionalGroups : [];
  const groups = groupsFromData.length ? groupsFromData : inferLigandFunctionalGroups(name, compId);
  const mw = ligandWeightDa(ligand.formulaWeight ?? ligand.mw ?? ligand.molecularWeight);
  return {
    present: true,
    name,
    compId,
    mw,
    functionalGroups: groups.slice(0, 8),
  };
}

function compactPocket(protein) {
  const stats = protein?.pocketStats || protein?.pocket;
  const status =
    (stats && typeof stats === "object" && stats.status) ||
    (typeof protein?.pocket === "string" ? protein.pocket : null) ||
    "unclear";
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return {
      status,
      available: status === "detected",
      residueCount: null,
      hydrophobicity: null,
      sizeLabel: null,
      hydrophobicityLabel: null,
    };
  }
  return {
    status: stats.status || status,
    available: Boolean(stats.available),
    residueCount: stats.residueCount ?? null,
    hydrophobicity: stats.hydrophobicity ?? null,
    sizeLabel: stats.sizeLabel ?? null,
    hydrophobicityLabel: stats.hydrophobicityLabel ?? null,
  };
}

function dataGapsFor(protein, ligand, pocket) {
  const gaps = [];
  if (!ligand?.present) gaps.push("No co-crystallized ligand in the selected structure");
  if (!pocket?.available) {
    if (pocket?.status === "none") {
      gaps.push("No polymer residues within 5 Å of a bound ligand");
    } else {
      gaps.push("Pocket geometry is unclear or unavailable");
    }
  } else {
    if (pocket.hydrophobicity == null) gaps.push("Pocket hydrophobicity could not be estimated");
    if (pocket.residueCount == null) gaps.push("Pocket size could not be estimated");
  }
  if (ligand?.present && (ligand.mw == null || Number.isNaN(ligand.mw))) {
    gaps.push("Reference ligand molecular weight is unavailable");
  }
  return gaps;
}

/**
 * Pack target/pocket/ligand fields already present on a scored PDB row
 * into the compact object sent to /api/rank-candidates.
 */
function buildTargetContext(protein) {
  if (!protein) return null;
  const ligand = compactLigand(protein);
  const pocket = compactPocket(protein);
  const pdbId = protein.id || protein.pdb_id || null;
  const gene = String(protein.gene || protein.symbol || "").trim();
  const name = protein.name || targetDisplayName(protein);
  return {
    name,
    pdb_id: pdbId,
    id: pdbId,
    gene,
    title: protein.title || "",
    queryName: protein.queryName || protein.name || "",
    targetSelectionScore: protein.targetSelectionScore ?? protein.score ?? null,
    resolution: protein.resolution || null,
    method: protein.methodLabel || protein.method || null,
    hasLigand: Boolean(ligand.present),
    ligand,
    pocket,
    family: protein.family || null,
    dataGaps: dataGapsFor(protein, ligand, pocket),
  };
}

function summarizeTargetData(protein) {
  const ctx = buildTargetContext(protein);
  if (!ctx) {
    return {
      pdb_id: null,
      name: "",
      gene: "",
      hasLigand: false,
      hasPocket: false,
      ligand: { present: false },
      pocket: { available: false },
      dataGaps: ["No target structure was provided"],
    };
  }
  return {
    pdb_id: ctx.pdb_id,
    name: ctx.name,
    gene: ctx.gene,
    title: ctx.title,
    queryName: ctx.queryName,
    hasLigand: Boolean(ctx.ligand?.present),
    hasPocket: Boolean(ctx.pocket?.available),
    ligand: ctx.ligand,
    pocket: ctx.pocket,
    dataGaps: ctx.dataGaps,
  };
}

module.exports = {
  PDB_ID_RE,
  TARGET_SPECIFIC_INSTRUCTION,
  targetDisplayName,
  rankingCacheKey,
  stableHashString,
  extractDiseaseKeywords,
  drugMatchesDiseaseKeywords,
  buildTargetContext,
  summarizeTargetData,
};
