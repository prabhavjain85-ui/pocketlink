import { searchPdbTargets } from "./pdbSearch";

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
      json: async () => ({ result_set: [] }),
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
