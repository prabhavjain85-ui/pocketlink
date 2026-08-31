const handler = require("../api/rank-candidates");

function mockRes() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : {};
    },
  };
}

const caffeine = {
  name: "caffeine",
  cid: "2519",
  molecularWeight: 194.19,
  xlogp: -0.1,
  hbd: 0,
  hba: 6,
  rotatableBonds: 0,
  tpsa: 58.4,
};

const ugly = {
  name: "non-drug-like oligomer",
  cid: "999999",
  molecularWeight: 920,
  xlogp: 8.4,
  hbd: 9,
  hba: 16,
  rotatableBonds: 22,
  tpsa: 210,
};

test("API rejects non-POST methods", async () => {
  const res = mockRes();
  await handler({ method: "GET" }, res);
  expect(res.statusCode).toBe(405);
});

test("API requires at least two candidates", async () => {
  const res = mockRes();
  await handler({ method: "POST", body: { candidates: [caffeine] } }, res);
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/at least 2/i);
});

test("API heuristic ranking references supplied PAINS alerts", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const flaggedCaffeine = {
    ...caffeine,
    cid: "10680",
    name: "benzoquinone-like",
    pains: {
      status: "alert",
      hasAlerts: true,
      alerts: [{ family: "pains", catalog: "PAINS_A", name: "Quinone", explanation: "Redox cycling." }],
    },
  };
  const res = mockRes();
  await handler({ method: "POST", body: { candidates: [flaggedCaffeine, caffeine] } }, res);
  if (previous == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
  expect(res.statusCode).toBe(200);
  expect(res.body.recommended.cid).toBe("2519");
  const flaggedRow = res.body.ranking.find((r) => r.cid === "10680");
  expect(flaggedRow.concerns.join(" ")).toMatch(/PAINS alert: Quinone/i);
});

test("API returns heuristic ranking when OpenAI is not configured", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const res = mockRes();
  await handler({ method: "POST", body: { candidates: [ugly, caffeine], protein: { id: "4KIK", title: "IKK beta" } } }, res);
  if (previous == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
  expect(res.statusCode).toBe(200);
  expect(res.body.source).toBe("heuristic");
  expect(res.body.recommended.cid).toBe("2519");
  expect(res.body.ranking).toHaveLength(2);
  expect(res.body.summary).toContain("4KIK");
  expect(res.body.target.pdb_id).toBe("4KIK");
  expect(res.body.candidates).toHaveLength(2);
});

test("rank prompt instructs the model to score the compound-target pair only", () => {
  const { TARGET_SPECIFIC_INSTRUCTION } = require("../src/targetContext");
  const protein = handler.compactProtein({
    id: "2HYY",
    queryName: "ABL1",
    title: "c-Abl kinase domain",
    score: 88,
    resolution: "2.4 Å",
    method: "X-RAY DIFFRACTION",
    hasLigand: true,
    ligands: [{ name: "IMATINIB", compId: "STI", formulaWeight: 493.6 }],
    pocketStats: { status: "detected", available: true, residueCount: 14, hydrophobicity: 0.64, sizeLabel: "medium", hydrophobicityLabel: "hydrophobic" },
  });
  const { system, user } = handler.buildRankPrompt([caffeine, ugly], protein, { ranking: [] });
  expect(system).toContain(TARGET_SPECIFIC_INSTRUCTION);
  expect(user).toContain(TARGET_SPECIFIC_INSTRUCTION);
  expect(system).toMatch(/same compound should score differently against different targets/i);
  expect(system).toMatch(/do not give a high score based on general drug-likeness alone/i);
  expect(user).toContain("2HYY");
  expect(user).toContain("ABL1");
});

test("normalizeResult accepts the structured candidates JSON schema", () => {
  const normalized = handler.normalizeResult(
    {
      target: { name: "ABL1", pdb_id: "2HYY" },
      candidates: [
        { compound_id: "5291", score: 87, reasoning: ["Known kinase-inhibitor-like scaffold"] },
        { compound_id: "2519", score: 41, reasoning: ["No kinase-inhibitor class match"] },
      ],
      summary: "imatinib fits ABL1",
      limitations: ["no docking"],
    },
    ["5291", "2519"],
    { name: "ABL1", pdb_id: "2HYY" }
  );
  expect(normalized.recommended.cid).toBe("5291");
  expect(normalized.candidates[0].compound_id).toBe("5291");
  expect(normalized.ranking[0].reasoning[0]).toMatch(/kinase-inhibitor/i);
  expect(normalized.target.pdb_id).toBe("2HYY");
});
