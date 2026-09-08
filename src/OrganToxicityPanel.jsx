import React, { useState } from "react";
import { ORGAN_SYSTEMS } from "./organToxicity";

export default function OrganToxicityPanel({ organToxicity, onSelectPreset }) {
  const [expandedAlerts, setExpandedAlerts] = useState({});
  const [showProToxDetails, setShowProToxDetails] = useState(false);

  if (!organToxicity || !organToxicity.valid) {
    return null;
  }

  const {
    methodInfo,
    overallRisk,
    overallBadgeColor,
    totalAlerts,
    totalHighAlerts,
    totalModerateAlerts,
    organBreakdown,
  } = organToxicity;

  const toggleAlertDetails = (organId) => {
    setExpandedAlerts((prev) => ({
      ...prev,
      [organId]: !prev[organId],
    }));
  };

  return (
    <div
      className="panel"
      id="organ-toxicity-panel"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "24px",
        boxShadow: "var(--shadow-sm)",
        marginBottom: "24px",
      }}
    >
      {/* Section Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
          paddingBottom: "14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "var(--amber-bg)",
                color: "var(--amber)",
                border: "1px solid var(--amber-border)",
                letterSpacing: "0.5px",
              }}
            >
              Organ Safety Screening
            </span>
            <span
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                background:
                  overallBadgeColor === "red"
                    ? "var(--red-bg)"
                    : overallBadgeColor === "amber"
                    ? "var(--amber-bg)"
                    : "var(--green-bg)",
                color:
                  overallBadgeColor === "red"
                    ? "var(--red)"
                    : overallBadgeColor === "amber"
                    ? "var(--amber)"
                    : "var(--green)",
                fontWeight: 700,
                border: `1px solid ${
                  overallBadgeColor === "red"
                    ? "var(--red-border)"
                    : overallBadgeColor === "amber"
                    ? "var(--amber-border)"
                    : "var(--green-border)"
                }`,
              }}
            >
              {totalAlerts === 0
                ? "Structural alerts: 0"
                : `Structural alerts: ${totalAlerts} (${totalHighAlerts} high, ${totalModerateAlerts} mod)`}
            </span>
          </div>

          <h3
            style={{
              margin: "0 0 4px",
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--text)",
            }}
          >
            Organ-Specific Toxicity Risk Predictions
          </h3>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text-muted)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>
              Method: {methodInfo.methodLabel}
            </span>
            <span>•</span>
            <span style={{ color: "var(--amber)", fontWeight: 600 }}>
              Confidence: {methodInfo.confidenceLevel}
            </span>
          </div>
        </div>

        {/* ProTox API Status Toggle */}
        <button
          type="button"
          onClick={() => setShowProToxDetails((v) => !v)}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "5px 10px",
            fontSize: "11px",
            color: "var(--text-muted)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>ℹ️ ProTox-3.0 API Status</span>
          <span style={{ fontSize: "9px" }}>{showProToxDetails ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* ProTox-3.0 Investigation Note (Collapsible) */}
      {showProToxDetails && (
        <div
          style={{
            marginBottom: "18px",
            padding: "12px 14px",
            borderRadius: "var(--radius)",
            background: "var(--surface-muted)",
            border: "1px solid var(--border-light)",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--text-dim)",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>
            ProTox-3.0 API Availability Check
          </div>
          <p style={{ margin: "0 0 6px" }}>
            We checked the official ProTox-3.0 server (<code>https://tox.charite.de/protox3/</code>)
            prior to building this module. The documented sample script endpoint (
            <code>https://comptox.charite.de/protox3/protox3_api.py</code>) redirected and responded with{" "}
            <strong style={{ color: "var(--red)" }}>HTTP 404 Not Found</strong>, and no public
            REST API with CORS headers is provided by Charité.
          </p>
          <p style={{ margin: 0 }}>
            PocketLink has therefore implemented an in-browser, rule-based toxicophore alert engine
            using <strong>@rdkit/rdkit WebAssembly</strong> grounded in published medicinal chemistry
            literature. This is transparently categorized as a{" "}
            <strong>lower-confidence structural alert heuristic</strong>, avoiding overstated model certainty.
          </p>
        </div>
      )}

      {/* Honest Limitations Banner */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          padding: "12px 16px",
          borderRadius: "var(--radius)",
          background: "var(--amber-bg)",
          border: "1px solid var(--amber-border)",
          color: "var(--amber-text, #92400e)",
          fontSize: "12px",
          lineHeight: 1.5,
          marginBottom: "20px",
        }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>⚠️</span>
        <div>
          <strong style={{ display: "block", marginBottom: "2px" }}>
            Honest Limitations &amp; Computational Safety Notice:
          </strong>
          These are computational heuristic predictions meant to flag candidate liabilities for further
          investigation, <strong>not confirmed clinical toxicity data</strong>. Real organ toxicity
          depends on complex systemic exposure, in vivo pharmacokinetics, dosage, metabolism, and
          active clearance. Rule-based alerts can produce both <em>false positives</em> (e.g. approved drugs
          tolerated at clinical therapeutic doses) and <em>false negatives</em> (unflagged structural
          novelty). Rigorous in vitro/in vivo testing is required.
        </div>
      </div>

      {/* Organ-by-Organ Breakdown Grid */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        {ORGAN_SYSTEMS.map((sys) => {
          const organData = organBreakdown[sys.id] || {
            riskLevel: "Low",
            badgeColor: "green",
            summaryExplanation: "No documented structural alerts detected for this organ system.",
            alertsCount: 0,
            alerts: [],
          };

          const isExpanded = Boolean(expandedAlerts[sys.id]);
          const hasAlerts = organData.alertsCount > 0;

          // Severity colors
          const badgeBg =
            organData.badgeColor === "red"
              ? "var(--red-bg)"
              : organData.badgeColor === "amber"
              ? "var(--amber-bg)"
              : "var(--green-bg)";

          const badgeText =
            organData.badgeColor === "red"
              ? "var(--red)"
              : organData.badgeColor === "amber"
              ? "var(--amber)"
              : "var(--green)";

          const badgeBorder =
            organData.badgeColor === "red"
              ? "var(--red-border)"
              : organData.badgeColor === "amber"
              ? "var(--amber-border)"
              : "var(--green-border)";

          return (
            <div
              key={sys.id}
              id={`organ-row-${sys.id}`}
              style={{
                border: `1px solid ${hasAlerts ? badgeBorder : "var(--border)"}`,
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                padding: "14px 16px",
                transition: "border-color 0.15s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                {/* Organ Title and Icon */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      background: badgeBg,
                      border: `1px solid ${badgeBorder}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: badgeText,
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={sys.icon} />
                    </svg>
                  </div>

                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {sys.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {sys.subtitle}
                    </div>
                  </div>
                </div>

                {/* Risk Severity Badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: "20px",
                      background: badgeBg,
                      color: badgeText,
                      border: `1px solid ${badgeBorder}`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: badgeText,
                      }}
                    />
                    {organData.riskLevel} Risk
                  </span>

                  {hasAlerts && (
                    <button
                      type="button"
                      onClick={() => toggleAlertDetails(sys.id)}
                      style={{
                        background: "none",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "4px 8px",
                        fontSize: "11px",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Hide Alerts ▲" : `${organData.alertsCount} Alert${organData.alertsCount === 1 ? "" : "s"} ▼`}
                    </button>
                  )}
                </div>
              </div>

              {/* One-Line Explanation of Flag */}
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  color: hasAlerts ? "var(--text)" : "var(--text-muted)",
                  lineHeight: 1.4,
                  paddingLeft: "42px",
                }}
              >
                {organData.summaryExplanation}
              </div>

              {/* Triggered Alert Details Dropdown */}
              {hasAlerts && isExpanded && (
                <div
                  style={{
                    marginTop: "12px",
                    paddingLeft: "42px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {organData.alerts.map((alert) => (
                    <div
                      key={alert.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius)",
                        background: "var(--surface-muted)",
                        border: "1px solid var(--border-light)",
                        fontSize: "11px",
                        lineHeight: 1.4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "var(--text)" }}>
                          {alert.name}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "1px 6px",
                            borderRadius: "3px",
                            background: alert.severity === "high" ? "var(--red-bg)" : "var(--amber-bg)",
                            color: alert.severity === "high" ? "var(--red)" : "var(--amber)",
                            border: `1px solid ${
                              alert.severity === "high" ? "var(--red-border)" : "var(--amber-border)"
                            }`,
                            textTransform: "uppercase",
                          }}
                        >
                          {alert.severity} Severity
                        </span>
                      </div>
                      <div style={{ color: "var(--text-dim)", marginBottom: "4px" }}>
                        {alert.explanation}
                      </div>
                      {alert.evidence && (
                        <div style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: "10px" }}>
                          Ref: {alert.evidence}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick Validation Benchmarks (Requirement #5) */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "var(--radius)",
          background: "var(--surface-subtle)",
          border: "1px solid var(--border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          fontSize: "12px",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
          Verify with Withdrawn Drug Test Cases:
        </span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {onSelectPreset && (
            <>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  onSelectPreset({
                    name: "Terfenadine (Withdrawn Cardiotoxicant)",
                    smiles: "CC(C)(C)c1ccc(C(O)CCCN2CCC(C(O)(c3ccccc3)c4ccccc4)CC2)cc1",
                    cid: "5405",
                  })
                }
                style={{ fontSize: "11px", padding: "3px 8px" }}
              >
                ❤️ Test Terfenadine (Cardiotoxicity / hERG)
              </button>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  onSelectPreset({
                    name: "Troglitazone (Withdrawn Hepatotoxicant)",
                    smiles: "Cc1c(C)c2c(c(C)c1O)CCC(C)(COc1ccc(CC3C(=O)NC(=O)S3)cc1)O2",
                    cid: "5591",
                  })
                }
                style={{ fontSize: "11px", padding: "3px 8px" }}
              >
                🧪 Test Troglitazone (Hepatotoxicity / DILI)
              </button>
              <button
                type="button"
                className="chip"
                onClick={() =>
                  onSelectPreset({
                    name: "Paracetamol (Acetaminophen)",
                    smiles: "CC(=O)Nc1ccc(O)cc1",
                    cid: "1983",
                  })
                }
                style={{ fontSize: "11px", padding: "3px 8px" }}
              >
                💊 Test Paracetamol (Moderate DILI)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
