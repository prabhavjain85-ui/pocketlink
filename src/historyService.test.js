import {
  MAX_HISTORY_ENTRIES,
  SNAPSHOT_RANKING_LIMIT,
  compactAgentReport,
  compactSnapshot,
  saveHistoryEntry,
  getHistory,
  deleteHistoryEntry,
  clearAllHistory,
  setActiveState,
  getActiveState,
  clearActiveState,
  HISTORY_STORAGE_KEY,
} from "./historyService";

describe("historyService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("saves and retrieves history entries in reverse chronological order", () => {
    const entry1 = saveHistoryEntry({
      type: "pdb-search",
      title: "PDB Search: EGFR",
      summary: "1M17 · Score 85/100",
      inputs: { query: "EGFR" },
    });

    const entry2 = saveHistoryEntry({
      type: "staging-bench",
      title: "Staging Bench: EGFR + 3 compounds",
      summary: "Winner: Gefitinib",
      inputs: { query: "EGFR", count: 3 },
    });

    const history = getHistory();
    expect(history.length).toBe(2);
    expect(history[0].id).toBe(entry2.id);
    expect(history[1].id).toBe(entry1.id);
  });

  test("enforces the MAX_HISTORY_ENTRIES limit (50 items)", () => {
    for (let i = 0; i < 60; i++) {
      saveHistoryEntry({
        type: "pdb-search",
        title: `Search ${i}`,
        summary: `Result ${i}`,
        inputs: { index: i },
      });
    }

    const history = getHistory();
    expect(history.length).toBe(MAX_HISTORY_ENTRIES);
    expect(history[0].title).toBe("Search 59");
  });

  test("deletes an individual history entry", () => {
    const entry1 = saveHistoryEntry({
      type: "target-discovery",
      title: "Target Discovery: lung cancer",
      summary: "15 targets",
      inputs: { disease: "lung cancer" },
    });

    const entry2 = saveHistoryEntry({
      type: "repurposing-run",
      title: "Repurposing: ABL1",
      summary: "Top: Imatinib",
      inputs: { target: "ABL1" },
    });

    deleteHistoryEntry(entry1.id);
    const history = getHistory();
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(entry2.id);
  });

  test("clears all history entries", () => {
    saveHistoryEntry({ type: "pdb-search", title: "Target A" });
    saveHistoryEntry({ type: "pdb-search", title: "Target B" });

    expect(getHistory().length).toBe(2);
    clearAllHistory();
    expect(getHistory().length).toBe(0);
  });

  test("saves, retrieves, and clears active session state", () => {
    const key = "test_active_key";
    setActiveState(key, { protein: { id: "2HYY" }, query: "ABL1" });

    const active = getActiveState(key);
    expect(active).toEqual({ protein: { id: "2HYY" }, query: "ABL1" });

    clearActiveState(key);
    expect(getActiveState(key)).toBeNull();
  });

  test("compactAgentReport truncates large rankings and step payloads", () => {
    const ranking = Array.from({ length: 50 }, (_, i) => ({
      name: `Drug${i}`,
      cid: String(i),
      score: 90 - i,
      reasoning: [`reason-${i}`, `extra-${i}`],
    }));

    const compacted = compactAgentReport({
      goal: "Test goal",
      status: "completed",
      steps: {
        3: {
          id: 3,
          status: "complete",
          narration: "x".repeat(5000),
          data: { ranking, recommended: ranking[0] },
        },
      },
      executiveSummary: { verdict: "Done" },
    });

    expect(compacted.steps[3].data.ranking.length).toBeLessThanOrEqual(SNAPSHOT_RANKING_LIMIT);
    expect(compacted.steps[3].narration.length).toBeLessThan(5000);
    expect(compacted.steps[3].data.ranking[0].name).toBe("Drug0");
  });

  test("compactSnapshot compacts repurposing and staging-bench snapshots", () => {
    const ranking = Array.from({ length: 30 }, (_, i) => ({ name: `Drug${i}`, cid: i, score: i }));
    const compacted = compactSnapshot("repurposing-run", {
      target: { id: "2HYY", title: "ABL", score: 95, extra: "drop-me" },
      topCandidates: ranking,
      highlightCount: 3,
    });

    expect(compacted.topCandidates.length).toBeLessThanOrEqual(SNAPSHOT_RANKING_LIMIT);
    expect(compacted.target.id).toBe("2HYY");
    expect(compacted.target.extra).toBeUndefined();
  });

  test("retries history write by dropping oldest entries when quota is exceeded", () => {
    const originalSetItem = Storage.prototype.setItem;
    let failNextHistoryWrite = true;

    Storage.prototype.setItem = function patchedSetItem(key, value) {
      if (key === HISTORY_STORAGE_KEY && failNextHistoryWrite) {
        failNextHistoryWrite = false;
        const err = new Error("Quota exceeded");
        err.name = "QuotaExceededError";
        throw err;
      }
      return originalSetItem.call(window.localStorage, key, value);
    };

    try {
      const entry = saveHistoryEntry({
        type: "pdb-search",
        title: "Search 0",
        summary: "Result 0",
        inputs: { index: 0 },
      });

      expect(entry).toBeTruthy();
      expect(getHistory().length).toBe(1);
    } finally {
      Storage.prototype.setItem = originalSetItem;
    }
  });
});
