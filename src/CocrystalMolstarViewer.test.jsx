import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import CocrystalMolstarViewer from "./CocrystalMolstarViewer";
import * as cocrystalMolstar from "./cocrystalMolstar";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./cocrystalMolstar", () => {
  const actual = jest.requireActual("./cocrystalMolstar");
  return {
    ...actual,
    mountCocrystalMolstarViewer: jest.fn(),
    destroyCocrystalMolstarViewer: jest.fn(() => Promise.resolve()),
  };
});

describe("CocrystalMolstarViewer", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
    jest.clearAllMocks();
    cocrystalMolstar.mountCocrystalMolstarViewer.mockImplementation(async (el) => {
      while (el.firstChild) el.removeChild(el.firstChild);
      const stub = document.createElement("div");
      stub.className = "molstar-stub";
      stub.textContent = "molstar";
      el.appendChild(stub);
      return { dispose: jest.fn(() => Promise.resolve()) };
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = null;
  });

  test("does not crash when Mol* replaces host children and loading overlay unmounts", async () => {
    await act(async () => {
      root.render(<CocrystalMolstarViewer pdbId="1iep" ligandCode="STI" />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector("[data-molstar-host] .molstar-stub")).not.toBeNull();
    expect(container.textContent).not.toContain("Loading structure from RCSB");

    await act(async () => {
      root.unmount();
    });

    expect(cocrystalMolstar.destroyCocrystalMolstarViewer).toHaveBeenCalled();
  });

  test("shows inline error when mount fails without crashing the tree", async () => {
    cocrystalMolstar.mountCocrystalMolstarViewer.mockRejectedValueOnce(new Error("WebGL is not available"));

    await act(async () => {
      root.render(<CocrystalMolstarViewer pdbId="1iep" ligandCode="STI" />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("WebGL is not available");
  });
});
