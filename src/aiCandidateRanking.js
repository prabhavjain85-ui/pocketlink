import { rankCandidatesLocal } from "./scoreCandidates";

function toApiCandidate(candidate) {
  return {
    name: candidate.displayName || candidate.IUPACName || candidate.name || `CID ${candidate.CID || candidate.cid}`,
    cid: candidate.CID ?? candidate.cid,
    smiles: candidate.IsomericSMILES || candidate.CanonicalSMILES || candidate.SMILES || candidate.smiles || "",
    molecularFormula: candidate.MolecularFormula || candidate.molecularFormula,
    molecularWeight: candidate.MolecularWeight ?? candidate.molecularWeight,
    xlogp: candidate.XLogP ?? candidate.xlogp,
    hbd: candidate.HBondDonorCount ?? candidate.hbd,
    hba: candidate.HBondAcceptorCount ?? candidate.hba,
    rotatableBonds: candidate.RotatableBondCount ?? candidate.rotatableBonds,
    tpsa: candidate.TPSA ?? candidate.tpsa,
  };
}

export async function rankCandidates(candidates, protein) {
  const payload = {
    candidates: candidates.map(toApiCandidate),
    protein: protein
      ? { id: protein.id, title: protein.title, method: protein.method, resolution: protein.resolution }
      : null,
  };

  try {
    const response = await fetch("/api/rank-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "AI analysis failed.");
    if (!data?.recommended?.cid || !Array.isArray(data.ranking)) {
      throw new Error("The AI returned an incomplete ranking.");
    }
    return data;
  } catch {
    return rankCandidatesLocal(candidates, protein);
  }
}
