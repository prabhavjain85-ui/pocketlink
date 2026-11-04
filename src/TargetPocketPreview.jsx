import React, { useEffect, useRef, useState } from "react";
import { searchPdbTargets } from "./serverApi";
import {
  destroyCocrystalMolstarViewer,
  isWebGLAvailable,
  mountCocrystalMolstarViewer,
} from "./cocrystalMolstar";

export default function TargetPocketPreview({ target, onCommitToBench, onClose }) {
  const [structures, setStructures] = useState([]);
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewerReady, setViewerReady] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [showSurface, setShowSurface] = useState(true);
  const viewerContainerRef = useRef(null);
  const viewerInstanceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const symbol = target?.symbol || "";
    if (!symbol) return undefined;

    setLoading(true);
    setError("");
    setStructures([]);
    setSelectedStructure(null);

    searchPdbTargets(symbol, { uniprotId: target?.uniprotId })
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.results) ? res.results : [];
        setStructures(list);
        if (list.length > 0) {
          setSelectedStructure(list[0]);
        } else {
          setError(res?.error || `No structural models found for ${symbol}.`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || `Failed to load structural models for ${symbol}.`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target?.symbol, target?.uniprotId]);

  useEffect(() => {
    let cancelled = false;
    const struct = selectedStructure;
    const container = viewerContainerRef.current;

    if (viewerInstanceRef.current) {
      destroyCocrystalMolstarViewer(viewerInstanceRef.current);
      viewerInstanceRef.current = null;
    }

    if (!struct || !container) {
      setViewerReady(false);
      return undefined;
    }

    if (!isWebGLAvailable()) {
      setViewerReady(false);
      setViewerError("");
      return undefined;
    }

    setViewerReady(false);
    setViewerError("");

    const primaryLigand = Array.isArray(struct.ligands) && struct.ligands[0] ? struct.ligands[0] : null;
    const centerArr = Array.isArray(struct.pocketCenter) ? struct.pocketCenter : [0, 0, 0];
    const hasNonZeroCenter = centerArr.some((v) => Number(v) !== 0);
    const focusCenter = hasNonZeroCenter
      ? { x: Number(centerArr[0]) || 0, y: Number(centerArr[1]) || 0, z: Number(centerArr[2]) || 0 }
      : undefined;

    mountCocrystalMolstarViewer(container, {
      pdbId: struct.id,
      ligandCode: primaryLigand?.compId || undefined,
      pocketRadiusAngstrom: 5,
      focusCenter,
      renderPocketSurface: showSurface,
      isAlphaFold: Boolean(struct.isAlphaFold),
    })
      .then((viewer) => {
        if (cancelled) {
          destroyCocrystalMolstarViewer(viewer);
          return;
        }
        viewerInstanceRef.current = viewer;
        setViewerReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setViewerError(err?.message || "3D pocket surface preview unavailable.");
        }
      });

    return () => {
      cancelled = true;
      if (viewerInstanceRef.current) {
        destroyCocrystalMolstarViewer(viewerInstanceRef.current);
        viewerInstanceRef.current = null;
      }
    };
  }, [selectedStructure, showSurface]);

  if (!target) return null;

  const pocketCenter = Array.isArray(selectedStructure?.pocketCenter)
    ? selectedStructure.pocketCenter
    : [0, 0, 0];

  return (
    <div
      className="pocket-preview-card"
      data-testid="target-pocket-preview"
      style={{
        marginTop: 14,
        marginBottom: 16,
        padding: 16,
        borderRadius: 10,
        background: "rgba(15, 23, 42, 0.78)",
        border: "1px solid rgba(56, 189, 248, 0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div className="panel-eyebrow" style={{ color: "#38bdf8" }}>
            3D Pocket &amp; Conformation Inspector
          </div>
          <h4 style={{ margin: "2px 0 4px", fontSize: 16 }}>
            {target.symbol} — {target.name}
          </h4>
          <div className="hint" style={{ margin: 0 }}>
            Inspects binding-site druggability, missing pocket residues (&lt;5 Å), and conformational state via backend-proxied coordinates.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              cursor: "pointer",
              color: "#cbd5e1",
            }}
          >
            <input
              type="checkbox"
              checked={showSurface}
              onChange={(e) => setShowSurface(e.target.checked)}
            />
            Translucent Pocket Surface
          </label>
          {onClose ? (
            <button type="button" className="chip" onClick={onClose}>
              Close 3D Preview
            </button>
          ) : null}
        </div>
      </div>

      {loading && (
        <div className="repurpose-progress" role="status">
          <div className="repurpose-progress-label">
            Scoring experimental PDB &amp; AlphaFold DB structures for {target.symbol}…
          </div>
        </div>
      )}

      {error && !loading && <div className="error-msg">{error}</div>}

      {selectedStructure && !loading && (
        <div>
          {structures.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {structures.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  className={"chip" + (selectedStructure.id === st.id ? " active" : "")}
                  onClick={() => setSelectedStructure(st)}
                >
                  {st.id} · Score {st.score}
                  {st.conformationTag ? ` (${st.conformationTag})` : ""}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 14,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                position: "relative",
                minHeight: 280,
                borderRadius: 8,
                overflow: "hidden",
                background: "#090d16",
                border: "1px solid rgba(148, 163, 184, 0.22)",
              }}
            >
              <div
                ref={viewerContainerRef}
                data-testid="pocket-molstar-viewport"
                style={{ width: "100%", height: 280 }}
              />
              {(!isWebGLAvailable() || viewerError) && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 18,
                    textAlign: "center",
                    background:
                      "radial-gradient(circle at 50% 45%, rgba(56, 189, 248, 0.16), rgba(9, 13, 22, 0.95))",
                  }}
                >
                  <div className="mono" style={{ fontSize: 13, color: "#38bdf8", marginBottom: 6 }}>
                    {selectedStructure.isAlphaFold
                      ? `AlphaFold DB 3D Model (${selectedStructure.id})`
                      : `Experimental 3D Pocket (${selectedStructure.id})`}
                  </div>
                  <div style={{ fontSize: 12, color: "#cbd5e1", maxWidth: 360, marginBottom: 8 }}>
                    {selectedStructure.title}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: "#94a3b8" }}>
                    Pocket Centroid: [{pocketCenter.join(", ")}] Å ·{" "}
                    {showSurface ? "Translucent Surface Active" : "Ribbon + Ligand"}
                  </div>
                  {viewerError ? (
                    <div className="score-title" style={{ marginTop: 6, color: "#f87171" }}>
                      {viewerError}
                    </div>
                  ) : null}
                </div>
              )}
              {viewerReady && (
                <div
                  className="mono"
                  style={{
                    position: "absolute",
                    bottom: 8,
                    left: 10,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    background: "rgba(9, 13, 22, 0.82)",
                    color: "#e2e8f0",
                  }}
                >
                  {selectedStructure.id} · Zoomed to binding pocket (5 Å shell)
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: 14,
                borderRadius: 8,
                background: "rgba(30, 41, 59, 0.55)",
                border: "1px solid rgba(148, 163, 184, 0.18)",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="result-id" style={{ fontSize: 15 }}>
                    {selectedStructure.id}
                  </span>
                  <span className="mono score-num">
                    Selection Score: {selectedStructure.score}/100
                  </span>
                </div>
                <div className="score-title" style={{ marginTop: 4, marginBottom: 10 }}>
                  {selectedStructure.title}
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  {selectedStructure.pocketClass && (
                    <span
                      className="novelty-badge"
                      style={{
                        background: "rgba(168, 85, 247, 0.16)",
                        color: "#c084fc",
                        border: "1px solid rgba(168, 85, 247, 0.4)",
                      }}
                    >
                      Site: {selectedStructure.pocketClass}
                    </span>
                  )}
                  {selectedStructure.druggabilityTier && (
                    <span
                      className="novelty-badge"
                      style={{
                        background:
                          selectedStructure.druggabilityTier === "High Druggability"
                            ? "rgba(34, 197, 94, 0.16)"
                            : selectedStructure.druggabilityTier === "Moderate Druggability"
                              ? "rgba(250, 204, 21, 0.16)"
                              : "rgba(248, 113, 113, 0.16)",
                        color:
                          selectedStructure.druggabilityTier === "High Druggability"
                            ? "#4ade80"
                            : selectedStructure.druggabilityTier === "Moderate Druggability"
                              ? "#facc15"
                              : "#f87171",
                        border: "1px solid currentColor",
                      }}
                    >
                      {selectedStructure.druggabilityTier}
                    </span>
                  )}
                  {selectedStructure.conformationTag && (
                    <span
                      className="novelty-badge"
                      style={{
                        background: "rgba(56, 189, 248, 0.16)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.4)",
                      }}
                    >
                      State: {selectedStructure.conformationTag}
                    </span>
                  )}
                  {selectedStructure.hasMissingPocketResidues && (
                    <span
                      className="novelty-badge"
                      style={{
                        background: "rgba(239, 68, 68, 0.2)",
                        color: "#f87171",
                        border: "1px solid rgba(239, 68, 68, 0.45)",
                      }}
                    >
                      ⚠️ Missing Pocket Residues (&lt;5 Å)
                    </span>
                  )}
                </div>

                {selectedStructure.isAlphaFold && selectedStructure.plddtTier && (
                  <div
                    className="score-title"
                    style={{
                      marginBottom: 8,
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: "rgba(15, 23, 42, 0.7)",
                      border: `1px solid ${selectedStructure.plddtTier.color || "#65CBF3"}`,
                    }}
                  >
                    AlphaFold DB Confidence: <b>{selectedStructure.plddtTier.badge}</b>
                  </div>
                )}

                <div className="mono" style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 8 }}>
                  Resolution: {selectedStructure.resolution || "N/A"} · R-free:{" "}
                  {selectedStructure.rFreeLabel || "N/A"} · Completeness:{" "}
                  {selectedStructure.completenessLabel || "N/A"} · Pocket Centroid: [
                  {pocketCenter.join(", ")}]
                </div>

                <ul className="rank-bullets" style={{ margin: "6px 0 12px" }}>
                  {(selectedStructure.reasons || []).slice(0, 3).map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-target"
                  data-testid="commit-target-pocket-btn"
                  onClick={() => onCommitToBench(target, selectedStructure)}
                >
                  Commit Target &amp; Pocket to Staging Bench ({selectedStructure.id})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
