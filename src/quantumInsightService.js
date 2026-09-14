import { buildQuantumAtoms } from "./quantumGeometry";

const QUANTUM_ENDPOINT = "/api/quantum-insight";

export async function fetchQuantumInsight({ smiles, name, signal } = {}) {
  const cleanSmiles = String(smiles || "").trim();
  if (!cleanSmiles) {
    throw new Error("SMILES is required to run Quantum Insight.");
  }

  const payload = { smiles: cleanSmiles };
  if (name) payload.name = String(name).trim();

  const atoms = await buildQuantumAtoms(cleanSmiles);
  if (atoms) {
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
