import { demoCaseToDockingResults } from "./dockingDemo";

test("demoCaseToDockingResults maps static case for viewer", () => {
  const view = demoCaseToDockingResults({
    drug: "Imatinib",
    target: "ABL1",
    pdbId: "1IEP",
    ligandCode: "STI",
    smiles: "CCO",
    scoreKcalMol: -7.5,
    redockRmsdAngstrom: 1.2,
    redockPass2A: true,
    poseAtoms: [{ x: 1, y: 2, z: 3, element: "C" }],
    pocketAtoms: [
      {
        atomName: "CA",
        resName: "ALA",
        resSeq: 1,
        x: 0,
        y: 0,
        z: 0,
        element: "C",
        isBackbone: true,
      },
    ],
    poseFile: "poses/x.sdf",
  });
  expect(view.bestPose.deltaG).toBe(-7.5);
  expect(view.engine.demo).toBe(true);
  expect(view.pocketAtoms).toHaveLength(1);
  expect(view.bestPose.interactions).toBeDefined();
});
