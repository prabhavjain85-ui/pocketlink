import {
  rankCandidates,
  rankCandidatesBatch,
  rankingCacheKey,
  rememberRanking,
  getCachedScore,
  tryCachedRanking,
  clearRankingCache,
  overlayLocalScores,
} from "./aiCandidateRanking";
import { TARGET_SPECIFIC_INSTRUCTION, buildTargetContext, rankingCacheKey as contextKey } from "./targetContext";

const caffeine = {
  CID: 2519,
  displayName: "caffeine",
  MolecularWeight: 194.19,
  XLogP: -0.1,
  HBondDonorCount: 0,
  HBondAcceptorCount: 6,
  RotatableBondCount: 0,
  TPSA: 58.4,
};

const ugly = {
  CID: 999999,
  displayName: "non-drug-like oligomer",
  MolecularWeight: 920,
  XLogP: 8.4,
  HBondDonorCount: 9,
  HBondAcceptorCount: 16,
  RotatableBondCount: 22,
  TPSA: 210,
};

const imatinib = {
  CID: 5291,
  displayName: "imatinib",
  MolecularWeight: 493.6,
  XLogP: 3.5,
  HBondDonorCount: 2,
  HBondAcceptorCount: 7,
  RotatableBondCount: 7,
  TPSA: 86.3,
};

afterEach(() => {
  clearRankingCache();
});

test("falls back to the local model when the API is unreachable", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  try {
    const result = await rankCandidates([caffeine, ugly]);
    expect(result.recommended.cid).toBe("2519");
    expect(result.source).toBe("heuristic-v2");
    expect(result.ranking).toHaveLength(2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("local fallback includes supplied PAINS alerts in the heuristic ranking", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  try {
    const result = await rankCandidates([caffeine, ugly], null, {
      "999999": {
        status: "alert",
        hasAlerts: true,
        alerts: [{ family: "pains", catalog: "PAINS_A", name: "Quinone", explanation: "Redox cycling." }],
      },
    });
    expect(result.source).toBe("heuristic-v2");
    const uglyRow = result.ranking.find((r) => r.cid === "999999");
    expect(uglyRow.concerns.join(" ")).toMatch(/PAINS alert.*Quinone/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("uses a successful API payload when it is well-formed", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        target: { name: "IKKβ", pdb_id: "4KIK" },
        candidates: [
          { compound_id: "999999", score: 91, reasoning: ["llm pick"] },
          { compound_id: "2519", score: 70, reasoning: ["x"] },
        ],
        recommended: { cid: "999999", score: 91, reason: "llm pick" },
        ranking: [
          { cid: "999999", rank: 1, score: 91, strengths: ["x"], concerns: ["y"], reasoning: ["llm pick"] },
          { cid: "2519", rank: 2, score: 70, strengths: ["a"], concerns: ["b"], reasoning: ["x"] },
        ],
        summary: "llm summary",
        limitations: ["none"],
        source: "llm",
      }),
    })
  );
  try {
    const result = await rankCandidates([caffeine, ugly]);
    expect(result.recommended.cid).toBe("999999");
    expect(result.source).toBe("llm");
  } finally {
    global.fetch = originalFetch;
  }
});

test("cache keys are pdb_id plus compound cid, never cid alone", () => {
  expect(rankingCacheKey("2HYY", "5291")).toBe("2HYY_5291");
  expect(rankingCacheKey("2hyy", "5291")).toBe("2HYY_5291");
  expect(rankingCacheKey("3SN6", "5291")).toBe("3SN6_5291");
  expect(rankingCacheKey("2HYY", "5291")).not.toBe("5291");
  expect(rankingCacheKey("2HYY", "5291")).not.toBe(rankingCacheKey("3SN6", "5291"));
  expect(contextKey("2HYY", "5291")).toBe("2HYY_5291");
});

test("a score cached for one target is never reused for a different target", async () => {
  const kinase = { id: "2HYY", queryName: "ABL1", title: "c-Abl kinase domain" };
  const gpcr = { id: "3SN6", queryName: "ADRB2", title: "beta-2 adrenergic receptor GPCR" };
  rememberRanking(kinase, {
    candidates: [
      { compound_id: "5291", score: 91, reasoning: ["kinase inhibitor"] },
      { compound_id: "2519", score: 40, reasoning: ["weak kinase fit"] },
    ],
  });

  expect(getCachedScore("2HYY", "5291").score).toBe(91);
  expect(getCachedScore("3SN6", "5291")).toBeNull();

  const reused = tryCachedRanking([imatinib, caffeine], kinase);
  expect(reused).toBeTruthy();
  expect(reused.recommended.cid).toBe("5291");
  expect(reused.source).toBe("cache");

  expect(tryCachedRanking([imatinib, caffeine], gpcr)).toBeNull();

  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  try {
    const gpcrResult = await rankCandidates([imatinib, caffeine], gpcr);
    const imatinibRow = gpcrResult.ranking.find((r) => r.cid === "5291");
    expect(imatinibRow.score).not.toBe(91);
    expect(imatinibRow.reasoning.join(" ")).toMatch(/GPCR/i);
    expect(getCachedScore("2HYY", "5291").score).toBe(91);
    expect(getCachedScore("3SN6", "5291").score).toBe(imatinibRow.score);
  } finally {
    global.fetch = originalFetch;
  }
});

test("payload sent to the API includes packed target context, not a full RCSB refetch", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  const protein = {
    id: "2HYY",
    queryName: "ABL1",
    title: "c-Abl kinase domain",
    score: 90,
    resolution: "2.4 Å",
    methodLabel: "X-ray",
    hasLigand: true,
    pocket: "detected",
    pocketStats: { status: "detected", available: true, residueCount: 12, hydrophobicity: 0.7, sizeLabel: "medium", hydrophobicityLabel: "hydrophobic" },
    ligands: [{ compId: "STI", name: "IMATINIB", formulaWeight: 493.6 }],
  };
  try {
    await rankCandidates([imatinib, caffeine], protein);
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.protein.pdb_id).toBe("2HYY");
    expect(body.protein.name).toBe("ABL1");
    expect(body.protein.ligand.present).toBe(true);
    expect(body.protein.ligand.mw).toBe(493.6);
    expect(body.protein.pocket.available).toBe(true);
    expect(body.protein).not.toHaveProperty("instances");
  } finally {
    global.fetch = originalFetch;
  }
});

test("buildTargetContext records data gaps when ligand and pocket are missing", () => {
  const ctx = buildTargetContext({
    id: "1D3Z",
    queryName: "ubiquitin",
    title: "ubiquitin NMR",
    hasLigand: false,
    pocket: "unclear",
  });
  expect(ctx.dataGaps.join(" ")).toMatch(/No co-crystallized ligand/i);
  expect(ctx.dataGaps.join(" ")).toMatch(/Pocket geometry/i);
  expect(TARGET_SPECIFIC_INSTRUCTION).toMatch(/specific target only/i);
});

test("overlayLocalScores ignores a stale LLM ranking that always crowns alprazolam", () => {
  const local = {
    source: "heuristic-v2",
    ranking: [
      { cid: "5291", rank: 1, score: 96, reasoning: ["kinase inhibitor"], strengths: ["class match"], concerns: [] },
      { cid: "2118", rank: 2, score: 64, reasoning: ["no kinase class match"], strengths: [], concerns: [] },
    ],
    recommended: { cid: "5291", score: 96, reason: "imatinib fits ABL1" },
  };
  const llm = {
    source: "llm",
    ranking: [
      { cid: "2118", rank: 1, score: 99, reasoning: ["alprazolam is highly drug-like"] },
      { cid: "5291", rank: 2, score: 12, reasoning: ["too big"] },
    ],
    recommended: { cid: "2118", score: 99, reason: "alprazolam" },
  };
  const merged = overlayLocalScores(llm, local);
  expect(merged.ranking[0].cid).toBe("5291");
  expect(merged.ranking[0].score).toBe(96);
  expect(merged.recommended.cid).toBe("5291");
  expect(merged.source).toBe("heuristic-v2");
  expect(merged.ranking.find((r) => r.cid === "2118").score).toBe(64);
});

test("rankCandidatesBatch does not let an LLM alprazolam-top response beat local kinase scores", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        source: "llm",
        ranking: [
          { cid: "2118", rank: 1, score: 100, reasoning: ["always alprazolam"] },
          { cid: "5291", rank: 2, score: 10, reasoning: ["ignored"] },
        ],
        recommended: { cid: "2118", score: 100, reason: "alprazolam" },
      }),
    })
  );
  const kinase = { id: "2HYY", queryName: "ABL1", title: "c-Abl tyrosine kinase domain" };
  const alprazolam = {
    CID: 2118,
    cid: "2118",
    displayName: "Alprazolam",
    name: "Alprazolam",
    MolecularWeight: 308.8,
    XLogP: 2.1,
    HBondDonorCount: 0,
    HBondAcceptorCount: 4,
    RotatableBondCount: 1,
    TPSA: 43.1,
    drugClass: "benzodiazepine",
  };
  try {
    const result = await rankCandidatesBatch([imatinib, alprazolam], kinase);
    expect(result.ranking[0].cid).toBe("5291");
    expect(result.ranking[0].score).toBeGreaterThan(result.ranking.find((r) => r.cid === "2118").score);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.protein.pdb_id).toBe("2HYY");
    expect(body.mode).toBe("batch");
  } finally {
    global.fetch = originalFetch;
  }
});
