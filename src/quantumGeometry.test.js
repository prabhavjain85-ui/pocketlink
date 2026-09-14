import { buildQuantumAtoms, isH2Smiles, parseAtomsFromMolblock } from "./quantumGeometry";

function mockRdkitMol({ molblock, valid = true, hsBlock = null }) {
  return {
    is_valid: () => valid,
    add_hs: () => hsBlock || molblock,
    get_new_coords: jest.fn(() => molblock),
    get_molblock: () => molblock,
    delete: jest.fn(),
  };
}

describe("quantumGeometry", () => {
  test("H2 returns null (backend canonical geometry)", async () => {
    expect(isH2Smiles("[H][H]")).toBe(true);
    await expect(buildQuantumAtoms("[H][H]", {})).resolves.toBeNull();
  });

  test("add_hs + planar lift produces non-zero z", async () => {
    const planarBlock = `
     RDKit          2D

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
   -1.2990    0.7500    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const mol = mockRdkitMol({ molblock: planarBlock, hsBlock: planarBlock });
    const rdkit = {
      get_mol: () => mol,
    };

    const atoms = await buildQuantumAtoms("O", rdkit);
    expect(atoms).toHaveLength(3);
    expect(atoms.some((a) => Math.abs(a.z) > 1e-4)).toBe(true);
    expect(mol.get_new_coords).toHaveBeenCalledWith(true);
  });

  test("fails clearly when coordinates stay planar", async () => {
    const flatBlock = `
     RDKit          2D

  1  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
M  END
`;
    const mol = mockRdkitMol({ molblock: flatBlock, hsBlock: flatBlock });
    const rdkit = { get_mol: () => mol };

    await expect(buildQuantumAtoms("O", rdkit)).rejects.toThrow(/planar/i);
  });

  test("parseAtomsFromMolblock reads symbols and coordinates", () => {
    const atoms = parseAtomsFromMolblock(` 
  2  0  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0
    0.0000    0.0000    0.7350 H   0  0  0  0  0  0  0  0  0  0  0  0
M  END`);
    expect(atoms).toHaveLength(2);
    expect(atoms[1].z).toBeCloseTo(0.735, 3);
  });
});
