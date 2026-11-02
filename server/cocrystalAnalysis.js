import { analyzePoseInteractions } from "./dockingInteractions.js";
import {
  fetchPdbText,
  groupHetatmLigandInstances,
  parseProteinAtomsFromPdb,
  poseCentroidFromAtoms,
  selectCoCrystalLigandInstance,
} from "./pdbStructure.js";

export const EXPERIMENTAL_COCOCRYSTAL_DISCLAIMER =
  "Contacts are measured from the experimental co-crystal structure coordinates in the PDB entry (not from docking).";

/**
 * @param {object} [instancePick] { chainId, resSeq } — force a specific HETATM instance
 */
export function analyzeExperimentalCocrystalFromPdbText(pdbText, pdbId, ligandCode, options = {}) {
  const protein = parseProteinAtomsFromPdb(pdbText);
  const instances = groupHetatmLigandInstances(pdbText, ligandCode);
  if (!instances.length) {
    return {
      ok: false,
      error: `No HETATM records for ligand ${ligandCode} in ${pdbId}.`,
      instances: [],
    };
  }

  let pick;
  if (options.instancePick?.chainId != null && options.instancePick?.resSeq != null) {
    const key = `${String(ligandCode).toUpperCase()}|${options.instancePick.chainId}|${options.instancePick.resSeq}`;
    const inst = instances.find((i) => i.instanceKey === key);
    if (!inst) {
      return {
        ok: false,
        error: `Ligand instance ${options.instancePick.chainId} ${options.instancePick.resSeq} not found in ${pdbId}.`,
        instances: instances.map((i) => ({
          chainId: i.chainId,
          resSeq: i.resSeq,
          heavyAtomCount: i.atoms.length,
        })),
      };
    }
    pick = {
      instance: {
        ligandCode: inst.ligandCode,
        chainId: inst.chainId,
        resSeq: inst.resSeq,
        instanceKey: inst.instanceKey,
        heavyAtomCount: inst.atoms.length,
      },
      atoms: inst.atoms,
      selectionReason: "user_selected_instance",
      instanceCount: instances.length,
    };
  } else {
    pick = selectCoCrystalLigandInstance(pdbText, ligandCode, protein, {
      poseCentroid: options.poseCentroid,
      preferredChainId: options.preferredChainId,
    });
  }

  if (!pick.atoms?.length) {
    return { ok: false, error: "Could not select a co-crystal ligand instance.", instances };
  }

  const analysis = analyzePoseInteractions(protein, pick.atoms, { pdbId });
  analysis.disclaimer = EXPERIMENTAL_COCOCRYSTAL_DISCLAIMER;
  analysis.dataSource = "experimental_cocrystal";
  analysis.pdbId = pdbId;
  analysis.ligandCode = String(ligandCode).toUpperCase();
  analysis.bindingSiteSanity = {
    cocrystalLigand: pick.instance,
    cocrystalLigandSelectionReason: pick.selectionReason,
    cocrystalLigandInstanceCount: pick.instanceCount,
    focusCenter: poseCentroidFromAtoms(pick.atoms),
  };

  return {
    ok: true,
    bundle: analysis,
    pocketResidueCount: analysis.bindingSiteResidues45Angstrom?.length ?? 0,
    interactionCount: analysis.interactions?.length ?? 0,
    instances: instances.map((i) => ({
      chainId: i.chainId,
      resSeq: i.resSeq,
      heavyAtomCount: i.atoms.length,
      instanceKey: i.instanceKey,
    })),
    pick: pick.instance,
  };
}

export async function analyzeExperimentalCocrystal(pdbId, ligandCode, options = {}) {
  const pdbText = options.pdbText || (await fetchPdbText(pdbId));
  return analyzeExperimentalCocrystalFromPdbText(pdbText, pdbId, ligandCode, options);
}
