import { calculateAdmeProperties } from "./admeCalculator";
import { getRDKit } from "./rdkitLoader";
import { scoreEvolvedMolecule } from "./evolutionScore";

const { scoreOne } = require("./scoreCandidates");

const SEEDS = [
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(C(C)C(=O)O)cc1" },
  { name: "Naproxen", smiles: "COc1ccc2cc(C(C)C(=O)O)ccc2c1" },
];

function candidateFromAdme(smiles, adme) {
  const p = adme?.properties || {};
  return {
    IsomericSMILES: smiles,
    CanonicalSMILES: adme?.canonicalSmiles || smiles,
    MolecularWeight: p.mw,
    XLogP: p.logp,
    HBondDonorCount: p.hbd,
    HBondAcceptorCount: p.hba,
    RotatableBondCount: p.rotb,
    TPSA: p.tpsa,
  };
}

test("target-free old scoreOne vs new desirability (logged for release notes)", async () => {
  const RDKit = await getRDKit();
  const rows = [];
  for (const seed of SEEDS) {
    const adme = await calculateAdmeProperties(seed.smiles, { name: seed.name });
    const cand = candidateFromAdme(seed.smiles, adme);
    const old = scoreOne(cand, null);
    const neu = await scoreEvolvedMolecule({
      smiles: seed.smiles,
      parentSmiles: null,
      referenceSmiles: null,
      protein: null,
      RDKit,
      operator: "seed",
    });
    rows.push({
      name: seed.name,
      oldScore: Number(old?.score ?? 0),
      newScore: neu.ok ? neu.fitness?.displayScore ?? neu.displayScore : null,
      gated: !neu.ok,
    });
  }
  // eslint-disable-next-line no-console
  console.log("[evolution-score-compare]", JSON.stringify(rows, null, 2));
  expect(rows.every((r) => r.oldScore > 0)).toBe(true);
  expect(rows.every((r) => r.newScore != null)).toBe(true);
});
