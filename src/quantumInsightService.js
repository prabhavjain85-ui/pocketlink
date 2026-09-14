import { buildQuantumAtoms } from "./quantumGeometry";
import { buildRefusalPreview } from "./quantumInsightGate";

const QUANTUM_ENDPOINT = "/api/quantum-insight";

export async function fetchQuantumInsight({ smiles, name, signal, sizePreview } = {}) {
  const cleanSmiles = String(smiles || "").trim();
  if (!cleanSmiles) {
    throw new Error("SMILES is required to run Quantum Insight.");
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
    const clientRefusal = buildRefusalPreview(atoms.length, atoms.filter((a) => a.symbol.toUpperCase() !== "H").length);
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
