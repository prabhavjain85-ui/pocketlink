import { normalizeServiceDockingResult } from "./dockingApi";

test("normalizeServiceDockingResult maps Vina poses for the viewer", () => {
  const normalized = normalizeServiceDockingResult(
    {
      result: {
        engineConfigVersion: "1.0.0",
        smiles: "CCO",
        box: { center_x: 1, center_y: 2, center_z: 3, size_x: 20 },
        pocketAtoms: [
          {
            atomName: "CA",
            resName: "ALA",
            resSeq: 10,
            x: 0,
            y: 0,
            z: 0,
            element: "C",
            isBackbone: true,
          },
        ],
        poses: [
          {
            rank: 1,
            scoreKcalMol: -7.5,
            rmsdLb: 0,
            rmsdUb: 0,
            atoms: [{ x: 1, y: 2, z: 3, element: "C" }],
          },
        ],
        disclaimer: "estimate",
      },
    },
    { targetTitle: "Abl", pdbId: "1IEP", compoundName: "Imatinib" }
  );

  expect(normalized.bestPose.deltaG).toBe(-7.5);
  expect(normalized.rankedPoses).toHaveLength(1);
  expect(normalized.pocketAtoms).toHaveLength(1);
  expect(normalized.engine.type).toBe("autodock_vina");
});
