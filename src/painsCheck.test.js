import { checkPainsBatch, clearPainsCache, compactPainsForRanking, getCachedPains } from "./painsCheck";

const caffeine = {
  CID: 2519,
  IsomericSMILES: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
};

const quinone = {
  CID: 10680,
  CanonicalSMILES: "O=C1C=CC(=O)C=C1",
};

const missing = {
  CID: 1,
};

afterEach(() => {
  clearPainsCache();
});

test("missing SMILES is marked unable without calling the API", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn();
  try {
    const byCid = await checkPainsBatch([missing]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(byCid["1"].status).toBe("unable");
    expect(byCid["1"].reason).toMatch(/missing/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("caches successful API results by CID so a second call does not refetch", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({
        engine: "rdkit",
        results: [
          {
            cid: "2519",
            smiles: caffeine.IsomericSMILES,
            status: "clean",
            hasAlerts: false,
            checked: true,
            alerts: [],
          },
        ],
      }),
    })
  );
  try {
    const first = await checkPainsBatch([caffeine]);
    expect(first["2519"].status).toBe("clean");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const second = await checkPainsBatch([caffeine]);
    expect(second["2519"].status).toBe("clean");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(getCachedPains(caffeine).status).toBe("clean");
  } finally {
    global.fetch = originalFetch;
  }
});

test("API failure is unable-to-check, not a silent clean pass", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  try {
    const byCid = await checkPainsBatch([quinone]);
    expect(byCid["10680"].status).toBe("unable");
    expect(byCid["10680"].hasAlerts).toBe(false);
    expect(byCid["10680"].reason).toMatch(/unavailable/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("compacts alert payloads for the ranking prompt", () => {
  const compact = compactPainsForRanking({
    status: "alert",
    hasAlerts: true,
    alerts: [
      {
        family: "pains",
        catalog: "PAINS_A",
        name: "Quinone",
        explanation: "Quinones are frequent false positives.",
        pattern: "quinone_A(370)",
      },
    ],
  });
  expect(compact.status).toBe("alert");
  expect(compact.alerts[0].name).toBe("Quinone");
  expect(compact.alerts[0].family).toBe("pains");
});
