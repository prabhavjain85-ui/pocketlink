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

export function scoreAssociatedRows(rows) {
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
    const clinicalScore = datatypeScores.clinical || 0;
    const drugCount = Number(target.drugAndClinicalCandidates?.count) || 0;
    const biology = biologySignal(datatypeScores, overallScore);
    const genetic = geneticStrength(geneticScore);
    const item = {
      ensemblId: target.id || "",
      symbol: target.approvedSymbol || "",
      name: target.approvedName || "",
      overallScore,
      geneticScore,
      somaticScore,
      clinicalScore,
      drugCount,
      biologySignal: biology,
      noveltyScore: noveltyScoreValue(biology, { clinicalScore, drugCount }),
      // Exposed so the UI and reports can show how the score was reached.
      noveltyComponents: {
        biology,
        diseaseNoveltyFactor: diseaseNoveltyFactor(clinicalScore),
        broadDrugDiscount: broadDrugDiscount(drugCount),
      },
      datatypeScores,
      datasourceScores,
      geneticLabel: genetic.label,
      geneticLevel: genetic.level,
    };
    item.highNovelty = isHighNovelty(item);
    item.wellEstablished = isWellEstablished(item);
    item.evidenceSummary = evidenceSummary(datatypeScores);
    item.explanation = explainTarget(item);
    item.passesFloor = passesEvidenceFloor(item);
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

  return { all: scored, novelty, established };
}
