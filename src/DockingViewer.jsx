import React, { useRef, useEffect, useState, useCallback } from "react";

// Element standard colors
const ELEMENT_COLORS = {
  C: "#0D9488", // Teal for ligand carbon
  N: "#2563EB", // Blue for nitrogen
  O: "#DC2626", // Red for oxygen
  S: "#D97706", // Amber for sulfur
  F: "#059669", // Green for fluorine
  Cl: "#059669",
  Br: "#7C2D12",
  I: "#581C87",
  H: "#94A3B8",
  DEFAULT: "#64748B",
};

const FALLBACK_CENTER = Object.freeze({ x: 0, y: 0, z: 0 });

export default function DockingViewer({
  targetName = "Target Pocket",
  ligandName = "Ligand",
  pocketAtoms = [],
  activePose = null,
  rankedPoses = [],
  onSelectPose = null,
}) {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0.35, y: -0.45 });
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showHbonds, setShowHbonds] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPocketBackbone, setShowPocketBackbone] = useState(true);

  // Compute pocket center
  const center = activePose?.center || FALLBACK_CENTER;

  // Render loop
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // High-DPI crisp clear
    ctx.clearRect(0, 0, width, height);

    // Deep dark scientific viewport background
    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      50,
      width / 2,
      height / 2,
      width / 1.2
    );
    gradient.addColorStop(0, "#0F172A"); // Slate 900
    gradient.addColorStop(1, "#020617"); // Slate 950
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 3D Projection math
    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.045 * zoom;

    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);

    const project = (x, y, z) => {
      // Relative to center
      const dx = x - center.x;
      const dy = y - center.y;
      const dz = z - center.z;

      // Rotate Y
      const x1 = dx * cosY + dz * sinY;
      const z1 = -dx * sinY + dz * cosY;

      // Rotate X
      const y2 = dy * cosX - z1 * sinX;
      const z2 = dy * sinX + z1 * cosX;

      // Orthographic/weak perspective
      const perspective = 1 + z2 * 0.015;
      const sx = cx + x1 * scale * perspective;
      const sy = cy - y2 * scale * perspective;

      return { sx, sy, depth: z2 };
    };

    // Draw grid bounding box indicator
    ctx.strokeStyle = "rgba(71, 85, 105, 0.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(cx - 120 * zoom, cy - 100 * zoom, 240 * zoom, 200 * zoom);
    ctx.setLineDash([]);

    // 1. Draw pocket atoms & wireframe
    if (showPocketBackbone && pocketAtoms.length > 0) {
      // Group atoms by residue
      const resGroups = new Map();
      for (const a of pocketAtoms) {
        const key = `${a.resName}-${a.resSeq}`;
        if (!resGroups.has(key)) resGroups.set(key, []);
        resGroups.get(key).push(a);
      }

      // Draw subtle residue sidechain bonds
      ctx.lineWidth = 1.2;
      resGroups.forEach((atoms, resName) => {
        const projected = atoms.map((a) => ({ ...a, p: project(a.x, a.y, a.z) }));

        // Connect atoms within 1.8 Å
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        for (let i = 0; i < projected.length; i++) {
          for (let j = i + 1; j < projected.length; j++) {
            const dist = Math.hypot(
              atoms[i].x - atoms[j].x,
              atoms[i].y - atoms[j].y,
              atoms[i].z - atoms[j].z
            );
            if (dist <= 1.85) {
              ctx.beginPath();
              ctx.moveTo(projected[i].p.sx, projected[i].p.sy);
              ctx.lineTo(projected[j].p.sx, projected[j].p.sy);
              ctx.stroke();
            }
          }
        }

        // Draw residue nodes
        const ca = atoms.find((a) => a.atomName === "CA") || atoms[0];
        const pCA = project(ca.x, ca.y, ca.z);

        ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
        ctx.beginPath();
        ctx.arc(pCA.sx, pCA.sy, 2.5 * zoom, 0, Math.PI * 2);
        ctx.fill();

        if (showLabels) {
          ctx.fillStyle = "rgba(203, 213, 225, 0.65)";
          ctx.font = "10px IBM Plex Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(resName, pCA.sx, pCA.sy - 6 * zoom);
        }
      });
    }

    // 2. Draw Hydrogen Bond Interaction Lines
    if (showHbonds && activePose?.hbondInteractions?.length > 0 && activePose?.atoms) {
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "#10B981"; // Emerald green for H-bonds

      for (const hb of activePose.hbondInteractions) {
        // Find corresponding residue atom
        const resMatch = pocketAtoms.find(
          (pa) => `${pa.resName}-${pa.resSeq}` === hb.residue && pa.atomName === hb.proteinAtom
        );
        // Ligand atom
        const ligIdx = parseInt(hb.ligandAtom.split("-")[1], 10) - 1;
        const ligAtom = activePose.atoms[ligIdx] || activePose.atoms[0];

        if (resMatch && ligAtom) {
          const pRes = project(resMatch.x, resMatch.y, resMatch.z);
          const pLig = project(ligAtom.x, ligAtom.y, ligAtom.z);

          ctx.beginPath();
          ctx.moveTo(pLig.sx, pLig.sy);
          ctx.lineTo(pRes.sx, pRes.sy);
          ctx.stroke();

          // Distance label in Å
          const mx = (pLig.sx + pRes.sx) / 2;
          const my = (pLig.sy + pRes.sy) / 2;
          ctx.fillStyle = "#34D399";
          ctx.font = "bold 9px IBM Plex Mono, monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${hb.distance} Å`, mx, my - 4);
        }
      }
      ctx.setLineDash([]);
    }

    // 3. Draw Docked Ligand (Ball-and-stick with z-sorting)
    if (activePose?.atoms?.length > 0) {
      const atomsWithProj = activePose.atoms.map((a, i) => ({
        ...a,
        idx: i,
        p: project(a.x, a.y, a.z),
      }));

      // Draw Ligand Bonds
      ctx.lineWidth = 2.4 * zoom;
      ctx.strokeStyle = "#94A3B8";

      for (let i = 0; i < atomsWithProj.length; i++) {
        for (let j = i + 1; j < atomsWithProj.length; j++) {
          const a1 = atomsWithProj[i];
          const a2 = atomsWithProj[j];
          const dist = Math.hypot(a1.x - a2.x, a1.y - a2.y, a1.z - a2.z);

          // Standard covalent bond distance cutoff (~1.85 Å)
          if (dist <= 1.85) {
            ctx.beginPath();
            ctx.moveTo(a1.p.sx, a1.p.sy);
            ctx.lineTo(a2.p.sx, a2.p.sy);
            ctx.stroke();
          }
        }
      }

      // Sort atoms back-to-front by depth
      atomsWithProj.sort((a, b) => a.p.depth - b.p.depth);

      // Draw Ligand Atom Spheres
      for (const a of atomsWithProj) {
        const radius = Math.max(2.5, 4.5 * zoom);
        const col = ELEMENT_COLORS[a.symbol] || ELEMENT_COLORS.DEFAULT;

        // Radial shine for 3D look
        const grad = ctx.createRadialGradient(
          a.p.sx - radius * 0.3,
          a.p.sy - radius * 0.3,
          radius * 0.2,
          a.p.sx,
          a.p.sy,
          radius
        );
        grad.addColorStop(0, "#FFFFFF");
        grad.addColorStop(0.3, col);
        grad.addColorStop(1, "#090D16");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(a.p.sx, a.p.sy, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }, [
    center,
    pocketAtoms,
    activePose,
    rotation,
    zoom,
    showHbonds,
    showLabels,
    showPocketBackbone,
  ]);

  // Redraw when state updates
  useEffect(() => {
    drawScene();
  }, [drawScene]);

  // Mouse drag handlers for 3D rotation
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setRotation((prev) => ({
      x: prev.x + dy * 0.008,
      y: prev.y + dx * 0.008,
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((prev) => Math.max(0.4, Math.min(2.8, prev * factor)));
  };

  const handleReset = () => {
    setRotation({ x: 0.35, y: -0.45 });
    setZoom(1.0);
  };

  return (
    <div
      className="docking-viewer-wrapper"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "100%",
      }}
    >
      {/* Top Header with Pose Selector and Active Pose Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
            Conformational Poses:
          </span>
          {rankedPoses.map((p) => {
            const isSelected = activePose?.rank === p.rank;
            return (
              <button
                key={p.rank}
                type="button"
                className={`chip ${isSelected ? "active" : ""}`}
                onClick={() => onSelectPose && onSelectPose(p)}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Pose {p.rank} ({p.deltaG} kcal/mol)
              </button>
            );
          })}
        </div>

        {/* Viewport Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setZoom((z) => Math.min(2.8, z * 1.2))}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setZoom((z) => Math.max(0.4, z * 0.8))}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            title="Zoom Out"
          >
            -
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
            style={{ padding: "3px 8px", fontSize: "11px" }}
            title="Reset Camera Orientation"
          >
            Reset
          </button>
        </div>
      </div>

      {/* 3D Canvas Box */}
      <div
        style={{
          position: "relative",
          borderRadius: "var(--radius)",
          overflow: "hidden",
          border: "1px solid var(--border)",
          boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.4)",
          background: "#020617",
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          style={{ width: "100%", height: "auto", display: "block" }}
        />

        {/* Viewport Overlay Info */}
        <div
          style={{
            position: "absolute",
            top: "10px",
            left: "12px",
            pointerEvents: "none",
            color: "#F8FAFC",
            fontSize: "11px",
            lineHeight: 1.4,
            textShadow: "0 1px 3px rgba(0,0,0,0.8)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px", color: "#38BDF8" }}>
            {targetName}
          </div>
          <div style={{ color: "#94A3B8" }}>Ligand: {ligandName}</div>
          {activePose && (
            <div style={{ marginTop: "4px" }}>
              <span style={{ color: "#34D399", fontWeight: 700 }}>
                Pose {activePose.rank}: {activePose.deltaG} kcal/mol
              </span>{" "}
              · Ki ≈ {activePose.kiFormatted}
            </div>
          )}
        </div>

        {/* Instructions pill */}
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            left: "12px",
            pointerEvents: "none",
            fontSize: "10px",
            color: "#64748B",
            background: "rgba(15, 23, 42, 0.7)",
            padding: "2px 6px",
            borderRadius: "4px",
          }}
        >
          Drag to rotate in 3D · Scroll to zoom
        </div>

        {/* Display Toggles */}
        <div
          style={{
            position: "absolute",
            bottom: "8px",
            right: "10px",
            display: "flex",
            gap: "6px",
            background: "rgba(15, 23, 42, 0.85)",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "10px",
            color: "#E2E8F0",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showHbonds}
              onChange={(e) => setShowHbonds(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            H-Bonds
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Residues
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPocketBackbone}
              onChange={(e) => setShowPocketBackbone(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Pocket
          </label>
        </div>
      </div>

      {/* Color Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          padding: "6px 10px",
          background: "var(--surface-subtle)",
          borderRadius: "var(--radius-sm)",
          fontSize: "11px",
          color: "var(--text-dim)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#0D9488",
              display: "inline-block",
            }}
          />
          <span>Carbon</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#2563EB",
              display: "inline-block",
            }}
          />
          <span>Nitrogen</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#DC2626",
              display: "inline-block",
            }}
          />
          <span>Oxygen</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#D97706",
              display: "inline-block",
            }}
          />
          <span>Sulfur</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span
            style={{
              width: "14px",
              height: "2px",
              borderTop: "2px dashed #10B981",
              display: "inline-block",
            }}
          />
          <span>H-Bond (≤ 3.2 Å)</span>
        </div>
      </div>
    </div>
  );
}
