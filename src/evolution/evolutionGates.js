import { checkPainsFast } from "../painsCheck";

const ELEMENT_OK = new Set(["C", "N", "O", "S", "F", "Cl", "Br", "P", "H"]);

export function structuralAlerts(smiles, candidateForPains) {
  const pains = checkPainsFast(candidateForPains || { IsomericSMILES: smiles });
  const painsHits = (pains?.hits || []).filter((h) => h.catalog === "PAINS" || h.family === "pains");
  const brenkHits = (pains?.hits || []).filter((h) => /brenk/i.test(h.catalog || "") || h.id === "brenk");
  return {
    pains: painsHits.length,
    brenk: brenkHits.length,
    painsNames: painsHits.map((h) => h.name),
    brenkNames: brenkHits.map((h) => h.name),
    blocked: painsHits.length > 0 || brenkHits.length > 1,
  };
}

export function passesHardGates({ adme, alerts, heavyAtoms, rotb, elements }) {
  if (!adme?.valid) return { ok: false, reason: adme?.error || "ADME invalid" };
  const mw = adme.properties?.mw ?? 0;
  if (mw < 180 || mw > 600) return { ok: false, reason: `MW ${mw} outside [180,600]` };
  if (heavyAtoms < 12 || heavyAtoms > 45) return { ok: false, reason: `Heavy atoms ${heavyAtoms} outside [12,45]` };
  if (rotb > 12) return { ok: false, reason: `Rotatable bonds ${rotb} > 12` };
  if (alerts?.blocked) return { ok: false, reason: "PAINS or multiple Brenk alerts" };
  if (elements?.some((z) => !ELEMENT_OK.has(z))) return { ok: false, reason: "Element outside whitelist" };
  return { ok: true };
}
