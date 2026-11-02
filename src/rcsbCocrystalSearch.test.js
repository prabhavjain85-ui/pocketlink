import {
  discoverChemCompCandidates,
  enrichEntrySummaries,
  looksLikeChemCompId,
  looksLikePdbId,
  normalizeResolutionCombined,
  resolveCocrystalSearchQuery,
} from "../server/rcsbCocrystalSearch";

describe("rcsbCocrystalSearch helpers", () => {
  test("normalizeResolutionCombined accepts scalar or array from GraphQL", () => {
    expect(normalizeResolutionCombined(1.57)).toBe(1.57);
    expect(normalizeResolutionCombined([2.1])).toBe(2.1);
    expect(normalizeResolutionCombined([])).toBeNull();
    expect(normalizeResolutionCombined(null)).toBeNull();
  });

  test("detects PDB IDs and CCD codes", () => {
    expect(looksLikePdbId("1iep")).toBe(true);
    expect(looksLikePdbId("STI")).toBe(false);
    expect(looksLikeChemCompId("STI")).toBe(true);
    expect(looksLikeChemCompId("715")).toBe(true);
  });

  test("curated alias resolves imatinib to STI", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes("chemcomp/STI")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ chem_comp: { id: "STI", name: "Imatinib" } }),
        });
      }
      if (u.includes("rcsbsearch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ result_set: [], total_count: 0 }),
        });
      }
      if (u.includes("pubchem")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    try {
      const { candidates } = await discoverChemCompCandidates("imatinib");
      expect(candidates.some((c) => c.compId === "STI")).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("enrichEntrySummaries falls back when GraphQL returns 403", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url) => {
      if (String(url).includes("graphql")) {
        return Promise.resolve({ ok: false, status: 403 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    try {
      const rows = await enrichEntrySummaries(["1iep", "2abc"]);
      expect(rows).toHaveLength(2);
      expect(rows[0].pdbId).toBe("1IEP");
      expect(rows[0].title).toBe("1IEP");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("resolve reports failure for unknown drug when APIs return empty", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn((url) => {
      if (String(url).includes("pubchem")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      if (String(url).includes("rcsbsearch")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ result_set: [], total_count: 0 }),
        });
      }
      if (String(url).includes("chemcomp")) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    try {
      const result = await resolveCocrystalSearchQuery("fictitiousinib-zz-no-pdb");
      expect(result.mode).toBe("failed");
      expect(result.entries).toEqual([]);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
