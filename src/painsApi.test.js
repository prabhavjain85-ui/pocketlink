const handler = require("../api/pains-check");

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

jest.setTimeout(30000);

test("API rejects non-POST/GET methods", async () => {
  const res = mockRes();
  await handler({ method: "PUT" }, res);
  expect(res.statusCode).toBe(405);
});

test("API checks a batch of SMILES with RDKit-JS", async () => {
  const res = mockRes();
  await handler(
    {
      method: "POST",
      body: {
        compounds: [
          { cid: "2519", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
          { cid: "10680", smiles: "O=C1C=CC(=O)C=C1" },
        ],
      },
    },
    res
  );
  expect(res.statusCode).toBe(200);
  expect(res.body.engine).toBe("rdkit-js");
  expect(res.body.wasmBytes).toBeLessThan(20_000_000);
  expect(res.body.results).toHaveLength(2);
  expect(res.body.results[0].status).toBe("clean");
  expect(res.body.results[1].alerts.map((a) => a.name)).toContain("Quinone");
});
