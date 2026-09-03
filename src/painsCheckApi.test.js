const painsHandler = require("../api/pains-check");

describe("pains-check node API handler", () => {
  test("clean SMILES returns clean status", async () => {
    let statusCode = null;
    let responseBody = null;
    const req = {
      method: "POST",
      body: { smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", cid: "2519" },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (str) => {
        responseBody = JSON.parse(str);
      },
    };
    await painsHandler(req, res);
    expect(responseBody.results[0].status).toBe("clean");
    expect(responseBody.results[0].hasAlerts).toBe(false);
  });

  test("benzoquinone triggers Quinone alert", async () => {
    let responseBody = null;
    const req = {
      method: "POST",
      body: { compounds: [{ cid: "10680", smiles: "O=C1C=CC(=O)C=C1" }] },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (str) => {
        responseBody = JSON.parse(str);
      },
    };
    await painsHandler(req, res);
    expect(responseBody.results[0].status).toBe("alert");
    expect(responseBody.results[0].hasAlerts).toBe(true);
    expect(responseBody.results[0].alerts[0].name).toBe("Quinone");
  });

  test("missing SMILES returns unable", async () => {
    let responseBody = null;
    const req = {
      method: "POST",
      body: { smiles: "", cid: "1" },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (str) => {
        responseBody = JSON.parse(str);
      },
    };
    await painsHandler(req, res);
    expect(responseBody.results[0].status).toBe("unable");
  });
});
