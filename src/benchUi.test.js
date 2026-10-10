import { pubchemStructureImageUrl } from "./benchUi";

test("pubchemStructureImageUrl uses PUG-REST PNG endpoint", () => {
  expect(pubchemStructureImageUrl(5291)).toBe(
    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/5291/PNG"
  );
  expect(pubchemStructureImageUrl(" 123631 ")).toBe(
    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/123631/PNG"
  );
});

test("pubchemStructureImageUrl returns null for empty cid", () => {
  expect(pubchemStructureImageUrl(null)).toBeNull();
  expect(pubchemStructureImageUrl("")).toBeNull();
});
