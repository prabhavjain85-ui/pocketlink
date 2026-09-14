import {
  buildDiatomicFragment,
  parseBondsFromMolblock,
  parseLigandAtomLabel,
  selectFragmentFromDocking,
  selectPocketContactFragment,
} from "./quantumFragmentSelector";
import { MAX_NON_H_ATOMS } from "./quantumInsightGate";

const CAFFEINE_SMILES = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const ASPIRIN_SMILES = "CC(=O)Oc1ccccc1C(=O)O";

describe("quantumFragmentSelector", () => {
  test("buildDiatomicFragment returns geometry with at most two heavy atoms", () => {
    const fragment = buildDiatomicFragment("C", "O", 2);
    expect(fragment.formula).toBe("C–O");
    expect(fragment.heavySymbols.length).toBeLessThanOrEqual(MAX_NON_H_ATOMS);
    expect(fragment.geometry).toMatch(/^C /);
    expect(fragment.geometry).toMatch(/; O /);
    expect(fragment.atoms.length).toBe(2);
  });

  test("parseLigandAtomLabel extracts symbol and zero-based index", () => {
    expect(parseLigandAtomLabel("O-12")).toEqual({ symbol: "O", index: 11 });
    expect(parseLigandAtomLabel("bad")).toBeNull();
  });

  test("parseBondsFromMolblock reads V2000 bond block", () => {
    const molblock = `
  RDKit

  2  1  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    1.2000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  2  0
M  END
`;
    const bonds = parseBondsFromMolblock(molblock);
    expect(bonds).toEqual([{ a: 0, b: 1, order: 2 }]);
  });

  test("selectFragmentFromDocking prefers hbond interaction ligand atom", () => {
    const hint = selectFragmentFromDocking({
      bestPose: {
        hbondInteractions: [
          {
            ligandAtom: "O-5",
            residue: "MET-793",
            distance: 2.9,
          },
        ],
      },
    });
    expect(hint).toEqual({
      contactResidue: "MET-793",
      selectionSource: "docking_hbond",
      ligandAtomLabel: "O-5",
    });
  });

  test("drug-like SMILES returns eligible fragment with geometry", async () => {
    const plan = await selectPocketContactFragment({ smiles: ASPIRIN_SMILES });
    expect(plan.eligible).toBe(true);
    expect(plan.geometry).toBeTruthy();
    expect(plan.heavySymbols.length).toBeLessThanOrEqual(MAX_NON_H_ATOMS);
    expect(plan.atoms.length).toBeLessThanOrEqual(4);
    expect(plan.selection_source).toBe("ligand_polar_pair_no_pocket");
    expect(plan.formula).toMatch(/–/);
  });

  test("caffeine without pocket uses ligand polar pair fallback label", async () => {
    const plan = await selectPocketContactFragment({ smiles: CAFFEINE_SMILES });
    expect(plan.eligible).toBe(true);
    expect(plan.fragment).toBe(true);
    expect(plan.selection_source).toBe("ligand_polar_pair_no_pocket");
  });
});
