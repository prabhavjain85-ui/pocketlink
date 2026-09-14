import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import QuantumInsight from "./QuantumInsight";
import * as quantumInsightService from "./quantumInsightService";

const mockCompound = {
  CID: "783",
  displayName: "Hydrogen",
};

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
  });

  test("renders VQE result energy", async () => {
    jest.spyOn(quantumInsightService, "fetchQuantumInsight").mockResolvedValue({
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

    expect(container.textContent).toMatch(/-1\.137306/);
    expect(container.textContent).toMatch(/Experimental estimate only/);
  });

  test("shows refusal message for oversized molecules", async () => {
    jest.spyOn(quantumInsightService, "fetchQuantumInsight").mockRejectedValue({
      message: "Molecule too large",
      payload: {
        refused: true,
        error: "Molecule too large for experimental quantum simulation.",
        reasons: ["Molecule has 24 atoms (limit: 4)."],
      },
    });

    await act(async () => {
      root.render(<QuantumInsight compound={mockCompound} smiles="CCO" />);
    });

    await act(async () => {
      container.querySelector(".btn-quantum-toggle").click();
    });

    await act(async () => {
      container.querySelector(".quantum-actions button").click();
    });

    expect(container.textContent).toMatch(/outside experimental limits/i);
    expect(container.textContent).toMatch(/24 atoms/i);
  });
});
