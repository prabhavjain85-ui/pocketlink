import { analyzeExperimentalCocrystalFromPdbText } from "./cocrystalAnalysis";

const SNIPPET = `ATOM      1  CA  VAL A  10      10.000  10.000  10.000  1.00 30.00           C
HETATM 1001  C1  STI A 201      10.500  10.500  10.500  1.00 35.00           C
`;

test("analyzeExperimentalCocrystalFromPdbText returns pocket residues", () => {
  const result = analyzeExperimentalCocrystalFromPdbText(SNIPPET, "1TST", "STI");
  expect(result.ok).toBe(true);
  expect(result.pocketResidueCount).toBeGreaterThan(0);
  expect(result.bundle.dataSource).toBe("experimental_cocrystal");
});
