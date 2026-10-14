import { checkPainsFast } from "../painsCheck";

const ELEMENT_OK = new Set(["C", "N", "O", "S", "F", "Cl", "Br", "P", "H"]);

export function elementSymbolsFromSmiles(smiles, RDKit) {
  const raw = String(smiles || "").trim();
  if (!raw) return [];
  if (!RDKit) return ["C", "N", "O"];
  let mol = null;
  try {
    mol = RDKit.get_mol(raw);
    if (!mol) return [];
    const json = JSON.parse(mol.get_json() || "{}");
    const molBlock = json?.molecules?.[0] || {};
    const defaults = json?.defaults?.atom || {};
    const atoms = molBlock.atoms || [];
    const map = { 1: "H", 6: "C", 7: "N", 8: "O", 9: "F", 15: "P", 16: "S", 17: "Cl", 35: "Br", 53: "I" };
    const out = new Set();
    for (const a of atoms) {
      const z = a.z ?? defaults.z ?? 6;
      const sym = map[z] || `Z${z}`;
      out.add(sym);
    }
    return [...out];
  } catch {
    return [];
  } finally {
    if (mol) mol.delete();
  }
}

export function structuralAlerts(smiles, candidateForPains) {
  const pains = checkPainsFast(candidateForPains || { IsomericSMILES: smiles });
  const painsHits = (pains?.hits || pains?.alerts || []).filter(
    (h) => h.catalog === "PAINS" || h.family === "pains"
  );
  const brenkHits = (pains?.hits || pains?.alerts || []).filter(
    (h) => /brenk/i.test(h.catalog || "") || h.id === "brenk" || h.family === "brenk"
  );
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
  if (!Number.isFinite(heavyAtoms) || heavyAtoms < 12 || heavyAtoms > 45) {
    return { ok: false, reason: `Heavy atoms ${heavyAtoms} outside [12,45]` };
  }
  if (rotb > 12) return { ok: false, reason: `Rotatable bonds ${rotb} > 12` };
  if (alerts?.blocked) return { ok: false, reason: "PAINS or multiple Brenk alerts" };
  if (elements?.some((z) => !ELEMENT_OK.has(z))) return { ok: false, reason: "Element outside whitelist" };
  return { ok: true };
}
