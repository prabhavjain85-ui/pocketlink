import {
  groupHetatmLigandInstances,
  parseProteinAtomsFromPdb,
  selectCoCrystalLigandInstance,
} from "../server/pdbStructure";

const STI_TWO_CHAIN_SNIPPET = `ATOM      1  N   MET A 315      15.000  60.000  12.000  1.00 30.00           N
ATOM      2  CA  MET A 315      16.000  60.500  12.500  1.00 30.00           C
HETATM 4465  C1  STI A 201      11.879  62.272  12.570  1.00 35.17           C
HETATM 4466  C6  STI A 201      13.002  61.429  12.910  1.00 32.96           C
HETATM 4500  C1  STI B 202      50.000  90.000  55.000  1.00 35.17           C
HETATM 4501  C6  STI B 202      51.000  91.000  55.500  1.00 32.96           C
`;

describe("pdbStructure ligand instance selection", () => {
  test("groups HETATM by chain and author resSeq", () => {
    const groups = groupHetatmLigandInstances(STI_TWO_CHAIN_SNIPPET, "STI");
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => `${g.chainId}:${g.resSeq}`).sort()).toEqual(["A:201", "B:202"]);
  });

  test("selects instance with more protein contacts in the pocket", () => {
    const protein = parseProteinAtomsFromPdb(STI_TWO_CHAIN_SNIPPET);
    const picked = selectCoCrystalLigandInstance(STI_TWO_CHAIN_SNIPPET, "STI", protein);
    expect(picked.instance.chainId).toBe("A");
    expect(picked.instance.resSeq).toBe(201);
    expect(picked.atoms.length).toBe(2);
  });

  test("breaks ties using pose centroid when pocket contact counts match", () => {
    const tieSnippet = `ATOM      1  CA  GLY A  10      10.000  10.000  10.000  1.00 30.00           C
ATOM      2  CA  GLY B  10      50.000  50.000  50.000  1.00 30.00           C
HETATM 1001  C1  STI A 201      10.500  10.500  10.500  1.00 35.00           C
HETATM 1002  C1  STI B 202      50.500  50.500  50.500  1.00 35.00           C
`;
    const protein = parseProteinAtomsFromPdb(tieSnippet);
    const nearB = selectCoCrystalLigandInstance(tieSnippet, "STI", protein, {
      poseCentroid: { x: 50, y: 50, z: 50 },
    });
    expect(nearB.instance.chainId).toBe("B");
  });
});
