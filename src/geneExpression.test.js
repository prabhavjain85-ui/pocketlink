import { getTargetExpressionProfile, tauSpecificity, classifySpecificity } from "../server/geneExpression";
import * as openTargets from "../server/openTargets";

// GTEx rows as Open Targets returns them, plus a single-cell row in CPM that
// must be filtered out rather than mixed into the TPM figures.
function otResponse(symbol, tissues, extraRows = []) {
  return {
    target: {
      id: "ENSG_TEST",
      approvedSymbol: symbol,
      baselineExpression: {
        count: tissues.length + extraRows.length,
        rows: [
          ...tissues.map(([name, median, parent]) => ({
            datasourceId: "gtex",
            unit: "TPM",
            median,
            tissueBiosample: { biosampleId: name.replace(/\s+/g, "_"), biosampleName: name },
            tissueBiosampleParent: { biosampleName: parent || "" },
          })),
          ...extraRows,
        ],
      },
    },
  };
}

const SINGLE_CELL_ROW = {
  datasourceId: "tabula_sapiens",
  unit: "CPM(pseudobulk sum[counts])",
  median: 99999,
  tissueBiosample: { biosampleId: "sc", biosampleName: "single cell tissue" },
  tissueBiosampleParent: { biosampleName: "" },
};

describe("tau specificity index", () => {
  test("is 0 for perfectly even expression and near 1 for one tissue", () => {
    expect(tauSpecificity([10, 10, 10, 10])).toBeCloseTo(0);
    expect(tauSpecificity([100, 0, 0, 0])).toBeCloseTo(1);
  });

  test("sits in between for an enriched gene", () => {
    const tau = tauSpecificity([100, 20, 5, 1]);
    expect(tau).toBeGreaterThan(0.5);
    expect(tau).toBeLessThan(1);
  });

  test("is computed on the log scale, so a housekeeping gene reads as ubiquitous", () => {
    // Expressed everywhere, one tissue ~8x higher (the GAPDH shape).
    const housekeeping = [7882, 1200, 1000, 900, 850, 800, 750, 700];
    expect(tauSpecificity(housekeeping)).toBeLessThan(0.4);
    // A genuinely restricted gene still scores high.
    const restricted = [800, 5, 2, 1, 0.5, 0.2, 0.1, 0];
    expect(tauSpecificity(restricted)).toBeGreaterThan(0.75);
  });

  test("is undefined-safe", () => {
    expect(tauSpecificity([])).toBeNull();
    expect(tauSpecificity([5])).toBeNull();
    expect(tauSpecificity([0, 0, 0])).toBeNull();
  });

  test("classification thresholds follow tau", () => {
    expect(classifySpecificity(0.9).specificity).toBe("enriched");
    expect(classifySpecificity(0.7).specificity).toBe("group_enriched");
    expect(classifySpecificity(0.3).specificity).toBe("ubiquitous");
    expect(classifySpecificity(null).specificity).toBe("unknown");
  });
});

describe("getTargetExpressionProfile", () => {
  afterEach(() => jest.restoreAllMocks());

  test("uses GTEx TPM rows and ignores single-cell CPM rows", async () => {
    jest.spyOn(openTargets, "otGraphql").mockResolvedValue(
      otResponse(
        "PCSK9",
        [
          ["right lobe of liver", 28.3, "liver"],
          ["cerebellum", 22.7, "brain"],
          ["upper lobe of left lung", 7.2, "lung"],
          ["kidney", 0.4, "kidney"],
        ],
        [SINGLE_CELL_ROW]
      )
    );

    const profile = await getTargetExpressionProfile("PCSK9", { ensemblId: "ENSG00000169174" });

    expect(profile.available).toBe(true);
    expect(profile.primaryTissue).toBe("right lobe of liver");
    expect(profile.primaryTpm).toBe(28.3);
    expect(profile.source.unit).toBe("median TPM");
    // The 99999 CPM row must not appear anywhere.
    expect(profile.maxTpm).toBe(28.3);
    expect(profile.tissues.some((t) => t.name === "single cell tissue")).toBe(false);
    expect(profile.tissues).toHaveLength(4);
  });

  test("collapses repeated biosamples to their median", async () => {
    jest.spyOn(openTargets, "otGraphql").mockResolvedValue(
      otResponse("X", [
        ["cerebellum", 10, "brain"],
        ["cerebellum", 20, "brain"],
        ["liver", 1, "liver"],
      ])
    );
    const profile = await getTargetExpressionProfile("X", { ensemblId: "ENSG_X" });
    const cerebellum = profile.tissues.find((t) => t.name === "cerebellum");
    expect(profile.tissues).toHaveLength(2);
    expect(cerebellum.tpm).toBe(15);
  });

  test("reports no data instead of inventing values when GTEx has none", async () => {
    jest.spyOn(openTargets, "otGraphql").mockResolvedValue(otResponse("ORPHAN", [], [SINGLE_CELL_ROW]));
    const profile = await getTargetExpressionProfile("ORPHAN", { ensemblId: "ENSG_ORPHAN" });

    expect(profile.available).toBe(false);
    expect(profile.tissues).toEqual([]);
    expect(profile.primaryTpm).toBeNull();
    expect(profile.tau).toBeNull();
    expect(profile.reason).toMatch(/no GTEx/i);
  });

  test("reports no data when the gene cannot be identified", async () => {
    const spy = jest.spyOn(openTargets, "otGraphql");
    const profile = await getTargetExpressionProfile("NOID");
    expect(profile.available).toBe(false);
    expect(profile.reason).toMatch(/Ensembl/i);
    expect(spy).not.toHaveBeenCalled();
  });

  test("reports no data when Open Targets is unreachable", async () => {
    jest.spyOn(openTargets, "otGraphql").mockRejectedValue(new Error("network down"));
    const profile = await getTargetExpressionProfile("EGFR", { ensemblId: "ENSG00000146648" });
    expect(profile.available).toBe(false);
    expect(profile.reason).toMatch(/could not be reached/i);
  });

  test("two different genes never share a fabricated profile", async () => {
    jest
      .spyOn(openTargets, "otGraphql")
      .mockResolvedValueOnce(otResponse("A", [["liver", 50, "liver"], ["lung", 1, "lung"]]))
      .mockResolvedValueOnce(otResponse("B", [["liver", 2, "liver"], ["lung", 60, "lung"]]));

    const a = await getTargetExpressionProfile("A", { ensemblId: "ENSG_A" });
    const b = await getTargetExpressionProfile("B", { ensemblId: "ENSG_B" });
    expect(a.primaryTissue).toBe("liver");
    expect(b.primaryTissue).toBe("lung");
  });
});
