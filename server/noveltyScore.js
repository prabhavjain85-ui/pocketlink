/**
 * Novelty Score for Target Discovery.
 *
 * Open Targets overall association is necessary but not sufficient: a gene
 * can be strongly linked to a disease and still be a poor discovery
 * opportunity if many approved / investigational drugs already target it.
 *
 * biologySignal weights genetic (and related) evidence most heavily.
 *
 * How explored a target is has two separate meanings, and conflating them was
 * a bug: `target.drugAndClinicalCandidates.count` from Open Targets is a
 * GLOBAL count across every indication, so EGFR reports 82 drugs whether the
 * disease under study is lung cancer or pachyonychia congenita. Dividing by it
 * made a gene look un-novel for a disease nobody has ever drugged it for —
 * exactly backwards for repurposing.
 *
 * So novelty now combines:
 *   diseaseNoveltyFactor  — from the association's `clinical` datatype score,
 *                           which IS disease-specific (EGFR: 0.996 in NSCLC,
 *                           0.000 in pachyonychia congenita). This dominates.
 *   broadDrugDiscount     — a gentle, logarithmic discount on the global drug
 *                           count. A heavily drugged gene is well-trodden
 *                           chemistry, which lowers novelty a little, but it
 *                           no longer collapses the score.
 *
 * Open Targets also exposes an association `novelty` field based on evidence
 * accumulation over time — that is NOT this score, and we do not use it.
 */

export const MIN_OVERALL_SCORE = 0.2;

export const DATATYPE_LABELS = {
  genetic_association: "Genetic association",
  genetic_literature: "Genetic literature",
  somatic_mutation: "Somatic mutation",
  literature: "Literature",
  affected_pathway: "Pathway",
  animal_model: "Animal model",
  rna_expression: "Expression",
  clinical: "Clinical / known drugs",
};

const GWAS_SOURCES = new Set([
  "gwas_credible_sets",
  "gwas_catalog",
  "ot_genetics_portal",
  "gwas_associated_studies",
]);

const RARE_VARIANT_SOURCES = new Set([
  "eva",
  "gene2phenotype",
  "genomics_england",
  "gene_burden",
  "uniprot_variants",
  "uniprot_literature",
  "clinvar",
  "orphanet",
  "clingen",
]);

export function datatypeMap(scores) {
  const map = {};
  for (const row of scores || []) {
    if (!row || !row.id) continue;
    const n = Number(row.score);
    map[row.id] = Number.isFinite(n) ? n : 0;
  }
  return map;
}

/** Weights sum to exactly 1.0, so a perfect-evidence target scores 100. */
export const BIOLOGY_WEIGHTS = {
  genetic_association: 0.5,
  genetic_literature: 0.12,
  somatic_mutation: 0.12,
  overall: 0.1,
  literature: 0.08,
  affected_pathway: 0.05,
  animal_model: 0.02,
  rna_expression: 0.01,
};

export const REPURPOSING_WEIGHTS = {
  clinical: 0.35,
  affected_pathway: 0.18,
  genetic_association: 0.15,
  somatic_mutation: 0.1,
  rna_expression: 0.08,
  animal_model: 0.06,
  literature: 0.08,
};

export const EVIDENCE_PROFILES = {
  novel_discovery: {
    id: "novel_discovery",
    label: "Novel Discovery",
    description:
      "Weights human genetic associations, somatic drivers, and rare/GWAS variants heavily while discounting targets already drugged for this disease.",
    weights: BIOLOGY_WEIGHTS,
  },
  repurposing: {
    id: "repurposing",
    label: "Repurposing & Clinical Precedence",
    description:
      "Weights clinical trial precedence, affected pathways, RNA expression, and small-molecule tractability for rapid translational repurposing.",
    weights: REPURPOSING_WEIGHTS,
  },
};

const LOSS_OF_FUNCTION_GENES = new Set([
  "TP53",
  "BRCA1",
  "BRCA2",
  "PALB2",
  "SMAD4",
  "PTEN",
  "APC",
  "RB1",
  "VHL",
  "STK11",
  "NF1",
  "NF2",
  "ATM",
  "ATR",
  "CDKN2A",
  "ARID1A",
  "TET2",
  "FBXW7",
  "BAP1",
  "GBA",
  "GBA1",
  "CFTR",
  "SMN1",
  "DMD",
  "FXN",
  "INS",
  "LDLR",
  "PKD1",
  "TSC1",
  "TSC2",
]);

const GAIN_OF_FUNCTION_GENES = new Set([
  "EGFR",
  "KRAS",
  "NRAS",
  "HRAS",
  "BRAF",
  "NRG1",
  "ERBB2",
  "ABL1",
  "ALK",
  "ROS1",
  "MET",
  "RET",
  "FGFR1",
  "FGFR2",
  "FGFR3",
  "PIK3CA",
  "AKT1",
  "MTOR",
  "JAK1",
  "JAK2",
  "JAK3",
  "BTK",
  "BCL2",
  "CDK4",
  "CDK6",
  "HDAC1",
  "PARP1",
  "PDE5A",
  "HMGCR",
  "PTGS2",
  "DPP4",
  "SLC5A2",
  "ACE",
  "AGTR1",
  "BACE1",
  "PCSK9",
  "TNF",
  "IL6",
  "MAPK14",
  "SRC",
  "KDR",
  "FLT3",
  "KIT",
  "PDGFRA",
  "IDH1",
  "IDH2",
  "EZH2",
  "MDM2",
  "MYC",
]);

export function biologySignal(datatypeScores, overallScore) {
  const dt = datatypeScores || {};
  const w = BIOLOGY_WEIGHTS;
  return (
    w.genetic_association * (dt.genetic_association || 0) +
    w.genetic_literature * (dt.genetic_literature || 0) +
    w.somatic_mutation * (dt.somatic_mutation || 0) +
    w.overall * (Number(overallScore) || 0) +
    w.literature * (dt.literature || 0) +
    w.affected_pathway * (dt.affected_pathway || 0) +
    w.animal_model * (dt.animal_model || 0) +
    w.rna_expression * (dt.rna_expression || 0)
  );
}

export function repurposingSignal(datatypeScores, overallScore, tractability = null, drugCount = 0) {
  const dt = datatypeScores || {};
  const w = REPURPOSING_WEIGHTS;
  const clinical = dt.clinical ?? dt.known_drug ?? 0;
  const base =
    w.clinical * clinical +
    w.affected_pathway * (dt.affected_pathway || 0) +
    w.genetic_association * (dt.genetic_association || 0) +
    w.somatic_mutation * (dt.somatic_mutation || 0) +
    w.rna_expression * (dt.rna_expression || 0) +
    w.animal_model * (dt.animal_model || 0) +
    w.literature * (dt.literature || 0);
  const globalDrugBonus = Number(drugCount) > 0 ? Math.min(0.15, Math.log1p(Number(drugCount)) * 0.035) : 0;
  const tractBoost = tractability?.smallMolecule ? 1.12 : tractability?.clinicalPrecedence ? 1.06 : 1.0;
  const combined = Math.min(1, (base + globalDrugBonus + 0.05 * (Number(overallScore) || 0)) * tractBoost);
  return Math.round(combined * 1000) / 10;
}

export function summarizeTractability(tractability = []) {
  const rows = Array.isArray(tractability) ? tractability : [];
  const active = rows.filter((t) => t && t.value === true);
  const sm = active.filter((t) => t.modality === "SM");
  const ab = active.filter((t) => t.modality === "AB");
  const pr = active.filter((t) => t.modality === "PR");
  const labels = active.map((t) => `${t.modality}: ${t.label}`);

  const approvedDrug = active.some((t) => /approved drug/i.test(String(t.label || "")));
  const clinicalPrecedence = active.some((t) =>
    /approved drug|advanced clinical|phase [123]|clinical precedence/i.test(String(t.label || ""))
  );
  const highQualityPocket = sm.some((t) =>
    /high-quality ligand|high-quality pocket|medium-quality pocket|druggable family/i.test(String(t.label || ""))
  );
  const hasChemicalLigand = sm.some((t) =>
    /ligand|chembl|bioactivity|binder|clinical|approved/i.test(String(t.label || ""))
  );

  let topModality = "Uncharacterized";
  if (sm.length > 0) topModality = "Small Molecule";
  else if (ab.length > 0) topModality = "Antibody";
  else if (pr.length > 0) topModality = "PROTAC";

  return {
    smallMolecule: sm.length > 0,
    antibody: ab.length > 0,
    protac: pr.length > 0,
    approvedDrug,
    clinicalPrecedence,
    highQualityPocket,
    hasChemicalLigand,
    topModality,
    labels: labels.slice(0, 6),
  };
}

/**
 * Derive Pharos Target Development Level (TDL: Tclin, Tchem, Tbio, Tdark)
 * from Open Targets tractability, clinical candidates, ChEMBL bioactivities, and functional annotations.
 */
export function classifyPharosTDL(target = {}, datatypeScores = {}) {
  const drugCount = Number(target?.drugAndClinicalCandidates?.count ?? target?.drugCount) || 0;
  const clinicalScore = Number(datatypeScores?.clinical ?? datatypeScores?.known_drug) || 0;
  const tract = summarizeTractability(target?.tractability);
  const chemblCount = Number(target?.chemblBioactivities ?? target?.bioactivityCount) || 0;

  if (
    tract.approvedDrug ||
    clinicalScore >= 0.7 ||
    drugCount >= 3 ||
    String(target?.maxClinicalStage || "").toUpperCase() === "APPROVAL"
  ) {
    return {
      tdl: "Tclin",
      tdlLabel: "Tclin · Approved drug MoA",
      description: "Clinical target with approved mechanism-of-action drugs.",
    };
  }

  if (
    drugCount >= 1 ||
    clinicalScore >= 0.15 ||
    tract.smallMolecule ||
    tract.clinicalPrecedence ||
    tract.hasChemicalLigand ||
    chemblCount > 0
  ) {
    return {
      tdl: "Tchem",
      tdlLabel: "Tchem · Tool compound active",
      description: "Target with active small-molecule probes or ChEMBL bioactivities.",
    };
  }

  const fnCount = Array.isArray(target?.functionDescriptions) ? target.functionDescriptions.length : 0;
  const hasBioSignal =
    fnCount > 0 ||
    (Number(datatypeScores?.genetic_association) || 0) >= 0.15 ||
    (Number(datatypeScores?.somatic_mutation) || 0) >= 0.15 ||
    (Number(datatypeScores?.affected_pathway) || 0) >= 0.15 ||
    (Number(datatypeScores?.animal_model) || 0) >= 0.15 ||
    (Number(datatypeScores?.literature) || 0) >= 0.25 ||
    Boolean(target?.approvedName && !/uncharacterized|putative|hypothetical/i.test(target.approvedName));

  if (hasBioSignal) {
    return {
      tdl: "Tbio",
      tdlLabel: "Tbio · Biologically characterized",
      description: "Experimentally or genetically annotated target without established small-molecule probes.",
    };
  }

  return {
    tdl: "Tdark",
    tdlLabel: "Tdark · Understudied proteome",
    description: "Dark proteome target with minimal experimental or chemical characterization.",
  };
}

export const CUSTOM_WEIGHT_KEYS = [
  "genetic_association",
  "somatic_mutation",
  "rna_expression",
  "crispr_screen",
  "known_drug",
];

export function normalizeCustomWeights(rawWeights) {
  if (!rawWeights || typeof rawWeights !== "object") return null;
  const cleaned = {};
  let total = 0;
  for (const key of CUSTOM_WEIGHT_KEYS) {
    if (rawWeights[key] === undefined || rawWeights[key] === null || rawWeights[key] === "") continue;
    const val = Math.max(0, Math.min(1, Number(rawWeights[key]) || 0));
    cleaned[key] = val;
    total += val;
  }
  if (total <= 0) return null;
  const normalized = {};
  for (const key of CUSTOM_WEIGHT_KEYS) {
    normalized[key] = (cleaned[key] || 0) / total;
  }
  return normalized;
}

export function customWeightedSignal(datatypeScores = {}, datasourceScores = {}, overallScore = 0, customWeights = null, drugCount = 0) {
  const norm = normalizeCustomWeights(customWeights);
  if (!norm) return null;

  const dt = datatypeScores || {};
  const ds = datasourceScores || {};
  const geneticVal = Math.min(1, (dt.genetic_association || 0) + 0.25 * (dt.genetic_literature || 0));
  const somaticVal = dt.somatic_mutation || 0;
  const rnaVal = dt.rna_expression || 0;
  const crisprVal = Math.max(
    dt.crispr_screen || 0,
    dt.crispr || 0,
    dt.affected_pathway || 0,
    ds.crispr || 0,
    ds.crispr_screen || 0,
    ds.project_score || 0
  );
  const clinicalRaw = dt.clinical ?? dt.known_drug ?? 0;
  const globalDrugProxy = drugCount > 0 ? Math.min(1, Math.log1p(Number(drugCount)) / Math.log1p(25)) : 0;
  const knownDrugVal = Math.max(clinicalRaw, globalDrugProxy * 0.75);

  const weightedSum =
    norm.genetic_association * geneticVal +
    norm.somatic_mutation * somaticVal +
    norm.rna_expression * rnaVal +
    norm.crispr_screen * crisprVal +
    norm.known_drug * knownDrugVal;

  // When known_drug weight is very low (< 0.15), apply a gentle novelty preference
  const noveltyMod =
    norm.known_drug < 0.15
      ? 1 - (0.15 - norm.known_drug) * 2.5 * clinicalRaw
      : 1;

  const combined = Math.min(1, Math.max(0, (weightedSum * 0.92 + 0.08 * (Number(overallScore) || 0)) * noveltyMod));
  return Math.round(combined * 1000) / 10;
}

const VITAL_ORGAN_PATTERNS = [
  { organ: "Heart", re: /\b(heart|cardiac|myocard|ventricle|atrial)\b/i },
  { organ: "Liver", re: /\b(liver|hepat)\b/i },
  { organ: "Kidney", re: /\b(kidney|renal|cortex of kidney)\b/i },
  { organ: "Brain", re: /\b(brain|cerebr|cortex|hippocamp|cerebell|basal ganglia|hypothalam)\b/i },
];

/**
 * Evaluate DepMap CRISPR essentiality, gnomAD genetic constraint (pLI / oe_lof),
 * and GTEx vital-organ baseline expression (heart, liver, kidney, brain).
 */
export function evaluateEssentialityAndExpression(target = {}, safetySummary = null) {
  const isDepMapScreenEssential = (() => {
    const depMap = target?.depMapEssentiality;
    if (!Array.isArray(depMap) || !depMap.length) return false;
    let totalScreens = 0;
    let essentialScreens = 0;
    for (const tissueBlock of depMap) {
      for (const s of tissueBlock?.screens || []) {
        const eff = Number(s?.geneEffect);
        if (!Number.isFinite(eff)) continue;
        totalScreens += 1;
        if (eff <= -0.7) essentialScreens += 1;
      }
    }
    return totalScreens >= 4 && essentialScreens / totalScreens >= 0.5;
  })();

  const isEssential = Boolean(target?.isEssential) || isDepMapScreenEssential;

  const constraints = Array.isArray(target?.geneticConstraint) ? target.geneticConstraint : [];
  const lofRow =
    constraints.find((c) => String(c?.constraintType || "").toLowerCase() === "lof") ||
    constraints.find((c) => c?.oe != null || c?.score != null) ||
    null;

  const pLI = numOrNull(target?.pLI ?? lofRow?.score);
  const oeLof = numOrNull(target?.oeLof ?? lofRow?.oe);
  const oeUpper = numOrNull(target?.oeUpper ?? lofRow?.oeUpper);

  const expressions = Array.isArray(target?.expressions) ? target.expressions : [];
  const vitalOrgansFound = new Set();
  let expressedTissueCount = 0;
  let highTissueCount = 0;

  for (const exp of expressions) {
    const label = [
      exp?.tissue?.label,
      exp?.tissue?.id,
      ...(exp?.tissue?.organs || []),
      ...(exp?.tissue?.anatomicalSystems || []),
    ]
      .filter(Boolean)
      .join(" ");
    const rnaVal = Number(exp?.rna?.value);
    const rnaLevel = Number(exp?.rna?.level);
    const protLevel = Number(exp?.protein?.level);

    const isExpressed =
      (Number.isFinite(rnaVal) && rnaVal >= 3) ||
      (Number.isFinite(rnaLevel) && rnaLevel >= 2) ||
      (Number.isFinite(protLevel) && protLevel >= 1);
    const isHighInVital =
      (Number.isFinite(rnaVal) && rnaVal >= 15) ||
      (Number.isFinite(rnaLevel) && rnaLevel >= 3) ||
      (Number.isFinite(protLevel) && protLevel >= 2);

    if (isExpressed) expressedTissueCount += 1;
    if (isHighInVital) {
      highTissueCount += 1;
      for (const vp of VITAL_ORGAN_PATTERNS) {
        if (vp.re.test(label)) vitalOrgansFound.add(vp.organ);
      }
    }
  }

  const vitalOrgans = Array.from(vitalOrgansFound);
  const ubiquitousVitalOrganExpression = vitalOrgans.length >= 3;
  const highConstraint = (pLI != null && pLI > 0.9) || (oeLof != null && oeLof < 0.25);
  const panEssential = isEssential || (highConstraint && ubiquitousVitalOrganExpression);

  const tissueSpecific =
    !panEssential &&
    expressions.length > 0 &&
    vitalOrgans.length <= 1 &&
    highTissueCount <= Math.max(2, Math.floor(expressions.length * 0.25));

  let safetyProfile = "Low Intrinsic Risk";
  let toxicityPenalty = 0;
  if (panEssential) {
    safetyProfile = "Pan-Essential Warning";
    toxicityPenalty = 15;
  } else if (tissueSpecific) {
    safetyProfile = "Tissue-Specific";
    toxicityPenalty = 0;
  } else if (safetySummary?.hasLiability && safetySummary.count >= 2) {
    toxicityPenalty = 5;
  }

  return {
    safetyProfile,
    isEssential,
    panEssential,
    pLI: pLI != null ? Math.round(pLI * 100) / 100 : null,
    oeLof: oeLof != null ? Math.round(oeLof * 100) / 100 : null,
    oeUpper: oeUpper != null ? Math.round(oeUpper * 100) / 100 : null,
    vitalOrgans,
    ubiquitousVitalOrganExpression,
    tissueSpecific,
    expressedTissueCount,
    toxicityPenalty,
  };
}

function numOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const CURATED_HUMAN_PARALOGS = {
  EGFR: [
    { symbol: "ERBB2", identityPct: 82 },
    { symbol: "ERBB4", identityPct: 79 },
    { symbol: "ERBB3", identityPct: 68 },
  ],
  ERBB2: [
    { symbol: "EGFR", identityPct: 82 },
    { symbol: "ERBB4", identityPct: 78 },
  ],
  ABL1: [
    { symbol: "ABL2", identityPct: 91 },
    { symbol: "SRC", identityPct: 68 },
  ],
  BRAF: [
    { symbol: "RAF1", identityPct: 76 },
    { symbol: "ARAF", identityPct: 72 },
  ],
  KRAS: [
    { symbol: "HRAS", identityPct: 89 },
    { symbol: "NRAS", identityPct: 88 },
  ],
  NRAS: [
    { symbol: "KRAS", identityPct: 88 },
    { symbol: "HRAS", identityPct: 87 },
  ],
  HRAS: [
    { symbol: "KRAS", identityPct: 89 },
    { symbol: "NRAS", identityPct: 87 },
  ],
  PIK3CA: [
    { symbol: "PIK3CB", identityPct: 69 },
    { symbol: "PIK3CD", identityPct: 67 },
  ],
  JAK2: [
    { symbol: "JAK1", identityPct: 71 },
    { symbol: "JAK3", identityPct: 69 },
    { symbol: "TYK2", identityPct: 68 },
  ],
  JAK1: [
    { symbol: "JAK2", identityPct: 71 },
    { symbol: "TYK2", identityPct: 69 },
  ],
  CDK4: [
    { symbol: "CDK6", identityPct: 74 },
    { symbol: "CDK2", identityPct: 66 },
  ],
  CDK6: [
    { symbol: "CDK4", identityPct: 74 },
  ],
  HDAC1: [
    { symbol: "HDAC2", identityPct: 86 },
    { symbol: "HDAC3", identityPct: 68 },
  ],
  PTGS2: [
    { symbol: "PTGS1", identityPct: 67 },
  ],
  PDE5A: [
    { symbol: "PDE6A", identityPct: 68 },
    { symbol: "PDE11A", identityPct: 66 },
  ],
  BTK: [
    { symbol: "ITK", identityPct: 71 },
    { symbol: "TEC", identityPct: 73 },
    { symbol: "BMX", identityPct: 69 },
  ],
  FLT3: [
    { symbol: "KIT", identityPct: 69 },
    { symbol: "PDGFRA", identityPct: 67 },
    { symbol: "KDR", identityPct: 66 },
  ],
  KIT: [
    { symbol: "PDGFRA", identityPct: 70 },
    { symbol: "FLT3", identityPct: 69 },
  ],
  FGFR1: [
    { symbol: "FGFR2", identityPct: 84 },
    { symbol: "FGFR3", identityPct: 81 },
    { symbol: "FGFR4", identityPct: 75 },
  ],
  FGFR2: [
    { symbol: "FGFR1", identityPct: 84 },
    { symbol: "FGFR3", identityPct: 80 },
  ],
  FGFR3: [
    { symbol: "FGFR1", identityPct: 81 },
    { symbol: "FGFR2", identityPct: 80 },
  ],
  IDH1: [
    { symbol: "IDH2", identityPct: 70 },
  ],
  IDH2: [
    { symbol: "IDH1", identityPct: 70 },
  ],
  EZH2: [
    { symbol: "EZH1", identityPct: 76 },
  ],
  AKT1: [
    { symbol: "AKT2", identityPct: 81 },
    { symbol: "AKT3", identityPct: 83 },
  ],
  IKBKB: [
    { symbol: "CHUK", identityPct: 67 },
  ],
};

/**
 * Extract human paralogs with > 65% sequence identity from Open Targets `homologues`
 * (or fallback to curated high-homology human paralog map).
 */
export function extractHumanParalogs(target = {}) {
  const selfSymbol = String(target?.approvedSymbol || target?.symbol || "").trim().toUpperCase();
  const rawHomologues = Array.isArray(target?.homologues) ? target.homologues : [];
  const paralogs = [];
  const seen = new Set();

  for (const h of rawHomologues) {
    if (!h) continue;
    const speciesId = String(h.speciesId ?? "").trim();
    const speciesName = String(h.speciesName ?? "").trim();
    const homologyType = String(h.homologyType ?? "").trim();
    const isHuman =
      speciesId === "9606" ||
      /human|homo sapiens/i.test(speciesName) ||
      (!speciesId && !speciesName && /paralog/i.test(homologyType));
    if (!isHuman) continue;

    const sym = String(h.targetGeneSymbol || h.symbol || "").trim().toUpperCase();
    if (!sym || sym === selfSymbol || seen.has(sym)) continue;

    const qId = Number(h.queryPercentageIdentity) || 0;
    const tId = Number(h.targetPercentageIdentity) || 0;
    const identity = Number(h.identityPct) || Math.max(qId, tId);
    if (identity <= 65) continue;

    seen.add(sym);
    paralogs.push({
      symbol: sym,
      identityPct: Math.round(identity * 10) / 10,
    });
  }

  if (!paralogs.length && selfSymbol && CURATED_HUMAN_PARALOGS[selfSymbol]) {
    for (const p of CURATED_HUMAN_PARALOGS[selfSymbol]) {
      if (p.identityPct > 65 && !seen.has(p.symbol)) {
        seen.add(p.symbol);
        paralogs.push({ symbol: p.symbol, identityPct: p.identityPct });
      }
    }
  }

  paralogs.sort((a, b) => b.identityPct - a.identityPct || a.symbol.localeCompare(b.symbol));
  return paralogs.slice(0, 5);
}

/**
 * Compute 5 normalized (0–100) dimensions for the Side-by-Side Target Triage Matrix:
 *   1. geneticEvidence
 *   2. pocketDruggability
 *   3. structuralQuality
 *   4. safetySpecificity
 *   5. chemicalMatter
 */
export function computeTriageMatrixDimensions(item) {
  const geneticRaw = Math.max(
    Number(item.geneticScore) || 0,
    (Number(item.geneticScore) || 0) * 0.75 + (Number(item.somaticScore) || 0) * 0.55
  );
  const geneticEvidence = Math.round(Math.min(100, Math.max(8, geneticRaw * 100)));

  const tract = item.tractability || {};
  let pocketDruggability = 52;
  if (tract.highQualityPocket) pocketDruggability = 90;
  else if (tract.smallMolecule && tract.clinicalPrecedence) pocketDruggability = 86;
  else if (tract.smallMolecule) pocketDruggability = 78;
  else if (tract.clinicalPrecedence) pocketDruggability = 72;
  else if (tract.antibody || tract.protac) pocketDruggability = 60;
  else if (item.expectedMoA === "inhibitor") pocketDruggability = 66;
  else if (item.tdl === "Tdark") pocketDruggability = 32;

  let structuralQuality = 62;
  if (item.uniprotId && (tract.highQualityPocket || item.drugCount > 0)) structuralQuality = 88;
  else if (item.uniprotId || item.drugCount > 0) structuralQuality = 78;
  else if (item.tdl === "Tbio") structuralQuality = 65;
  else if (item.tdl === "Tdark") structuralQuality = 45;

  let safetySpecificity = 82;
  if (item.safetyProfile === "Pan-Essential Warning") safetySpecificity -= 36;
  else if (item.safetyProfile === "Tissue-Specific") safetySpecificity += 12;
  if (item.safety?.count > 0) safetySpecificity -= Math.min(24, item.safety.count * 10);
  if (Array.isArray(item.paralogs) && item.paralogs.length > 0) {
    const maxParalog = item.paralogs[0]?.identityPct || 0;
    if (maxParalog >= 80) safetySpecificity -= 12;
    else if (maxParalog > 65) safetySpecificity -= 6;
  }
  safetySpecificity = Math.max(12, Math.min(98, Math.round(safetySpecificity)));

  const drugs = Number(item.drugCount) || 0;
  let chemicalMatter = 18;
  if (item.tdl === "Tclin") {
    chemicalMatter = Math.min(98, 76 + Math.round(Math.log1p(drugs) * 6));
  } else if (item.tdl === "Tchem") {
    chemicalMatter = Math.min(75, 52 + Math.round(Math.log1p(drugs) * 8));
  } else if (item.tdl === "Tbio") {
    chemicalMatter = drugs > 0 ? 45 : 22;
  } else {
    chemicalMatter = 10;
  }

  return {
    geneticEvidence,
    pocketDruggability,
    structuralQuality,
    safetySpecificity,
    chemicalMatter,
  };
}

export function summarizeSafetyLiabilities(safetyLiabilities = []) {
  const rows = Array.isArray(safetyLiabilities) ? safetyLiabilities : [];
  const events = [];
  const tissues = [];
  const seenEvents = new Set();
  const seenTissues = new Set();

  for (const item of rows) {
    const evt = String(item?.event || "").trim();
    if (evt && !seenEvents.has(evt.toLowerCase())) {
      seenEvents.add(evt.toLowerCase());
      events.push(evt);
    }
    for (const bio of item?.biosamples || []) {
      const tissue = String(bio?.tissueLabel || "").trim();
      if (tissue && !seenTissues.has(tissue.toLowerCase())) {
        seenTissues.add(tissue.toLowerCase());
        tissues.push(tissue);
      }
    }
  }

  return {
    hasLiability: events.length > 0,
    hasKnownSafetyFlags: events.length > 0,
    badge: events.length > 0 ? `Safety flag (${events.length})` : null,
    count: events.length,
    events: events.slice(0, 4),
    tissues: tissues.slice(0, 4),
    topOrgans: tissues.slice(0, 3),
  };
}

/**
 * Infer expected therapeutic Mechanism of Action ("inhibitor" | "activator" | "modulator")
 * and biological directionality from target annotations and Open Targets evidence.
 */
export function inferExpectedMoA(target = {}, datatypeScores = {}) {
  const symbol = String(target?.approvedSymbol || target?.symbol || "").trim().toUpperCase();
  const name = String(target?.approvedName || target?.name || "");
  const fnDesc = Array.isArray(target?.functionDescriptions)
    ? target.functionDescriptions.join(" ")
    : String(target?.functionDescriptions || "");
  const combinedText = `${name} ${fnDesc}`;

  if (LOSS_OF_FUNCTION_GENES.has(symbol)) {
    return {
      expectedMoA: "activator",
      directionOfEffect: "Loss-of-Function",
      rationale: `${symbol} acts via loss-of-function or haploinsufficiency; therapeutic strategy requires functional restoration, stabilization, or pathway activation rather than direct inhibition.`,
    };
  }

  if (GAIN_OF_FUNCTION_GENES.has(symbol)) {
    return {
      expectedMoA: "inhibitor",
      directionOfEffect: "Gain-of-Function / Overactivity",
      rationale: `${symbol} drives pathology through enzymatic overactivity, amplification, or activating mutations; small-molecule inhibition or antagonism is the primary therapeutic strategy.`,
    };
  }

  if (/\b(tumor suppressor|loss[- ]of[- ]function|haploinsufficien|chaperone|deficiency)\b/i.test(combinedText)) {
    return {
      expectedMoA: "activator",
      directionOfEffect: "Loss-of-Function",
      rationale: `Target annotation indicates tumor-suppressor or loss-of-function biology; direct inhibition is counter-indicated (activation or restoration preferred).`,
    };
  }

  if (
    /\b(kinase|protease|transferase|hydrolase|synthase|reductase|oxidase|dehydrogenase|phosphodiesterase|cyclooxygenase|esterase|polymerase|helicase|methyltransferase|deacetylase|oncogene)\b/i.test(
      combinedText
    )
  ) {
    return {
      expectedMoA: "inhibitor",
      directionOfEffect: "Gain-of-Function / Catalytic Target",
      rationale: `Catalytic enzyme or oncogenic driver profile; active-site or allosteric inhibition is the standard small-molecule mechanism.`,
    };
  }

  const somatic = Number(datatypeScores?.somatic_mutation) || 0;
  const clinical = Number(datatypeScores?.clinical ?? datatypeScores?.known_drug) || 0;
  if (somatic >= 0.45 && clinical >= 0.2) {
    return {
      expectedMoA: "inhibitor",
      directionOfEffect: "Somatic Driver / Druggable",
      rationale: `Strong somatic driver and clinical precedent suggest inhibition of hyperactive target signaling.`,
    };
  }

  return {
    expectedMoA: "modulator",
    directionOfEffect: "Context-Dependent",
    rationale: `Directionality depends on disease context; evaluate both positive and negative modulation before committing to an inhibitor screen.`,
  };
}

/** Never let a maxed-out clinical score drive novelty to exactly zero. */
const MAX_CLINICAL_PENALTY = 0.95;

/**
 * Disease-specific exploration, from the association's `clinical` datatype
 * score: evidence that drugs already target this gene FOR THIS DISEASE.
 * 0 → untouched here (factor 1), ~1 → heavily drugged here (factor 0.05).
 */
export function diseaseNoveltyFactor(clinicalScore) {
  const c = Math.min(1, Math.max(0, Number(clinicalScore) || 0));
  return 1 - MAX_CLINICAL_PENALTY * c;
}

/**
 * Gentle discount for a gene that is already drugged in any indication.
 * Logarithmic, so going from 0 to 1 drug costs far less than the old
 * 1/(1+n) hyperbola, and 82 drugs no longer wipes the score out.
 *   0 → 1.00 · 1 → 0.85 · 10 → 0.62 · 82 → 0.48
 */
export function broadDrugDiscount(drugCount) {
  const n = Math.max(0, Number(drugCount) || 0);
  return 1 / (1 + Math.log1p(n) / 4);
}

/**
 * @param {number} biology  biologySignal, 0–1
 * @param {{clinicalScore?: number, drugCount?: number}} exploration
 */
export function noveltyScoreValue(biology, exploration = {}) {
  const { clinicalScore = 0, drugCount = 0 } = exploration;
  const raw =
    100 * Math.max(0, Number(biology) || 0) * diseaseNoveltyFactor(clinicalScore) * broadDrugDiscount(drugCount);
  return Math.round(Math.min(100, raw) * 10) / 10;
}

export function geneticStrength(geneticScore) {
  const g = Number(geneticScore) || 0;
  if (g >= 0.7) return { label: "Strong", level: "strong" };
  if (g >= 0.4) return { label: "Moderate", level: "moderate" };
  if (g >= 0.15) return { label: "Limited", level: "limited" };
  return { label: "None / weak", level: "none" };
}

export function passesEvidenceFloor(row) {
  const overall = Number(row?.overallScore) || 0;
  if (overall < MIN_OVERALL_SCORE) return false;
  const dt = row?.datatypeScores || {};
  const genetic = Number(row?.geneticScore ?? dt.genetic_association) || 0;
  const somatic = Number(row?.somaticScore ?? dt.somatic_mutation) || 0;
  const genLit = dt.genetic_literature || 0;
  const core = genetic + somatic + genLit;
  if (core >= 0.15) return true;
  const path = (dt.affected_pathway || 0) + (dt.animal_model || 0);
  return path >= 0.45 && overall >= 0.4;
}

/** Clinical evidence at or above this means the disease is already being drugged here. */
export const UNDRUGGED_CLINICAL_CEILING = 0.1;

export function isHighNovelty(row) {
  // Judged per disease: a gene drugged for other indications can still be
  // untouched for this one, which is the repurposing case worth surfacing.
  const clinical = Number(row?.clinicalScore) || 0;
  if (clinical >= UNDRUGGED_CLINICAL_CEILING) return false;
  const overall = Number(row?.overallScore) || 0;
  if (overall < 0.35) return false;
  const dt = row?.datatypeScores || {};
  const genetic = Number(row?.geneticScore ?? dt.genetic_association) || 0;
  const somatic = Number(row?.somaticScore ?? dt.somatic_mutation) || 0;
  const genLit = dt.genetic_literature || 0;
  return genetic >= 0.35 || (genetic >= 0.15 && somatic >= 0.4) || genetic + somatic + genLit >= 0.7;
}

export function isWellEstablished(row) {
  // Established FOR THIS DISEASE: clinical evidence here, not drugs elsewhere.
  const clinical = Number(row?.clinicalScore) || 0;
  return clinical >= 0.4 && (Number(row?.overallScore) || 0) >= 0.4;
}

export function evidenceSummary(datatypeScores) {
  const dt = datatypeScores || {};
  const parts = Object.keys(DATATYPE_LABELS)
    .filter((id) => id !== "clinical" && (dt[id] || 0) > 0.08)
    .sort((a, b) => (dt[b] || 0) - (dt[a] || 0))
    .slice(0, 3)
    .map((id) => `${DATATYPE_LABELS[id]} ${(dt[id] * 100).toFixed(0)}`);
  return parts.length ? parts.join(" · ") : "Limited structured evidence";
}

export function geneticEvidencePhrase(row) {
  const ds = row?.datasourceScores || {};
  const hasGwas = Object.keys(ds).some((id) => GWAS_SOURCES.has(id) && ds[id] >= 0.1);
  const hasRare = Object.keys(ds).some((id) => RARE_VARIANT_SOURCES.has(id) && ds[id] >= 0.1);
  if (hasGwas && hasRare) return "GWAS + rare variant evidence";
  if (hasGwas) return "GWAS evidence";
  if (hasRare) return "rare variant evidence";
  const strength = geneticStrength(row?.geneticScore).level;
  if (strength === "none") {
    const somatic = Number(row?.somaticScore) || 0;
    if (somatic >= 0.3) return "somatic mutation evidence";
    return "limited genetic evidence";
  }
  return "genetic association evidence";
}

export function explainTarget(row) {
  const strength = geneticStrength(row?.geneticScore);
  const phrase = geneticEvidencePhrase(row);
  const clinical = Number(row?.clinicalScore) || 0;
  const drugs = Number(row?.drugCount) || 0;
  const gene = row?.symbol || "this gene";
  // "drugs elsewhere" is a repurposing asset, so it is reported separately
  // from whether this disease is already being treated through this target.
  const elsewhere =
    drugs > 0
      ? ` ${drugs} drug${drugs === 1 ? "" : "s"} target${drugs === 1 ? "s" : ""} ${gene} in other indications, which helps if you want an existing chemotype.`
      : "";

  if (clinical < UNDRUGGED_CLINICAL_CEILING) {
    if (strength.level === "strong" || strength.level === "moderate") {
      return `${strength.label} genetic association (${phrase}), and no drug is in clinical development against ${gene} for this disease.${elsewhere}`;
    }
    if ((Number(row?.somaticScore) || 0) >= 0.3) {
      return `Somatic / cancer-genetics evidence links ${gene} to this disease, with no clinical programme against it here.${elsewhere}`;
    }
    return `Biological association with little genetic support and no clinical programme here, so treat as a weaker discovery lead.${elsewhere}`;
  }
  if (clinical >= 0.4) {
    return `${strength.label} disease association, but drugs against ${gene} are already in clinical development for this disease — well explored, so novelty is low.`;
  }
  return `${strength.label} genetic association (${phrase}), with early clinical activity against ${gene} already reported for this disease.`;
}

export function scoreAssociatedRows(rows, options = {}) {
  const profileId =
    options?.profile && EVIDENCE_PROFILES[options.profile] ? options.profile : "novel_discovery";
  const normalizedCustom = normalizeCustomWeights(options?.customWeights);
  const scored = [];
  for (const row of rows || []) {
    const target = row?.target || {};
    if (target.biotype && target.biotype !== "protein_coding") continue;
    const datatypeScores = datatypeMap(row.datatypeScores);
    const datasourceScores = datatypeMap(row.datasourceScores);
    const overallScore = Number(row.score) || 0;
    const geneticScore = datatypeScores.genetic_association || 0;
    const somaticScore = datatypeScores.somatic_mutation || 0;
    // Disease-specific: drugs in clinical development against this target for
    // the queried disease. Distinct from drugCount, which is global.
    const clinicalScore = datatypeScores.clinical || datatypeScores.known_drug || 0;
    const drugCount = Number(target.drugAndClinicalCandidates?.count) || 0;
    const biology = biologySignal(datatypeScores, overallScore);
    const genetic = geneticStrength(geneticScore);
    const tractability = summarizeTractability(target.tractability);
    const safety = summarizeSafetyLiabilities(target.safetyLiabilities);
    const moaInfo = inferExpectedMoA(target, datatypeScores);
    const tdlInfo = classifyPharosTDL(target, datatypeScores);
    const essentialityInfo = evaluateEssentialityAndExpression(target, safety);
    const paralogs = extractHumanParalogs(target);
    const repurposingScore = repurposingSignal(datatypeScores, overallScore, tractability, drugCount);
    const defaultNoveltyScore = noveltyScoreValue(biology, { clinicalScore, drugCount });
    const customScore = normalizedCustom
      ? customWeightedSignal(datatypeScores, datasourceScores, overallScore, normalizedCustom, drugCount)
      : null;
    const rawProfileScore =
      customScore !== null
        ? customScore
        : profileId === "repurposing"
          ? repurposingScore
          : defaultNoveltyScore;
    const penalizedNoveltyScore =
      Math.round(Math.max(0, rawProfileScore - (essentialityInfo.toxicityPenalty || 0)) * 10) / 10;

    const uniprotId =
      (target.proteinIds || []).find((p) => p?.source === "uniprot_swissprot")?.id ||
      (target.proteinIds || []).find((p) => /uniprot/i.test(String(p?.source || "")))?.id ||
      null;

    const item = {
      ensemblId: target.id || "",
      symbol: target.approvedSymbol || "",
      name: target.approvedName || "",
      uniprotId,
      overallScore,
      geneticScore,
      somaticScore,
      clinicalScore,
      drugCount,
      biologySignal: biology,
      noveltyScore: penalizedNoveltyScore,
      discoveryNoveltyScore: defaultNoveltyScore,
      repurposingScore,
      evidenceProfile: normalizedCustom ? "custom" : profileId,
      tdl: tdlInfo.tdl,
      tdlLabel: tdlInfo.label,
      tdlDescription: tdlInfo.description,
      safetyProfile: essentialityInfo.safetyProfile,
      essentiality: essentialityInfo,
      paralogs,
      // Exposed so the UI and reports can show how the score was reached.
      noveltyComponents: {
        biology,
        diseaseNoveltyFactor: diseaseNoveltyFactor(clinicalScore),
        broadDrugDiscount: broadDrugDiscount(drugCount),
        toxicityPenalty: essentialityInfo.toxicityPenalty || 0,
      },
      datatypeScores,
      datasourceScores,
      geneticLabel: genetic.label,
      geneticLevel: genetic.level,
      tractability,
      safety,
      expectedMoA: moaInfo.expectedMoA,
      directionOfEffect: moaInfo.directionOfEffect,
      moaRationale: moaInfo.rationale,
    };
    item.triageDimensions = computeTriageMatrixDimensions(item);
    item.highNovelty = isHighNovelty(item);
    item.wellEstablished = isWellEstablished(item);
    item.evidenceSummary = evidenceSummary(datatypeScores);
    item.explanation = explainTarget(item);
    item.passesFloor =
      normalizedCustom !== null
        ? overallScore >= MIN_OVERALL_SCORE
        : profileId === "repurposing"
          ? overallScore >= MIN_OVERALL_SCORE && (clinicalScore >= 0.1 || drugCount > 0 || passesEvidenceFloor(item))
          : passesEvidenceFloor(item);
    scored.push(item);
  }

  const novelty = scored
    .filter((row) => row.passesFloor)
    .sort((a, b) => {
      const n = b.noveltyScore - a.noveltyScore;
      if (n !== 0) return n;
      const g = b.geneticScore - a.geneticScore;
      if (g !== 0) return g;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

  const established = scored
    .filter((row) => row.wellEstablished)
    .sort((a, b) => {
      const o = b.overallScore - a.overallScore;
      if (o !== 0) return o;
      return String(a.symbol).localeCompare(String(b.symbol));
    });

  return {
    all: scored,
    novelty,
    established,
    evidenceProfile: normalizedCustom ? "custom" : profileId,
  };
}

