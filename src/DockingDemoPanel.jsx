import React, { useEffect, useState } from "react";
import DockingViewer from "./DockingViewer";
import {
  demoCaseToDockingResults,
  loadDockingDemoCase,
  loadDockingDemoManifest,
} from "./dockingDemo";

export default function DockingDemoPanel({ embedded = false, onClose = null }) {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [demoView, setDemoView] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadDockingDemoManifest();
        if (!cancelled) {
          setManifest(data);
          if (data.cases?.length) setSelectedId(data.cases[0].id);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load demo data.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setCaseLoading(true);
    setDemoView(null);
    (async () => {
      try {
        const caseJson = await loadDockingDemoCase(selectedId);
        if (!cancelled) setDemoView(demoCaseToDockingResults(caseJson));
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load demo case.");
      } finally {
        if (!cancelled) setCaseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (error) {
    return (
      <p style={{ fontSize: "13px", color: "var(--red)" }} role="alert">
        {error}
      </p>
    );
  }

  if (!manifest) {
    return <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Loading precomputed demo…</p>;
  }

  const activeCase = manifest.cases.find((c) => c.id === selectedId);

  return (
    <div
      className="panel"
      style={{
        marginTop: embedded ? 0 : 24,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700 }}>Demo: precomputed results</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.5 }}>
            AutoDock Vina {manifest.engine?.version} (seed {manifest.engine?.seed}), box from co-crystal ligand.
            Generated {manifest.generatedAt?.slice(0, 10) || "offline"} — no live service required.
          </p>
        </div>
        {onClose && (
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: "12px" }}>
            Hide demo
          </button>
        )}
      </div>

      <div className="score-table-wrap" style={{ marginBottom: 16 }}>
        <table className="score-table" style={{ width: "100%", fontSize: "12px" }}>
          <thead>
            <tr>
              <th>Drug</th>
              <th>Target</th>
              <th>PDB</th>
              <th>Ligand</th>
              <th>ΔG (kcal/mol)</th>
              <th>Redock RMSD (Å)</th>
              <th>≤ 2.0 Å</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {manifest.cases.map((c) => (
              <tr key={c.id} style={{ background: c.id === selectedId ? "var(--primary-subtle, #F0FDF4)" : undefined }}>
                <td>{c.drug}</td>
                <td>{c.target}</td>
                <td className="mono">{c.pdbId}</td>
                <td className="mono">{c.ligandCode}</td>
                <td className="mono">{c.scoreKcalMol}</td>
                <td className="mono">{c.redockRmsdAngstrom}</td>
                <td>{c.redockPass2A ? "Pass" : "Fail"}</td>
                <td>
                  <button
                    type="button"
                    className={`chip ${c.id === selectedId ? "active" : ""}`}
                    onClick={() => setSelectedId(c.id)}
                    style={{ fontSize: "11px" }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activeCase?.notes && (
        <p style={{ margin: "0 0 12px", fontSize: "11px", color: "var(--text-muted)" }}>{activeCase.notes}</p>
      )}

      {caseLoading && <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Loading pose…</p>}

      {!caseLoading && demoView?.bestPose && (
        <>
          <p style={{ margin: "0 0 10px", fontSize: "12px", color: "var(--text-dim)" }}>
            Pose file:{" "}
            <a href={`/docking-demo/${activeCase?.poseFile}`} download>
              {activeCase?.poseFile}
            </a>
          </p>
          <DockingViewer
            targetName={`${activeCase?.target} (${activeCase?.pdbId})`}
            ligandName={activeCase?.drug}
            pocketAtoms={demoView.pocketAtoms}
            activePose={demoView.bestPose}
            rankedPoses={demoView.rankedPoses}
          />
        </>
      )}
    </div>
  );
}
