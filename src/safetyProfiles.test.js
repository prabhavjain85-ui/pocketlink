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

  test("uncurated drugs are flagged as estimates and invent no safety data", () => {
    const drug = { cid: "999988", name: "NovelRepurposingLead", indication: "Hypertension", class: "kinase inhibitor" };
    const profile = getDrugSafetyProfile(drug);
    expect(profile.cid).toBe("999988");
    expect(profile.isEstimate).toBe(true);
    expect(profile.synthesis).toContain("No curated pharmacovigilance record");
    expect(profile.synthesis).not.toMatch(/established safety profile/i);
    // No fabricated report counts, frequencies, approval year or boxed warning.
    expect(profile.approvalYear).toBeNull();
    expect(profile.hasBoxedWarning).toBe(false);
    for (const event of profile.topEvents) {
      expect(event.count).toBeNull();
      expect(event.frequency).toBeNull();
    }
  });

  test("uncurated profiles never vary with the compound id", () => {
    const base = { name: "X", indication: "Hypertension", class: "kinase inhibitor" };
    const a = getDrugSafetyProfile({ ...base, cid: "111111" });
    const b = getDrugSafetyProfile({ ...base, cid: "999999" });
    expect(a.safetyCategory).toBe(b.safetyCategory);
    expect(a.topEvents).toEqual(b.topEvents);
  });

  test("curated profiles keep their recorded events and are not flagged as estimates", () => {
    const profile = getDrugSafetyProfile({ cid: "5291", name: "Imatinib" });
    expect(profile.isEstimate).toBe(false);
    expect(profile.topEvents[0].count).toBeTruthy();
  });
});
