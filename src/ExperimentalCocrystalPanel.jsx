import React, { useEffect, useState } from "react";
import CocrystalMolstarViewer from "./CocrystalMolstarViewer";
import DockingInteractionsPanel from "./DockingInteractionsPanel";
import { analyzePoseInteractions } from "./dockingInteractions";
import {
  fetchPdbText,
  parseProteinAtomsFromPdb,
  poseCentroidFromAtoms,
  selectCoCrystalLigandInstance,
} from "./pdbStructure";

/**
 * Experimental co-crystal interaction table + Mol* viewer (not docked pose).
 */
export default function ExperimentalCocrystalPanel({ caseJson, precomputedPoseBundle = null }) {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const sanity = precomputedPoseBundle?.bindingSiteSanity;
  const cocrystalLigand =
    sanity?.cocrystalLigand || precomputedPoseBundle?.experimentalCocrystal?.cocrystalLigand;

  useEffect(() => {
    if (!caseJson?.pdbId || !caseJson?.ligandCode) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const pdbText = await fetchPdbText(caseJson.pdbId);
        const protein = parseProteinAtomsFromPdb(pdbText);
        const pick = selectCoCrystalLigandInstance(pdbText, caseJson.ligandCode, protein, {
          poseCentroid: poseCentroidFromAtoms(caseJson.poseAtoms),
        });
        const analysis = analyzePoseInteractions(protein, pick.atoms, { pdbId: caseJson.pdbId });
        analysis.disclaimer =
          "Contacts are measured from the experimental co-crystal structure coordinates in the PDB entry (not from docking).";
        analysis.dataSource = "experimental_cocrystal";
        analysis.pdbId = caseJson.pdbId;
        analysis.ligandCode = caseJson.ligandCode;
        analysis.bindingSiteSanity = {
          cocrystalLigand: pick.instance,
          cocrystalLigandSelectionReason: pick.selectionReason,
          cocrystalLigandInstanceCount: pick.instanceCount,
        };
        if (!cancelled) setBundle(analysis);
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load experimental interactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseJson?.pdbId, caseJson?.ligandCode, caseJson?.poseAtoms]);

  if (error) {
    return (
      <p style={{ fontSize: "12px", color: "var(--red)" }} role="alert">
        {error}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
      <CocrystalMolstarViewer
        pdbId={caseJson.pdbId}
        ligandCode={caseJson.ligandCode}
        cocrystalLigand={cocrystalLigand || bundle?.bindingSiteSanity?.cocrystalLigand}
      />
      {loading && (
        <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: 12 }}>
          Computing experimental contact table…
        </p>
      )}
      {!loading && bundle && (
        <DockingInteractionsPanel
          interactionBundle={bundle}
          showMethodology
          title="Measured co-crystal contacts"
          experimental
        />
      )}
    </div>
  );
}
