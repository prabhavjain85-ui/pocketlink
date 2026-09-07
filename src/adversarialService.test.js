import { fetchAdversarialCritique, getCachedAdversarialCritique } from "./adversarialService";

describe("src/adversarialService", () => {
  const mockCandidate = {
    cid: "5291",
    name: "Imatinib",
    score: 95,
  };

  const mockTarget = {
    id: "2HYY",
    name: "ABL1",
  };

  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test("getCachedAdversarialCritique returns null when cache is empty", () => {
    const cached = getCachedAdversarialCritique(mockCandidate, mockTarget);
    expect(cached).toBeNull();
  });

  test("fetchAdversarialCritique fetches, caches, and returns critique", async () => {
    const mockApiResponse = {
      compound_id: "5291",
      case_against: {
        concerns: [
          { issue: "Resistance liability", detail: "Gatekeeper mutation T315I abrogates binding." },
        ],
        overall_assessment: "Substantive risk in chronic therapy due to resistance mutations.",
      },
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });

    const result = await fetchAdversarialCritique(mockCandidate, mockTarget);
    expect(result.compound_id).toBe("5291");
    expect(result.case_against.concerns.length).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call should come from cache without invoking fetch
    const cachedResult = await fetchAdversarialCritique(mockCandidate, mockTarget);
    expect(cachedResult).toEqual(mockApiResponse);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
