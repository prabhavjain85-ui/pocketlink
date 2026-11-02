import {
  dockingPresetForPdb,
  ligandCodeFromReferenceLigand,
  pickCocrystalLigandForDocking,
} from "../server/dockingRunCocrystal";
import { DRUG_NAME_TO_CCD } from "../server/rcsbCocrystalSearch";

describe("dockingRunCocrystal ligand resolution", () => {
  test("ligandCodeFromReferenceLigand parses CCD prefix", () => {
    expect(ligandCodeFromReferenceLigand("STI (Imatinib)")).toBe("STI");
    expect(ligandCodeFromReferenceLigand("AQ4 (Erlotinib)")).toBe("AQ4");
  });

  test("dockingPresetForPdb finds ABL and EGFR presets", () => {
    expect(dockingPresetForPdb("1iep")?.name).toMatch(/Abl/i);
    expect(dockingPresetForPdb("1M17")?.referenceLigand).toMatch(/AQ4/);
  });

  test("pickCocrystalLigandForDocking prefers preset ligand in entry", () => {
    const preset = dockingPresetForPdb("1IEP");
    const pick = pickCocrystalLigandForDocking({
      compoundName: "Imatinib",
      entryLigands: [{ compId: "STI", name: "IMATINIB" }, { compId: "GOL", name: "GLYCEROL" }],
      preset,
    });
    expect(pick.ligandCode).toBe("STI");
    expect(pick.source).toBe("preset");
  });

  test("pickCocrystalLigandForDocking maps erlotinib alias for EGFR entry", () => {
    const preset = dockingPresetForPdb("1M17");
    expect(preset?.referenceLigand).toMatch(/Erlotinib/i);
    const pick = pickCocrystalLigandForDocking({
      compoundName: "Erlotinib",
      entryLigands: [{ compId: "AQ4", name: "ERLOTINIB" }],
      preset,
    });
    expect(pick.ligandCode).toBe("AQ4");
  });

  test("1M17 AQ4 is erlotinib in presets; gefitinib CCD is IRE not AQ4", () => {
    expect(dockingPresetForPdb("1M17")?.referenceLigand).toMatch(/Erlotinib/i);
    expect(DRUG_NAME_TO_CCD.erlotinib).toBe("AQ4");
    expect(DRUG_NAME_TO_CCD.gefitinib).toBe("IRE");
  });

  test("pickCocrystalLigandForDocking uses sole native ligand", () => {
    const pick = pickCocrystalLigandForDocking({
      compoundName: "Unknown",
      entryLigands: [{ compId: "ABC", name: "INHIBITOR" }],
      preset: null,
    });
    expect(pick.ligandCode).toBe("ABC");
    expect(pick.source).toBe("sole_native");
  });

  test("pickCocrystalLigandForDocking does not invent ligands absent from entry", () => {
    const preset = dockingPresetForPdb("1IEP");
    const pick = pickCocrystalLigandForDocking({
      compoundName: "Imatinib",
      entryLigands: [],
      preset,
    });
    expect(pick.ligandCode).toBeNull();
  });
});
