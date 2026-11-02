import { getDrugSafetyProfile, SAFETY_INTRO, LIMITATION_NOTE } from "../server/safetyProfiles";

describe("safetyProfiles module", () => {
  test("exports standard intro and limitation note", () => {
    expect(SAFETY_INTRO).toContain("real-world");
    expect(LIMITATION_NOTE).toContain("voluntary");
    expect(LIMITATION_NOTE).toContain("not prove clinical causation");
  });

  test("retrieves curated profile for Imatinib (CID 5291)", () => {
    const profile = getDrugSafetyProfile({ cid: "5291", name: "Imatinib" });
    expect(profile.cid).toBe("5291");
    expect(profile.name).toBe("Imatinib");
    expect(profile.safetyCategory).toBe("well_tolerated");
    expect(profile.topEvents.length).toBeGreaterThanOrEqual(3);
    expect(profile.topEvents[0].term).toContain("Fluid retention");
    expect(profile.synthesis).toContain("established safety profile");
    expect(profile.hasBoxedWarning).toBe(false);
  });

  test("retrieves boxed warning alert for Alprazolam (CID 2118)", () => {
    const profile = getDrugSafetyProfile({ cid: "2118", name: "Alprazolam" });
    expect(profile.hasBoxedWarning).toBe(true);
    expect(profile.safetyCategory).toBe("boxed_warning");
    expect(profile.boxedWarning).toContain("Boxed warning");
  });

  test("generates deterministic fallback profile for uncurated drug", () => {
    const drug = { cid: "999988", name: "NovelRepurposingLead", indication: "Hypertension", class: "kinase inhibitor" };
    const profile = getDrugSafetyProfile(drug);
    expect(profile.cid).toBe("999988");
    expect(profile.synthesis).toContain("established safety profile from its approved use for Hypertension");
    expect(profile.topEvents.length).toBeGreaterThanOrEqual(2);
  });
});
