import fs from "fs";
import path from "path";
import {
  analyzePoseInteractions,
  findBindingSiteResidues,
  normalizeElement,
} from "./dockingInteractions";

const casePath = path.join(
  process.cwd(),
  "public/docking-demo/cases/erlotinib-1m17.json"
);

describe("dockingInteractions classifier", () => {
  test("normalizes PDBQT element symbols", () => {
    expect(normalizeElement("OA")).toBe("O");
    expect(normalizeElement("NA")).toBe("N");
    expect(normalizeElement("A")).toBe("C");
  });

  test("erlotinib in 1M17 demo pose shows hinge H-bond to MET769 backbone N", () => {
    const caseJson = JSON.parse(fs.readFileSync(casePath, "utf8"));
    const analysis = analyzePoseInteractions(caseJson.pocketAtoms, caseJson.poseAtoms);
    const met769 = analysis.bindingSiteResidues45Angstrom.find(
      (r) => r.resName === "MET" && r.resSeq === 769
    );
    expect(met769).toBeDefined();

    const hingeHb = analysis.interactions.find(
      (row) =>
        row.type === "hydrogen_bond" &&
        row.resName === "MET" &&
        row.resSeq === 769 &&
        row.proteinAtom === "N"
    );
    expect(hingeHb).toBeDefined();
    expect(hingeHb.distanceAngstrom).toBeLessThanOrEqual(3.5);
    expect(hingeHb.proteinElement).toBe("N");
  });

  test("lists binding-site residues within 4.5 and 5.0 Å cutoffs", () => {
    const caseJson = JSON.parse(fs.readFileSync(casePath, "utf8"));
    const site45 = findBindingSiteResidues(caseJson.pocketAtoms, caseJson.poseAtoms, 4.5);
    const site50 = findBindingSiteResidues(caseJson.pocketAtoms, caseJson.poseAtoms, 5.0);
    expect(site45.length).toBeGreaterThan(0);
    expect(site50.length).toBeGreaterThanOrEqual(site45.length);
  });
});
