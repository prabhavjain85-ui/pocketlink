import {
  parsePdbStructure,
  prepareLigand3D,
  scoreLigandPose,
  calculatePoseRmsd,
  formatKi,
  runMolecularDocking,
} from "./dockingEngine";

// Sample miniature PDB pocket structure (representing a binding site with catalytic residues)
const SAMPLE_POCKET_PDB = `
HEADER    KINASE DOMAIN                           01-JAN-20   1IEP              
TITLE     ABL KINASE DOMAIN TEST POCKET
ATOM      1  N   MET A 318      10.000  60.000  10.000  1.00 20.00           N  
ATOM      2  CA  MET A 318      11.200  60.500  10.500  1.00 20.00           C  
ATOM      3  C   MET A 318      12.000  61.500  10.000  1.00 20.00           C  
ATOM      4  O   MET A 318      12.200  61.800   8.800  1.00 20.00           O  
ATOM      5  N   THR A 315      14.000  63.000  12.000  1.00 20.00           N  
ATOM      6  CA  THR A 315      14.500  63.800  13.100  1.00 20.00           C  
ATOM      7  OG1 THR A 315      15.200  64.500  12.200  1.00 20.00           O  
ATOM      8  CG2 THR A 315      13.500  65.000  13.800  1.00 20.00           C  
ATOM      9  N   GLU A 286      10.500  66.000  14.000  1.00 20.00           N  
ATOM     10  OE1 GLU A 286       9.200  67.200  15.100  1.00 20.00           O  
ATOM     11  OE2 GLU A 286       8.800  66.000  16.000  1.00 20.00           O  
ATOM     12  N   ASP A 381      12.500  64.000  16.000  1.00 20.00           N  
ATOM     13  OD1 ASP A 381      13.200  65.000  17.200  1.00 20.00           O  
ATOM     14  OD2 ASP A 381      11.800  65.200  17.800  1.00 20.00           O  
ATOM     15  N   ILE A 293       8.000  62.000  11.000  1.00 20.00           N  
ATOM     16  CD1 ILE A 293       6.800  63.000  10.200  1.00 20.00           C  
HETATM   17  C1  STI A 201      12.000  63.000  13.000  1.00 20.00           C  
HETATM   18  N1  STI A 201      12.500  63.500  14.000  1.00 20.00           N  
END
`;

describe("Native Molecular Docking Engine", () => {
  test("parsePdbStructure parses protein atoms, heteroatoms, and calculates pocket center", () => {
    const parsed = parsePdbStructure(SAMPLE_POCKET_PDB);
    expect(parsed.proteinAtoms.length).toBe(16);
    expect(parsed.heteroAtoms.length).toBe(2);
    expect(parsed.detectedLigandName).toBe("STI");

    // Center should be roughly around the STI ligand coordinates (12.25, 63.25, 13.5)
    expect(parsed.pocketCenter.x).toBeCloseTo(12.25, 1);
    expect(parsed.pocketCenter.y).toBeCloseTo(63.25, 1);
    expect(parsed.pocketCenter.z).toBeCloseTo(13.5, 1);
  });

  test("formatKi correctly converts molar concentrations to nM, µM, mM", () => {
    expect(formatKi(1.5e-9)).toBe("1.5 nM");
    expect(formatKi(3.2e-6)).toBe("3.2 µM");
    expect(formatKi(4.5e-3)).toBe("4.5 mM");
    expect(formatKi(8.0e-12)).toBe("8.0 pM");
  });

  test("calculatePoseRmsd measures spatial deviation between 3D conformations", () => {
    const poseA = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const poseB = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    ];
    const poseC = [
      { x: 0, y: 0, z: 2 },
      { x: 1, y: 0, z: 2 },
    ];

    expect(calculatePoseRmsd(poseA, poseB)).toBe(0);
    expect(calculatePoseRmsd(poseA, poseC)).toBe(2.0);
  });

  test("prepareLigand3D generates valid atomic coordinates and descriptors from SMILES", async () => {
    const ligand = await prepareLigand3D("CC(=O)Oc1ccccc1C(=O)O"); // Aspirin
    expect(ligand.atomCount).toBe(13);
    expect(ligand.mw).toBeCloseTo(180.16, 1);
    expect(ligand.atoms.length).toBe(13);
    expect(ligand.atoms[0]).toHaveProperty("x");
    expect(ligand.atoms[0]).toHaveProperty("y");
    expect(ligand.atoms[0]).toHaveProperty("z");
    expect(ligand.atoms[0]).toHaveProperty("params");
  });

  test("scoreLigandPose calculates binding components including vdW, H-bonds, and torsion penalty", () => {
    const ligandAtoms = [
      {
        x: 14.5,
        y: 63.8,
        z: 12.0,
        symbol: "O",
        charge: 0,
        index: 0,
        isHbDonor: true,
        isHbAcceptor: true,
        isHydrophobic: false,
        params: { r: 1.52, eps: 0.2, charge: -0.25 },
      },
    ];

    const pocketAtoms = [
      {
        x: 14.0,
        y: 63.0,
        z: 12.0,
        atomName: "N",
        resName: "THR",
        resSeq: 315,
        chainId: "A",
        element: "N",
        isBackbone: true,
      },
    ];

    const score = scoreLigandPose(ligandAtoms, pocketAtoms, 3);
    expect(typeof score.deltaG).toBe("number");
    expect(score.components).toHaveProperty("vdw");
    expect(score.components).toHaveProperty("hbond");
    expect(score.components).toHaveProperty("torsional");
    expect(score.components.torsional).toBeCloseTo(3 * 0.315, 2);
  });

  test("runMolecularDocking completes simulation and returns ranked binding poses", async () => {
    const result = await runMolecularDocking(
      SAMPLE_POCKET_PDB,
      "CC(=O)Oc1ccccc1C(=O)O", // Aspirin
      {
        boxSize: 16,
        searchExhaustiveness: 4,
      }
    );

    expect(result.rankedPoses.length).toBeGreaterThan(0);
    expect(result.bestPose).not.toBeNull();
    expect(result.bestPose.rank).toBe(1);
    expect(typeof result.bestPose.deltaG).toBe("number");
    expect(result.bestPose.kiFormatted).toBeDefined();
    expect(result.target.pocketResidues.length).toBeGreaterThan(0);
  }, 15000);
});
