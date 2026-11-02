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
