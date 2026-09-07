import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import AdversarialCritique from "./AdversarialCritique";
import * as adversarialService from "./adversarialService";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("src/AdversarialCritique", () => {
  let container = null;
  let root = null;

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
  });

  test("renders collapsed toggle button by default", () => {
    act(() => {
      root.render(<AdversarialCritique candidate={mockCandidate} target={mockTarget} />);
    });

    const toggleBtn = container.querySelector(".btn-adversarial-toggle");
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.textContent).toContain("See the case against this candidate");
    expect(container.querySelector(".adversarial-panel")).toBeNull();
  });

  test("expands and loads critique on click", async () => {
    const mockCritiqueData = {
      compound_id: "5291",
      case_against: {
        concerns: [
          { issue: "T315I resistance mutation", detail: "Gatekeeper clash abrogates binding." },
          { issue: "Off-target kinase liability", detail: "Inhibits PDGFR and c-Kit." },
        ],
        overall_assessment: "Significant resistance and off-target safety risks in chronic therapy.",
      },
      source: "ai",
    };

    jest.spyOn(adversarialService, "getCachedAdversarialCritique").mockReturnValue(null);
    jest.spyOn(adversarialService, "fetchAdversarialCritique").mockResolvedValue(mockCritiqueData);

    act(() => {
      root.render(<AdversarialCritique candidate={mockCandidate} target={mockTarget} />);
    });

    const toggleBtn = container.querySelector(".btn-adversarial-toggle");
    await act(async () => {
      toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.querySelector(".adversarial-panel")).not.toBeNull();
    expect(container.textContent).toContain("The Case Against Imatinib");
    expect(container.textContent).toContain("T315I resistance mutation");
    expect(container.textContent).toContain("Significant resistance and off-target safety risks");
  });

  test("collapses when clicking toggle button again", async () => {
    const mockCritiqueData = {
      compound_id: "5291",
      case_against: {
        concerns: [
          { issue: "T315I mutation", detail: "Steric clash." },
        ],
        overall_assessment: "Risk of resistance.",
      },
    };

    jest.spyOn(adversarialService, "getCachedAdversarialCritique").mockReturnValue(mockCritiqueData);

    act(() => {
      root.render(<AdversarialCritique candidate={mockCandidate} target={mockTarget} />);
    });

    const toggleBtn = container.querySelector(".btn-adversarial-toggle");

    // Expand
    await act(async () => {
      toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".adversarial-panel")).not.toBeNull();

    // Collapse
    await act(async () => {
      toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".adversarial-panel")).toBeNull();
  });
});
