const { checkSmiles, checkCompounds, engineInfo } = require("./painsEngine");

const CAFFEINE = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const BENZOQUINONE = "O=C1C=CC(=O)C=C1";
const RHODANINE = "O=C1CSC(=S)N1";
const BENZALDEHYDE = "O=Cc1ccccc1";
const EPOXIDE = "C1CO1";
const CHLOROETHANE = "CCCl";
const ACROLEIN = "C=CC=O";

jest.setTimeout(30000);

test("RDKit-JS WASM is a few megabytes, not a 200MB Python wheel", async () => {
  const info = await engineInfo();
  expect(info.engine).toBe("rdkit-js");
  expect(info.rdkitVersion).toBeTruthy();
  expect(info.painsPatterns).toBeGreaterThanOrEqual(400);
  expect(info.toxicophorePatterns).toBe(4);
  expect(info.wasmBytes).toBeGreaterThan(1_000_000);
  expect(info.wasmBytes).toBeLessThan(20_000_000);
});

test("caffeine is clean", async () => {
  const result = await checkSmiles(CAFFEINE, "2519");
  expect(result.status).toBe("clean");
  expect(result.hasAlerts).toBe(false);
  expect(result.checked).toBe(true);
  expect(result.alerts).toEqual([]);
  expect(result.cid).toBe("2519");
});

test("benzoquinone flags PAINS quinone with a plain-language name", async () => {
  const result = await checkSmiles(BENZOQUINONE, "10680");
  expect(result.status).toBe("alert");
  expect(result.hasAlerts).toBe(true);
  const names = result.alerts.map((a) => a.name);
  expect(names).toContain("Quinone");
  const quinone = result.alerts.find((a) => a.name === "Quinone");
  expect(quinone.family).toBe("pains");
  expect(quinone.catalog).toMatch(/PAINS/);
  expect(quinone.explanation.toLowerCase()).toMatch(/false positive/);
});

test("rhodanine uses a plain-language name", async () => {
  const result = await checkSmiles(RHODANINE);
  expect(result.status).toBe("alert");
  expect(result.alerts.map((a) => a.name)).toContain("Rhodanine");
  const rhod = result.alerts.find((a) => a.name === "Rhodanine");
  expect(rhod.explanation).toMatch(/Rhodanine/);
});

test("toxicophores not covered by PAINS still fire", async () => {
  const aldehyde = await checkSmiles(BENZALDEHYDE);
  expect(aldehyde.hasAlerts).toBe(true);
  expect(aldehyde.alerts.map((a) => a.name)).toContain("Aldehyde");

  const epoxide = await checkSmiles(EPOXIDE);
  expect(epoxide.alerts.map((a) => a.name)).toContain("Epoxide");

  const halide = await checkSmiles(CHLOROETHANE);
  expect(halide.alerts.map((a) => a.name)).toContain("Alkyl halide");

  const acrolein = await checkSmiles(ACROLEIN);
  const names = acrolein.alerts.map((a) => a.name);
  expect(names).toContain("Michael acceptor");
  expect(names).toContain("Aldehyde");
});

test("missing and invalid SMILES are unable, not clean", async () => {
  const missing = await checkSmiles("", "1");
  expect(missing.status).toBe("unable");
  expect(missing.checked).toBe(false);
  expect(missing.reason).toMatch(/Missing SMILES/);

  const invalid = await checkSmiles("not-a-smiles", "2");
  expect(invalid.status).toBe("unable");
  expect(invalid.reason).toMatch(/Invalid SMILES/);
  expect(invalid.hasAlerts).toBe(false);
});

test("batch caps at five and preserves order", async () => {
  const results = await checkCompounds([
    { cid: "2519", smiles: CAFFEINE },
    { cid: "10680", smiles: BENZOQUINONE },
    { cid: "x", smiles: "" },
    { cid: "y", smiles: "%%%" },
    { cid: "100", smiles: EPOXIDE },
    { cid: "extra", smiles: CHLOROETHANE },
  ]);
  expect(results).toHaveLength(5);
  expect(results.map((r) => r.cid)).toEqual(["2519", "10680", "x", "y", "100"]);
  expect(results[0].status).toBe("clean");
  expect(results[1].status).toBe("alert");
  expect(results[2].status).toBe("unable");
  expect(results[3].status).toBe("unable");
  expect(results[4].status).toBe("alert");
});
