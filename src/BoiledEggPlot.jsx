import React, { useMemo, useState } from "react";
import { BOILED_EGG_GEOMETRY } from "./shared/admeDisplay";

/**
 * Generate an SVG path string for a rotated ellipse
 */
function generateEllipseSvgPath(ellipse, toSvgX, toSvgY, points = 72) {
  const { cx, cy, a, b, theta } = ellipse;
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const phi = (i / points) * 2 * Math.PI;
    const x =
      cx + a * Math.cos(phi) * Math.cos(theta) - b * Math.sin(phi) * Math.sin(theta);
    const y =
      cy + a * Math.cos(phi) * Math.sin(theta) + b * Math.sin(phi) * Math.cos(theta);
    const sx = toSvgX(x);
    const sy = toSvgY(y);
    coords.push(`${i === 0 ? "M" : "L"} ${sx.toFixed(1)},${sy.toFixed(1)}`);
  }
  coords.push("Z");
  return coords.join(" ");
}

/**
 * Interactive BOILED-Egg plot component (TPSA vs LogP)
 * Based on Daina & Zoete, ChemMedChem 2016, 11(11): 1117-1121.
 */
export default function BoiledEggPlot({ tpsa = 0, logp = 0, compoundName = "Molecule" }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // SVG canvas bounds and chart coordinates
  const width = 520;
  const height = 360;
  const margin = { top: 24, right: 30, bottom: 44, left: 62 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Domain ranges (TPSA: 0 to 160 Å², LogP: -3 to +7)
  const xMin = 0;
  const xMax = 160;
  const yMin = -3.0;
  const yMax = 7.0;

  const toSvgX = (xVal) =>
    margin.left + Math.max(0, Math.min(innerWidth, ((xVal - xMin) / (xMax - xMin)) * innerWidth));

  const toSvgY = (yVal) =>
    margin.top +
    Math.max(0, Math.min(innerHeight, ((yMax - yVal) / (yMax - yMin)) * innerHeight));

  // Ellipse paths
  const hiaPath = useMemo(
    () => generateEllipseSvgPath(BOILED_EGG_GEOMETRY.hia, toSvgX, toSvgY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const bbbPath = useMemo(
    () => generateEllipseSvgPath(BOILED_EGG_GEOMETRY.bbb, toSvgX, toSvgY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Ticks
  const xTicks = [0, 25, 50, 75, 100, 125, 150];
  const yTicks = [-2, 0, 2, 4, 6];

  // Active compound point coordinates
  const markerX = toSvgX(tpsa);
  const markerY = toSvgY(logp);

  return (
    <div className="boiled-egg-container" style={{ width: "100%", maxWidth: "560px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
          BOILED-Egg Absorption Space
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Daina &amp; Zoete (2016)
        </div>
      </div>

      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "8px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="BOILED-Egg Gastrointestinal Absorption and Brain Permeation Model"
        >
          {/* Background Grey: Low passive absorption zone */}
          <rect
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            fill="#F1F5F9"
            rx="4"
          />

          {/* Grid lines */}
          {xTicks.map((val) => (
            <line
              key={`grid-x-${val}`}
              x1={toSvgX(val)}
              y1={margin.top}
              x2={toSvgX(val)}
              y2={margin.top + innerHeight}
              stroke="#E2E8F0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}
          {yTicks.map((val) => (
            <line
              key={`grid-y-${val}`}
              x1={margin.left}
              y1={toSvgY(val)}
              x2={margin.left + innerWidth}
              y2={toSvgY(val)}
              stroke="#E2E8F0"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          ))}

          {/* Zone 1: HIA (White Ellipse) */}
          <path
            d={hiaPath}
            fill="#FFFFFF"
            stroke="#94A3B8"
            strokeWidth="1.5"
            strokeDasharray="none"
          />

          {/* Zone 2: BBB Yolk (Yellow/Amber Ellipse) */}
          <path
            d={bbbPath}
            fill="#FEF3C7"
            stroke="#D97706"
            strokeWidth="1.5"
            strokeDasharray="none"
          />

          {/* Region Text Labels */}
          <text
            x={toSvgX(102)}
            y={toSvgY(1.8)}
            fontSize="11"
            fontWeight="600"
            fill="#64748B"
            textAnchor="middle"
          >
            HIA (White)
          </text>
          <text
            x={toSvgX(38)}
            y={toSvgY(2.6)}
            fontSize="11"
            fontWeight="700"
            fill="#B45309"
            textAnchor="middle"
          >
            BBB (Yolk)
          </text>
          <text
            x={toSvgX(138)}
            y={toSvgY(-1.6)}
            fontSize="10"
            fill="#94A3B8"
            textAnchor="middle"
          >
            Low Absorption
          </text>

          {/* Axis lines */}
          <line
            x1={margin.left}
            y1={margin.top + innerHeight}
            x2={margin.left + innerWidth}
            y2={margin.top + innerHeight}
            stroke="#94A3B8"
            strokeWidth="1.2"
          />
          <line
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + innerHeight}
            stroke="#94A3B8"
            strokeWidth="1.2"
          />

          {/* X Ticks & Labels */}
          {xTicks.map((val) => {
            const sx = toSvgX(val);
            return (
              <g key={`xtick-${val}`}>
                <line
                  x1={sx}
                  y1={margin.top + innerHeight}
                  x2={sx}
                  y2={margin.top + innerHeight + 4}
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
                <text
                  x={sx}
                  y={margin.top + innerHeight + 16}
                  fontSize="10"
                  fill="#64748B"
                  textAnchor="middle"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}
          <text
            x={margin.left + innerWidth / 2}
            y={height - 8}
            fontSize="11"
            fontWeight="600"
            fill="#334155"
            textAnchor="middle"
          >
            TPSA (Å²) — Topological Polar Surface Area
          </text>

          {/* Y Ticks & Labels */}
          {yTicks.map((val) => {
            const sy = toSvgY(val);
            return (
              <g key={`ytick-${val}`}>
                <line
                  x1={margin.left - 4}
                  y1={sy}
                  x2={margin.left}
                  y2={sy}
                  stroke="#94A3B8"
                  strokeWidth="1"
                />
                <text
                  x={margin.left - 8}
                  y={sy + 3}
                  fontSize="10"
                  fill="#64748B"
                  textAnchor="end"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}
          <text
            x={-(margin.top + innerHeight / 2)}
            y="14"
            fontSize="10"
            fontWeight="600"
            fill="#334155"
            textAnchor="middle"
            transform="rotate(-90)"
          >
            cLogP (Crippen; BOILED-Egg trained on WLOGP)
          </text>

          {/* Active Molecule Marker */}
          <g
            style={{ cursor: "pointer" }}
            onMouseEnter={() =>
              setHoveredPoint({
                name: compoundName,
                tpsa: tpsa.toFixed(1),
                logp: logp.toFixed(2),
              })
            }
            onMouseLeave={() => setHoveredPoint(null)}
          >
            {/* Pulsing ring halo */}
            <circle
              cx={markerX}
              cy={markerY}
              r="10"
              fill="#0F766E"
              fillOpacity="0.2"
              stroke="#0F766E"
              strokeWidth="1.5"
            />
            {/* Center dot */}
            <circle
              cx={markerX}
              cy={markerY}
              r="5"
              fill="#0F766E"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        </svg>

        {/* Hover / Point Tooltip */}
        {hoveredPoint && (
          <div
            style={{
              position: "absolute",
              top: "14px",
              right: "16px",
              background: "rgba(15, 23, 42, 0.9)",
              color: "#FFFFFF",
              padding: "6px 10px",
              borderRadius: "4px",
              fontSize: "11px",
              pointerEvents: "none",
              zIndex: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{hoveredPoint.name}</div>
            <div>TPSA: {hoveredPoint.tpsa} Å²</div>
            <div>cLogP: {hoveredPoint.logp}</div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          marginTop: "8px",
          padding: "6px 10px",
          background: "var(--surface-subtle)",
          borderRadius: "var(--radius-sm)",
          fontSize: "11px",
          color: "var(--text-dim)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#FEF3C7",
              border: "1.5px solid #D97706",
              display: "inline-block",
            }}
          />
          <span>
            <strong>Yolk:</strong> BBB Permeant &amp; High GI
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#FFFFFF",
              border: "1.5px solid #94A3B8",
              display: "inline-block",
            }}
          />
          <span>
            <strong>White:</strong> High GI Absorption
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              background: "#0F766E",
              border: "1.5px solid #FFFFFF",
              display: "inline-block",
            }}
          />
          <span>
            <strong>Point:</strong> Active Molecule
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: "6px",
          fontSize: "11px",
          color: "var(--text-muted)",
          lineHeight: 1.4,
          fontStyle: "italic",
        }}
      >
        * Note: BOILED-Egg (Daina &amp; Zoete 2016) was trained on WLOGP. Plotted using Wildman–Crippen cLogP. Transporters, active efflux (P-gp), and CYPs are not modeled.
      </div>
    </div>
  );
}
