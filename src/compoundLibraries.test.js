import { pubchemStructureImageUrl } from "./benchUi";
import {
  DEFAULT_LIBRARY_ID,
  hasLibrary,
  listCompoundLibraries,
  resolveLibraryId,
} from "../server/compoundLibraries";
import { getDailyScreen, rememberDailyScreen, clearDailyScreens } from "../server/repurposingScreen";

describe("compound library registry", () => {
  test("lists both libraries with the metadata the picker needs", () => {
    const libs = listCompoundLibraries();
    const ids = libs.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(["approved", "clinical"]));
    for (const lib of libs) {
      expect(lib.label).toBeTruthy();
      expect(lib.source).toBeTruthy();
      expect(lib.license).toMatch(/CC BY-SA/i);
      expect(lib.approxCount).toBeGreaterThan(0);
    }
  });

  test("unknown ids fall back to the default rather than throwing", () => {
    expect(hasLibrary("clinical")).toBe(true);
    expect(hasLibrary("nope")).toBe(false);
    expect(resolveLibraryId("nope")).toBe(DEFAULT_LIBRARY_ID);
    expect(resolveLibraryId("")).toBe(DEFAULT_LIBRARY_ID);
    expect(resolveLibraryId("clinical")).toBe("clinical");
  });

  test("the catalogue never leaks compound rows to the browser", () => {
    for (const lib of listCompoundLibraries()) {
      expect(lib).not.toHaveProperty("rows");
      expect(lib).not.toHaveProperty("compounds");
    }
  });
});

describe("daily screen cache is keyed per library", () => {
  beforeEach(() => clearDailyScreens());

  test("two libraries screened against one target do not overwrite each other", () => {
    const payload = (name) => ({
      ranking: [{ cid: "1", name, score: 90, reasoning: [] }],
      librarySize: 10,
    });
    rememberDailyScreen("1M17", payload("FromApproved"), "approved");
    rememberDailyScreen("1M17", payload("FromClinical"), "clinical");

    expect(getDailyScreen("1M17", "approved").ranking[0].name).toBe("FromApproved");
    expect(getDailyScreen("1M17", "clinical").ranking[0].name).toBe("FromClinical");
  });

  test("an unknown library id reads back as the default, not as a miss", () => {
    rememberDailyScreen("1M17", { ranking: [{ cid: "1", name: "X", score: 1 }], librarySize: 1 }, "approved");
    expect(getDailyScreen("1M17", "bogus")).toBeTruthy();
  });
});

describe("structure images for library compounds", () => {
  test("numeric PubChem CIDs get a PubChem URL", () => {
    expect(pubchemStructureImageUrl("176870")).toContain("/compound/cid/176870/PNG");
  });

  test("ChEMBL ids get no PubChem URL, so the RDKit fallback draws them", () => {
    // Requesting these from PubChem returned HTTP 400 for every library row.
    expect(pubchemStructureImageUrl("CHEMBL553")).toBeNull();
    expect(pubchemStructureImageUrl("")).toBeNull();
    expect(pubchemStructureImageUrl(null)).toBeNull();
  });
});
