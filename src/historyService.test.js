import {
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_ENTRIES,
  saveHistoryEntry,
  getHistory,
  deleteHistoryEntry,
  clearAllHistory,
  setActiveState,
  getActiveState,
  clearActiveState,
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
});
