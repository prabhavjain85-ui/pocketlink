/**
 * Server-side Vina docking client (PR B). Gated validated targets only.
 * See benchmark/vina_validated_targets.json and api/dock-vina.js.
 */

const VALIDATED = [
  { targetId: "abl1", pdbId: "1IEP", label: "ABL1" },
  { targetId: "erbb2", pdbId: "3PP0", label: "HER2 (ERBB2)" },
  { targetId: "ptgs2", pdbId: "1CX2", label: "COX-2" },
  { targetId: "pde5a", pdbId: "1UDT", label: "PDE5A" },
  { targetId: "esr1", pdbId: "3ERT", label: "ESR1" },
  { targetId: "dpp4", pdbId: "4A5S", label: "DPP4" },
  { targetId: "jak2", pdbId: "4JI9", label: "JAK2" },
  { targetId: "thrombin", pdbId: "1PPB", label: "Thrombin" },
];

export const VINA_NOT_VALIDATED_MESSAGE =
  "Docking not validated for this target. Server-side Vina is only enabled where co-crystal redocking in-place RMSD < 2 Å.";

export function validatedTargetForPdb(pdbId) {
  const id = (pdbId || "").trim().toUpperCase();
  return VALIDATED.find((t) => t.pdbId === id) || null;
}

export function isPdbVinaValidated(pdbId) {
  return Boolean(validatedTargetForPdb(pdbId));
}

export async function dockViaServerVina({ targetId, smiles, exhaustiveness = 8 }) {
  const res = await fetch("/api/dock-vina", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target_id: targetId, smiles, exhaustiveness }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Dock API HTTP ${res.status}`);
  }
  return data;
}
