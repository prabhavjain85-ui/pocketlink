import { getRDKit } from "../rdkitLoader";
import { computeQEDFromSmilesAsync, preloadQedAlerts } from "./qedFromRdkit";

/**
 * Reference QED from RDKit Chem.QED.qed(mol) on the same WASM build (WEIGHT_MEAN).
 */
const REFERENCE = [
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O", qed: 0.55 },
  { name: "Paracetamol", smiles: "CC(=O)Nc1ccc(O)cc1", qed: 0.595 },
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1", qed: 0.389 },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", qed: 0.538 },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(C(C)C(=O)O)cc1", qed: 0.822 },
  { name: "Naproxen", smiles: "COc1ccc2cc(C(C)C(=O)O)ccc2c1", qed: 0.881 },
  { name: "Metformin", smiles: "CN(C)C(=N)NC(=N)N", qed: 0.249 },
  { name: "Diazepam", smiles: "CN1C(=O)CN=C(c2ccccc2)c2ccccc21", qed: 0.765 },
  { name: "Atorvastatin", smiles: "CC(C)C1=C(C(=C(N1CCC(C)C)C(=O)Nc2ccccc2F)C(=O)O)C", qed: 0.712 },
  { name: "Ciprofloxacin", smiles: "Cc1cc2c(c3c1C(=O)c1c(O)ccc(F)c1C3=O)C(=O)C=CN2C1CC1", qed: 0.72 },
  { name: "Morphine", smiles: "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5", qed: 0.703 },
  { name: "Warfarin", smiles: "CC(=O)CC(c1ccccc1)c1c(O)c2ccccc2oc1=O", qed: 0.748 },
  { name: "Ranitidine", smiles: "CN(C)CCSCc1ccc(CN(C)C)o1", qed: 0.682 },
  { name: "Loratadine", smiles: "CCOC(=O)N1CCC(=C2c3ccc(Cl)cc3CCc3cccnc32)CC1", qed: 0.705 },
  { name: "Doxorubicin", smiles: "COc1cccc2c1C(=O)c1c(O)c3c(c(O)c1C2=O)C[C@@](O)(C(=O)CO)C[C@@H]3O[C@H]1C[C@H](N)[C@H](O)[C@H](C)O1", qed: 0.276 },
  { name: "Salbutamol", smiles: "CC(C)(C)NCC(O)c1ccc(O)c(CO)c1", qed: 0.639 },
  { name: "Simvastatin", smiles: "CCC(C)(C)C(=O)O[C@H]1C[C@@H](C)C=C2C=C[C@H](C)[C@H](CC[C@@H]3C[C@@H](O)CC(=O)O3)[C@H]21", qed: 0.639 },
];

test("Bickerton QED matches RDKit reference drugs within tolerance", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  await preloadQedAlerts();
  expect(REFERENCE.length).toBeGreaterThanOrEqual(15);
  for (const row of REFERENCE) {
    const q = await computeQEDFromSmilesAsync(RDKit, row.smiles);
    expect(q).not.toBeNull();
    const diff = Math.abs(q - row.qed);
    // eslint-disable-next-line no-console
    console.log(`[qed-parity] ${row.name}: js=${q?.toFixed(3)} ref=${row.qed} Δ=${diff.toFixed(3)}`);
    expect(diff).toBeLessThanOrEqual(0.05);
  }
});
