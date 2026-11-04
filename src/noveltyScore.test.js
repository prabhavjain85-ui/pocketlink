import {
  biologySignal,
  broadDrugDiscount,
  diseaseNoveltyFactor,
  evidenceSummary,
  explainTarget,
  geneticStrength,
  isHighNovelty,
  isWellEstablished,
  noveltyScoreValue,
  passesEvidenceFloor,
  scoreAssociatedRows,
} from "../server/noveltyScore";

function row({
  symbol,
  name,
  overall,
  genetic = 0,
  somatic = 0,
  genLit = 0,
  literature = 0,
  pathway = 0,
  animal = 0,
  expression = 0,
  clinical = 0,
  drugs = 0,
  biotype = "protein_coding",
  sources = {},
}) {
  const datatypeScores = [
    ["genetic_association", genetic],
    ["genetic_literature", genLit],
    ["somatic_mutation", somatic],
    ["literature", literature],
    ["affected_pathway", pathway],
    ["animal_model", animal],
    ["rna_expression", expression],
    ["clinical", clinical],
  ]
    .filter(([, score]) => score > 0)
    .map(([id, score]) => ({ id, score }));
  const datasourceScores = Object.entries(sources).map(([id, score]) => ({ id, score }));
  return {
    score: overall,
    datatypeScores,
    datasourceScores,
    target: {
      id: `ENSG_${symbol}`,
      approvedSymbol: symbol,
      approvedName: name || symbol,
      biotype,
      drugAndClinicalCandidates: { count: drugs },
    },
  };
}

test("disease novelty factor is driven by clinical evidence for THIS disease", () => {
  expect(diseaseNoveltyFactor(0)).toBe(1);
  expect(diseaseNoveltyFactor(0.5)).toBeCloseTo(0.525);
  expect(diseaseNoveltyFactor(1)).toBeCloseTo(0.05);
});

test("global drug count only discounts novelty gently", () => {
  expect(broadDrugDiscount(0)).toBe(1);
  expect(broadDrugDiscount(1)).toBeGreaterThan(0.8);
  expect(broadDrugDiscount(82)).toBeGreaterThan(0.4);
  // The old 1/(1+n) curve put 82 drugs at 0.012, which wiped the score out.
  expect(broadDrugDiscount(82)).toBeGreaterThan(1 / 83);
});

test("biology weights sum to exactly 1 so perfect evidence scores 100", () => {
  const perfect = biologySignal(
    {
      genetic_association: 1,
      genetic_literature: 1,
      somatic_mutation: 1,
      literature: 1,
      affected_pathway: 1,
      animal_model: 1,
      rna_expression: 1,
    },
    1
  );
  expect(perfect).toBeCloseTo(1, 10);
  expect(noveltyScoreValue(perfect, { clinicalScore: 0, drugCount: 0 })).toBe(100);
});

test("a gene drugged for other diseases stays novel for an untouched disease", () => {
  // EGFR: 82 drugs globally, but clinical evidence is 0.996 in NSCLC and
  // 0.000 in pachyonychia congenita. Novelty must follow the disease.
  const biology = biologySignal({ genetic_association: 0.6, literature: 0.4 }, 0.5);
  const inLungCancer = noveltyScoreValue(biology, { clinicalScore: 0.996, drugCount: 82 });
  const inRareDisease = noveltyScoreValue(biology, { clinicalScore: 0, drugCount: 82 });
  expect(inRareDisease).toBeGreaterThan(inLungCancer * 10);
  expect(inRareDisease).toBeGreaterThan(10);
});

test("biology signal weights genetic association far above literature", () => {
  const genetic = biologySignal({ genetic_association: 0.9, literature: 0.2 }, 0.5);
  const literatureOnly = biologySignal({ genetic_association: 0, literature: 0.9 }, 0.5);
  expect(genetic).toBeGreaterThan(literatureOnly * 1.5);
});

test("novelty score is high for strong genetics with no clinical programme here", () => {
  const biology = biologySignal({ genetic_association: 0.9 }, 0.8);
  const undrugged = noveltyScoreValue(biology, { clinicalScore: 0, drugCount: 0 });
  const crowded = noveltyScoreValue(biology, { clinicalScore: 0.95, drugCount: 27 });
  expect(undrugged).toBeGreaterThan(50);
  expect(crowded).toBeLessThan(10);
  expect(undrugged).toBeGreaterThan(crowded * 5);
});

test("evidence floor drops literature/clinical-only noise but keeps genetic or somatic leads", () => {
  const genetic = scoreAssociatedRows([row({ symbol: "SETBP1", overall: 0.68, genetic: 0.87 })]).all[0];
  const clinicalKinase = scoreAssociatedRows([
    row({ symbol: "FYN", overall: 0.6, literature: 0.7, clinical: 0.9, drugs: 6 }),
  ]).all[0];
  const weak = scoreAssociatedRows([row({ symbol: "NOISE", overall: 0.05, literature: 0.2 })]).all[0];
  expect(passesEvidenceFloor(genetic)).toBe(true);
  expect(passesEvidenceFloor(clinicalKinase)).toBe(false);
  expect(passesEvidenceFloor(weak)).toBe(false);
});

test("high-novelty badge is reserved for strong evidence and no clinical programme for this disease", () => {
  const palb2 = scoreAssociatedRows([
    row({
      symbol: "PALB2",
      overall: 0.79,
      genetic: 0.94,
      genLit: 0.85,
      somatic: 0.6,
      drugs: 0,
      sources: { eva: 0.94, genomics_england: 0.9 },
    }),
  ]).all[0];
  const kras = scoreAssociatedRows([
    row({ symbol: "KRAS", overall: 0.81, genetic: 0.86, somatic: 0.89, clinical: 0.75, drugs: 3 }),
  ]).all[0];
  expect(isHighNovelty(palb2)).toBe(true);
  expect(isHighNovelty(kras)).toBe(false);
  expect(palb2.explanation).toMatch(/no drug is in clinical development/i);
  expect(palb2.explanation).toMatch(/rare variant/i);
});

test("well-established means clinical programmes exist for THIS disease", () => {
  const abl1 = scoreAssociatedRows([
    row({ symbol: "ABL1", overall: 0.84, genetic: 0.86, clinical: 0.9, drugs: 27 }),
  ]).all[0];
  const tet2 = scoreAssociatedRows([row({ symbol: "TET2", overall: 0.64, genetic: 0.71, drugs: 0 })]).all[0];
  // Drugged elsewhere but untouched here: novel for this disease, not established.
  const elsewhere = scoreAssociatedRows([row({ symbol: "EGFR", overall: 0.5, genetic: 0.5, clinical: 0, drugs: 82 })]).all[0];
  expect(isWellEstablished(abl1)).toBe(true);
  expect(isWellEstablished(tet2)).toBe(false);
  expect(isWellEstablished(elsewhere)).toBe(false);
  expect(abl1.explanation).toMatch(/already in clinical development/i);
  expect(elsewhere.explanation).toMatch(/82 drugs target EGFR in other indications/i);
});

test("pancreatic cancer fixtures: undrugged genetic genes outrank KRAS/TP53 on novelty", () => {
  const { novelty, established } = scoreAssociatedRows([
    row({
      symbol: "KRAS",
      name: "KRas proto-oncogene, GTPase",
      overall: 0.807,
      genetic: 0.856,
      somatic: 0.894,
      literature: 0.987,
      pathway: 0.743,
      genLit: 0.608,
      clinical: 0.121,
      drugs: 3,
    }),
    row({
      symbol: "TP53",
      name: "tumor protein p53",
      overall: 0.795,
      genetic: 0.92,
      somatic: 0.873,
      literature: 0.971,
      genLit: 0.608,
      drugs: 9,
    }),
    row({
      symbol: "PALB2",
      name: "partner and localizer of BRCA2",
      overall: 0.786,
      genetic: 0.94,
      somatic: 0.604,
      literature: 0.573,
      pathway: 0.907,
      genLit: 0.847,
      drugs: 0,
      sources: { eva: 0.94, genomics_england: 0.907 },
    }),
    row({
      symbol: "SMAD4",
      overall: 0.779,
      genetic: 0.857,
      somatic: 0.891,
      literature: 0.923,
      drugs: 0,
    }),
    row({ symbol: "RRM1", overall: 0.607, literature: 0.4, clinical: 0.9, drugs: 10 }),
  ]);

  expect(novelty[0].symbol).toBe("PALB2");
  expect(novelty.map((r) => r.symbol)).toEqual(expect.arrayContaining(["PALB2", "SMAD4", "KRAS", "TP53"]));
  expect(novelty.map((r) => r.symbol)).not.toContain("RRM1");
  const palb2 = novelty.find((r) => r.symbol === "PALB2");
  const kras = novelty.find((r) => r.symbol === "KRAS");
  const tp53 = novelty.find((r) => r.symbol === "TP53");
  expect(palb2.noveltyScore).toBeGreaterThan(kras.noveltyScore);
  expect(kras.noveltyScore).toBeGreaterThan(tp53.noveltyScore);
  // Disease-specific: only RRM1 has real clinical evidence in these fixtures.
  expect(established.map((r) => r.symbol)).toEqual(expect.arrayContaining(["RRM1"]));
  expect(established.map((r) => r.symbol)).not.toContain("PALB2");
});

test("CML fixtures: SETBP1/TET2 outrank ABL1 on novelty despite ABL1's stronger overall association", () => {
  const { novelty, established } = scoreAssociatedRows([
    row({ symbol: "ABL1", overall: 0.836, genetic: 0.863, clinical: 0.95, literature: 0.8, drugs: 27 }),
    row({ symbol: "BCR", overall: 0.829, genetic: 0.277, clinical: 0.9, drugs: 15 }),
    row({ symbol: "SETBP1", overall: 0.678, genetic: 0.865, somatic: 0.4, drugs: 0 }),
    row({ symbol: "TET2", overall: 0.637, genetic: 0.709, somatic: 0.3, drugs: 0 }),
    row({ symbol: "KIT", overall: 0.71, somatic: 0.5, clinical: 0.9, drugs: 38 }),
  ]);
  expect(novelty[0].symbol).toMatch(/SETBP1|TET2/);
  const setbp1 = novelty.find((r) => r.symbol === "SETBP1");
  const abl1 = novelty.find((r) => r.symbol === "ABL1");
  expect(setbp1.noveltyScore).toBeGreaterThan(abl1.noveltyScore);
  expect(setbp1.highNovelty).toBe(true);
  expect(abl1.highNovelty).toBe(false);
  expect(established[0].symbol).toBe("ABL1");
  expect(isWellEstablished(abl1)).toBe(true);
});

test("non-protein-coding targets are skipped", () => {
  const { all } = scoreAssociatedRows([
    row({ symbol: "LINC", overall: 0.9, genetic: 0.9, biotype: "lncRNA" }),
    row({ symbol: "EGFR", overall: 0.7, genetic: 0.6 }),
  ]);
  expect(all.map((r) => r.symbol)).toEqual(["EGFR"]);
});

test("genetic strength labels and evidence summary are human-readable", () => {
  expect(geneticStrength(0.86).label).toBe("Strong");
  expect(geneticStrength(0.45).label).toBe("Moderate");
  expect(geneticStrength(0.2).label).toBe("Limited");
  expect(geneticStrength(0).label).toBe("None / weak");
  expect(evidenceSummary({ genetic_association: 0.9, literature: 0.4, clinical: 0.9 })).toMatch(
    /Genetic association 90/
  );
  expect(explainTarget({ symbol: "ATM", geneticScore: 0.8, clinicalScore: 0, drugCount: 0, datasourceScores: {} })).toMatch(
    /no drug is in clinical development against ATM/i
  );
});

test("repurposing evidence profile prioritizes clinically drugged, tractable targets over undrugged genetic leads", () => {
  const rows = [
    row({ symbol: "PALB2", overall: 0.78, genetic: 0.94, drugs: 0 }),
    row({ symbol: "ABL1", overall: 0.84, genetic: 0.86, clinical: 0.95, drugs: 27 }),
  ];
  const novelRun = scoreAssociatedRows(rows, { profile: "novel_discovery" });
  const repurposeRun = scoreAssociatedRows(rows, { profile: "repurposing" });

  expect(novelRun.novelty[0].symbol).toBe("PALB2");
  expect(repurposeRun.novelty[0].symbol).toBe("ABL1");
  expect(repurposeRun.evidenceProfile).toBe("repurposing");
  expect(repurposeRun.novelty[0].repurposingScore).toBeGreaterThan(repurposeRun.novelty[1].repurposingScore);
});

test("infers expectedMoA directionality (activator for tumour suppressors/LoF vs inhibitor for oncogenes/GoF)", () => {
  const { all } = scoreAssociatedRows([
    row({ symbol: "TP53", name: "tumor suppressor p53", overall: 0.8, genetic: 0.9 }),
    row({ symbol: "EGFR", name: "epidermal growth factor receptor tyrosine kinase", overall: 0.8, genetic: 0.8 }),
  ]);
  const tp53 = all.find((r) => r.symbol === "TP53");
  const egfr = all.find((r) => r.symbol === "EGFR");
  expect(tp53.expectedMoA).toBe("activator");
  expect(tp53.directionOfEffect).toMatch(/Loss-of-Function/i);
  expect(egfr.expectedMoA).toBe("inhibitor");
  expect(egfr.directionOfEffect).toMatch(/Gain-of-Function/i);
});


