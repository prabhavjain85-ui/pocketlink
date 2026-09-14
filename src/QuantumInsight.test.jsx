import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import QuantumInsight from "./QuantumInsight";
import * as quantumInsightService from "./quantumInsightService";

const mockCompound = {
  CID: "783",
  displayName: "Hydrogen",
};

const CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";

describe("QuantumInsight", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  test("shows experimental limitations when expanded", async () => {
    await act(async () => {
      root.render(<QuantumInsight compound={mockCompound} smiles="[H][H]" />);
    });

    const toggle = container.querySelector(".btn-quantum-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toMatch(/Experimental/);

    await act(async () => {
      toggle.click();
    });

    expect(container.textContent).toMatch(/not part of PocketLink scoring/i);
    expect(container.textContent).toMatch(/research-stage/i);
    expect(container.textContent).toMatch(/typical drugs will always be refused/i);
  });

  test("renders VQE result energy for H2", async () => {
    const fetchSpy = jest.spyOn(quantumInsightService, "fetchQuantumInsight").mockResolvedValue({
      experimental: true,
      refused: false,
      total_energy_hartree: -1.137306,
      n_qubits: 2,
      basis: "sto-3g",
      mapper: "ParityMapper",
      ansatz: "UCCSD/HartreeFock",
      runtime_seconds: 0.07,
      explanation: "Experimental estimate only.",
    });

    await act(async () => {
      root.render(<QuantumInsight compound={mockCompound} smiles="[H][H]" />);
    });

    await act(async () => {
      container.querySelector(".btn-quantum-toggle").click();
    });

    await act(async () => {
      container.querySelector(".quantum-actions button").click();
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(container.textContent).toMatch(/-1\.137306/);
    expect(container.textContent).toMatch(/Experimental estimate only/);
  });

  test("shows refusal immediately for drug-like SMILES without calling fetch", async () => {
    const fetchSpy = jest.spyOn(quantumInsightService, "fetchQuantumInsight");

    await act(async () => {
      root.render(
        <QuantumInsight
          compound={{ CID: "2519", displayName: "Caffeine" }}
          smiles={CAFFEINE_SMILES}
        />
      );
    });

    const toggle = container.querySelector(".btn-quantum-toggle");
    expect(toggle.textContent).toMatch(/too large for this molecule/i);

    await act(async () => {
      toggle.click();
    });

    expect(container.textContent).toMatch(/outside experimental limits/i);
    expect(container.textContent).toMatch(/non-hydrogen atoms/i);
    expect(container.querySelector(".quantum-actions button").disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("21-atom example shows refusal without API call", async () => {
    const fetchSpy = jest.spyOn(quantumInsightService, "fetchQuantumInsight");
    const largeSmiles = "CC(=O)Oc1ccccc1C(=O)O";

    await act(async () => {
      root.render(
        <QuantumInsight
          compound={{ CID: "2244", displayName: "Aspirin" }}
          smiles={largeSmiles}
        />
      );
    });

    await act(async () => {
      container.querySelector(".btn-quantum-toggle").click();
    });

    expect(container.textContent).toMatch(/outside experimental limits/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
