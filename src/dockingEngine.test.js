import {
  parsePdbStructure,
  extractPocketAtoms,
  eulerToRotationMatrix,
  transformLigandPose,
  scoreLigandPose,
  formatKi,
  calculatePoseRmsd,
  runMolecularDocking,
  DOCKING_REFERENCE_TARGETS,
} from "./dockingEngine";

jest.mock("./featureFlags", () => ({
  DOCKING_ENGINE_ENABLED: true,
  DOCKING_UNAVAILABLE_NOTICE: "Docking is under validation and currently unavailable.",
}));

describe("Molecular Docking Engine", () => {
  const SAMPLE_PDB = `HEADER    KINASE                                  09-MAY-01   1IEP
ATOM      1  N   THR A 315      14.100  75.100  37.400  1.00 20.00           N
ATOM      2  CA  THR A 315      15.200  75.800  38.100  1.00 20.00           C
ATOM      3  OG1 THR A 315      13.500  76.000  36.500  1.00 20.00           O
ATOM      4  N   GLU A 286      16.500  73.200  35.800  1.00 20.00           N
ATOM      5  OE1 GLU A 286      17.200  72.500  34.900  1.00 20.00           O
HETATM 2345  C1  STI A 999      14.500  75.500  37.000  1.00 25.00           C
HETATM 2346  N2  STI A 999      13.800  74.800  36.800  1.00 25.00           N
END
`;

  test("parses PDB structure correctly with protein atoms and hetero ligands", () => {
    const parsed = parsePdbStructure(SAMPLE_PDB);
    expect(parsed.proteinAtoms.length).toBe(5);
    expect(parsed.heteroAtoms.length).toBe(2);
    expect(parsed.detectedLigandName).toBe("STI");
    expect(parsed.pocketCenter).toBeDefined();
    expect(parsed.pocketCenter.x).toBeCloseTo(14.15, 1);
  });

  test("extracts pocket atoms within target radius around center", () => {
    const parsed = parsePdbStructure(SAMPLE_PDB);
    const center = { x: 14.1, y: 75.1, z: 37.4 };
    const { pocketAtoms, pocketResidues } = extractPocketAtoms(parsed.proteinAtoms, center, 5.0);
    expect(pocketAtoms.length).toBeGreaterThan(0);
    expect(pocketResidues.length).toBeGreaterThan(0);
    // All extracted atoms should be within 5.0 Å
    for (const a of pocketAtoms) {
      const dist = Math.hypot(a.x - center.x, a.y - center.y, a.z - center.z);
      expect(dist).toBeLessThanOrEqual(5.0);
    }
  });

  test("calculates rotation matrix and transforms ligand pose coordinates", () => {
    const rotMat = eulerToRotationMatrix(0, Math.PI / 2, 0);
    expect(rotMat.r11).toBeDefined();
    expect(rotMat.r22).toBeDefined();
    expect(rotMat.r33).toBeDefined();

    const atoms = [
      { x: 1, y: 0, z: 0, element: "C" },
      { x: 0, y: 1, z: 0, element: "N" },
    ];
    const transformed = transformLigandPose(atoms, { x: 10, y: 20, z: 30 }, rotMat);
    expect(transformed.length).toBe(2);
    expect(transformed[0].x).toBeCloseTo(10, 1);
    expect(transformed[0].y).toBeCloseTo(20, 1);
    expect(transformed[0].z).toBeCloseTo(29, 1);
  });

  test("scores ligand pose calculating deltaG, Ki and energy breakdown", () => {
    const ligandAtoms = [
      { x: 14.0, y: 75.0, z: 37.0, element: "O", isHbondDonor: false, isHbondAcceptor: true, partialCharge: -0.5 },
      { x: 15.0, y: 75.5, z: 37.5, element: "C", isHbondDonor: false, isHbondAcceptor: false, partialCharge: 0.1 },
    ];
    const pocketAtoms = [
      { x: 13.5, y: 76.0, z: 36.5, element: "O", resName: "THR", resSeq: 315, chainId: "A", partialCharge: -0.5 },
      { x: 14.1, y: 75.1, z: 37.4, element: "N", resName: "THR", resSeq: 315, chainId: "A", partialCharge: 0.3 },
    ];

    const score = scoreLigandPose(ligandAtoms, pocketAtoms, 3);
    expect(typeof score.deltaG).toBe("number");
    expect(typeof score.kiMolar).toBe("number");
    expect(score.kiMolar).toBeGreaterThan(0);
    expect(score.components).toBeDefined();
    expect(score.components.torsional).toBeCloseTo(3 * 0.315, 2);
    expect(Array.isArray(score.hbondInteractions)).toBe(true);
  });

  test("formats Ki values gracefully across scientific concentration scales", () => {
    expect(formatKi(1.5e-11)).toBe("15.0 pM");
    expect(formatKi(4.2e-9)).toBe("4.2 nM");
    expect(formatKi(3.8e-6)).toBe("3.8 µM");
    expect(formatKi(0.0025)).toBe("2.5 mM");
    expect(formatKi(0.12)).toBe("120.0 mM");
    expect(formatKi(null)).toBe("N/A");
  });

  test("calculates RMSD between identical and displaced ligand poses", () => {
    const poseA = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    const poseB = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ];
    expect(calculatePoseRmsd(poseA, poseB)).toBe(0);

    const poseC = [
      { x: 3, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ];
    expect(calculatePoseRmsd(poseA, poseC)).toBeCloseTo(3.0, 1);
  });

  test("runs complete molecular docking pipeline with sample PDB and SMILES", async () => {
    const result = await runMolecularDocking(SAMPLE_PDB, "CC(=O)Oc1ccccc1C(=O)O", {
      steps: 40,
      center: { x: 14.1, y: 75.1, z: 37.4 },
      boxSize: 18,
      minPocketAtoms: 2,
    });

    expect(result.rankedPoses.length).toBeGreaterThan(0);
    expect(result.bestPose).toBeDefined();
    expect(result.bestPose.deltaG).toBeDefined();
    expect(result.bestPose.kiFormatted).toBeDefined();
    expect(result.pocketAtoms.length).toBeGreaterThan(0);
  });

  test("verifies reference targets catalog has required fields", () => {
    expect(DOCKING_REFERENCE_TARGETS.length).toBeGreaterThanOrEqual(5);
    for (const t of DOCKING_REFERENCE_TARGETS) {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.referenceSmiles).toBeDefined();
      expect(t.center.x).toBeDefined();
      expect(t.center.y).toBeDefined();
      expect(t.center.z).toBeDefined();
      expect(Array.isArray(t.keyResidues)).toBe(true);
    }
  });
});
