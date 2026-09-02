/**
 * Novelty Score for Target Discovery.
 *
 * Open Targets overall association is necessary but not sufficient: a gene
 * can be strongly linked to a disease and still be a poor discovery
 * opportunity if many approved / investigational drugs already target it.
 *
 * biologySignal weights genetic (and related) evidence most heavily.
 * drugNoveltyFactor is 1 / (1 + known-drug count), so zero drugs keep the
 * full biology signal and heavily drugged genes collapse toward 0.
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

export function biologySignal(datatypeScores, overallScore) {
  const dt = datatypeScores || {};
  return (
    0.5 * (dt.genetic_association || 0) +
    0.12 * (dt.genetic_literature || 0) +
    0.12 * (dt.somatic_mutation || 0) +
    0.1 * (Number(overallScore) || 0) +
    0.08 * (dt.literature || 0) +
    0.05 * (dt.affected_pathway || 0) +
    0.03 * (dt.animal_model || 0) +
    0.02 * (dt.rna_expression || 0)
  );
}

export function drugNoveltyFactor(drugCount) {
  const n = Math.max(0, Number(drugCount) || 0);
  return 1 / (1 + n);
}

export function noveltyScoreValue(biology, drugCount) {
  const raw = 100 * Math.max(0, Number(biology) || 0) * drugNoveltyFactor(drugCount);
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

export function isHighNovelty(row) {
  const drugs = Number(row?.drugCount) || 0;
  if (drugs !== 0) return false;
  const overall = Number(row?.overallScore) || 0;
  if (overall < 0.35) return false;
  const dt = row?.datatypeScores || {};
  const genetic = Number(row?.geneticScore ?? dt.genetic_association) || 0;
  const somatic = Number(row?.somaticScore ?? dt.somatic_mutation) || 0;
  const genLit = dt.genetic_literature || 0;
  return genetic >= 0.35 || (genetic >= 0.15 && somatic >= 0.4) || genetic + somatic + genLit >= 0.7;
}

export function isWellEstablished(row) {
  return (Number(row?.drugCount) || 0) >= 3 && (Number(row?.overallScore) || 0) >= 0.4;
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
  const drugs = Number(row?.drugCount) || 0;
  const gene = row?.symbol || "this gene";
  if (drugs === 0) {
    if (strength.level === "strong" || strength.level === "moderate") {
      return `${strength.label} genetic association (${phrase}), no approved or investigational drugs currently target ${gene}.`;
    }
    if ((Number(row?.somaticScore) || 0) >= 0.3) {
      return `Somatic / cancer-genetics evidence links ${gene} to this disease, and no approved or investigational drugs currently target it.`;
    }
    return `Biological association with little genetic support; no existing drugs target ${gene}, so treat as a weaker discovery lead.`;
  }
  if (drugs >= 3) {
    return `${strength.label} disease association, but ${drugs} existing approved or investigational drugs already target ${gene} — well explored, so novelty is low.`;
  }
  return `${strength.label} genetic association (${phrase}), with ${drugs} existing drug${drugs === 1 ? "" : "s"} already listing ${gene} as a target.`;
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
      drugCount,
      biologySignal: biology,
      noveltyScore: noveltyScoreValue(biology, drugCount),
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
