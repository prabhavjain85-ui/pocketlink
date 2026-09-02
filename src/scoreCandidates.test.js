import { drugLikenessChecks, rankCandidatesLocal, scoreLibraryLocal } from "./scoreCandidates";

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

test("returns a complete ranking schema", () => {
  const result = rankCandidatesLocal([caffeine, imatinib]);
  expect(result.recommended.cid).toBeTruthy();
  expect(result.recommended.score).toBeGreaterThanOrEqual(0);
  expect(result.recommended.score).toBeLessThanOrEqual(100);
  expect(result.recommended.reason).toMatch(/caffeine|imatinib/i);
  expect(result.ranking.map((r) => r.cid).sort()).toEqual(["2519", "5291"]);
  expect(result.limitations.length).toBeGreaterThan(0);
  expect(result.source).toBe("heuristic");
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
  const againstKinase = rankCandidatesLocal([imatinib, caffeine], kinase);
  const againstGpcr = rankCandidatesLocal([imatinib, caffeine], gpcr);
  const kinaseImatinib = againstKinase.ranking.find((r) => r.cid === "5291");
  const gpcrImatinib = againstGpcr.ranking.find((r) => r.cid === "5291");
  expect(kinaseImatinib.score).toBeGreaterThanOrEqual(75);
  expect(gpcrImatinib.score).toBeLessThan(kinaseImatinib.score - 15);
  expect(kinaseImatinib.reasoning.join(" ")).toMatch(/kinase-inhibitor/i);
  expect(gpcrImatinib.reasoning.join(" ")).toMatch(/no particular GPCR/i);
  expect(againstKinase.recommended.cid).toBe("5291");
  expect(againstKinase.target.pdb_id).toBe("2HYY");
  expect(againstKinase.target.name).toBe("ABL1");
});

test("notes limited target-fit when pocket and ligand data are missing", () => {
  const apo = {
    id: "1D3Z",
    queryName: "ubiquitin",
    title: "ubiquitin NMR ensemble",
    hasLigand: false,
    pocket: "unclear",
  };
  const result = rankCandidatesLocal([ibuprofen, caffeine], apo);
  const row = result.ranking.find((r) => r.cid === "3672");
  expect(row.reasoning.join(" ")).toMatch(/limited without pocket\/ligand data/i);
});

test("kinase apo structures still use pharmacology when ligand/pocket are missing", () => {
  const apoKinase = {
    id: "1OPL",
    queryName: "ABL1",
    title: "c-Abl tyrosine kinase domain, apo",
    hasLigand: false,
    pocket: "unclear",
  };
  const result = rankCandidatesLocal([imatinib, caffeine], apoKinase);
  expect(result.recommended.cid).toBe("5291");
  expect(result.ranking.find((r) => r.cid === "5291").reasoning.join(" ")).toMatch(/kinase-inhibitor/i);
  expect(result.ranking.find((r) => r.cid === "5291").reasoning.join(" ")).toMatch(/limited without pocket\/ligand data/i);
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
  expect(flaggedRow.concerns.join(" ")).toMatch(/PAINS alert: Quinone/i);
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
  expect(flaggedRow.concerns.join(" ")).toMatch(/Toxicophore flag: Aldehyde/i);
});
