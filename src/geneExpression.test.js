import { getTargetExpressionProfile, MAJOR_TISSUES } from "./geneExpression";

describe("geneExpression module", () => {
  test("MAJOR_TISSUES contains expected vital organs", () => {
    expect(MAJOR_TISSUES.length).toBeGreaterThanOrEqual(10);
    const ids = MAJOR_TISSUES.map((t) => t.id);
    expect(ids).toContain("liver");
    expect(ids).toContain("brain");
    expect(ids).toContain("heart");
    expect(ids).toContain("lung");
    expect(ids).toContain("bone_marrow");
  });

  test("retrieves curated profile for PCSK9 with high liver specificity", () => {
    const profile = getTargetExpressionProfile("PCSK9");
    expect(profile.symbol).toBe("PCSK9");
    expect(profile.specificity).toBe("enriched");
    expect(profile.primaryTissue).toBe("Liver");
    expect(profile.riskLevel).toBe("lower");
    expect(profile.synthesis).toContain("Liver");
    expect(profile.synthesis).toContain("lower risk");
    expect(profile.tissues[0].id).toBe("liver");
  });

  test("retrieves curated profile for TP53 with ubiquitous distribution", () => {
    const profile = getTargetExpressionProfile("TP53");
    expect(profile.symbol).toBe("TP53");
    expect(profile.specificity).toBe("ubiquitous");
    expect(profile.riskLevel).toBe("higher");
    expect(profile.synthesis).toContain("broad, ubiquitous expression");
  });

  test("generates deterministic realistic fallback profile for unknown target", () => {
    const profileA = getTargetExpressionProfile("UNKNOWN99");
    const profileB = getTargetExpressionProfile("UNKNOWN99");
    expect(profileA.symbol).toBe("UNKNOWN99");
    expect(profileA.primaryTissue).toBe(profileB.primaryTissue);
    expect(profileA.primaryTpm).toBe(profileB.primaryTpm);
    expect(profileA.tissues.length).toBe(MAJOR_TISSUES.length);
    expect(profileA.synthesis.length).toBeGreaterThan(20);
  });
});
