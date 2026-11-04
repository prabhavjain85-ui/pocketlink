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

  const clinicalPrecedence = active.some((t) =>
    /approved drug|advanced clinical|phase [123]|clinical precedence/i.test(String(t.label || ""))
  );
  const highQualityPocket = sm.some((t) =>
    /high-quality ligand|high-quality pocket|medium-quality pocket|druggable family/i.test(String(t.label || ""))
  );

  let topModality = "Uncharacterized";
  if (sm.length > 0) topModality = "Small Molecule";
  else if (ab.length > 0) topModality = "Antibody";
  else if (pr.length > 0) topModality = "PROTAC";

  return {
    smallMolecule: sm.length > 0,
    antibody: ab.length > 0,
    protac: pr.length > 0,
    clinicalPrecedence,
    highQualityPocket,
    topModality,
    labels: labels.slice(0, 6),
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
    count: events.length,
    events: events.slice(0, 4),
    tissues: tissues.slice(0, 4),
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
    const repurposingScore = repurposingSignal(datatypeScores, overallScore, tractability, drugCount);
    const defaultNoveltyScore = noveltyScoreValue(biology, { clinicalScore, drugCount });
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
      noveltyScore: profileId === "repurposing" ? repurposingScore : defaultNoveltyScore,
      discoveryNoveltyScore: defaultNoveltyScore,
      repurposingScore,
      evidenceProfile: profileId,
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
      tractability,
      safety,
      expectedMoA: moaInfo.expectedMoA,
      directionOfEffect: moaInfo.directionOfEffect,
      moaRationale: moaInfo.rationale,
    };
    item.highNovelty = isHighNovelty(item);
    item.wellEstablished = isWellEstablished(item);
    item.evidenceSummary = evidenceSummary(datatypeScores);
    item.explanation = explainTarget(item);
    item.passesFloor =
      profileId === "repurposing"
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

  return { all: scored, novelty, established, evidenceProfile: profileId };
}
