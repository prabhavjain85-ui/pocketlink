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

  describe("10-Drug Reference Benchmark Suite", () => {
    const REFERENCE_TEST_DRUGS = [
      {
        name: "Aspirin",
        smiles: "CC(=O)Oc1ccccc1C(=O)O",
        expected: {
          lipinskiViolations: 0,
          passiveBbb: "Borderline",
          passiveHia: "High",
        },
      },
      {
        name: "Paracetamol",
        smiles: "CC(=O)Nc1ccc(O)cc1",
        expected: {
          lipinskiViolations: 0,
          passiveBbb: "Borderline",
          passiveHia: "High",
        },
      },
      {
        name: "Metformin",
        smiles: "CN(C)C(=N)NC(=N)N",
        expected: {
          lipinskiViolations: 0,
          passiveBbb: "No",
          passiveHia: "High", // BOILED-Egg passive HIA model puts it in the white
        },
      },
      {
        name: "Atorvastatin",
        smiles:
          "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CC[C@@H](O)C[C@@H](O)CC(=O)O",
        expected: {
          lipinskiViolations: 2,
          failingSummarySubstring: "MW",
          cLogPSubstring: "cLogP",
        },
      },
      {
        name: "Imatinib",
        smiles:
          "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
        expected: {
          lipinskiViolations: 0,
          pgpSubstrate: true,
          passiveBbb: "No",
        },
      },
      {
        name: "Gefitinib",
        smiles: "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1",
        expected: {
          lipinskiViolations: 0,
          pgpSubstrate: true,
          passiveBbb: "No",
        },
      },
      {
        name: "Diazepam",
        smiles: "CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21",
        expected: {
          lipinskiViolations: 0,
          passiveBbb: "Yes",
          passiveHia: "High",
        },
      },
      {
        name: "Morphine",
        smiles: "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5",
        expected: {
          lipinskiViolations: 0,
          passiveHia: "High",
        },
      },
      {
        name: "Paclitaxel",
        smiles:
          "CC(=O)O[C@H]1C(=O)[C@@]2(C)[C@H](O)C[C@@H]3OC[C@]3(OC(=O)C)[C@H]2[C@H](OC(=O)c2ccccc2)[C@]2(O)C[C@@H](OC(=O)[C@H](O)[C@@H](NC(=O)c3ccccc3)c3ccccc3)C(C)=C1C2(C)C",
        expected: {
          minLipinskiViolations: 2,
          passiveHia: "Low",
          pgpSubstrate: true,
        },
      },
      {
        name: "Remdesivir",
        smiles:
          "CCC(CC)COC(=O)[C@H](C)N[P@](=O)(OC[C@H]1O[C@](C#N)(c2ccc3n2ncnc3N)[C@H](O)[C@@H]1O)Oc1ccccc1",
        expected: {
          lipinskiViolations: 2,
          failingSummarySubstring: "MW",
          pgpSubstrate: true,
        },
      },
    ];

    REFERENCE_TEST_DRUGS.forEach(({ name, smiles, expected }) => {
      test(`evaluates ${name} with expected ADME & PK flags`, async () => {
        const res = await calculateAdmeProperties(smiles, { name });
        expect(res.valid).toBe(true);

        if (expected.lipinskiViolations !== undefined) {
          expect(res.druglikeness.lipinski.violations).toBe(
            expected.lipinskiViolations
          );
        }
        if (expected.minLipinskiViolations !== undefined) {
          expect(res.druglikeness.lipinski.violations).toBeGreaterThanOrEqual(
            expected.minLipinskiViolations
          );
        }
        if (expected.failingSummarySubstring) {
          expect(res.druglikeness.lipinski.status).toContain(
            expected.failingSummarySubstring
          );
        }
        if (expected.cLogPSubstring) {
          expect(res.druglikeness.lipinski.status).toContain(
            expected.cLogPSubstring
          );
        }
        if (expected.passiveBbb) {
          expect(res.pharmacokinetics.boiledEgg.passiveBbb).toBe(
            expected.passiveBbb
          );
        }
        if (expected.passiveHia) {
          expect(res.pharmacokinetics.boiledEgg.giAbsorption).toBe(
            expected.passiveHia
          );
        }
        if (expected.pgpSubstrate !== undefined) {
          expect(
            res.pharmacokinetics.rules?.pgpSubstrate.isSubstrate
          ).toBe(expected.pgpSubstrate);
        }
      });
    });
  });
});
