import React from "react";
import CocrystalMolstarViewer from "./CocrystalMolstarViewer";
import DockingInteractionsPanel from "./DockingInteractionsPanel";
import { DOCKING_ENABLED, DOCKING_ENGINE_ENABLED } from "./featureFlags";

export default function DockingRunCocrystalSection({
  sectionRef,
  context,
  dockingResults = null,
  dockingError = null,
}) {
  if (!context?.pdbId) return null;

  const {
    pdbId,
    ligandCode,
    bundle,
    pocketCount,
    loading,
    warning,
    analysisError,
    error: loadError,
  } = context;

  const dockingUnavailable =
    !DOCKING_ENGINE_ENABLED || (!DOCKING_ENABLED && !DOCKING_ENGINE_ENABLED);
  const showHonestNotice = dockingUnavailable || Boolean(dockingError) || !dockingResults;

  return (
    <div
      ref={sectionRef}
      id="docking-run-cocrystal"
      className="panel"
      style={{
        marginBottom: 24,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: 700 }}>
        Crystal structure for this run
      </h2>
      {showHonestNotice && (
        <p
          role="note"
          style={{
            margin: "0 0 12px",
            fontSize: "12px",
            color: "var(--amber, #B45309)",
            lineHeight: 1.55,
            padding: "10px 12px",
            background: "var(--amber-bg, #FFFBEB)",
            border: "1px solid var(--amber-border, #FDE68A)",
            borderRadius: "var(--radius)",
          }}
        >
          {dockingUnavailable
            ? "Molecular docking is under validation or disabled on this deployment. "
            : dockingError
              ? "Docking did not complete for this run. "
              : "Docking is still running or no docked pose is shown yet. "}
          The 3D view below is the <strong>experimental co-crystal</strong> from the PDB (measured
          coordinates){ligandCode ? ` with ligand ${ligandCode}` : ""}, not a computed docked pose.
        </p>
      )}
      {dockingResults && !dockingError && (
        <p style={{ margin: "0 0 12px", fontSize: "12px", color: "var(--text-dim)", lineHeight: 1.5 }}>
          Co-crystal reference is shown alongside the computed docking pose below. Measured contacts
          reflect the crystal ligand; docked poses are computational estimates.
        </p>
      )}
      {warning && (
        <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-dim)" }}>{warning}</p>
      )}
      {loading && (
        <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: 10 }}>
          Resolving co-crystallized ligand and loading structure from RCSB…
        </p>
      )}
      {(loadError || analysisError) && (
        <p role="alert" style={{ fontSize: "12px", color: "var(--red, #B91C1C)", marginBottom: 10 }}>
          {loadError || analysisError}
        </p>
      )}
      {!loading && pdbId && (
        <CocrystalMolstarViewer
          pdbId={pdbId}
          ligandCode={ligandCode || undefined}
          cocrystalLigand={bundle?.bindingSiteSanity?.cocrystalLigand}
        />
      )}
      {bundle && (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "8px 0" }}>
            Pocket residues within 4.5 Å: <span className="mono">{pocketCount}</span> · Measured contacts:{" "}
            <span className="mono">{bundle.interactions?.length ?? 0}</span>
          </p>
          <DockingInteractionsPanel
            interactionBundle={bundle}
            showMethodology
            title="Measured co-crystal contacts"
            experimental
          />
        </>
      )}
    </div>
  );
}
