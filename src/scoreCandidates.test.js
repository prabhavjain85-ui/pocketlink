import {
  drugLikenessChecks,
  rankCandidatesLocal,
  scoreLibraryLocal,
  rankRepurposing,
} from "../server/scoreCandidates";

const caffeine = {
  cid: "2519",
  displayName: "caffeine",
  molecularWeight: 194.19,
  xlogp: -0.1,
  hbd: 0,
  hba: 6,
  rotatableBonds: 0,
  tpsa: 58.4,
};

const imatinib = {
  cid: "5291",
  displayName: "imatinib",
  molecularWeight: 493.6,
  xlogp: 3.5,
  hbd: 2,
  hba: 7,
  rotatableBonds: 7,
  tpsa: 86.3,
};

const gefitinib = {
  cid: "123631",
  displayName: "gefitinib",
  molecularWeight: 446.9,
  xlogp: 3.2,
  hbd: 1,
  hba: 7,
  rotatableBonds: 7,
  tpsa: 68.7,
};

const erlotinib = {
  cid: "176870",
  displayName: "erlotinib",
  molecularWeight: 393.4,
  xlogp: 2.7,
  hbd: 1,
  hba: 6,
  rotatableBonds: 7,
  tpsa: 74.7,
};

const lapatinib = {
  cid: "208908",
  displayName: "lapatinib",
  molecularWeight: 581.1,
  xlogp: 5.2,
  hbd: 2,
  hba: 8,
  rotatableBonds: 9,
  tpsa: 114,
};

const dabrafenib = {
  cid: "44462760",
  displayName: "dabrafenib",
  molecularWeight: 519.6,
  xlogp: 4.8,
  hbd: 2,
  hba: 7,
  rotatableBonds: 6,
  tpsa: 115,
};

const salbutamol = {
  cid: "2083",
  displayName: "salbutamol",
  molecularWeight: 239.31,
  xlogp: 0.6,
  hbd: 4,
  hba: 4,
  rotatableBonds: 4,
  tpsa: 72.7,
};

const morphine = {
  cid: "5288826",
  displayName: "morphine",
  molecularWeight: 285.34,
  xlogp: 0.8,
  hbd: 2,
  hba: 4,
  rotatableBonds: 0,
  tpsa: 49.8,
};

const losartan = {
  cid: "3961",
  displayName: "losartan",
  molecularWeight: 422.9,
  xlogp: 4.0,
  hbd: 1,
  hba: 6,
  rotatableBonds: 6,
  tpsa: 66.8,
};

const celecoxib = {
  cid: "2662",
  displayName: "celecoxib",
  molecularWeight: 381.37,
  xlogp: 3.5,
  hbd: 1,
  hba: 5,
  rotatableBonds: 2,
  tpsa: 78,
};

const atorvastatin = {
  cid: "60823",
  displayName: "atorvastatin",
  molecularWeight: 558.6,
  xlogp: 5.7,
  hbd: 3,
  hba: 7,
  rotatableBonds: 12,
  tpsa: 112,
};

const metformin = {
  cid: "4091",
  displayName: "metformin",
  molecularWeight: 129.16,
  xlogp: -2.6,
  hbd: 3,
  hba: 2,
  rotatableBonds: 2,
  tpsa: 88,
};

const sitagliptin = {
  cid: "4369359",
  displayName: "sitagliptin",
  molecularWeight: 407.3,
  xlogp: 1.7,
  hbd: 2,
  hba: 6,
  rotatableBonds: 6,
  tpsa: 77,
};

const ritonavir = {
  cid: "392622",
  displayName: "ritonavir",
  molecularWeight: 720.9,
  xlogp: 3.9,
  hbd: 4,
  hba: 8,
  rotatableBonds: 17,
  tpsa: 140,
};

const nirmatrelvir = {
  cid: "155903259",
  displayName: "nirmatrelvir",
  molecularWeight: 499.5,
  xlogp: 1.6,
  hbd: 3,
  hba: 6,
  rotatableBonds: 8,
  tpsa: 115,
};

const sildenafil = {
  cid: "135398744",
  displayName: "sildenafil",
  molecularWeight: 474.6,
  xlogp: 1.9,
  hbd: 1,
  hba: 8,
  rotatableBonds: 7,
  tpsa: 113,
};

const vorinostat = {
  cid: "5311",
  displayName: "vorinostat",
  molecularWeight: 264.32,
  xlogp: 1.9,
  hbd: 3,
  hba: 4,
  rotatableBonds: 7,
  tpsa: 78.1,
};

const ibuprofen = {
  cid: "3672",
  displayName: "ibuprofen",
  molecularWeight: 206.28,
  xlogp: 3.5,
  hbd: 1,
  hba: 2,
  rotatableBonds: 4,
  tpsa: 37.3,
};

const ugly = {
  cid: "999999",
  displayName: "non-drug-like oligomer",
  molecularWeight: 920,
  xlogp: 8.4,
  hbd: 9,
  hba: 16,
  rotatableBonds: 22,
  tpsa: 210,
};

test("ranks a clearly non-drug-like molecule last", () => {
  const result = rankCandidatesLocal([ugly, caffeine, imatinib, ibuprofen, {
    cid: "2244",
    displayName: "aspirin",
    molecularWeight: 180.16,
    xlogp: 1.2,
    hbd: 1,
    hba: 4,
    rotatableBonds: 3,
    tpsa: 63.6,
  }]);

  expect(result.ranking).toHaveLength(5);
  expect(result.recommended.cid).not.toBe("999999");
  expect(result.ranking[result.ranking.length - 1].cid).toBe("999999");
  expect(result.ranking[0].score).toBeGreaterThan(result.ranking[4].score);
});

test("returns a complete ranking schema with heuristic-v2", () => {
  const result = rankCandidatesLocal([caffeine, imatinib]);
  expect(result.recommended.cid).toBeTruthy();
  expect(result.recommended.score).toBeGreaterThanOrEqual(0);
  expect(result.recommended.score).toBeLessThanOrEqual(100);
  expect(result.recommended.reason).toMatch(/caffeine|imatinib/i);
  expect(result.ranking.map((r) => r.cid).sort()).toEqual(["2519", "5291"]);
  expect(result.limitations.length).toBeGreaterThan(0);
  expect(result.source).toBe("heuristic-v2");
});

test("scoreLibraryLocal ranks more than five compounds without the shortlist cap", () => {
  const extra = [
    caffeine,
    imatinib,
    ibuprofen,
    ugly,
    {
      cid: "2244",
      displayName: "aspirin",
      molecularWeight: 180.16,
      xlogp: 1.2,
      hbd: 1,
      hba: 4,
      rotatableBonds: 3,
      tpsa: 63.6,
    },
    {
      cid: "1983",
      displayName: "paracetamol",
      molecularWeight: 151.16,
      xlogp: 0.5,
      hbd: 2,
      hba: 2,
      rotatableBonds: 1,
      tpsa: 49.3,
    },
  ];
  const result = scoreLibraryLocal(extra, { id: "2HYY", queryName: "ABL1", title: "c-Abl tyrosine kinase" });
  expect(result.ranking).toHaveLength(6);
  expect(result.ranking.find((r) => r.cid === "5291").score).toBeGreaterThan(result.ranking.find((r) => r.cid === "1983").score);
});

test("requires at least two candidates", () => {
  expect(() => rankCandidatesLocal([caffeine])).toThrow(/at least 2/i);
});

test("includes the staged target in the summary when provided", () => {
  const result = rankCandidatesLocal([caffeine, ibuprofen], { id: "4KIK", title: "IKK beta" });
  expect(result.summary).toContain("4KIK");
});

test("imatinib scores high against ABL1 and noticeably lower against a GPCR", () => {
  const kinase = {
    id: "2HYY",
    queryName: "ABL1",
    title: "Crystal structure of the c-Abl kinase domain in complex with imatinib",
    method: "X-RAY DIFFRACTION",
    resolution: "2.4 Å",
    score: 88,
    hasLigand: true,
    pocket: "detected",
    pocketStats: {
      status: "detected",
      available: true,
      residueCount: 14,
      hydrophobicity: 0.64,
      sizeLabel: "medium",
      hydrophobicityLabel: "hydrophobic",
    },
    ligands: [{ compId: "STI", name: "IMATINIB", formulaWeight: 493.6 }],
  };
  const gpcr = {
    id: "3SN6",
    queryName: "ADRB2",
    title: "beta-2 adrenergic receptor GPCR in complex with Gs",
    method: "X-RAY DIFFRACTION",
    resolution: "3.2 Å",
    score: 70,
    hasLigand: false,
    pocket: "unclear",
  };
  const againstKinase = rankCandidatesLocal([imatinib, caffeine], kinase);
  const againstGpcr = rankCandidatesLocal([imatinib, caffeine], gpcr);
  const kinaseImatinib = againstKinase.ranking.find((r) => r.cid === "5291");
  const gpcrImatinib = againstGpcr.ranking.find((r) => r.cid === "5291");
  expect(kinaseImatinib.score).toBeGreaterThanOrEqual(80);
  expect(gpcrImatinib.score).toBeLessThan(kinaseImatinib.score - 15);
  expect(kinaseImatinib.reasoning.join(" ")).toMatch(/target|kinase/i);
  expect(gpcrImatinib.reasoning.join(" ")).toMatch(/different primary target|no established target/i);
  expect(againstKinase.recommended.cid).toBe("5291");
  expect(againstKinase.target.pdb_id).toBe("2HYY");
  expect(againstKinase.target.name).toBe("ABL1");
});

test("notes insufficient target rule when target is unmodeled", () => {
  const apo = {
    id: "1D3Z",
    queryName: "ubiquitin",
    title: "ubiquitin NMR ensemble",
    hasLigand: false,
    pocket: "unclear",
  };
  const result = rankCandidatesLocal([ibuprofen, caffeine], apo);
  const row = result.ranking.find((r) => r.cid === "3672");
  expect(row.reasoning.join(" ")).toMatch(/insufficient target rule/i);
  expect(row.score).toBeLessThanOrEqual(30);
});

test("EGFR (1M17) demo ranks osimertinib above imatinib", () => {
  const egfr = {
    id: "1M17",
    queryName: "EGFR",
    title: "Structure of the EGFR kinase domain in complex with erlotinib",
    ligands: [{ compId: "AQ4", name: "ERLOTINIB" }],
  };
  const osimertinib = {
    cid: "71496458",
    displayName: "osimertinib",
    molecularWeight: 499.6,
    xlogp: 3.5,
    hbd: 2,
    hba: 8,
    rotatableBonds: 8,
    tpsa: 88.9,
  };
  const result = rankCandidatesLocal([imatinib, osimertinib], egfr);
  expect(result.recommended.cid).toBe("71496458");
  const ima = result.ranking.find((r) => r.cid === "5291");
  const osi = result.ranking.find((r) => r.cid === "71496458");
  expect(osi.score).toBeGreaterThan(ima.score);
  expect(ima.concerns.join(" ")).toMatch(/ABL/i);
});

test("EGFR (1M17) vs ABL (1IEP) return distinct rankings and top drugs", () => {
  const egfr = {
    id: "1M17",
    queryName: "EGFR",
    title: "Structure of the EGFR kinase domain in complex with erlotinib",
    ligands: [{ compId: "AQ4", name: "ERLOTINIB" }],
  };
  const abl = {
    id: "1IEP",
    queryName: "ABL1",
    title: "c-Abl in complex with imatinib",
    ligands: [{ compId: "STI", name: "IMATINIB" }],
  };

  const pool = [imatinib, gefitinib, erlotinib, caffeine];
  const egfrResult = rankCandidatesLocal(pool, egfr);
  const ablResult = rankCandidatesLocal(pool, abl);

  // EGFR top drug must be erlotinib or gefitinib, NOT imatinib
  expect(["176870", "123631"]).toContain(egfrResult.recommended.cid);
  const egfrImatinib = egfrResult.ranking.find((r) => r.cid === "5291");
  const egfrErlotinib = egfrResult.ranking.find((r) => r.cid === "176870");
  expect(egfrErlotinib.score).toBeGreaterThan(egfrImatinib.score);
  expect(egfrImatinib.concerns.join(" ")).toMatch(/ABL/i);

  // ABL top drug must be imatinib, NOT gefitinib or erlotinib
  expect(ablResult.recommended.cid).toBe("5291");
  const ablImatinib = ablResult.ranking.find((r) => r.cid === "5291");
  const ablGefitinib = ablResult.ranking.find((r) => r.cid === "123631");
  expect(ablImatinib.score).toBeGreaterThan(ablGefitinib.score);
  expect(ablGefitinib.concerns.join(" ")).toMatch(/EGFR/i);
});

test("HER2 (3PP0) prioritizes lapatinib over gefitinib", () => {
  const her2 = { id: "3PP0", queryName: "ERBB2", title: "HER2 kinase domain" };
  const result = rankCandidatesLocal([lapatinib, gefitinib, caffeine], her2);
  expect(result.recommended.cid).toBe("208908"); // lapatinib
  const gefitinibRow = result.ranking.find((r) => r.cid === "123631");
  expect(gefitinibRow.concerns.join(" ")).toMatch(/EGFR/i);
});

test("BRAF (4XV2) prioritizes dabrafenib over imatinib", () => {
  const braf = { id: "4XV2", queryName: "BRAF", title: "BRAF kinase domain with dabrafenib" };
  const result = rankCandidatesLocal([dabrafenib, imatinib, caffeine], braf);
  expect(result.recommended.cid).toBe("44462760"); // dabrafenib
});

test("β2-AR (3SN6) demotes opioids and ARBs with off-target concern", () => {
  const adrb2 = { id: "3SN6", queryName: "ADRB2", title: "beta-2 adrenergic receptor" };
  const result = rankCandidatesLocal([salbutamol, morphine, losartan], adrb2);
  expect(result.recommended.cid).toBe("2083"); // salbutamol
  const morphineRow = result.ranking.find((r) => r.cid === "5288826");
  const losartanRow = result.ranking.find((r) => r.cid === "3961");
  expect(morphineRow.concerns.join(" ")).toMatch(/opioid/i);
  expect(losartanRow.concerns.join(" ")).toMatch(/angiotensin/i);
  expect(result.recommended.score).toBeGreaterThan(morphineRow.score);
  expect(result.recommended.score).toBeGreaterThan(losartanRow.score);
});

test("COX-1/2 (4COX) prioritizes celecoxib", () => {
  const cox = { id: "4COX", queryName: "PTGS2", title: "COX-2 in complex with celecoxib" };
  const result = rankCandidatesLocal([celecoxib, imatinib, caffeine], cox);
  expect(result.recommended.cid).toBe("2662");
});

test("HMGCR (1HWK) prioritizes atorvastatin", () => {
  const hmgcr = { id: "1HWK", queryName: "HMGCR", title: "HMG-CoA reductase catalytic domain" };
  const result = rankCandidatesLocal([atorvastatin, metformin, caffeine], hmgcr);
  expect(result.recommended.cid).toBe("60823");
});

test("DPP4 (1X70) prioritizes sitagliptin, metformin does not win", () => {
  const dpp4 = { id: "1X70", queryName: "DPP4", title: "DPP-IV with sitagliptin" };
  const result = rankCandidatesLocal([sitagliptin, metformin, caffeine], dpp4);
  expect(result.recommended.cid).toBe("4369359");
  expect(result.ranking.find((r) => r.cid === "4091").score).toBeLessThan(35);
});

test("HIV-1 protease (1HVR) vs SARS-CoV-2 Mpro (7BQY) differentiate inhibitors", () => {
  const hiv = { id: "1HVR", queryName: "HIV-1 PR", title: "HIV-1 protease with ritonavir" };
  const mpro = { id: "7BQY", queryName: "Mpro", title: "SARS-CoV-2 main protease with nirmatrelvir" };

  const pool = [ritonavir, nirmatrelvir, caffeine];
  const hivResult = rankCandidatesLocal(pool, hiv);
  const mproResult = rankCandidatesLocal(pool, mpro);

  expect(hivResult.recommended.cid).toBe("392622"); // ritonavir
  expect(mproResult.recommended.cid).toBe("155903259"); // nirmatrelvir
});

test("PDE5 (1UDT) prioritizes sildenafil", () => {
  const pde5 = { id: "1UDT", queryName: "PDE5A", title: "PDE5 catalytic domain with sildenafil" };
  const result = rankCandidatesLocal([sildenafil, imatinib, caffeine], pde5);
  expect(result.recommended.cid).toBe("135398744");
});

test("HDAC (4LXZ) prioritizes vorinostat", () => {
  const hdac = { id: "4LXZ", queryName: "HDAC2", title: "HDAC2 with vorinostat" };
  const result = rankCandidatesLocal([vorinostat, caffeine, metformin], hdac);
  expect(result.recommended.cid).toBe("5311");
});

test("rankRepurposing unit test verifies top 5 on all 12 targets", () => {
  const candidatePool = [
    imatinib, gefitinib, erlotinib, lapatinib, dabrafenib,
    salbutamol, morphine, losartan, celecoxib, atorvastatin,
    metformin, sitagliptin, ritonavir, nirmatrelvir, sildenafil,
    vorinostat, caffeine, ibuprofen,
  ];

  const targetPdbs = [
    { id: "1M17", expectedTop: ["176870", "123631"] }, // EGFR
    { id: "3PP0", expectedTop: ["208908"] }, // HER2
    { id: "1IEP", expectedTop: ["5291"] }, // ABL
    { id: "4XV2", expectedTop: ["44462760"] }, // BRAF
    { id: "3SN6", expectedTop: ["2083"] }, // ADRB2
    { id: "4COX", expectedTop: ["2662"] }, // COX
    { id: "1HWK", expectedTop: ["60823"] }, // HMGCR
    { id: "1X70", expectedTop: ["4369359"] }, // DPP4
    { id: "1HVR", expectedTop: ["392622"] }, // HIV PR
    { id: "7BQY", expectedTop: ["155903259"] }, // SARS Mpro
    { id: "1UDT", expectedTop: ["135398744"] }, // PDE5
    { id: "4LXZ", expectedTop: ["5311"] }, // HDAC
  ];

  for (const { id, expectedTop } of targetPdbs) {
    const protein = { id, pdb_id: id };
    const res = rankRepurposing(candidatePool, protein);
    expect(res.source).toBe("heuristic-v2");
    expect(res.ranking.length).toBe(candidatePool.length);
    expect(res.top5.length).toBe(5);
    expect(expectedTop).toContain(res.recommended.cid);
  }
});

test("Lipinski checks flag the oversized molecule", () => {
  const checks = drugLikenessChecks(ugly);
  expect(checks.filter((c) => !c.pass).length).toBeGreaterThanOrEqual(5);
  const caffeineChecks = drugLikenessChecks(caffeine);
  expect(caffeineChecks.every((c) => c.pass)).toBe(true);
});

test("PAINS alerts deprioritize a molecule but keep it in the ranking", () => {
  const flagged = {
    ...caffeine,
    cid: "10680",
    displayName: "benzoquinone-like",
    pains: {
      status: "alert",
      hasAlerts: true,
      alerts: [
        {
          family: "pains",
          catalog: "PAINS_A",
          name: "Quinone",
          explanation: "Quinones are frequent false positives.",
        },
      ],
    },
  };
  const result = rankCandidatesLocal([flagged, caffeine]);
  expect(result.ranking.map((r) => r.cid).sort()).toEqual(["10680", "2519"]);
  expect(result.recommended.cid).toBe("2519");
  const flaggedRow = result.ranking.find((r) => r.cid === "10680");
  expect(flaggedRow.concerns.join(" ")).toMatch(/PAINS alert.*Quinone/i);
  expect(result.summary).toMatch(/PAINS or toxicophore/i);
});

test("toxicophore alerts are mentioned without dropping the compound", () => {
  const flagged = {
    ...ibuprofen,
    cid: "240",
    displayName: "benzaldehyde-like",
    pains: {
      status: "alert",
      hasAlerts: true,
      alerts: [{ family: "toxicophore", catalog: "toxicophore", name: "Aldehyde", explanation: "Reactive carbonyl." }],
    },
  };
  const result = rankCandidatesLocal([flagged, ibuprofen]);
  expect(result.ranking).toHaveLength(2);
  const flaggedRow = result.ranking.find((r) => r.cid === "240");
  expect(flaggedRow).toBeTruthy();
  expect(flaggedRow.concerns.join(" ")).toMatch(/Toxicophore alert.*Aldehyde/i);
});

test("penalizes an inhibitor when target requires activation (Loss-of-Function MoA mismatch)", () => {
  const inhibitorCandidate = {
    ...imatinib,
    cid: "5291",
    displayName: "imatinib",
    class: "Tyrosine kinase inhibitor",
  };
  const gofTarget = {
    id: "2HYY",
    queryName: "ABL1",
    title: "c-Abl tyrosine kinase domain",
    expectedMoA: "inhibitor",
  };
  const lofTarget = {
    id: "2HYY",
    queryName: "ABL1",
    title: "c-Abl tyrosine kinase domain",
    expectedMoA: "activator",
  };

  const gofResult = rankCandidatesLocal([inhibitorCandidate, caffeine], gofTarget);
  const lofResult = rankCandidatesLocal([inhibitorCandidate, caffeine], lofTarget);
  const gofImatinib = gofResult.ranking.find((r) => r.cid === "5291");
  const lofImatinib = lofResult.ranking.find((r) => r.cid === "5291");

  expect(lofImatinib.score).toBeLessThan(gofImatinib.score);
  expect(lofImatinib.concerns.join(" ")).toMatch(/Directionality mismatch/i);
});


