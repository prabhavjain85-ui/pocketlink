import { NO_EXPERIMENTAL_STRUCTURE_MSG, noPdbMatchMessage, searchPdbTargets } from "../server/pdbSearch";

test("searchPdbTargets returns an empty result for a blank query", async () => {
  const { results, error } = await searchPdbTargets("   ");
  expect(results).toEqual([]);
  expect(error).toBe("");
});

test("searchPdbTargets reports no matches when RCSB returns an empty set", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result_set: [] }),
    })
  );
  try {
    const { results, error } = await searchPdbTargets("not-a-protein-zzzz");
    expect(results).toEqual([]);
    expect(error).toMatch(/no pdb entries matched/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test("noPdbMatchMessage uses the AlphaFold handoff copy when Target Discovery finds no experimental structure", () => {
  expect(noPdbMatchMessage("FAKEGENE", { noStructureHint: true })).toBe(NO_EXPERIMENTAL_STRUCTURE_MSG);
  expect(noPdbMatchMessage("FAKEGENE")).toMatch(/no pdb entries matched/i);
});

test("searchPdbTargets treats RCSB 204 No Content as no matches", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error("Unexpected json() on 204");
      },
      text: async () => "",
    })
  );
  try {
    const { results, error } = await searchPdbTargets("NOTAREALGENEXXX", { noStructureHint: true });
    expect(results).toEqual([]);
    expect(error).toBe(NO_EXPERIMENTAL_STRUCTURE_MSG);
  } finally {
    global.fetch = originalFetch;
  }
});

test("classifyPlddtTier maps pLDDT to 4-tier AlphaFold confidence badges", () => {
  const { classifyPlddtTier } = require("../server/pdbSearch");
  expect(classifyPlddtTier(92.4).tier).toBe("very_high");
  expect(classifyPlddtTier(92.4).color).toBe("#0053D6");
  expect(classifyPlddtTier(78.0).tier).toBe("confident");
  expect(classifyPlddtTier(58.0).tier).toBe("low");
  expect(classifyPlddtTier(42.0).tier).toBe("very_low");
  expect(classifyPlddtTier(42.0).disordered).toBe(true);
});

test("searchPdbTargets falls back to AlphaFold DB when RCSB has no experimental structures", async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn((url) => {
    if (String(url).includes("search.rcsb.org")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result_set: [] }),
      });
    }
    if (String(url).includes("alphafold.ebi.ac.uk/api/prediction/P00533")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [
          {
            entryId: "AF-P00533-F1",
            uniprotAccession: "P00533",
            uniprotDescription: "Epidermal growth factor receptor",
            globalMetricValue: 84.6,
            pLddtVeryHigh: 0.55,
            pLddtConfident: 0.28,
            pLddtLow: 0.1,
            pLddtVeryLow: 0.07,
            bcifUrl: "https://alphafold.ebi.ac.uk/files/AF-P00533-F1-model_v4.bcif",
          },
        ],
      });
    }
    return Promise.resolve({ ok: false, status: 404, text: async () => "" });
  });
  try {
    const { results, error, alphaFoldFallbackUsed } = await searchPdbTargets("EGFR");
    expect(error).toBe("");
    expect(alphaFoldFallbackUsed).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].isAlphaFold).toBe(true);
    expect(results[0].uniprotId).toBe("P00533");
    expect(results[0].plddtTier.tier).toBe("confident");
  } finally {
    global.fetch = originalFetch;
  }
});

