import { analyzeExperimentalCocrystal } from "./cocrystalAnalysis";
import { DOCKING_REFERENCE_TARGETS } from "./dockingEngine";
import { DRUG_NAME_TO_CCD, listDrugLikeLigandsInEntry } from "./rcsbCocrystalSearch";

/** @param {string} referenceLigand e.g. "STI (Imatinib)" or "AQ4 (Erlotinib)" */
export function ligandCodeFromReferenceLigand(referenceLigand) {
  const raw = String(referenceLigand || "").trim();
  const m = raw.match(/^([A-Z0-9]{1,3})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function dockingPresetForPdb(pdbId) {
  const id = String(pdbId || "").trim().toUpperCase();
  return DOCKING_REFERENCE_TARGETS.find((t) => t.id.toUpperCase() === id) || null;
}

/**
 * Choose a CCD ligand code present in this PDB entry (never invent a ligand not in the entry).
 * @param {{ compoundName?: string, entryLigands?: { compId: string, name?: string }[], preset?: object|null }} params
 */
export function pickCocrystalLigandForDocking({ compoundName, entryLigands = [], preset = null }) {
  const ligands = entryLigands.map((l) => ({
    compId: String(l.compId || "").toUpperCase(),
    name: l.name || l.compId,
  }));
  const has = (code) => ligands.some((l) => l.compId === code);
  const nameLower = String(compoundName || "").toLowerCase().trim();

  const presetCode = preset ? ligandCodeFromReferenceLigand(preset.referenceLigand) : null;
  if (presetCode && has(presetCode)) {
    return { ligandCode: presetCode, source: "preset", warning: null };
  }

  if (nameLower && DRUG_NAME_TO_CCD[nameLower] && has(DRUG_NAME_TO_CCD[nameLower])) {
    return { ligandCode: DRUG_NAME_TO_CCD[nameLower], source: "drug_alias", warning: null };
  }

  for (const token of nameLower.split(/[\s,/]+/).filter((t) => t.length >= 4)) {
    if (DRUG_NAME_TO_CCD[token] && has(DRUG_NAME_TO_CCD[token])) {
      return { ligandCode: DRUG_NAME_TO_CCD[token], source: "drug_alias", warning: null };
    }
  }

  if (nameLower) {
    const byName = ligands.find(
      (l) =>
        l.name.toLowerCase().includes(nameLower) || nameLower.includes(l.name.toLowerCase().slice(0, 12))
    );
    if (byName) return { ligandCode: byName.compId, source: "name_match", warning: null };
  }

  if (ligands.length === 1) {
    return { ligandCode: ligands[0].compId, source: "sole_native", warning: null };
  }

  if (ligands.length > 1) {
    return {
      ligandCode: ligands[0].compId,
      source: "first_native",
      warning: `Multiple co-crystallized ligands in this entry; showing ${ligands[0].compId} (${ligands[0].name}). Pick another ligand via co-crystal search if needed.`,
    };
  }

  return { ligandCode: null, source: "none", warning: null };
}

/**
 * Load experimental co-crystal context for the docking run target (RCSB PDB + annotated ligand).
 */
export async function fetchDockingRunCocrystalContext(pdbId, compoundName) {
  const id = String(pdbId || "").trim().toUpperCase();
  if (!id || id.length !== 4) {
    return { ok: false, pdbId: id, error: "Invalid PDB ID.", ligandCode: null, bundle: null, pocketCount: null };
  }

  const preset = dockingPresetForPdb(id);
  const entryLigands = await listDrugLikeLigandsInEntry(id);
  const pick = pickCocrystalLigandForDocking({
    compoundName,
    entryLigands,
    preset,
  });

  if (!pick.ligandCode) {
    return {
      ok: true,
      pdbId: id,
      ligandCode: null,
      bundle: null,
      pocketCount: null,
      instances: [],
      pick: null,
      warning:
        pick.warning ||
        `PDB ${id} has no annotated drug-like co-crystallized ligand. Showing the crystal structure without a ligand contact table.`,
      structureOnly: true,
    };
  }

  let pdbText;
  try {
    const { fetchPdbText } = await import("./pdbStructure");
    pdbText = await fetchPdbText(id);
  } catch (e) {
    return {
      ok: false,
      pdbId: id,
      ligandCode: pick.ligandCode,
      bundle: null,
      error: e?.message || `Could not download PDB ${id} from RCSB.`,
    };
  }

  const { analyzeExperimentalCocrystalFromPdbText } = await import("./cocrystalAnalysis");
  const result = analyzeExperimentalCocrystalFromPdbText(pdbText, id, pick.ligandCode);
  if (!result.ok) {
    return {
      ok: true,
      pdbId: id,
      ligandCode: pick.ligandCode,
      bundle: null,
      pocketCount: null,
      instances: result.instances || [],
      pick: result.pick || null,
      warning: pick.warning,
      analysisError: result.error || "Could not compute measured contacts for this ligand copy.",
      structureOnly: false,
    };
  }

  return {
    ok: true,
    pdbId: id,
    ligandCode: pick.ligandCode,
    bundle: result.bundle,
    pocketCount: result.pocketResidueCount,
    instances: result.instances || [],
    pick: result.pick,
    warning: pick.warning,
    structureOnly: false,
  };
}
