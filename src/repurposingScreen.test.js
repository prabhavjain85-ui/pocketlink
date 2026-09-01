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

test("approved-drug library is a bundled 200–500 compound set with required examples", () => {
  const n = approvedDrugCount();
  expect(n).toBeGreaterThanOrEqual(200);
  expect(n).toBeLessThanOrEqual(500);
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
  expect(Math.max(imatinib.rank, erlotinib.rank, dasatinib.rank)).toBeLessThanOrEqual(20);
  expect(paracetamol.rank).toBeGreaterThan(40);
  expect(loratadine.rank).toBeGreaterThan(40);
  expect(imatinib.reasoning.join(" ")).toMatch(/kinase-inhibitor/i);
});

test("repurposing scores are cached as pdb_id plus drug cid", () => {
  expect(rankingCacheKey("2HYY", "5291")).toBe("2HYY_5291");
  expect(rankingCacheKey("2HYY", "5291")).not.toBe(rankingCacheKey("3SN6", "5291"));
});

test("a second screen of the same target within 24h reuses the daily snapshot", async () => {
  const originalFetch = global.fetch;
  let rankCalls = 0;
  global.fetch = jest.fn((url) => {
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
});

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
