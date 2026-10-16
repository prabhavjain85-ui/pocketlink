import React, { Suspense, useEffect, useState } from "react";
import DockingViewer from "./DockingViewer";
import {
  demoCaseToDockingResults,
  loadDockingDemoCase,
  loadDockingDemoInteractions,
  loadDockingDemoManifest,
} from "./dockingDemo";
import DockingInteractionsPanel from "./DockingInteractionsPanel";
import {
  demoCaseRedockPassLabel,
  demoCasePassesBenchmarkSanity,
  formatDemoRedockRmsdLabel,
  getBenchmarkSanityForDemoCase,
} from "./dockingBenchmarkPairs";
import { DOCKING_BENCHMARK_PAIRS_NOTICE } from "./featureFlags";

const ExperimentalCocrystalPanel = React.lazy(() => import("./ExperimentalCocrystalPanel"));

export default function DockingDemoPanel({ embedded = false, onClose = null }) {
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [caseLoading, setCaseLoading] = useState(false);
  const [demoView, setDemoView] = useState(null);
  const [activeCaseJson, setActiveCaseJson] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadDockingDemoManifest();
        if (!cancelled) {
          setManifest(data);
          const ready = (data.cases || []).filter((c) => !c.comingSoon);
          const firstReady =
            ready.find((c) => demoCasePassesBenchmarkSanity(c)) || ready[0];
          if (firstReady) setSelectedId(firstReady.id);
          else if (data.cases?.length) setSelectedId(data.cases[0].id);
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
    if (!selectedId || !manifest) return;
    const row = manifest.cases.find((c) => c.id === selectedId);
    if (row?.comingSoon) {
      setCaseLoading(false);
      setDemoView(null);
      return;
    }
    let cancelled = false;
    setCaseLoading(true);
    setDemoView(null);
    (async () => {
      try {
        const caseJson = await loadDockingDemoCase(selectedId);
        const precomputed = await loadDockingDemoInteractions(selectedId);
        if (!cancelled) {
          setActiveCaseJson(caseJson);
          setDemoView(demoCaseToDockingResults(caseJson, precomputed));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || "Failed to load demo case.");
      } finally {
        if (!cancelled) setCaseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, manifest]);

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
          <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {DOCKING_BENCHMARK_PAIRS_NOTICE}
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
                <td className="mono">{c.comingSoon ? "—" : c.scoreKcalMol}</td>
                <td className="mono">{c.comingSoon ? "—" : formatDemoRedockRmsdLabel(c)}</td>
                <td>{demoCaseRedockPassLabel(c)}</td>
                <td>
                  <button
                    type="button"
                    className={`chip ${c.id === selectedId ? "active" : ""}`}
                    onClick={() => setSelectedId(c.id)}
                    disabled={c.comingSoon}
                    style={{ fontSize: "11px", opacity: c.comingSoon ? 0.5 : 1 }}
                  >
                    {c.comingSoon ? "Soon" : "View"}
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

      {activeCase && !activeCase.comingSoon && !demoCasePassesBenchmarkSanity(activeCase) && (
        <div
          role="alert"
          style={{
            margin: "0 0 12px",
            padding: "10px 12px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--amber)",
            background: "var(--amber-bg, #FFFBEB)",
            border: "1px solid var(--amber-border, #FDE68A)",
            borderRadius: "var(--radius)",
          }}
        >
          This demo pair is flagged <strong>unreliable</strong> in the offline 25-drug benchmark (
          {getBenchmarkSanityForDemoCase(activeCase)?.pdbId || activeCase.pdbId}). Do not treat the pose or demo RMSD
          as validation.
          {activeCase.benchmarkRedockRmsdAngstrom != null && activeCase.redockRmsdAngstrom != null && (
            <>
              {" "}
              Benchmark redock RMSD: <span className="mono">{activeCase.benchmarkRedockRmsdAngstrom}</span> Å vs demo
              pose RMSD: <span className="mono">{activeCase.redockRmsdAngstrom}</span> Å.
            </>
          )}
        </div>
      )}

      {activeCase?.comingSoon && (
        <p style={{ fontSize: "13px", color: "var(--text-dim)", marginBottom: 12 }}>
          Precomputed pose for this pair is <strong>coming soon</strong> after ligand-prep QC. Other demo targets are
          available now.
        </p>
      )}

      {caseLoading && <p style={{ fontSize: "13px", color: "var(--text-dim)" }}>Loading pose…</p>}

      {!caseLoading && !activeCase?.comingSoon && demoView?.bestPose && (
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
            interactionBundle={demoView.bestPose?.interactions}
            hideAffinityOverlay
          />
          <DockingInteractionsPanel
            interactionBundle={demoView.bestPose?.interactions}
            poseRmsdAngstrom={activeCase?.redockRmsdAngstrom}
            unreliablePose={
              demoView.bestPose?.interactions?.bindingSiteSanity?.poseNotInKnownBindingSite ||
              !demoCasePassesBenchmarkSanity(activeCase) ||
              (activeCase?.redockRmsdAngstrom ?? 0) > 2
            }
          />
          {activeCaseJson && (
            <Suspense
              fallback={
                <p style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: 16 }}>
                  Loading experimental co-crystal viewer…
                </p>
              }
            >
              <ExperimentalCocrystalPanel
                caseJson={activeCaseJson}
                precomputedPoseBundle={demoView.bestPose?.interactions}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
