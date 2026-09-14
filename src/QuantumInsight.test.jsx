import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import QuantumInsight from "./QuantumInsight";
import * as quantumInsightService from "./quantumInsightService";
import * as quantumFragmentSelector from "./quantumFragmentSelector";

const mockCompound = {
  CID: "783",
  displayName: "Hydrogen",
};

const CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const ASPIRIN_SMILES = "CC(=O)Oc1ccccc1C(=O)O";

const mockFragmentPlan = {
  eligible: true,
  formula: "C–O",
  geometry: "C 0 0 0; O 0 0 1.23",
  atoms: [
    { symbol: "C", x: 0, y: 0, z: 0 },
    { symbol: "O", x: 0, y: 0, z: 1.23 },
  ],
  parent_smiles: ASPIRIN_SMILES,
  fragment_atoms: ["C", "O"],
  selection_source: "ligand_polar_pair_no_pocket",
  fragment: true,
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
    expect(fetchSpy.mock.calls[0][0].fragmentPlan).toBeNull();
  });

  test("drug-like SMILES offers fragment path and can run fragment VQE", async () => {
    jest.spyOn(quantumFragmentSelector, "selectPocketContactFragment").mockResolvedValue(mockFragmentPlan);
    const fetchSpy = jest.spyOn(quantumInsightService, "fetchQuantumInsight").mockResolvedValue({
      experimental: true,
      refused: false,
      fragment: true,
      fragment_formula: "C–O",
      total_energy_hartree: -99.5,
      n_qubits: 6,
      basis: "sto-3g",
      mapper: "ParityMapper",
      ansatz: "UCCSD/HartreeFock",
      runtime_seconds: 0.5,
      explanation: "Fragment ground-state energy only.",
    });

    await act(async () => {
      root.render(
        <QuantumInsight
          compound={{ CID: "2244", displayName: "Aspirin" }}
          smiles={ASPIRIN_SMILES}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const toggle = container.querySelector(".btn-quantum-toggle");
    expect(toggle.textContent).toMatch(/fragment VQE available/i);

    await act(async () => {
      toggle.click();
    });

    expect(container.textContent).toMatch(/Pocket-contact fragment path/i);
    expect(container.textContent).toMatch(/not binding affinity/i);
    expect(container.textContent).not.toMatch(/typical drugs will always be refused/i);

    const runButton = container.querySelector(".quantum-actions button");
    expect(runButton.disabled).toBe(false);

    await act(async () => {
      runButton.click();
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy.mock.calls[0][0].fragmentPlan).toEqual(mockFragmentPlan);
    expect(container.textContent).toMatch(/Fragment ground-state energy/i);
    expect(container.textContent).toMatch(/Fragment VQE/);
    expect(container.textContent).not.toMatch(/binding energy/i);
  });

  test("caffeine shows fragment offer instead of dead-end only", async () => {
    jest.spyOn(quantumFragmentSelector, "selectPocketContactFragment").mockResolvedValue({
      ...mockFragmentPlan,
      parent_smiles: CAFFEINE_SMILES,
      formula: "C–O",
    });
    const fetchSpy = jest.spyOn(quantumInsightService, "fetchQuantumInsight");

    await act(async () => {
      root.render(
        <QuantumInsight
          compound={{ CID: "2519", displayName: "Caffeine" }}
          smiles={CAFFEINE_SMILES}
        />
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/fragment VQE available/i);

    await act(async () => {
      container.querySelector(".btn-quantum-toggle").click();
    });

    expect(container.querySelector(".quantum-actions button").disabled).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
