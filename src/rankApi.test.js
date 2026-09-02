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

test("API batch mode accepts more than five candidates", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const many = [];
  for (let i = 0; i < 12; i += 1) {
    many.push({
      ...caffeine,
      cid: String(2500 + i),
      name: i % 2 === 0 ? "imatinib analog" : "caffeine analog",
    });
  }
  const res = mockRes();
  await handler(
    {
      method: "POST",
      body: {
        mode: "batch",
        candidates: many,
        protein: { id: "2HYY", queryName: "ABL1", title: "c-Abl tyrosine kinase" },
      },
    },
    res
  );
  if (previous == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previous;
  expect(res.statusCode).toBe(200);
  expect(res.body.ranking).toHaveLength(12);
  expect(handler.compactCandidates(many, 30)).toHaveLength(12);
  expect(handler.compactCandidates(many, 5)).toHaveLength(5);
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

const kinaseRow = {
  id: "2HYY",
  queryName: "ABL1",
  title: "Crystal structure of the c-Abl tyrosine kinase domain in complex with imatinib",
  score: 88,
  resolution: "2.4 Å",
  method: "X-RAY DIFFRACTION",
  hasLigand: true,
  pocket: "detected",
  ligands: [{ name: "IMATINIB", compId: "STI", formulaWeight: 493.6 }],
  pocketStats: {
    status: "detected",
    available: true,
    residueCount: 14,
    hydrophobicity: 0.64,
    sizeLabel: "medium",
    hydrophobicityLabel: "hydrophobic",
  },
};

const gpcrRow = {
  id: "3SN6",
  queryName: "ADRB2",
  title: "beta-2 adrenergic receptor GPCR in complex with Gs",
  score: 70,
  resolution: "3.2 Å",
  method: "X-RAY DIFFRACTION",
  hasLigand: true,
  pocket: "detected",
  ligands: [{ name: "CARAZOLOL", compId: "P0G", formulaWeight: 298.4 }],
  pocketStats: {
    status: "detected",
    available: true,
    residueCount: 18,
    hydrophobicity: 0.55,
    sizeLabel: "medium",
    hydrophobicityLabel: "mixed",
  },
};

test("compactProtein keeps ligand and pocket from a PDB search row (pocket is a status string)", () => {
  const packed = handler.compactProtein(kinaseRow);
  expect(packed.pdb_id).toBe("2HYY");
  expect(packed.name).toBe("ABL1");
  expect(packed.hasLigand).toBe(true);
  expect(packed.ligand.present).toBe(true);
  expect(packed.ligand.mw).toBe(493.6);
  expect(packed.pocket.available).toBe(true);
  expect(packed.pocket.hydrophobicity).toBe(0.64);
  expect(packed.pocket.status).toBe("detected");
});

test("prompts for two different targets include distinct target context, not a shared empty pocket", () => {
  const kinasePacked = handler.compactProtein(kinaseRow);
  const gpcrPacked = handler.compactProtein(gpcrRow);
  const kinasePrompt = handler.buildRankPrompt([caffeine, ugly], kinasePacked, { ranking: [] });
  const gpcrPrompt = handler.buildRankPrompt([caffeine, ugly], gpcrPacked, { ranking: [] });

  handler.logRankPrompt(kinasePrompt.system, kinasePrompt.user, kinasePacked);
  handler.logRankPrompt(gpcrPrompt.system, gpcrPrompt.user, gpcrPacked);

  expect(kinasePrompt.user).toContain("2HYY");
  expect(kinasePrompt.user).toContain("ABL1");
  expect(kinasePrompt.user).toContain("IMATINIB");
  expect(kinasePrompt.user).toMatch(/"hydrophobicity": 0.64/);

  expect(gpcrPrompt.user).toContain("3SN6");
  expect(gpcrPrompt.user).toContain("ADRB2");
  expect(gpcrPrompt.user).toContain("CARAZOLOL");
  expect(gpcrPrompt.user).toMatch(/"hydrophobicity": 0.55/);

  expect(kinasePrompt.user).not.toBe(gpcrPrompt.user);
  expect(kinasePrompt.user).not.toContain("3SN6");
  expect(gpcrPrompt.user).not.toContain("2HYY");
});

test("batch merge keeps local target-aware scores instead of per-batch LLM numbers", () => {
  const heuristic = {
    source: "heuristic",
    ranking: [
      { cid: "5291", rank: 1, score: 96, reasoning: ["kinase inhibitor"] },
      { cid: "2118", rank: 2, score: 64, reasoning: ["no kinase class match"] },
    ],
    limitations: [],
  };
  const llm = {
    source: "llm",
    ranking: [
      { cid: "2118", rank: 1, score: 99, reasoning: ["very drug-like benzodiazepine"], strengths: ["Ro5"] },
      { cid: "5291", rank: 2, score: 40, reasoning: ["large kinase inhibitor"] },
    ],
  };
  const merged = handler.mergeBatchLlmReasoning(heuristic, llm);
  expect(merged.ranking[0].cid).toBe("5291");
  expect(merged.ranking[0].score).toBe(96);
  expect(merged.ranking.find((r) => r.cid === "2118").score).toBe(64);
  expect(merged.ranking.find((r) => r.cid === "2118").reasoning.join(" ")).toMatch(/drug-like benzodiazepine/i);
  expect(merged.source).toBe("heuristic");
});

