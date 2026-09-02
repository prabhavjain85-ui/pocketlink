import { noDiseaseMatchMessage, pickDiseaseHit, runTargetDiscovery, searchDiseases } from "./openTargets";
import { clearTargetDiscoveryCache, getCachedTargets, rememberTargets } from "./targetDiscoveryCache";

const originalFetch = global.fetch;

afterEach(() => {
  clearTargetDiscoveryCache();
  global.fetch = originalFetch;
});

test("pickDiseaseHit prefers an exact name match over the first hit", () => {
  const hits = [
    { id: "MONDO_0001", name: "exocrine pancreatic carcinoma" },
    { id: "MONDO_0002", name: "pancreatic cancer" },
  ];
  expect(pickDiseaseHit(hits, "pancreatic cancer").id).toBe("MONDO_0002");
  expect(pickDiseaseHit(hits, "something else").id).toBe("MONDO_0001");
});

test("no-match copy is visible and names the query", () => {
  expect(noDiseaseMatchMessage("zzzz-not-a-disease")).toMatch(/zzzz-not-a-disease/);
  expect(noDiseaseMatchMessage("zzzz-not-a-disease")).toMatch(/no disease matching/i);
});

test("searchDiseases returns an empty list for a blank query without calling the API", async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  await expect(searchDiseases("   ")).resolves.toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("runTargetDiscovery reports a no-match error when Open Targets search is empty", async () => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: async () => ({ data: { search: { hits: [] } } }),
    })
  );
  const result = await runTargetDiscovery("zzzz-not-a-disease");
  expect(result.disease).toBe(null);
  expect(result.novelty).toEqual([]);
  expect(result.error).toMatch(/no disease matching/i);
});

test("runTargetDiscovery surfaces Open Targets downtime instead of failing silently", async () => {
  global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
  await expect(runTargetDiscovery("pancreatic cancer")).rejects.toThrow(/couldn't reach the open targets platform/i);
});

test("runTargetDiscovery scores associated targets and caches by disease ID", async () => {
  global.fetch = jest.fn((url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query.includes("DiseaseSearch")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            search: {
              hits: [{ id: "MONDO_0005192", name: "exocrine pancreatic carcinoma", entity: "disease" }],
            },
          },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        data: {
          disease: {
            id: "MONDO_0005192",
            name: "exocrine pancreatic carcinoma",
            associatedTargets: {
              count: 2,
              rows: [
                {
                  score: 0.81,
                  datatypeScores: [
                    { id: "genetic_association", score: 0.86 },
                    { id: "somatic_mutation", score: 0.89 },
                  ],
                  datasourceScores: [{ id: "eva", score: 0.86 }],
                  target: {
                    id: "ENSG1",
                    approvedSymbol: "KRAS",
                    approvedName: "KRAS",
                    biotype: "protein_coding",
                    drugAndClinicalCandidates: { count: 3 },
                  },
                },
                {
                  score: 0.79,
                  datatypeScores: [{ id: "genetic_association", score: 0.94 }],
                  datasourceScores: [{ id: "eva", score: 0.94 }],
                  target: {
                    id: "ENSG2",
                    approvedSymbol: "PALB2",
                    approvedName: "PALB2",
                    biotype: "protein_coding",
                    drugAndClinicalCandidates: { count: 0 },
                  },
                },
              ],
            },
          },
        },
      }),
    });
  });

  const first = await runTargetDiscovery("pancreatic cancer");
  expect(first.fromCache).toBe(false);
  expect(first.disease.id).toBe("MONDO_0005192");
  expect(first.novelty[0].symbol).toBe("PALB2");
  expect(getCachedTargets("MONDO_0005192")).toBeTruthy();

  const second = await runTargetDiscovery("pancreatic cancer");
  expect(second.fromCache).toBe(true);
  expect(second.novelty[0].symbol).toBe("PALB2");
  // search + associated on the first call; repeat search resolves the disease ID
  // again (cheap) then serves the associated-target payload from the 24h cache.
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test("remembered cache expires after 24 hours", () => {
  rememberTargets("EFO_1", { novelty: [{ symbol: "OLD" }] });
  expect(getCachedTargets("EFO_1").novelty[0].symbol).toBe("OLD");
  const realNow = Date.now;
  Date.now = () => realNow() + 25 * 60 * 60 * 1000;
  try {
    expect(getCachedTargets("EFO_1")).toBe(null);
  } finally {
    Date.now = realNow;
  }
});
