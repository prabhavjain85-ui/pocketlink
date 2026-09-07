import {
  calculateAdmeProperties,
  evaluateBoiledEgg,
  calculateEsolSolubility,
  ADME_EXAMPLE_COMPOUNDS,
} from "./admeCalculator";

jest.setTimeout(20000);

describe("ADME Calculator Engine", () => {
  test("calculates real RDKit descriptors for Aspirin", async () => {
    const res = await calculateAdmeProperties("CC(=O)Oc1ccccc1C(=O)O", {
      name: "Aspirin",
    });
    expect(res.valid).toBe(true);
    expect(res.properties.mw).toBeCloseTo(180.2, 0);
    expect(res.properties.tpsa).toBeGreaterThan(50);
    expect(res.properties.tpsa).toBeLessThan(75);
    expect(res.druglikeness.lipinski.pass).toBe(true);
    expect(res.druglikeness.veber.pass).toBe(true);
    expect(res.druglikeness.ghose.pass).toBe(true);
    expect(res.pharmacokinetics.boiledEgg.giAbsorption).toBe("High");
    expect(res.pharmacokinetics.solubility.qualitativeClass).toMatch(/Soluble/i);
    expect(res.structureSvg).toContain("<svg");
  });

  test("evaluates Caffeine as high GI absorption", async () => {
    const res = await calculateAdmeProperties("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", {
      name: "Caffeine",
    });
    expect(res.valid).toBe(true);
    expect(res.properties.mw).toBeCloseTo(194.2, 0);
    expect(res.pharmacokinetics.boiledEgg.giAbsorption).toBe("High");
    expect(res.druglikeness.lipinski.violations).toBe(0);
  });

  test("evaluates Imatinib correctly with high MW and poor solubility", async () => {
    const imatinib = ADME_EXAMPLE_COMPOUNDS.find((c) => c.name === "Imatinib");
    const res = await calculateAdmeProperties(imatinib.smiles, {
      name: imatinib.name,
      cid: imatinib.cid,
    });
    expect(res.valid).toBe(true);
    expect(res.properties.mw).toBeCloseTo(493.6, 0);
    expect(res.pharmacokinetics.boiledEgg.giAbsorption).toBe("High");
    // Imatinib is typically non-permeant for BBB
    expect(res.pharmacokinetics.boiledEgg.bbbPermeation).toMatch(/Low/i);
    expect(res.pharmacokinetics.solubility.qualitativeClass).toMatch(/Poorly soluble/i);
  });

  test("rejects invalid SMILES syntax gracefully without throwing", async () => {
    const res = await calculateAdmeProperties("INVALID_CHEMICAL_SMILES_123");
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/invalid|unable to parse/i);
  });

  test("evaluateBoiledEgg correctly identifies yolk vs white vs outer", () => {
    // Caffeine (approx 61.8 Å², -1.03 LogP) -> White (HIA)
    const caffe = evaluateBoiledEgg(61.8, -1.03);
    expect(caffe.inHia).toBe(true);
    expect(caffe.inBbb).toBe(false);
    expect(caffe.region).toBe("hia");

    // Paracetamol (approx 49.3 Å², 1.35 LogP) -> Yolk (BBB + HIA)
    const para = evaluateBoiledEgg(49.3, 1.35);
    expect(para.inHia).toBe(true);
    expect(para.inBbb).toBe(true);
    expect(para.region).toBe("bbb");

    // Huge peptide (240 Å², 8.5 LogP) -> Outer (Low GI)
    const huge = evaluateBoiledEgg(240, 8.5);
    expect(huge.inHia).toBe(false);
    expect(huge.inBbb).toBe(false);
    expect(huge.region).toBe("low_absorption");
  });

  test("calculateEsolSolubility calculates expected qualitative categories", () => {
    const sol = calculateEsolSolubility({
      mw: 180.2,
      logp: 1.31,
      rotb: 3,
      heavyAtoms: 13,
      aromaticRings: 1,
    });
    expect(sol.logS).toBeCloseTo(-1.93, 1);
    expect(sol.qualitativeClass).toBe("Soluble");
  });
});
