import React from "react";
import { act } from "react-dom/test-utils";
import ReactDOM from "react-dom/client";
import ExperimentalCocrystalContacts from "./ExperimentalCocrystalContacts";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("ExperimentalCocrystalContacts", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  test("shows loading state", async () => {
    await act(async () => {
      root.render(<ExperimentalCocrystalContacts loading />);
    });
    expect(container.textContent).toMatch(/Computing measured/i);
  });

  test("shows error state", async () => {
    await act(async () => {
      root.render(<ExperimentalCocrystalContacts error="PDB fetch failed" />);
    });
    expect(container.textContent).toContain("PDB fetch failed");
  });

  test("shows contacts when bundle has interactions", async () => {
    await act(async () => {
      root.render(
        <ExperimentalCocrystalContacts
          bundle={{
            interactions: [
              {
                type: "hydrogen_bond",
                resName: "MET",
                resSeq: 769,
                chainId: "A",
                residueLabel: "MET769 A",
                proteinAtom: "N",
                ligandAtom: "L1",
                distanceAngstrom: 3.1,
              },
            ],
            bindingSiteResidues45Angstrom: [{ resName: "MET", resSeq: 769, chainId: "A", label: "MET769 A" }],
            disclaimer: "test",
          }}
          pocketCount={1}
        />
      );
    });
    expect(container.textContent).toMatch(/Measured co-crystal contacts/i);
    expect(container.textContent).toMatch(/Hydrogen bond/i);
  });
});
