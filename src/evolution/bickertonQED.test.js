import { getRDKit } from "../rdkitLoader";
import { computeQEDFromSmiles } from "../../server/evolution/qedFromRdkit";

/**
 * Reference QED values from RDKit 2024 (Bickerton ADS, WEIGHT_MEAN).
 * Generated offline via RDKit.Chem.QED.qed(mol).
 */
const REFERENCE = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O", qed: 0.55 },
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1", qed: 0.34 },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", qed: 0.57 },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(C(C)C(=O)O)cc1", qed: 0.82 },
  { name: "Naproxen", smiles: "COc1ccc2cc(C(C)C(=O)O)ccc2c1", qed: 0.79 },
];

test("Bickerton QED tracks RDKit reference drugs within tolerance", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  let within = 0;
  for (const row of REFERENCE) {
    const q = computeQEDFromSmiles(RDKit, row.smiles, { alertCount: 0 });
    expect(q).not.toBeNull();
    const diff = Math.abs(q - row.qed);
    if (diff <= 0.12) within += 1;
    // eslint-disable-next-line no-console
    console.log(`[qed-parity] ${row.name}: js=${q?.toFixed(3)} ref=${row.qed}`);
  }
  expect(within).toBeGreaterThanOrEqual(Math.floor(REFERENCE.length * 0.8));
});
