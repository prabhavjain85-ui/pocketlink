import {
  isCrystallizationAdditive,
  classifyMethod,
  scoreResolution,
  completenessPercent,
  scoreCompleteness,
  ligandEntitiesFromNonpolymers,
  pocketFromLigands,
  scoreTargetFeatures,
  extractFromGraphqlEntry,
  rankScoredTargets,
  recommendationReasons,
} from "./targetSelectionScore";

test("resolution buckets match the spec", () => {
  expect(scoreResolution(1.5).pts).toBe(25);
  expect(scoreResolution(2.0).pts).toBe(25);
  expect(scoreResolution(2.5).pts).toBe(20);
  expect(scoreResolution(2.83).pts).toBe(15);
  expect(scoreResolution(3.0).pts).toBe(15);
  expect(scoreResolution(3.42).pts).toBe(10);
  expect(scoreResolution(4.1).pts).toBe(5);
  expect(scoreResolution(null).pts).toBe(0);
  expect(scoreResolution(undefined).value).toBeNull();
});

test("formats noisy RCSB resolution values to two decimal places", () => {
  const { formatAngstrom } = require("./targetSelectionScore");
  expect(formatAngstrom(2.5009425482)).toBe("2.5 Å");
  expect(formatAngstrom(2.83)).toBe("2.83 Å");
  expect(formatAngstrom(1.783)).toBe("1.78 Å");
  expect(formatAngstrom(2)).toBe("2.0 Å");
});

test("completeness scales linearly and handles missing counts", () => {
  expect(completenessPercent({
    deposited_modeled_polymer_monomer_count: 90,
    deposited_polymer_monomer_count: 100,
  })).toBe(90);
  expect(scoreCompleteness(100).pts).toBe(25);
  expect(scoreCompleteness(90).pts).toBe(22.5);
  expect(scoreCompleteness(null).pts).toBe(0);
  expect(completenessPercent({})).toBeNull();
  expect(completenessPercent({
    deposited_polymer_monomer_count: 800,
    polymer_monomer_count: 1000,
  })).toBe(80);
});

test("method buckets and missing method", () => {
  expect(classifyMethod("X-RAY DIFFRACTION").pts).toBe(15);
  expect(classifyMethod("X-ray").kind).toBe("xray");
  expect(classifyMethod("ELECTRON MICROSCOPY").pts).toBe(12);
  expect(classifyMethod("SOLUTION NMR").pts).toBe(8);
  expect(classifyMethod("NEUTRON DIFFRACTION").pts).toBe(5);
  expect(classifyMethod(null).pts).toBe(0);
  expect(classifyMethod("").label).toBe("N/A");
});

test("excludes crystallization additives but keeps real ligands", () => {
  expect(isCrystallizationAdditive("GOL", "glycerol")).toBe(true);
  expect(isCrystallizationAdditive("SO4", "SULFATE ION")).toBe(true);
  expect(isCrystallizationAdditive("PO4", "PHOSPHATE ION")).toBe(true);
  expect(isCrystallizationAdditive("EDO", "1,2-ETHANEDIOL")).toBe(true);
  expect(isCrystallizationAdditive("DMS", "DIMETHYL SULFOXIDE")).toBe(true);
  expect(isCrystallizationAdditive("KSA", "K-252A")).toBe(false);
  expect(isCrystallizationAdditive("ATP", "ADENOSINE-5'-TRIPHOSPHATE")).toBe(false);

  const ligands = ligandEntitiesFromNonpolymers([
    { pdbx_entity_nonpoly: { comp_id: "PO4", name: "PHOSPHATE ION" } },
    { pdbx_entity_nonpoly: { comp_id: "ASD", name: "4-ANDROSTENE-3-17-DIONE" } },
    { pdbx_entity_nonpoly: { comp_id: "GOL", name: "GLYCEROL" } },
  ]);
  expect(ligands.map((l) => l.compId)).toEqual(["ASD"]);
});

test("pocket is detected within 5Å, unclear without ligand, none when neighbors are far", () => {
  expect(pocketFromLigands([])).toBe("unclear");
  expect(
    pocketFromLigands([
      {
        compId: "KSA",
        instances: [
          { rcsb_target_neighbors: [{ distance: 2.7, target_comp_id: "GLU" }] },
        ],
      },
    ])
  ).toBe("detected");
  expect(
    pocketFromLigands([
      {
        compId: "KSA",
        instances: [
          { rcsb_target_neighbors: [{ distance: 8.2, target_comp_id: "GLU" }] },
        ],
      },
    ])
  ).toBe("none");
  expect(
    pocketFromLigands([{ compId: "KSA", instances: [] }])
  ).toBe("unclear");
});

test("scores an IKKβ-like X-ray holo structure highly and explains why", () => {
  const scored = scoreTargetFeatures({
    id: "4KIK",
    title: "Human IkB kinase beta",
    method: "X-RAY DIFFRACTION",
    resolutionA: 2.83,
    completeness: 93.7,
    hasLigand: true,
    pocket: "detected",
  });
  expect(scored.score).toBe(Math.round(15 + 25 * 0.937 + 20 + 15 + 15));
  expect(scored.score).toBeGreaterThanOrEqual(85);
  expect(scored.ligandLabel).toBe("✅");
  expect(scored.pocketLabel).toBe("✅");
  expect(scored.reasons.length).toBeGreaterThanOrEqual(3);
  expect(scored.reasons.length).toBeLessThanOrEqual(5);
  expect(scored.reasons.some((r) => /ligand/i.test(r))).toBe(true);
  expect(scored.reasons.some((r) => /X-ray/i.test(r))).toBe(true);
  expect(scored.reasons.some((r) => /completeness/i.test(r))).toBe(true);
  expect(scored.reasons.some((r) => /pocket/i.test(r))).toBe(true);
});

test("NMR without resolution does not crash and notes N/A", () => {
  const scored = scoreTargetFeatures({
    id: "1D3Z",
    title: "ubiquitin NMR",
    method: "SOLUTION NMR",
    resolutionA: null,
    completeness: 100,
    hasLigand: false,
    pocket: "unclear",
  });
  expect(scored.resolution).toBe("N/A");
  expect(scored.breakdown.resolution).toBe(0);
  expect(scored.breakdown.ligand).toBe(0);
  expect(scored.breakdown.method).toBe(8);
  expect(scored.breakdown.pocket).toBe(7);
  expect(scored.score).toBe(40);
  expect(scored.pocketLabel).toBe("?");
  expect(scored.ligandLabel).toBe("❌");
});

test("ranks by score descending with resolution as a tie-break", () => {
  const a = scoreTargetFeatures({
    id: "AAAA",
    method: "X-RAY DIFFRACTION",
    resolutionA: 1.8,
    completeness: 100,
    hasLigand: true,
    pocket: "detected",
  });
  const b = scoreTargetFeatures({
    id: "BBBB",
    method: "SOLUTION NMR",
    resolutionA: null,
    completeness: 80,
    hasLigand: false,
    pocket: "unclear",
  });
  const ranked = rankScoredTargets([b, a]);
  expect(ranked[0].id).toBe("AAAA");
  expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
});

test("extracts GraphQL payload fields used for scoring", () => {
  const features = extractFromGraphqlEntry({
    rcsb_id: "3EQM",
    struct: { title: "aromatase" },
    rcsb_accession_info: { initial_release_date: "2009-01-15T00:00:00Z" },
    rcsb_entry_info: {
      resolution_combined: [2.9],
      deposited_modeled_polymer_monomer_count: 452,
      deposited_polymer_monomer_count: 503,
      deposited_unmodeled_polymer_monomer_count: 51,
    },
    exptl: [{ method: "X-RAY DIFFRACTION" }],
    nonpolymer_entities: [
      {
        pdbx_entity_nonpoly: { comp_id: "ASD", name: "androstenedione" },
        nonpolymer_entity_instances: [
          { rcsb_target_neighbors: [{ distance: 2.9, target_comp_id: "MET" }] },
        ],
      },
      { pdbx_entity_nonpoly: { comp_id: "PO4", name: "PHOSPHATE ION" } },
    ],
  });
  expect(features.id).toBe("3EQM");
  expect(features.hasLigand).toBe(true);
  expect(features.pocket).toBe("detected");
  expect(features.ligands.map((l) => l.compId)).toEqual(["ASD"]);
  expect(features.completeness).toBeCloseTo((452 / 503) * 100);
});

test("recommendation reasons are deterministic template strings", () => {
  const scored = scoreTargetFeatures({
    id: "1CRN",
    method: "X-RAY DIFFRACTION",
    resolutionA: 1.5,
    completeness: 100,
    hasLigand: false,
    pocket: "unclear",
  });
  const reasons = recommendationReasons(scored);
  expect(reasons).toEqual(scored.reasons);
  expect(reasons.some((r) => r.includes("1.5 Å"))).toBe(true);
  expect(reasons.some((r) => /100%/.test(r))).toBe(true);
  expect(reasons.join(" ")).not.toMatch(/undefined|NaN/);
});
