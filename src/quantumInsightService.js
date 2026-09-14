import { buildQuantumAtoms } from "./quantumGeometry";
import { buildRefusalPreview } from "./quantumInsightGate";

const QUANTUM_ENDPOINT = "/api/quantum-insight";

export async function fetchQuantumInsight({
  smiles,
  name,
  signal,
  sizePreview,
  fragmentPlan = null,
} = {}) {
  const cleanSmiles = String(smiles || "").trim();
  if (!cleanSmiles) {
    throw new Error("SMILES is required to run Quantum Insight.");
  }

  if (fragmentPlan) {
    return fetchQuantumFragmentInsight({ fragmentPlan, name, signal });
  }

  if (sizePreview?.overLimit && sizePreview.refusal) {
    const err = new Error(sizePreview.refusal.error);
    err.status = 422;
    err.payload = sizePreview.refusal;
    throw err;
  }

  const payload = { smiles: cleanSmiles };
  if (name) payload.name = String(name).trim();

  const atoms = await buildQuantumAtoms(cleanSmiles);
  if (atoms) {
    const clientRefusal = buildRefusalPreview(
      atoms.length,
      atoms.filter((a) => a.symbol.toUpperCase() !== "H").length
    );
    if (clientRefusal) {
      const err = new Error(clientRefusal.error);
      err.status = 422;
      err.payload = clientRefusal;
      throw err;
    }
    payload.atoms = atoms;
  }

  const response = await fetch(QUANTUM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  return parseQuantumResponse(response);
}

export async function fetchQuantumFragmentInsight({ fragmentPlan, name, signal } = {}) {
  if (!fragmentPlan?.geometry) {
    throw new Error("Fragment geometry is required for pocket-contact VQE.");
  }

  if (fragmentPlan.refusal) {
    const err = new Error(fragmentPlan.refusal.error);
    err.status = 422;
    err.payload = fragmentPlan.refusal;
    throw err;
  }

  const payload = {
    fragment: true,
    geometry: fragmentPlan.geometry,
    parent_smiles: fragmentPlan.parent_smiles,
    fragment_atoms: fragmentPlan.fragment_atoms,
    fragment_formula: fragmentPlan.formula,
    contact_residue: fragmentPlan.contact_residue || null,
    selection_source: fragmentPlan.selection_source,
  };
  if (name) payload.name = String(name).trim();
  if (fragmentPlan.atoms) payload.atoms = fragmentPlan.atoms;

  const response = await fetch(QUANTUM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  return parseQuantumResponse(response);
}

async function parseQuantumResponse(response) {
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    const message =
      body.error ||
      (Array.isArray(body.reasons) ? body.reasons.join(" ") : null) ||
      `Quantum Insight request failed (${response.status}).`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = body;
    throw err;
  }

  return body;
}
