const {
  parsePdbId,
  parseSmiles,
  handleSubmit,
  handleStatus,
  handleHealth,
  forward,
  serviceBaseUrl,
} = require("./lib/dockingProxy");

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

beforeEach(() => {
  delete process.env.DOCKING_SERVICE_URL;
  delete process.env.DOCKING_SERVICE_API_KEY;
  global.fetch = jest.fn();
});

test("parsePdbId accepts valid codes", () => {
  expect(parsePdbId("1iep")).toBe("1IEP");
  expect(parsePdbId("bad")).toBeNull();
});

test("parseSmiles enforces non-empty", () => {
  expect(parseSmiles("CCO")).toBe("CCO");
  expect(parseSmiles("   ")).toBeNull();
});

test("submit returns 503 without service URL", async () => {
  const res = mockRes();
  await handleSubmit({ method: "POST", body: { pdbId: "1IEP", smiles: "CCO" } }, res);
  expect(res.statusCode).toBe(503);
  expect(res.body.prototype).toBe(true);
  expect(res.body.validationStatus).toBe("unvalidated");
  expect(res.body.serviceUnavailable).toBe(true);
});

test("forward attaches API key header", async () => {
  process.env.DOCKING_SERVICE_URL = "https://docking.example";
  process.env.DOCKING_SERVICE_API_KEY = "secret";
  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true }),
  });
  await forward("GET", "/health");
  expect(global.fetch).toHaveBeenCalledWith(
    "https://docking.example/health",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "secret" }),
    })
  );
  expect(serviceBaseUrl()).toBe("https://docking.example");
});

test("health reports unconfigured service", async () => {
  const res = mockRes();
  await handleHealth({}, res);
  expect(res.statusCode).toBe(200);
  expect(res.body.serviceUnavailable).toBe(true);
  expect(res.body.prototype).toBe(true);
  expect(res.body.validationStatus).toBe("unvalidated");
});

test("status proxies job id", async () => {
  process.env.DOCKING_SERVICE_URL = "https://docking.example";
  global.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: "running" }),
  });
  const res = mockRes();
  await handleStatus({}, res, "job-123");
  expect(res.statusCode).toBe(200);
  expect(res.body.status).toBe("running");
  expect(global.fetch.mock.calls[0][0]).toContain("/v1/jobs/job-123");
});
