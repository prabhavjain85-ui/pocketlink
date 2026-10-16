import fs from "fs";
import path from "path";
import {
  analyzePoseInteractions,
  findBindingSiteResidues,
  isHydrogenBondPair,
  normalizeElement,
} from "./dockingInteractions";

const demoDir = path.join(process.cwd(), "public/docking-demo");
const erlotinibCase = JSON.parse(
  fs.readFileSync(path.join(demoDir, "cases/erlotinib-1m17.json"), "utf8")
);

function loadInteractions(caseId) {
  return JSON.parse(fs.readFileSync(path.join(demoDir, `interactions/${caseId}.json`), "utf8"));
}

describe("dockingInteractions classifier", () => {
  test("normalizes PDBQT element symbols", () => {
    expect(normalizeElement("OA")).toBe("O");
    expect(normalizeElement("NA")).toBe("N");
    expect(normalizeElement("A")).toBe("C");
  });

  test("erlotinib in 1M17 demo pose shows hinge H-bond to MET769 backbone N", () => {
    const analysis = analyzePoseInteractions(erlotinibCase.pocketAtoms, erlotinibCase.poseAtoms);
    const hingeHb = analysis.interactions.find(
      (row) =>
        row.type === "hydrogen_bond" &&
        row.resName === "MET" &&
        row.resSeq === 769 &&
        row.proteinAtom === "N"
    );
    expect(hingeHb).toBeDefined();
    expect(hingeHb.distanceAngstrom).toBeLessThanOrEqual(3.5);
  });

  test("does not classify fluorine as halogen-bond donor", () => {
    const protein = [
      {
        atomName: "OE2",
        resName: "GLU",
        resSeq: 1,
        chainId: "A",
        x: 0,
        y: 0,
        z: 3.2,
        element: "O",
        isBackbone: false,
      },
    ];
    const ligand = [
      { index: 0, x: 0, y: 0, z: 0, element: "C", atomName: "C1" },
      { index: 1, x: 0, y: 0, z: 3.0, element: "F", atomName: "F1" },
    ];
    const analysis = analyzePoseInteractions(protein, ligand);
    expect(analysis.interactions.some((r) => r.type === "halogen_bond")).toBe(false);
  });

  test("classifies sub-3A heavy contacts as clashes unless H-bond pair", () => {
    const analysis = analyzePoseInteractions(erlotinibCase.pocketAtoms, erlotinibCase.poseAtoms);
    const leu764Clash = analysis.interactions.find(
      (r) =>
        r.type === "clash" &&
        r.resName === "LEU" &&
        r.resSeq === 764 &&
        r.proteinAtom === "CB" &&
        r.distanceAngstrom < 3.0
    );
    expect(leu764Clash).toBeDefined();
    const leu764Hydrophobic = analysis.interactions.find(
      (r) =>
        r.type === "hydrophobic" &&
        r.resName === "LEU" &&
        r.resSeq === 764 &&
        r.proteinAtom === "CB" &&
        r.distanceAngstrom < 3.0
    );
    expect(leu764Hydrophobic).toBeUndefined();
  });

  test("precomputed demo binding-site sanity flags off-site imatinib and sitagliptin", () => {
    const imatinib = loadInteractions("imatinib-1iep");
    const sita = loadInteractions("sitagliptin-4ffw");
    const erl = loadInteractions("erlotinib-1m17");
    expect(imatinib.bindingSiteSanity.poseNotInKnownBindingSite).toBe(true);
    expect(imatinib.bindingSiteSanity.crystalSiteRecoveryFraction).toBe(0);
    expect(sita.bindingSiteSanity.poseNotInKnownBindingSite).toBe(true);
    expect(sita.bindingSiteSanity.crystalSiteRecoveryFraction).toBe(0);
    expect(sita.bindingSiteSanity.pdbLiteratureResidueNote).toMatch(/GLU204/);
    expect(erl.bindingSiteSanity.poseNotInKnownBindingSite).toBe(false);
    expect(erl.bindingSiteSanity.crystalSiteRecoveryFraction).toBe(1);
  });

  test("sitagliptin precomputed interactions contain no halogen bonds to fluorine", () => {
    const sita = loadInteractions("sitagliptin-4ffw");
    expect(sita.interactions.filter((r) => r.type === "halogen_bond")).toHaveLength(0);
  });

  test("lists binding-site residues within 4.5 and 5.0 Å cutoffs", () => {
    const site45 = findBindingSiteResidues(erlotinibCase.pocketAtoms, erlotinibCase.poseAtoms, 4.5);
    const site50 = findBindingSiteResidues(erlotinibCase.pocketAtoms, erlotinibCase.poseAtoms, 5.0);
    expect(site45.length).toBeGreaterThan(0);
    expect(site50.length).toBeGreaterThanOrEqual(site45.length);
  });

  test("isHydrogenBondPair distinguishes donor-acceptor from random close contacts", () => {
    const pa = { atomName: "N", resName: "MET", isBackbone: true, element: "N" };
    const la = { element: "N", index: 0 };
    expect(isHydrogenBondPair(pa, la, [], [], 3.0)).toBe(true);
    const cb = { atomName: "CB", resName: "LEU", isBackbone: false, element: "C" };
    const lc = { element: "C", index: 1 };
    expect(isHydrogenBondPair(cb, lc, [], [], 2.8)).toBe(false);
  });

});
