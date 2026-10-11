import { loadJsonFromPublic } from "./lazyJsonData";

let cachedDrugs = null;
let loadPromise = null;

const SUPPLEMENTAL_DRUGS = [
  {
    id: "24812758",
    cid: "24812758",
    name: "Canagliflozin",
    smiles: "Cc1ccc(Cc2ccc(s2)[C@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)cc1Cl",
    indication: "Type 2 diabetes (SGLT2 inhibitor)",
    class: "SGLT2 inhibitor",
    mw: 444.5,
    xlogp: 3.2,
    hbd: 4,
    hba: 6,
    rot: 5,
    tpsa: 118,
  },
  {
    id: "9887712",
    cid: "9887712",
    name: "Dapagliflozin",
    smiles: "CCOc1ccc(Cc2ccc([C@@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)cc2Cl)cc1",
    indication: "Type 2 diabetes (SGLT2 inhibitor)",
    class: "SGLT2 inhibitor",
    mw: 408.9,
    xlogp: 2.7,
    hbd: 4,
    hba: 6,
    rot: 6,
    tpsa: 99,
  },
  {
    id: "11949646",
    cid: "11949646",
    name: "Empagliflozin",
    smiles: "CCOc1ccc(Cc2ccc([C@@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)cc2)cc1",
    indication: "Type 2 diabetes (SGLT2 inhibitor)",
    class: "SGLT2 inhibitor",
    mw: 450.9,
    xlogp: 2.5,
    hbd: 4,
    hba: 7,
    rot: 6,
    tpsa: 108,
  },
  {
    id: "44814423",
    cid: "44814423",
    name: "Ertugliflozin",
    smiles: "CC(C)(CO)[C@@]1(Cc2ccc(cc2)Cc3ccc(Cl)cc3)O[C@@H](CO)[C@H](O)[C@@H]1O",
    indication: "Type 2 diabetes (SGLT2 inhibitor)",
    class: "SGLT2 inhibitor",
    mw: 436.9,
    xlogp: 2.4,
    hbd: 4,
    hba: 6,
    rot: 7,
    tpsa: 99,
  },
];

function mapRawToDrugs(raw) {
  const drugs = Array.isArray(raw?.drugs) ? raw.drugs : [];
  const mapped = drugs.map((drug) => ({
    id: String(drug.id || drug.cid),
    name: drug.name,
    cid: String(drug.cid),
    smiles: drug.smiles,
    indication: drug.indication || "Approved small-molecule drug",
    class: drug.class || "",
    mw: drug.mw,
    xlogp: drug.xlogp,
    hbd: drug.hbd,
    hba: drug.hba,
    rot: drug.rot,
    tpsa: drug.tpsa,
  }));
  const names = new Set(mapped.map((d) => String(d.name || "").toLowerCase()));
  for (const extra of SUPPLEMENTAL_DRUGS) {
    if (!names.has(extra.name.toLowerCase())) mapped.push(extra);
  }
  return mapped;
}

/** Test-only: seed library without fetch (see src/setupTests.js). */
export function seedApprovedDrugsForTests(raw) {
  cachedDrugs = mapRawToDrugs(raw);
  return cachedDrugs;
}

/** Fetch and parse the approved-drug library (idempotent). */
export async function ensureApprovedDrugsLoaded() {
  if (cachedDrugs) return cachedDrugs;
  if (!loadPromise) {
    loadPromise = loadJsonFromPublic("approvedDrugs.json")
      .then((raw) => {
        cachedDrugs = mapRawToDrugs(raw);
        return cachedDrugs;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function loadApprovedDrugs() {
  if (!cachedDrugs) {
    return [];
  }
  return cachedDrugs;
}

export function approvedDrugCount() {
  return loadApprovedDrugs().length;
}

export function drugToCandidate(drug) {
  return {
    CID: drug.cid,
    cid: String(drug.cid),
    displayName: drug.name,
    name: drug.name,
    IsomericSMILES: drug.smiles,
    CanonicalSMILES: drug.smiles,
    SMILES: drug.smiles,
    MolecularWeight: drug.mw,
    XLogP: drug.xlogp,
    HBondDonorCount: drug.hbd,
    HBondAcceptorCount: drug.hba,
    RotatableBondCount: drug.rot,
    TPSA: drug.tpsa,
    indication: drug.indication,
    drugClass: drug.class,
  };
}

export function findApprovedDrug(nameOrCid) {
  const q = String(nameOrCid || "").trim().toLowerCase();
  return (
    loadApprovedDrugs().find(
      (d) =>
        d.name.toLowerCase() === q ||
        String(d.cid).toLowerCase() === q ||
        String(d.id || "").toLowerCase() === q
    ) || null
  );
}
