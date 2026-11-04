import React from "react";

const DIMENSION_META = [
  { key: "geneticEvidence", label: "Genetic Evidence", color: "#38bdf8" },
  { key: "pocketDruggability", label: "Pocket Druggability", color: "#a855f7" },
  { key: "structuralQuality", label: "Structural Quality", color: "#22c55e" },
  { key: "safetySpecificity", label: "Safety & Tissue Specificity", color: "#f59e0b" },
  { key: "chemicalMatter", label: "Chemical Matter Availability", color: "#ec4899" },
];

function fallbackDimensions(row) {
  if (row?.triageDimensions && typeof row.triageDimensions === "object") {
    return row.triageDimensions;
  }
  const geneticEvidence = Math.min(100, Math.round(((Number(row?.geneticScore) || 0) * 0.75 + (Number(row?.somaticScore) || 0) * 0.25) * 100));
  const pocketDruggability = row?.tractability?.hasHighConfidenceSmallMolecule
    ? 88
    : row?.tractability?.smallMolecule
      ? 68
      : 38;
  const structuralQuality = row?.uniprotId ? 80 : 52;
  const safetySpecificity =
    row?.safetyProfile === "Pan-Essential Warning"
      ? 42
      : row?.safetyProfile === "Tissue-Specific"
        ? 90
        : 76;
  const chemicalMatter =
    row?.tdl === "Tclin" ? 88 : row?.tdl === "Tchem" ? 64 : row?.drugCount > 0 ? 50 : 22;
  return {
    geneticEvidence,
    pocketDruggability,
    structuralQuality,
    safetySpecificity,
    chemicalMatter,
  };
}

export default function TargetTriageMatrix({
  rows = [],
  selectedPreviewSymbol = null,
  onInspectPocket,
  onFindStructures,
}) {
  const topFive = (Array.isArray(rows) ? rows : []).slice(0, 5);
  if (topFive.length === 0) return null;

  return (
    <div
      className="triage-matrix-card"
      data-testid="target-triage-matrix"
      style={{
        marginTop: 14,
        marginBottom: 16,
        padding: 16,
        borderRadius: 10,
        background: "rgba(15, 23, 42, 0.62)",
        border: "1px solid rgba(148, 163, 184, 0.22)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <div className="panel-eyebrow">Side-by-Side Multi-Parameter Comparison</div>
          <h4 style={{ margin: "2px 0 0", fontSize: 15 }}>
            Top-{topFive.length} Target Triage Matrix
          </h4>
        </div>
        <span className="hint" style={{ margin: 0 }}>
          Normalized 0–100 readiness across Genetics, Pocket Druggability, Structure, Safety &amp; Chemical Matter
        </span>
      </div>

      <div className="score-table-wrap">
        <table className="score-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th>Dimension / Attribute</th>
              {topFive.map((t) => (
                <th key={t.ensemblId || t.symbol}>
                  <div className="result-id">{t.symbol}</div>
                  <div className="score-title" style={{ fontWeight: 400 }}>
                    Score {(t.profileScore ?? t.noveltyScore ?? 0).toFixed(1)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="score-title" style={{ fontWeight: 600 }}>
                Pharos TDL &amp; MoA
              </td>
              {topFive.map((t) => (
                <td key={t.ensemblId || t.symbol}>
                  <span
                    className="novelty-badge"
                    style={{
                      background:
                        t.tdl === "Tclin"
                          ? "rgba(34, 197, 94, 0.15)"
                          : t.tdl === "Tchem"
                            ? "rgba(56, 189, 248, 0.15)"
                            : t.tdl === "Tbio"
                              ? "rgba(168, 85, 247, 0.15)"
                              : "rgba(148, 163, 184, 0.15)",
                      color:
                        t.tdl === "Tclin"
                          ? "#4ade80"
                          : t.tdl === "Tchem"
                            ? "#38bdf8"
                            : t.tdl === "Tbio"
                              ? "#c084fc"
                              : "#cbd5e1",
                      border: "1px solid currentColor",
                    }}
                  >
                    {t.tdl || "Tbio"}
                  </span>
                  {t.expectedMoA ? (
                    <div className="score-title" style={{ marginTop: 4 }}>
                      MoA: {t.expectedMoA}
                    </div>
                  ) : null}
                </td>
              ))}
            </tr>

            {DIMENSION_META.map((dim) => (
              <tr key={dim.key}>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{dim.label}</td>
                {topFive.map((t) => {
                  const dims = fallbackDimensions(t);
                  const val = Math.max(0, Math.min(100, Number(dims[dim.key]) || 0));
                  return (
                    <td key={`${t.ensemblId || t.symbol}-${dim.key}`}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            flex: 1,
                            height: 7,
                            borderRadius: 4,
                            background: "rgba(148, 163, 184, 0.18)",
                            overflow: "hidden",
                            minWidth: 54,
                          }}
                        >
                          <div
                            style={{
                              width: `${val}%`,
                              height: "100%",
                              background: dim.color,
                              borderRadius: 4,
                            }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: 12, minWidth: 26 }}>
                          {val}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            <tr>
              <td className="score-title" style={{ fontWeight: 600 }}>
                Essentiality &amp; Paralogs
              </td>
              {topFive.map((t) => (
                <td key={t.ensemblId || t.symbol}>
                  <div
                    className="score-title"
                    style={{
                      color:
                        t.safetyProfile === "Pan-Essential Warning"
                          ? "#f87171"
                          : t.safetyProfile === "Tissue-Specific"
                            ? "#4ade80"
                            : "#94a3b8",
                      fontWeight: 600,
                    }}
                  >
                    {t.safetyProfile || "Low Intrinsic Risk"}
                  </div>
                  {Array.isArray(t.paralogs) && t.paralogs.length > 0 ? (
                    <div className="score-title" style={{ marginTop: 2 }}>
                      Paralogs:{" "}
                      {t.paralogs
                        .slice(0, 2)
                        .map((p) => `${p.symbol} (${p.identityPct}%)`)
                        .join(", ")}
                    </div>
                  ) : (
                    <div className="score-title" style={{ marginTop: 2 }}>
                      No &gt;65% paralogs
                    </div>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <td className="score-title" style={{ fontWeight: 600 }}>
                3D Pocket &amp; Bench Handoff
              </td>
              {topFive.map((t) => {
                const isPreviewing = selectedPreviewSymbol === t.symbol;
                return (
                  <td key={t.ensemblId || t.symbol}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button
                        type="button"
                        className={"chip" + (isPreviewing ? " active" : "")}
                        onClick={() => onInspectPocket(t)}
                      >
                        {isPreviewing ? "Viewing 3D Pocket" : "3D Pocket Preview"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-target"
                        style={{ padding: "4px 8px", fontSize: 11 }}
                        onClick={() => onFindStructures(t)}
                      >
                        Stage {t.symbol}
                      </button>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
