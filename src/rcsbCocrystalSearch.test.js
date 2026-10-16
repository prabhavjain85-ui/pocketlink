import {
  discoverChemCompCandidates,
  looksLikeChemCompId,
  looksLikePdbId,
  resolveCocrystalSearchQuery,
} from "./rcsbCocrystalSearch";

describe("rcsbCocrystalSearch helpers", () => {
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
