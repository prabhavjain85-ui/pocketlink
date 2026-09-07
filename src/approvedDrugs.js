import raw from "./data/approvedDrugs.json";

let cachedDrugs = null;

export function loadApprovedDrugs() {
  if (cachedDrugs) return cachedDrugs;
  const drugs = Array.isArray(raw?.drugs) ? raw.drugs : [];
  cachedDrugs = drugs.map((drug) => ({
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
