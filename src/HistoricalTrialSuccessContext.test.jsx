import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import HistoricalTrialSuccessContext from "./HistoricalTrialSuccessContext";

// The component fetches its data from the server; serve it from the real server module.
jest.mock("./serverApi", () => {
  const { getTrialSuccessContext } = jest.requireActual("../server/trialSuccessContext");
  return { getTrialSuccessContext: async (target) => getTrialSuccessContext(target) };
});

global.IS_REACT_ACT_ENVIRONMENT = true;

const egfrProtein = {
  id: "1M17",
  gene: "EGFR",
  name: "EGFR kinase",
  queryName: "EGFR",
};

describe("HistoricalTrialSuccessContext", () => {
  let container = null;
  let root = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
  });

  test("shows category and all three phase columns (no single giant percentage)", async () => {
    await act(async () => {
      root.render(<HistoricalTrialSuccessContext target={egfrProtein} />);
    });

    const text = container.textContent;
    expect(text).toMatch(/EGFR inhibitors/i);
    expect(text).toMatch(/Phase 1/);
    expect(text).toMatch(/Phase 2/);
    expect(text).toMatch(/Phase 3/);
    expect(text).toMatch(/Class and phase historical completion base rates/i);

    const bigLegacyPct = container.querySelector(".trial-success-pct");
    expect(bigLegacyPct).toBeNull();

    const tabs = container.querySelectorAll(".trial-success-tab");
    expect(tabs.length).toBe(0);

    const rateCells = container.querySelectorAll(".trial-success-phase-rate");
    expect(rateCells.length).toBe(3);
  });
});
