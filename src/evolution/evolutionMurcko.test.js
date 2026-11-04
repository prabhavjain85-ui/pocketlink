import { getRDKit } from "../../server/rdkitLoader";
import { murckoScaffoldSmiles, murckoScaffoldAtomIndices } from "../../server/evolution/evolutionMurcko";

test("Murcko scaffold is a substructure of the parent", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  const parentSmi = "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";
  const scaf = murckoScaffoldSmiles(RDKit, parentSmi);
  if (!scaf.ok) throw new Error(scaf.error);
  expect(scaf.ok).toBe(true);
  expect(scaf.smiles).toBeTruthy();

  const mol = RDKit.get_mol(parentSmi);
  const q = RDKit.get_qmol(scaf.smiles);
  const match = mol.get_substruct_match(q);
  mol.delete();
  q.delete();
  expect(match).toBeTruthy();
});

test("single-ring side chains trim to the ring framework", async () => {
  const RDKit = await getRDKit();
  const scaf = murckoScaffoldSmiles(RDKit, "c1ccccc1CCO");
  if (!scaf.ok) throw new Error(scaf.error);
  expect(scaf.ok).toBe(true);
  expect(scaf.smiles).toMatch(/c1ccccc1/i);
  const mol = RDKit.get_mol("c1ccccc1CCO");
  const idx = murckoScaffoldAtomIndices(mol);
  mol.delete();
  expect(idx.length).toBe(6);
});
