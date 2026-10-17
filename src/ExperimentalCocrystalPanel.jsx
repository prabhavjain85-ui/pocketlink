import React, { useEffect, useState } from "react";
import CocrystalMolstarViewer from "./CocrystalMolstarViewer";
import InlineErrorBoundary from "./InlineErrorBoundary";
import DockingInteractionsPanel from "./DockingInteractionsPanel";
import { analyzeExperimentalCocrystal } from "./cocrystalAnalysis";
import { poseCentroidFromAtoms } from "./pdbStructure";

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
        const result = await analyzeExperimentalCocrystal(caseJson.pdbId, caseJson.ligandCode, {
          poseCentroid: poseCentroidFromAtoms(caseJson.poseAtoms),
        });
        if (!result.ok) throw new Error(result.error);
        if (!cancelled) setBundle(result.bundle);
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
      <InlineErrorBoundary
        fallbackMessage="Experimental co-crystal 3D viewer could not be shown for this demo pose."
        showDetail
      >
        <CocrystalMolstarViewer
          pdbId={caseJson.pdbId}
          ligandCode={caseJson.ligandCode}
          cocrystalLigand={cocrystalLigand || bundle?.bindingSiteSanity?.cocrystalLigand}
        />
      </InlineErrorBoundary>
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
