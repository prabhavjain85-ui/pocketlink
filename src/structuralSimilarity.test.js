import { getRDKit } from "../server/rdkitLoader";
import { tanimotoBits, annotateStructuralSimilarity } from "../server/structuralSimilarity";
import { scoreLibraryLocal } from "../server/scoreCandidates";

// Offline by design: the staged structure below carries the reference ligand's
// SMILES, so no RCSB lookup happens here. The network path (compId -> RCSB
// chemcomp -> SMILES) is exercised against the running app, not in unit tests.

jest.setTimeout(60000);

// 1M17 is the EGFR kinase domain with erlotinib (CCD code AQ4) bound.
const EGFR_1M17 = {
  id: "1M17",
  pdb_id: "1M17",
  queryName: "1M17",
  title: "Epidermal Growth Factor Receptor tyrosine kinase domain with 4-anilinoquinazoline inhibitor erlotinib",
  ligand: {
    present: true,
    compId: "AQ4",
    name: "erlotinib analogue",
    smiles: "COCCOc1cc2c(cc1OCCOC)ncnc2Nc3cccc(c3)C#C",
  },
  pocket: { status: "detected", available: true, residueCount: 17, hydrophobicity: 0.53 },
};

const ERLOTINIB = "COCCOc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OCCOC";
const GEFITINIB = "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1";
const CAFFEINE = "CN1C=NC2=C1C(=O)N(C(=O)N2C)C";
const ALPRAZOLAM = "Cc1nnc2n1-c1ccc(Cl)cc1C(c1ccccc1)=NC2";

/** Candidates with names the curated target rules cannot recognise. */
function anonymised() {
  return [
    { cid: "a1", name: "Compound A1", smiles: ERLOTINIB, molecularWeight: 393.4, xlogp: 2.7, hbd: 1, hba: 7, rotatableBonds: 10, tpsa: 74.7 },
    { cid: "a2", name: "Compound A2", smiles: GEFITINIB, molecularWeight: 446.9, xlogp: 3.2, hbd: 1, hba: 7, rotatableBonds: 8, tpsa: 68.7 },
    { cid: "a3", name: "Compound A3", smiles: CAFFEINE, molecularWeight: 194.2, xlogp: -0.1, hbd: 0, hba: 6, rotatableBonds: 0, tpsa: 58.4 },
    { cid: "a4", name: "Compound A4", smiles: ALPRAZOLAM, molecularWeight: 308.8, xlogp: 2.1, hbd: 0, hba: 3, rotatableBonds: 1, tpsa: 43.1 },
  ];
}

describe("structural similarity", () => {
  test("Tanimoto is computed over bits and behaves sensibly", async () => {
    const RDKit = await getRDKit();
    if (!RDKit) throw new Error("RDKit did not load");
    const fp = (smiles) => {
      const mol = RDKit.get_mol(smiles);
      const out = mol.get_morgan_fp_as_uint8array(JSON.stringify({ radius: 2, nBits: 2048 }));
      mol.delete();
      return out;
    };
    const erlotinib = fp(ERLOTINIB);
    expect(tanimotoBits(erlotinib, erlotinib)).toBe(1);

    const toGefitinib = tanimotoBits(erlotinib, fp(GEFITINIB));
    const toCaffeine = tanimotoBits(erlotinib, fp(CAFFEINE));
    expect(toGefitinib).toBeGreaterThan(toCaffeine);
    expect(toGefitinib).toBeLessThan(1);
    expect(toCaffeine).toBeGreaterThanOrEqual(0);
  });

  test("annotates candidates against the co-crystal ligand of a staged structure", async () => {
    const candidates = anonymised();
    const result = await annotateStructuralSimilarity(candidates, EGFR_1M17);

    expect(result.available).toBe(true);
    expect(result.compId).toBe("AQ4");
    expect(result.scored).toBe(4);
    // AQ4 is erlotinib, so the erlotinib candidate should be near-identical.
    expect(candidates[0].structuralSimilarity).toBeGreaterThan(0.9);
    expect(candidates[0].structuralSimilarity).toBeGreaterThan(candidates[1].structuralSimilarity);
    expect(candidates[1].structuralSimilarity).toBeGreaterThan(candidates[2].structuralSimilarity);
  });

  test("reports cleanly when the structure has no co-crystallised ligand", async () => {
    const result = await annotateStructuralSimilarity(anonymised(), { id: "1ABC", ligand: { present: false } });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/no co-crystallised ligand/i);
  });
});

describe("held-out generalisation: name rules removed", () => {
  // The curated rules recognise drugs by name, so renaming the compounds
  // removes that signal entirely. What is left is what actually generalises.
  test("without similarity, anonymised compounds are indistinguishable on target fit", () => {
    const ranking = scoreLibraryLocal(anonymised(), EGFR_1M17).ranking;
    const byCid = Object.fromEntries(ranking.map((r) => [r.cid, r]));
    // The known EGFR inhibitor gets no credit over the unrelated stimulant,
    // because neither name appears in the target rules.
    expect(byCid.a1.score).toBeLessThan(40);
    expect(ranking.every((r) => !/target match/i.test(r.reasoning.join(" ")))).toBe(true);
  });

  test("with similarity, the co-crystal analogue is recovered without using its name", async () => {
    const candidates = anonymised();
    await annotateStructuralSimilarity(candidates, EGFR_1M17);
    const ranking = scoreLibraryLocal(candidates, EGFR_1M17).ranking;

    expect(ranking[0].cid).toBe("a1");
    expect(ranking[1].cid).toBe("a2");
    const byCid = Object.fromEntries(ranking.map((r) => [r.cid, r]));
    expect(byCid.a1.score).toBeGreaterThan(byCid.a3.score + 20);
    expect(byCid.a1.reasoning.join(" ")).toMatch(/structural similarity/i);
  });

  test("named drugs keep the score they had before similarity was added", () => {
    const named = [
      { cid: "176870", name: "Erlotinib", class: "kinase inhibitor", smiles: ERLOTINIB, molecularWeight: 393.4, xlogp: 2.7, hbd: 1, hba: 7, rotatableBonds: 10, tpsa: 74.7 },
      { cid: "2519", name: "Caffeine", smiles: CAFFEINE, molecularWeight: 194.2, xlogp: -0.1, hbd: 0, hba: 6, rotatableBonds: 0, tpsa: 58.4 },
    ];
    const before = scoreLibraryLocal(named, EGFR_1M17).ranking;
    expect(before[0].cid).toBe("176870");
    expect(before[0].score).toBeGreaterThanOrEqual(90);
  });

  test("equal scores share a rank instead of being split alphabetically", () => {
    const twins = [
      { cid: "zzz", name: "Compound Z", smiles: CAFFEINE, molecularWeight: 194.2, xlogp: -0.1, hbd: 0, hba: 6, rotatableBonds: 0, tpsa: 58.4 },
      { cid: "aaa", name: "Compound A", smiles: CAFFEINE, molecularWeight: 194.2, xlogp: -0.1, hbd: 0, hba: 6, rotatableBonds: 0, tpsa: 58.4 },
    ];
    const ranking = scoreLibraryLocal(twins, EGFR_1M17).ranking;
    expect(ranking[0].score).toBe(ranking[1].score);
    expect(ranking[0].rank).toBe(ranking[1].rank);
    expect(ranking[1].tiedWithPrevious).toBe(true);
  });
});
