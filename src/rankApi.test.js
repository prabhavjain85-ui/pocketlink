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
});
