import { rankCandidates } from "./aiCandidateRanking";

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

test("falls back to the local model when the API is unreachable", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  try {
    const result = await rankCandidates([caffeine, ugly]);
    expect(result.recommended.cid).toBe("2519");
    expect(result.source).toBe("heuristic");
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
    expect(result.source).toBe("heuristic");
    const uglyRow = result.ranking.find((r) => r.cid === "999999");
    expect(uglyRow.concerns.join(" ")).toMatch(/PAINS alert: Quinone/i);
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
        recommended: { cid: "999999", score: 91, reason: "llm pick" },
        ranking: [
          { cid: "999999", rank: 1, score: 91, strengths: ["x"], concerns: ["y"] },
          { cid: "2519", rank: 2, score: 70, strengths: ["a"], concerns: ["b"] },
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
