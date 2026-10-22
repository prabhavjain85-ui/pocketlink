import React, { useEffect, useRef, useState } from "react";
import InlineErrorBoundary from "./InlineErrorBoundary";
import {
  destroyCocrystalMolstarViewer,
  mountCocrystalMolstarViewer,
  rcsbStructurePageUrl,
  scheduleCocrystalMolstarResize,
} from "./cocrystalMolstar";

const LEGEND = [
  { color: "#10B981", label: "Hydrogen bond" },
  { color: "#3B82F6", label: "Salt bridge" },
  { color: "#D97706", label: "Hydrophobic" },
  { color: "#A855F7", label: "π–π stacking" },
  { color: "#EC4899", label: "Cation–π" },
  { color: "#14B8A6", label: "Halogen bond" },
];

function CocrystalMolstarViewerInner({
  pdbId,
  ligandCode,
  cocrystalLigand = null,
  height = 420,
  pocketRadiusAngstrom = 5,
  focusCenter = null,
}) {
  const molstarHostRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const el = molstarHostRef.current;
    if (!el || !pdbId) return undefined;

    setStatus("loading");
    setError(null);

    (async () => {
      try {
        if (viewerRef.current) {
          await destroyCocrystalMolstarViewer(viewerRef.current);
          viewerRef.current = null;
        }
        const viewer = await mountCocrystalMolstarViewer(el, {
          pdbId,
          ligandCode,
          ligandChainId: cocrystalLigand?.chainId,
          ligandResSeq: cocrystalLigand?.resSeq,
          pocketRadiusAngstrom,
          focusCenter,
        });
        if (!cancelled) {
          viewerRef.current = viewer;
          setStatus("ready");
        } else {
          await destroyCocrystalMolstarViewer(viewer);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Could not load Mol* viewer.");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      const v = viewerRef.current;
      viewerRef.current = null;
      void destroyCocrystalMolstarViewer(v);
    };
  }, [
    pdbId,
    ligandCode,
    cocrystalLigand?.chainId,
    cocrystalLigand?.resSeq,
    cocrystalLigand?.ligandCode,
    pocketRadiusAngstrom,
    focusCenter,
  ]);

  useEffect(() => {
    if (status !== "ready" || !viewerRef.current) return undefined;
    const host = molstarHostRef.current;
    if (!host || typeof ResizeObserver === "undefined") {
      scheduleCocrystalMolstarResize(viewerRef.current);
      return undefined;
    }
    const ro = new ResizeObserver(() => {
      scheduleCocrystalMolstarResize(viewerRef.current);
    });
    ro.observe(host);
    scheduleCocrystalMolstarResize(viewerRef.current);
    return () => ro.disconnect();
  }, [status, pdbId, ligandCode]);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700 }}>
          Experimental co-crystal structure (measured)
        </h3>
        <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
          Coordinates from PDB{" "}
          <a href={rcsbStructurePageUrl(pdbId)} target="_blank" rel="noreferrer">
            {String(pdbId).toUpperCase()}
          </a>{" "}
          (RCSB). Ligand{" "}
          <span className="mono">{ligandCode}</span>
          {cocrystalLigand?.chainId && (
            <>
              {" "}
              on chain <span className="mono">{cocrystalLigand.chainId}</span> (author res{" "}
              <span className="mono">{cocrystalLigand.resSeq}</span>)
            </>
          )}
          . Pocket residues within ~{pocketRadiusAngstrom} Å shown as sticks; dashed lines are Mol* non-covalent
          interactions (H-bonds, hydrophobic, π-stacking, salt bridges, halogen bonds).
        </p>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          background: "#fff",
        }}
        aria-label={`Molstar co-crystal viewer for PDB ${pdbId}`}
      >
        <div
          ref={molstarHostRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          data-molstar-host
        />
        {status === "loading" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              color: "var(--text-dim)",
              background: "rgba(255,255,255,0.85)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            Loading structure from RCSB…
          </div>
        )}
        {status === "error" && (
          <div
            role="alert"
            style={{
              position: "absolute",
              inset: 0,
              padding: 16,
              fontSize: "12px",
              color: "var(--red, #B91C1C)",
              background: "var(--red-bg, #FEF2F2)",
              zIndex: 2,
            }}
          >
            {error}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: "11px", color: "var(--text-dim)", lineHeight: 1.6 }}>
        <strong>Interaction legend (Mol*):</strong>{" "}
        {LEGEND.map((row) => (
          <span key={row.label} style={{ marginRight: 10, whiteSpace: "nowrap" }}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: row.color,
                marginRight: 4,
                verticalAlign: "middle",
              }}
            />
            {row.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CocrystalMolstarViewer(props) {
  return (
    <InlineErrorBoundary
      fallbackMessage="The 3D co-crystal viewer failed unexpectedly. You can still use the contact table above."
      showDetail
    >
      <CocrystalMolstarViewerInner {...props} />
    </InlineErrorBoundary>
  );
}
