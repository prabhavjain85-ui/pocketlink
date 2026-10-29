import React from "react";
import DockingInteractionsPanel from "./DockingInteractionsPanel";

/**
 * Measured co-crystal contact table with explicit loading / error states (never silent blank).
 */
export default function ExperimentalCocrystalContacts({
  loading = false,
  error = null,
  bundle = null,
  pocketCount = null,
  title = "Measured co-crystal contacts",
}) {
  if (loading) {
    return (
      <p
        role="status"
        style={{ fontSize: "12px", color: "var(--text-dim)", margin: "12px 0 0" }}
      >
        Computing measured protein–ligand contacts from PDB coordinates…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" style={{ fontSize: "12px", color: "var(--red, #B91C1C)", margin: "12px 0 0" }}>
        {error}
      </p>
    );
  }

  if (!bundle) {
    return (
      <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "12px 0 0" }}>
        Contact analysis did not return results for this structure.
      </p>
    );
  }

  const count = bundle.interactions?.length ?? 0;

  return (
    <>
      <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "8px 0" }}>
        Pocket residues within 4.5 Å: <span className="mono">{pocketCount ?? "—"}</span> · Measured
        contacts: <span className="mono">{count}</span>
      </p>
      <DockingInteractionsPanel
        interactionBundle={bundle}
        showMethodology
        title={title}
        experimental
      />
    </>
  );
}
