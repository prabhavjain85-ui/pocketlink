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

const unknownProtein = {
  id: "XXXX",
  name: "Uncharacterized target",
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

  test("shows category, phase transition rate, trial completion rate, 95% CIs, n, and attribution without calling completion 'success'", async () => {
    await act(async () => {
      root.render(<HistoricalTrialSuccessContext target={egfrProtein} />);
    });

    const text = container.textContent;
    expect(text).toMatch(/EGFR inhibitors/i);
    expect(text).toMatch(/Phase 1/);
    expect(text).toMatch(/Phase 2/);
    expect(text).toMatch(/Phase 3/);
    expect(text).toMatch(/Phase transition rate/i);
    expect(text).toMatch(/Trial completion rate/i);
    expect(text).toMatch(/95% CI/);
    expect(text).toMatch(/ClinicalTrials\.gov API v2/);
    expect(text).toMatch(/data generated \d{4}-\d{2}-\d{2}/);

    // No UI string calls a completion rate a "success" rate
    expect(text.toLowerCase()).not.toMatch(/\bsuccess\b/);
    const region = container.querySelector('[role="region"]');
    expect(region?.getAttribute("aria-label")?.toLowerCase()).not.toMatch(/\bsuccess\b/);

    const bigLegacyPct = container.querySelector(".trial-success-pct");
    expect(bigLegacyPct).toBeNull();

    const tabs = container.querySelectorAll(".trial-success-tab");
    expect(tabs.length).toBe(0);

    const transitionCells = container.querySelectorAll(".trial-success-transition-rate");
    expect(transitionCells.length).toBe(3);

    const completionCells = container.querySelectorAll(".trial-success-phase-rate");
    expect(completionCells.length).toBe(4);
  });

  test("shows unavailable state when category cannot be computed without inventing a fallback percentage", async () => {
    await act(async () => {
      root.render(<HistoricalTrialSuccessContext target={unknownProtein} />);
    });

    const text = container.textContent;
    expect(text).toMatch(/Unavailable/i);
    expect(text).not.toMatch(/\d+(\.\d+)?%/);
    expect(text.toLowerCase()).not.toMatch(/\bsuccess\b/);
  });
});
