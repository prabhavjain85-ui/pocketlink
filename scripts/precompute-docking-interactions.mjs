#!/usr/bin/env node
/**
 * Regenerate public/docking-demo/interactions/*.json using the JS classifier
 * and co-crystal ligand instance selection (author chain + resSeq).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  analyzePoseInteractions,
  evaluateBindingSiteSanity,
} from "../src/dockingInteractions.js";
import {
  fetchPdbText,
  parseProteinAtomsFromPdb,
  poseCentroidFromAtoms,
  selectCoCrystalLigandInstance,
} from "../src/pdbStructure.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CASE_DIR = path.join(ROOT, "public", "docking-demo", "cases");
const OUT_DIR = path.join(ROOT, "public", "docking-demo", "interactions");

const EXPERIMENTAL_DISCLAIMER =
  "Contacts are measured from the experimental co-crystal structure coordinates in the PDB entry (not from docking).";

function mapPocketAtoms(rows) {
  return (rows || []).map((a) => ({
    atomName: a.atomName,
    resName: a.resName,
    resSeq: a.resSeq,
    chainId: a.chainId || "A",
    x: a.x,
    y: a.y,
    z: a.z,
    element: a.element,
    isBackbone: Boolean(a.isBackbone),
  }));
}

function mapPoseAtoms(rows) {
  return (rows || []).map((a, i) => ({
    index: i,
    element: a.element || a.symbol || "C",
    x: a.x,
    y: a.y,
    z: a.z,
    atomName: a.atomName || `L${i + 1}`,
  }));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const casePath of fs.readdirSync(CASE_DIR).filter((f) => f.endsWith(".json")).sort()) {
    const caseRow = JSON.parse(fs.readFileSync(path.join(CASE_DIR, casePath), "utf8"));
    const caseId = caseRow.id;
    const pocket = mapPocketAtoms(caseRow.pocketAtoms);
    const pose = mapPoseAtoms(caseRow.poseAtoms);
    const pdbText = await fetchPdbText(caseRow.pdbId);
    const fullProtein = parseProteinAtomsFromPdb(pdbText);
    const pick = selectCoCrystalLigandInstance(pdbText, caseRow.ligandCode, fullProtein, {
      poseCentroid: poseCentroidFromAtoms(caseRow.poseAtoms),
    });
    const crystalLigand = pick.atoms;
    const sanity = evaluateBindingSiteSanity(fullProtein, crystalLigand, pose, {
      pdbId: caseRow.pdbId,
    });
    sanity.cocrystalLigand = pick.instance;
    sanity.cocrystalLigandSelectionReason = pick.selectionReason;
    sanity.cocrystalLigandInstanceCount = pick.instanceCount;

    const analysis = analyzePoseInteractions(pocket, pose, {
      fullProteinAtoms: fullProtein,
      crystalLigandAtoms: crystalLigand,
      pdbId: caseRow.pdbId,
      bindingSiteSanity: sanity,
    });

    const experimental = analyzePoseInteractions(fullProtein, crystalLigand, {
      pdbId: caseRow.pdbId,
    });
    experimental.disclaimer = EXPERIMENTAL_DISCLAIMER;
    experimental.dataSource = "experimental_cocrystal";
    experimental.pdbId = caseRow.pdbId;
    experimental.ligandCode = caseRow.ligandCode;
    experimental.cocrystalLigand = pick.instance;

    try {
      const crystalKeys = new Set(
        (experimental.interactions || []).map(
          (r) => `${r.type}|${r.resName}|${r.resSeq}|${r.proteinAtom}|${r.ligandElement}`
        )
      );
      for (const row of analysis.interactions || []) {
        row.matchesCrystal = crystalKeys.has(
          `${row.type}|${row.resName}|${row.resSeq}|${row.proteinAtom}|${row.ligandElement}`
        );
      }
      analysis.crystalInteractionCount = experimental.interactions?.length || 0;
    } catch (err) {
      analysis.crystalMatchError = String(err);
    }

    analysis.experimentalCocrystal = {
      interactionCount: experimental.interactions?.length || 0,
      bindingSiteResidueCount: experimental.bindingSiteResidues45Angstrom?.length || 0,
      cocrystalLigand: pick.instance,
    };

    const outPath = path.join(OUT_DIR, `${caseId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(analysis));
    const frac = sanity.crystalSiteRecoveryFraction;
    console.log(
      `Wrote ${outPath} (${fs.statSync(outPath).size} bytes, recovery=${frac}, ligand=${pick.instance?.instanceKey})`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
