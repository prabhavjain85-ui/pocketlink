import fs from "fs";
import path from "path";

const demoDir = path.join(process.cwd(), "public/docking-demo/interactions");

function load(id) {
  return JSON.parse(fs.readFileSync(path.join(demoDir, `${id}.json`), "utf8"));
}

/**
 * Regression guard: co-crystal pocket recovery must use one ligand instance (author chain/resSeq).
 */
describe("docking demo co-crystal pocket recovery", () => {
  const cases = [
    "imatinib-1iep",
    "erlotinib-1m17",
    "sitagliptin-4ffw",
    "ruxolitinib-6vgl",
    "carazolol-3p0g",
  ];

  test.each(cases)("%s exposes sanity metadata and selected ligand", (id) => {
    const row = load(id);
    const sanity = row.bindingSiteSanity;
    expect(sanity.cocrystalLigand?.instanceKey).toMatch(/^[A-Z0-9]{1,3}\|[A-Z0-9]\|\d+$/);
    expect(sanity.cocrystalLigandInstanceCount).toBeGreaterThan(0);
    expect(row.experimentalCocrystal?.cocrystalLigand).toBeTruthy();
  });
});
