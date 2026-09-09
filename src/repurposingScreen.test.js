import { approvedDrugCount, drugToCandidate, findApprovedDrug, loadApprovedDrugs } from "./approvedDrugs";
import { scoreLibraryLocal } from "./scoreCandidates";
import { clearRankingCache } from "./rankingCache";
import {
  AI_BATCH_SIZE,
  EXTREME_MW_CUTOFF,
  clearDailyScreens,
  getDailyScreen,
  prefilterApprovedDrug,
  rememberDailyScreen,
  screenApprovedLibrary,
} from "./repurposingScreen";
import { rankingCacheKey } from "./targetContext";

jest.setTimeout(60000);

const kinase = {
  id: "2HYY",
  queryName: "ABL1",
  title: "Crystal structure of the c-Abl tyrosine kinase domain in complex with imatinib",
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
  hasLigand: true,
  pocket: "detected",
  pocketStats: {
    status: "detected",
    available: true,
    residueCount: 18,
    hydrophobicity: 0.55,
    sizeLabel: "medium",
    hydrophobicityLabel: "mixed",
  },
  ligands: [{ compId: "P0G", name: "CARAZOLOL", formulaWeight: 298.4 }],
};

function mockPainsOk() {
  return {
    ok: true,
    json: async () => ({ engine: "rdkit", results: [] }),
  };
}

afterEach(() => {
  clearRankingCache();
  clearDailyScreens();
});

test("approved-drug library is an expanded 1500+ compound set with required examples", () => {
  const n = approvedDrugCount();
  expect(n).toBeGreaterThanOrEqual(1500);
  expect(findApprovedDrug("imatinib")).toBeTruthy();
  expect(findApprovedDrug("erlotinib")).toBeTruthy();
  expect(findApprovedDrug("dasatinib")).toBeTruthy();
  expect(findApprovedDrug("paracetamol")).toBeTruthy();
  expect(findApprovedDrug("loratadine")).toBeTruthy();
  const classes = new Set(loadApprovedDrugs().map((d) => d.class));
  expect(classes.has("kinase inhibitor")).toBe(true);
  expect(classes.has("beta-blocker")).toBe(true);
  expect(classes.has("analgesic")).toBe(true);
  expect(classes.has("antihistamine")).toBe(true);
  expect(classes.has("statin")).toBe(true);
  for (const drug of loadApprovedDrugs()) {
    expect(drug.smiles).toBeTruthy();
    expect(drug.cid).toBeTruthy();
    expect(drug.indication).toBeTruthy();
  }
});

test("pre-filter drops extreme MW and keeps ordinary approved small molecules", () => {
  expect(prefilterApprovedDrug(findApprovedDrug("imatinib")).keep).toBe(true);
  expect(prefilterApprovedDrug(findApprovedDrug("paracetamol")).keep).toBe(true);
  const huge = {
    name: "cyclosporine-like",
    cid: "5284373",
    smiles: "CC",
    mw: EXTREME_MW_CUTOFF + 50,
    xlogp: 3,
    hbd: 5,
    hba: 12,
    rot: 8,
    tpsa: 200,
    indication: "immunosuppressant",
  };
  const gate = prefilterApprovedDrug(huge);
  expect(gate.keep).toBe(false);
  expect(gate.reason).toMatch(/900/i);
  expect(prefilterApprovedDrug({ name: "empty", cid: "1", smiles: "", mw: 200 }).keep).toBe(false);
});

test("tyrosine kinase screen ranks known kinase inhibitors above unrelated drugs", () => {
  const kept = loadApprovedDrugs().filter((d) => prefilterApprovedDrug(d).keep).map(drugToCandidate);
  const result = scoreLibraryLocal(kept, kinase);
  expect(result.ranking.length).toBeGreaterThan(100);

  const byCid = (cid) => result.ranking.find((r) => String(r.cid) === String(cid));
  const imatinib = byCid(findApprovedDrug("imatinib").cid);
  const erlotinib = byCid(findApprovedDrug("erlotinib").cid);
  const dasatinib = byCid(findApprovedDrug("dasatinib").cid);
  const paracetamol = byCid(findApprovedDrug("paracetamol").cid);
  const loratadine = byCid(findApprovedDrug("loratadine").cid);

  expect(imatinib).toBeTruthy();
  expect(erlotinib).toBeTruthy();
  expect(dasatinib).toBeTruthy();
  expect(paracetamol).toBeTruthy();
  expect(loratadine).toBeTruthy();

  expect(imatinib.rank).toBeLessThan(paracetamol.rank);
  expect(erlotinib.rank).toBeLessThan(loratadine.rank);
  expect(dasatinib.rank).toBeLessThan(paracetamol.rank);
  expect(imatinib.score).toBeGreaterThan(paracetamol.score + 10);
  expect(erlotinib.score).toBeGreaterThan(loratadine.score + 10);
  expect(dasatinib.score).toBeGreaterThan(paracetamol.score + 10);
  expect(Math.max(imatinib.rank, erlotinib.rank, dasatinib.rank)).toBeLessThanOrEqual(50);
  expect(paracetamol.rank).toBeGreaterThan(100);
  expect(loratadine.rank).toBeGreaterThan(100);
  expect(imatinib.reasoning.join(" ")).toMatch(/kinase-inhibitor/i);
});

test("HIV protease with a bound inhibitor does not rank alprazolam or albendazole first", () => {
  const protease = {
    id: "1HSG",
    queryName: "HIV-1 protease",
    title:
      "CRYSTAL STRUCTURE OF HUMAN IMMUNODEFICIENCY VIRUS (HIV) II PROTEASE COMPLEXED WITH L-735,524, AN ORALLY BIOAVAILABLE INHIBITOR OF THE HIV PROTEASES",
    method: "X-RAY DIFFRACTION",
    resolution: "1.9 Å",
    score: 95,
    hasLigand: true,
    pocket: "detected",
    pocketStats: {
      status: "detected",
      available: true,
      residueCount: 28,
      hydrophobicity: 0.54,
      sizeLabel: "large",
      hydrophobicityLabel: "mixed",
    },
    ligands: [{ compId: "MK1", name: "HIV protease inhibitor L-735,524", formulaWeight: 0.614 }],
  };
  const kept = loadApprovedDrugs().filter((d) => prefilterApprovedDrug(d).keep).map(drugToCandidate);
  const result = scoreLibraryLocal(kept, protease);
  const top = result.ranking.slice(0, 5).map((r) => findApprovedDrug(r.cid));
  expect(top[0].name.toLowerCase()).not.toBe("alprazolam");
  expect(top[0].name.toLowerCase()).not.toBe("albendazole");
  expect(top.some((d) => d.class === "protease inhibitor")).toBe(true);
  const alp = result.ranking.find((r) => String(r.cid) === String(findApprovedDrug("alprazolam").cid));
  const rito = result.ranking.find((r) => String(r.cid) === String(findApprovedDrug("ritonavir").cid));
  expect(rito.rank).toBeLessThan(alp.rank);
  expect(rito.score).toBeGreaterThan(alp.score + 10);
});

test("estrogen receptor with 4-hydroxytamoxifen ranks SERMs above alprazolam", () => {
  const er = {
    id: "3ERT",
    queryName: "estrogen receptor",
    title: "HUMAN ESTROGEN RECEPTOR ALPHA LIGAND-BINDING DOMAIN IN COMPLEX WITH 4-HYDROXYTAMOXIFEN",
    hasLigand: true,
    pocket: "detected",
    pocketStats: {
      status: "detected",
      available: true,
      residueCount: 19,
      hydrophobicity: 0.68,
      sizeLabel: "large",
      hydrophobicityLabel: "hydrophobic",
    },
    ligands: [{ compId: "OHT", name: "4-HYDROXYTAMOXIFEN", formulaWeight: 0.388 }],
  };
  const kept = loadApprovedDrugs().filter((d) => prefilterApprovedDrug(d).keep).map(drugToCandidate);
  const result = scoreLibraryLocal(kept, er);
  const top = findApprovedDrug(result.ranking[0].cid);
  expect(["SERM", "aromatase inhibitor"]).toContain(top.class);
  const alp = result.ranking.find((r) => String(r.cid) === String(findApprovedDrug("alprazolam").cid));
  const tam = result.ranking.find((r) => String(r.cid) === String(findApprovedDrug("tamoxifen").cid));
  expect(tam.rank).toBeLessThan(alp.rank);
  expect(tam.score).toBeGreaterThan(alp.score + 10);
});

test("COX-2 skips glycan/heme and ranks NSAIDs first", () => {
  const cox = {
    id: "1CX2",
    queryName: "COX-2",
    title: "CYCLOOXYGENASE-2 (PROSTAGLANDIN SYNTHASE-2) COMPLEXED WITH A SELECTIVE INHIBITOR, SC-558",
    hasLigand: true,
    pocket: "detected",
    pocketStats: {
      status: "detected",
      available: true,
      residueCount: 40,
      hydrophobicity: 0.38,
      sizeLabel: "large",
      hydrophobicityLabel: "mixed",
    },
    ligands: [
      { compId: "NAG", name: "2-acetamido-2-deoxy-beta-D-glucopyranose", formulaWeight: 0.221 },
      { compId: "HEM", name: "PROTOPORPHYRIN IX CONTAINING FE", formulaWeight: 0.616 },
      { compId: "S58", name: "1-PHENYLSULFONAMIDE-3-TRIFLUOROMETHYL-5-PARABROMOPHENYLPYRAZOLE", formulaWeight: 0.446 },
    ],
  };
  const kept = loadApprovedDrugs().filter((d) => prefilterApprovedDrug(d).keep).map(drugToCandidate);
  const result = scoreLibraryLocal(kept, cox);
  const topClass = findApprovedDrug(result.ranking[0].cid).class;
  expect(topClass).toBe("NSAID");
  expect(result.ranking[0].cid).not.toBe(String(findApprovedDrug("alprazolam").cid));
});

test("kinase vs GPCR screens produce different top 5 and never rank alprazolam first", () => {
  const kept = loadApprovedDrugs().filter((d) => prefilterApprovedDrug(d).keep).map(drugToCandidate);
  const kinaseResult = scoreLibraryLocal(kept, kinase);
  const gpcrResult = scoreLibraryLocal(kept, gpcr);

  const kinaseTop = kinaseResult.ranking.slice(0, 5).map((r) => {
    const drug = findApprovedDrug(r.cid);
    return { name: drug.name, class: drug.class, score: r.score };
  });
  const gpcrTop = gpcrResult.ranking.slice(0, 5).map((r) => {
    const drug = findApprovedDrug(r.cid);
    return { name: drug.name, class: drug.class, score: r.score };
  });

  expect(kinaseTop[0].name.toLowerCase()).not.toBe("alprazolam");
  expect(gpcrTop[0].name.toLowerCase()).not.toBe("alprazolam");
  expect(kinaseTop.map((r) => r.name).join(",")).not.toBe(gpcrTop.map((r) => r.name).join(","));
  expect(kinaseTop.some((r) => r.class === "kinase inhibitor")).toBe(true);
  expect(gpcrTop.every((r) => r.class !== "kinase inhibitor")).toBe(true);
  expect(gpcrTop.some((r) => /beta-blocker|antimuscarinic|opioid|antipsychotic|alpha-2|5-HT3|alpha-1/i.test(r.class))).toBe(true);

  const alpKinase = kinaseResult.ranking.find((r) => String(r.cid) === String(findApprovedDrug("alprazolam").cid));
  const alpGpcr = gpcrResult.ranking.find((r) => String(r.cid) === String(findApprovedDrug("alprazolam").cid));
  expect(alpKinase.rank).toBeGreaterThan(20);
  expect(alpGpcr.rank).toBeGreaterThan(10);
});

test("repurposing scores are cached as pdb_id plus drug cid", () => {
  expect(rankingCacheKey("2HYY", "5291")).toBe("2HYY_5291");
  expect(rankingCacheKey("2HYY", "5291")).not.toBe(rankingCacheKey("3SN6", "5291"));
});

test("unrecognized apo structures fail visibly instead of ranking alprazolam first", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  const apo = {
    id: "1D3Z",
    queryName: "ubiquitin",
    title: "ubiquitin NMR ensemble",
    hasLigand: false,
    pocket: "unclear",
  };
  try {
    await expect(screenApprovedLibrary(apo)).rejects.toThrow(
      /Unable to score against this target — insufficient structural data/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("a second screen of the same target within 24h reuses the daily snapshot", async () => {
  const originalFetch = global.fetch;
  let rankCalls = 0;
  global.fetch = jest.fn((url, opts) => {
    if (String(url).includes("pains-check")) {
      const body = JSON.parse(opts?.body || "{}");
      return Promise.resolve({
        ok: true,
        json: async () => ({
          engine: "rdkit",
          results: (body.compounds || []).map((c) => ({
            cid: c.cid,
            smiles: c.smiles,
            status: "clean",
            hasAlerts: false,
            checked: true,
            alerts: [],
          })),
        }),
      });
    }
    if (String(url).includes("rank-candidates")) {
      rankCalls += 1;
      return Promise.reject(new Error("network down"));
    }
    return Promise.resolve(mockPainsOk());
  });

  try {
    const first = await screenApprovedLibrary(kinase);
    expect(first.ranking.length).toBeGreaterThan(50);
    expect(first.fromDailyCache).toBe(false);
    const callsAfterFirst = rankCalls;

    const daily = getDailyScreen("2HYY");
    expect(daily).toBeTruthy();
    expect(daily.ranking.length).toBe(first.ranking.length);

    const second = await screenApprovedLibrary(kinase);
    expect(second.fromDailyCache).toBe(true);
    expect(second.ranking[0].cid).toBe(first.ranking[0].cid);
    expect(rankCalls).toBe(callsAfterFirst);
  } finally {
    global.fetch = originalFetch;
  }
}, 35000);

test("AI batch size stays inside the serverless-safe window", () => {
  expect(AI_BATCH_SIZE).toBeGreaterThanOrEqual(20);
  expect(AI_BATCH_SIZE).toBeLessThanOrEqual(30);
});

test("rememberDailyScreen round-trips a compact ranking", () => {
  rememberDailyScreen("2HYY", {
    ranking: [{ cid: "5291", name: "Imatinib", score: 88, reasoning: ["kinase"], indication: "CML", smiles: "C" }],
    excluded: [],
    source: "heuristic",
  });
  const hit = getDailyScreen("2HYY");
  expect(hit.ranking[0].cid).toBe("5291");
  expect(getDailyScreen("3SN6")).toBeNull();
});

const unmodeledTarget = {
  id: "6XYZ",
  queryName: "NOVELGENE",
  gene: "NOVELGENE",
  symbol: "NOVELGENE",
  title: "Crystal structure of novel protein with small-molecule inhibitor",
  method: "X-RAY DIFFRACTION",
  resolution: "2.0 Å",
  score: 82,
  hasLigand: true,
  pocket: "detected",
  pocketStats: {
    status: "detected",
    available: true,
    residueCount: 42,
    hydrophobicity: 0.52,
    sizeLabel: "medium",
    hydrophobicityLabel: "mixed",
  },
  ligands: [{ compId: "LIG", name: "UnknownInhibitor", formulaWeight: 360 }],
};

test("shortlistOnly returns named ranking rows for modeled kinase targets", async () => {
  const result = await screenApprovedLibrary(kinase, { shortlistOnly: true });
  expect(result.ranking.length).toBeGreaterThan(0);
  expect(result.recommended?.name).toBeTruthy();
  expect(result.recommended?.indication).toBeTruthy();
  for (const row of result.top5) {
    expect(row.name).toBeTruthy();
    expect(row.name).not.toMatch(/^CHEMBL/i);
    expect(row.indication).toBeTruthy();
  }
  expect(result.unmodeledFiller).toBeFalsy();
});

test("shortlistOnly returns named exploratory ranking for unmodeled targets with caveat flag", async () => {
  const result = await screenApprovedLibrary(unmodeledTarget, {
    shortlistOnly: true,
    activeTarget: { symbol: "NOVELGENE", name: "Novel Gene" },
  });
  expect(result.unmodeledFiller).toBe(true);
  expect(result.ranking.length).toBeGreaterThan(0);
  expect(result.top5.length).toBeGreaterThan(0);
  expect(result.recommended?.name).toBeTruthy();
  expect(result.summary).toMatch(/exploratory drug-likeness/i);
  expect(result.summary).toMatch(/no curated pharmacology rule/i);
  for (const row of result.top5) {
    expect(row.name).toBeTruthy();
    expect(row.name).not.toMatch(/^CHEMBL/i);
    expect(row.indication).toBeTruthy();
  }
});
