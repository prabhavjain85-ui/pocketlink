import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  calculateAdmeProperties,
  ADME_EXAMPLE_COMPOUNDS,
} from "./admeCalculator";
import { getRDKit } from "./rdkitLoader";
import BoiledEggPlot from "./BoiledEggPlot";
import OrganToxicityPanel from "./OrganToxicityPanel";
import { getActiveState, ACTIVE_STATE_KEYS } from "./historyService";

export default function AdmePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [smilesInput, setSmilesInput] = useState(
    searchParams.get("smiles") || "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" // Imatinib default
  );
  const [compoundNameInput, setCompoundNameInput] = useState(
    searchParams.get("name") || "Imatinib"
  );
  const [cidInput, setCidInput] = useState(searchParams.get("cid") || "5291");

  const [loading, setLoading] = useState(false);
  const [rdkitReady, setRdkitReady] = useState(false);
  const [error, setError] = useState(null);
  const [admeData, setAdmeData] = useState(null);
  const [copiedSmiles, setCopiedSmiles] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  // Shortlist from active session
  const benchCandidates = useMemo(() => {
    try {
      const state = getActiveState(ACTIVE_STATE_KEYS.BENCH);
      return Array.isArray(state?.candidates) ? state.candidates : [];
    } catch {
      return [];
    }
  }, []);

  // Run calculation
  const runPrediction = async (smiles, name, cid) => {
    const targetSmiles = (smiles || smilesInput).trim();
    if (!targetSmiles) {
      setError("Please provide a chemical SMILES string.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await calculateAdmeProperties(targetSmiles, {
        name: name || compoundNameInput || "Compound",
        cid: cid || cidInput || null,
      });

      if (!res.valid) {
        setError(res.error || "Unable to compute ADME properties for this structure.");
        setAdmeData(null);
      } else {
        setAdmeData(res);
      }
    } catch (err) {
      setError(err?.message || "An unexpected error occurred during calculation.");
      setAdmeData(null);
    } finally {
      setLoading(false);
    }
  };

  // Initialize RDKit readiness and run prediction
  useEffect(() => {
    getRDKit()
      .then((r) => {
        if (r) setRdkitReady(true);
      })
      .catch(() => {});

    const paramSmiles = searchParams.get("smiles");
    const paramName = searchParams.get("name");
    const paramCid = searchParams.get("cid");

    if (paramSmiles) {
      setSmilesInput(paramSmiles);
      if (paramName) setCompoundNameInput(paramName);
      if (paramCid) setCidInput(paramCid);
      runPrediction(paramSmiles, paramName, paramCid);
    } else {
      // Default to initial example
      runPrediction(smilesInput, compoundNameInput, cidInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (preset) => {
    setSmilesInput(preset.smiles);
    setCompoundNameInput(preset.name);
    setCidInput(preset.cid || "");
    setSearchParams({
      smiles: preset.smiles,
      name: preset.name,
      ...(preset.cid ? { cid: preset.cid } : {}),
    });
    runPrediction(preset.smiles, preset.name, preset.cid);
  };

  const handleSelectBenchCandidate = (cand) => {
    const s = cand.canonicalSmiles || cand.smiles || "";
    const n = cand.displayName || cand.name || "Bench Candidate";
    const c = cand.CID || cand.cid || "";
    setSmilesInput(s);
    setCompoundNameInput(n);
    setCidInput(String(c));
    setSearchParams({ smiles: s, name: n, ...(c ? { cid: String(c) } : {}) });
    runPrediction(s, n, c);
  };

  const handleCopySmiles = () => {
    const str = admeData?.canonicalSmiles || smilesInput;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(str).then(() => {
        setCopiedSmiles(true);
        setTimeout(() => setCopiedSmiles(false), 2500);
      });
    }
  };

  const handleCopyReport = () => {
    if (!admeData) return;

    let toxSummary = "";
    if (admeData.organToxicity && admeData.organToxicity.valid) {
      const b = admeData.organToxicity.organBreakdown;
      toxSummary = `\nStructural Alerts: ${admeData.organToxicity.totalAlerts === 0 ? "0" : `${admeData.organToxicity.totalAlerts} (${admeData.organToxicity.flaggedCategories.join(", ")})`}
- Liver (Hepatotoxicity): ${b.liver?.riskLevel || "Low"} Risk - ${b.liver?.summaryExplanation || "No alerts"}
- Heart (Cardiotoxicity / hERG): ${b.heart?.riskLevel || "Low"} Risk - ${b.heart?.summaryExplanation || "No alerts"}
- Kidney (Nephrotoxicity): ${b.kidney?.riskLevel || "Low"} Risk - ${b.kidney?.summaryExplanation || "No alerts"}
- Genetic Material (Mutagenicity): ${b.mutagenicity?.riskLevel || "Low"} Risk - ${b.mutagenicity?.summaryExplanation || "No alerts"}
- Cellular Safety (Carcinogenicity): ${b.carcinogenicity?.riskLevel || "Low"} Risk - ${b.carcinogenicity?.summaryExplanation || "No alerts"}\n`;
    }

    const text = `TargetForge ADME Profile
Compound: ${admeData.compoundName} (CID: ${admeData.cid || "N/A"})
SMILES: ${admeData.canonicalSmiles}

Physicochemical Properties:
- Molecular Weight: ${admeData.properties.mw.toFixed(1)} g/mol
- cLogP (Crippen): ${admeData.properties.logp.toFixed(2)}
- WLOGP (approx): ${admeData.properties.wlogp.toFixed(2)}
- TPSA: ${admeData.properties.tpsa.toFixed(1)} Å²
- H-Bond Donors (HBD): ${admeData.properties.hbd}
- H-Bond Acceptors (HBA): ${admeData.properties.hba}
- Rotatable Bonds: ${admeData.properties.rotb}
- Molar Refractivity: ${admeData.properties.mr.toFixed(1)}
- Heavy Atoms: ${admeData.properties.heavyAtoms}

Druglikeness Assessment:
- Lipinski Rule of 5: ${admeData.druglikeness.lipinski.status}
- Veber Bioavailability: ${admeData.druglikeness.veber.status}
- Ghose Filter: ${admeData.druglikeness.ghose.status}

Pharmacokinetics (rules & models):
- Passive HIA: ${admeData.pharmacokinetics.boiledEgg.giAbsorption}
- Passive BBB: ${admeData.pharmacokinetics.boiledEgg.passiveBbb}
- ESOL Aqueous Solubility: ${admeData.pharmacokinetics.solubility.qualitativeClass} (logS ${admeData.pharmacokinetics.solubility.logS})
- P-gp Substrate (heuristic): ${admeData.pharmacokinetics.rules?.pgpSubstrate.value || "N/A"}
- CYP: not modeled
- Bioavailability Score: ${admeData.pharmacokinetics.rules?.bioavailabilityScore.score || "N/A"}
${toxSummary}
Disclaimer: Passive BOILED-Egg only. Transporters, Pgp, CYPs, and clinical toxicity are not measured.
Methods: RDKit WASM, Lipinski (2001), Veber (2002), Ghose (1999), Daina & Zoete (2016), Delaney (2004), Martin (2005).`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      });
    }
  };

  return (
    <div className="adme-page-container" style={{ maxWidth: "1080px", margin: "0 auto 48px" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              background: "var(--primary-light)",
              color: "var(--primary)",
              border: "1px solid var(--primary-border)",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Native Cheminformatics
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            In-Browser RDKit WebAssembly Engine
          </span>
        </div>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: "26px",
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.5px",
          }}
        >
          ADME &amp; Pharmacokinetic Profiling
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "var(--text-dim)",
            lineHeight: 1.5,
            maxWidth: "800px",
          }}
        >
          Calculate verified physicochemical properties, rule-based druglikeness filters (Lipinski,
          Veber, Ghose), and BOILED-Egg passive gastrointestinal absorption and blood-brain barrier
          permeation — evaluated locally with no third-party data transmission.
        </p>
      </div>

      {/* Input Panel */}
      <div
        className="panel"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px",
          marginBottom: "24px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ marginBottom: "14px" }}>
          <label
            htmlFor="adme-smiles-input"
            style={{
              display: "block",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: "6px",
            }}
          >
            Compound SMILES String
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              id="adme-smiles-input"
              type="text"
              className="mono"
              value={smilesInput}
              onChange={(e) => setSmilesInput(e.target.value)}
              placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
              style={{
                flex: "1 1 360px",
                padding: "9px 12px",
                fontSize: "13px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface-muted)",
                color: "var(--text)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runPrediction(smilesInput, compoundNameInput, cidInput);
                }
              }}
            />
            <input
              type="text"
              value={compoundNameInput}
              onChange={(e) => setCompoundNameInput(e.target.value)}
              placeholder="Compound Name (optional)"
              style={{
                width: "200px",
                padding: "9px 12px",
                fontSize: "13px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface-muted)",
                color: "var(--text)",
              }}
            />
            <button
              id="predict-adme-btn"
              type="button"
              className="btn btn-primary"
              onClick={() => runPrediction(smilesInput, compoundNameInput, cidInput)}
              disabled={loading || !smilesInput.trim() || !rdkitReady}
              style={{
                padding: "9px 20px",
                fontWeight: 600,
                background: !smilesInput.trim() || !rdkitReady ? "var(--surface-muted)" : "var(--primary)",
                borderColor: !smilesInput.trim() || !rdkitReady ? "var(--border)" : "var(--primary)",
                color: !smilesInput.trim() || !rdkitReady ? "var(--text-muted)" : "#FFFFFF",
                cursor: !smilesInput.trim() || !rdkitReady || loading ? "not-allowed" : "pointer",
                boxShadow: !smilesInput.trim() || !rdkitReady ? "none" : "0 1px 2px rgba(15, 118, 110, 0.18)",
              }}
            >
              {!rdkitReady ? "RDKit loading…" : loading ? "Calculating..." : "Predict ADME"}
            </button>
          </div>
        </div>

        {/* Preset Selector & Bench Candidate Linkage */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
              Reference Drugs:
            </span>
            {ADME_EXAMPLE_COMPOUNDS.map((ex) => (
              <button
                key={ex.name}
                type="button"
                className={`chip ${compoundNameInput === ex.name ? "active" : ""}`}
                onClick={() => handleSelectPreset(ex)}
                style={{ fontSize: "11px", padding: "4px 8px" }}
              >
                {ex.name}
              </button>
            ))}
          </div>

          {benchCandidates.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--primary)" }}>
                From Active Bench:
              </span>
              {benchCandidates.slice(0, 6).map((c) => (
                <button
                  key={c.CID || c.cid}
                  type="button"
                  className="chip"
                  onClick={() => handleSelectBenchCandidate(c)}
                  style={{
                    fontSize: "11px",
                    padding: "4px 8px",
                    borderColor: "var(--primary-border)",
                  }}
                >
                  {c.displayName || c.name || `CID ${c.CID}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            background: "var(--red-bg)",
            border: "1px solid var(--red-border)",
            color: "var(--red)",
            borderRadius: "var(--radius)",
            padding: "12px 16px",
            marginBottom: "24px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ fontWeight: 700 }}>Calculation Error:</span>
          <span>{error}</span>
        </div>
      )}

      {/* Calculation Loading Spinner */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "6px" }}>
            Processing Molecular Graph in RDKit WebAssembly...
          </div>
          <div style={{ fontSize: "12px" }}>
            Computing 3D descriptors, topological polar surface area, and semi-empirical solubility.
          </div>
        </div>
      )}

      {/* Main Results Dashboard */}
      {!loading && admeData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Top Compound Banner Card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "20px",
              boxShadow: "var(--shadow-sm)",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              gap: "24px",
              alignItems: "center",
            }}
          >
            {/* 2D Chemical Structure */}
            {admeData.structureSvg ? (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "180px",
                  height: "140px",
                  overflow: "hidden",
                }}
                dangerouslySetInnerHTML={{ __html: admeData.structureSvg }}
              />
            ) : (
              <div
                style={{
                  width: "180px",
                  height: "140px",
                  background: "var(--surface-subtle)",
                  borderRadius: "var(--radius)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  color: "var(--text-light)",
                }}
              >
                Structure Preview
              </div>
            )}

            {/* Compound Information */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  {admeData.compoundName}
                </h2>
                {admeData.cid && (
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 6px",
                      background: "var(--surface-subtle)",
                      borderRadius: "4px",
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                    }}
                  >
                    CID: {admeData.cid}
                  </span>
                )}
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-dim)",
                  marginBottom: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span className="mono" style={{ wordBreak: "break-all" }}>
                  {admeData.canonicalSmiles}
                </span>
                <button
                  type="button"
                  onClick={handleCopySmiles}
                  title="Copy Canonical SMILES"
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    padding: "2px 4px",
                    color: copiedSmiles ? "var(--green)" : "var(--text-muted)",
                    fontSize: "11px",
                  }}
                >
                  {copiedSmiles ? "Copied ✓" : "Copy"}
                </button>
              </div>

              {/* Status Badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background:
                      admeData.druglikeness.lipinski.violations === 0
                        ? "var(--green-bg)"
                        : admeData.druglikeness.lipinski.violations === 1
                        ? "var(--amber-bg)"
                        : "var(--red-bg)",
                    color:
                      admeData.druglikeness.lipinski.violations === 0
                        ? "var(--green)"
                        : admeData.druglikeness.lipinski.violations === 1
                        ? "var(--amber)"
                        : "var(--red)",
                    border: `1px solid ${
                      admeData.druglikeness.lipinski.violations === 0
                        ? "var(--green-border)"
                        : admeData.druglikeness.lipinski.violations === 1
                        ? "var(--amber-border)"
                        : "var(--red-border)"
                    }`,
                  }}
                >
                  Lipinski: {admeData.druglikeness.lipinski.status}
                </span>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background:
                      admeData.pharmacokinetics.boiledEgg.giAbsorption === "High"
                        ? "var(--green-bg)"
                        : "var(--surface-subtle)",
                    color:
                      admeData.pharmacokinetics.boiledEgg.giAbsorption === "High"
                        ? "var(--green)"
                        : "var(--text-dim)",
                    border: `1px solid ${
                      admeData.pharmacokinetics.boiledEgg.giAbsorption === "High"
                        ? "var(--green-border)"
                        : "var(--border)"
                    }`,
                  }}
                >
                  Passive HIA: {admeData.pharmacokinetics.boiledEgg.giAbsorption}
                </span>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background:
                      admeData.pharmacokinetics.boiledEgg.passiveBbb === "Yes"
                        ? "var(--amber-bg)"
                        : "var(--surface-subtle)",
                    color:
                      admeData.pharmacokinetics.boiledEgg.passiveBbb === "Yes"
                        ? "var(--amber)"
                        : "var(--text-dim)",
                    border: `1px solid ${
                      admeData.pharmacokinetics.boiledEgg.passiveBbb === "Yes"
                        ? "var(--amber-border)"
                        : "var(--border)"
                    }`,
                  }}
                >
                  Passive BBB: {admeData.pharmacokinetics.boiledEgg.passiveBbb}
                </span>

                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    fontWeight: 600,
                    background:
                      admeData.pharmacokinetics.solubility.classColor === "green"
                        ? "var(--green-bg)"
                        : admeData.pharmacokinetics.solubility.classColor === "amber"
                        ? "var(--amber-bg)"
                        : "var(--red-bg)",
                    color:
                      admeData.pharmacokinetics.solubility.classColor === "green"
                        ? "var(--green)"
                        : admeData.pharmacokinetics.solubility.classColor === "amber"
                        ? "var(--amber)"
                        : "var(--red)",
                    border: `1px solid ${
                      admeData.pharmacokinetics.solubility.classColor === "green"
                        ? "var(--green-border)"
                        : admeData.pharmacokinetics.solubility.classColor === "amber"
                        ? "var(--amber-border)"
                        : "var(--red-border)"
                    }`,
                  }}
                >
                  Solubility: {admeData.pharmacokinetics.solubility.qualitativeClass} (logS {admeData.pharmacokinetics.solubility.logS}, est.)
                </span>

                {admeData.organToxicity && admeData.organToxicity.valid && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background:
                        admeData.organToxicity.overallBadgeColor === "red"
                          ? "var(--red-bg)"
                          : admeData.organToxicity.overallBadgeColor === "amber"
                          ? "var(--amber-bg)"
                          : "var(--green-bg)",
                      color:
                        admeData.organToxicity.overallBadgeColor === "red"
                          ? "var(--red)"
                          : admeData.organToxicity.overallBadgeColor === "amber"
                          ? "var(--amber)"
                          : "var(--green)",
                      border: `1px solid ${
                        admeData.organToxicity.overallBadgeColor === "red"
                          ? "var(--red-border)"
                          : admeData.organToxicity.overallBadgeColor === "amber"
                          ? "var(--amber-border)"
                          : "var(--green-border)"
                      }`,
                    }}
                  >
                    Structural alerts: {admeData.organToxicity.totalAlerts === 0
                      ? "0"
                      : `${admeData.organToxicity.totalAlerts} (${admeData.organToxicity.flaggedCategories.join(", ")})`}
                  </span>
                )}
              </div>

              {/* Scope & Methodology Disclaimer */}
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                Passive BOILED-Egg only. Transporters, Pgp, CYPs, and clinical toxicity are not measured.
              </p>

              {/* Extra Pharmacokinetics (rules) row */}
              {admeData.pharmacokinetics.rules && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Pharmacokinetics (rules):
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 9px",
                      borderRadius: "16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: admeData.pharmacokinetics.rules.pgpSubstrate.isSubstrate
                        ? "var(--amber-bg)"
                        : "var(--surface-subtle)",
                      color: admeData.pharmacokinetics.rules.pgpSubstrate.isSubstrate
                        ? "var(--amber)"
                        : "var(--text-dim)",
                      border: `1px solid ${
                        admeData.pharmacokinetics.rules.pgpSubstrate.isSubstrate
                          ? "var(--amber-border)"
                          : "var(--border)"
                      }`,
                    }}
                    title={admeData.pharmacokinetics.rules.pgpSubstrate.rationale}
                  >
                    P-gp Substrate (heuristic): {admeData.pharmacokinetics.rules.pgpSubstrate.value}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 9px",
                      borderRadius: "16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "var(--surface-subtle)",
                      color: "var(--text-dim)",
                      border: "1px solid var(--border)",
                    }}
                    title={admeData.pharmacokinetics.rules.cypRisk.rationale}
                  >
                    CYP: not modeled
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "3px 9px",
                      borderRadius: "16px",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "var(--surface-subtle)",
                      color: "var(--text-dim)",
                      border: "1px solid var(--border)",
                    }}
                    title={admeData.pharmacokinetics.rules.bioavailabilityScore.rule}
                  >
                    Bioavailability Score: {admeData.pharmacokinetics.rules.bioavailabilityScore.score}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCopyReport}
                style={{ fontSize: "12px", padding: "6px 14px", whiteSpace: "nowrap" }}
              >
                {copiedReport ? "Report Copied ✓" : "Copy Report"}
              </button>
              <Link
                to="/"
                className="btn"
                style={{
                  fontSize: "12px",
                  padding: "6px 14px",
                  textAlign: "center",
                  border: "1px solid var(--border)",
                  color: "var(--text-dim)",
                  background: "var(--surface)",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                ← Back to Bench
              </Link>
            </div>
          </div>

          {/* Two-Column Analytics Section */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
              gap: "24px",
              alignItems: "start",
            }}
          >
            {/* Left Column: Pharmacokinetics & BOILED-Egg Chart */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* BOILED-Egg Plot */}
              <div
                className="panel"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div style={{ marginBottom: "14px" }}>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: "16px",
                      fontWeight: 700,
                      color: "var(--text)",
                    }}
                  >
                    BOILED-Egg Absorption Plot
                  </h3>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                    Predicts passive intestinal absorption (HIA) and blood-brain barrier (BBB)
                    permeation from Topological Polar Surface Area (TPSA) and lipophilicity (cLogP).
                  </p>
                </div>

                <BoiledEggPlot
                  tpsa={admeData.properties.tpsa}
                  logp={admeData.properties.logp}
                  compoundName={admeData.compoundName}
                />

                <div
                  style={{
                    marginTop: "16px",
                    padding: "12px",
                    borderRadius: "var(--radius)",
                    background: "var(--surface-subtle)",
                    fontSize: "12px",
                    color: "var(--text-dim)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Plot Placement:</strong> {admeData.compoundName} is located in the{" "}
                  <strong>{admeData.pharmacokinetics.boiledEgg.label}</strong> (TPSA ={" "}
                  {admeData.properties.tpsa.toFixed(1)} Å², cLogP ={" "}
                  {admeData.properties.logp.toFixed(2)}).
                  {admeData.pharmacokinetics.boiledEgg.inBbb ? (
                    <span>
                      {" "}
                      This lipophilic profile suggests sufficient blood-brain barrier penetration.
                    </span>
                  ) : admeData.pharmacokinetics.boiledEgg.inHia ? (
                    <span>
                      {" "}
                      This profile supports high human gastrointestinal absorption with minimal central
                      nervous system permeability.
                    </span>
                  ) : (
                    <span>
                      {" "}
                      This polarity/lipophilicity balance indicates reduced passive gastrointestinal
                      absorption.
                    </span>
                  )}
                </div>
              </div>

              {/* Pharmacokinetics Breakdown */}
              <div
                className="panel"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Pharmacokinetics &amp; Solubility
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Passive HIA */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                        Passive Intestinal Absorption (HIA)
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Passive human intestinal permeability (BOILED-Egg model)
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "13px",
                        color:
                          admeData.pharmacokinetics.boiledEgg.giAbsorption === "High"
                            ? "var(--green)"
                            : "var(--text-dim)",
                      }}
                    >
                      {admeData.pharmacokinetics.boiledEgg.giAbsorption}
                    </span>
                  </div>

                  {/* Passive BBB */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                        Passive Blood-Brain Barrier (BBB) Permeation
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Likelihood of crossing capillary endothelial tight junctions passively
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: "13px",
                        color:
                          admeData.pharmacokinetics.boiledEgg.passiveBbb === "Yes"
                            ? "var(--amber)"
                            : "var(--text-dim)",
                      }}
                    >
                      {admeData.pharmacokinetics.boiledEgg.passiveBbb}
                    </span>
                  </div>

                  {/* ESOL Aqueous Solubility */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      border: "1px solid var(--border-light)",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                        Aqueous Solubility (ESOL)
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Delaney (2004) topological structure-solubility model
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "13px",
                          color:
                            admeData.pharmacokinetics.solubility.classColor === "green"
                              ? "var(--green)"
                              : admeData.pharmacokinetics.solubility.classColor === "amber"
                              ? "var(--amber)"
                              : "var(--red)",
                        }}
                      >
                        {admeData.pharmacokinetics.solubility.qualitativeClass}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        LogS = {admeData.pharmacokinetics.solubility.logS} (approx.{" "}
                        {admeData.pharmacokinetics.solubility.mgPerMl >= 0.01
                          ? `${admeData.pharmacokinetics.solubility.mgPerMl} mg/mL`
                          : `${(admeData.pharmacokinetics.solubility.mgPerMl * 1000).toFixed(2)} µg/mL`}
                        )
                      </div>
                    </div>
                  </div>

                  {/* Extra PK Rules */}
                  {admeData.pharmacokinetics.rules && (
                    <>
                      {/* P-gp Efflux Substrate */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "var(--surface-muted)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                            P-gp Substrate (heuristic)
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {admeData.pharmacokinetics.rules.pgpSubstrate.criterion}
                          </div>
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "13px",
                            color: admeData.pharmacokinetics.rules.pgpSubstrate.isSubstrate
                              ? "var(--amber)"
                              : "var(--text-dim)",
                          }}
                        >
                          {admeData.pharmacokinetics.rules.pgpSubstrate.value}
                        </span>
                      </div>

                      {/* CYP Liability */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "var(--surface-muted)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                            Cytochrome P450 (CYP) Liability
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Metabolic clearance &amp; isoform inhibition
                          </div>
                        </div>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: "12px",
                            color: "var(--text-muted)",
                          }}
                        >
                          not modeled
                        </span>
                      </div>

                      {/* Bioavailability Score */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "10px 14px",
                          background: "var(--surface-muted)",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                            Bioavailability Score
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Martin (2005) Abbott rule (Ro5 violations ≤ 1 &amp; TPSA ≤ 140 Å²)
                          </div>
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: "13px",
                            color: "var(--text)",
                          }}
                        >
                          {admeData.pharmacokinetics.rules.bioavailabilityScore.score}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Physicochemical Descriptors & Druglikeness */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Physicochemical Properties Table */}
              <div
                className="panel"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Physicochemical Properties
                </h3>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Molecular Weight
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.mw.toFixed(2)} g/mol
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      cLogP (Wildman-Crippen)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.logp.toFixed(2)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      WLOGP (approximate)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.wlogp !== undefined ? admeData.properties.wlogp.toFixed(2) : "N/A"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Polar Surface Area (TPSA)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.tpsa.toFixed(1)} Å²
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Molar Refractivity (MR)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.mr.toFixed(1)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      H-Bond Donors (HBD)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.hbd}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      H-Bond Acceptors (HBA)
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.hba}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Rotatable Bonds
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.rotb}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Fraction Csp3
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.fractionCsp3.toFixed(2)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Heavy Atoms / Rings
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.heavyAtoms} heavy / {admeData.properties.rings} rings
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Aromatic Rings
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>
                      {admeData.properties.aromaticRings} aromatic
                    </div>
                  </div>
                </div>
              </div>

              {/* Druglikeness Rules Card */}
              <div
                className="panel"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 16px",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Druglikeness Rule Compliance
                </h3>

                {/* 1. Lipinski Rule of 5 */}
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>
                      Lipinski&apos;s Rule of Five
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background:
                          admeData.druglikeness.lipinski.violations === 0
                            ? "var(--green-bg)"
                            : "var(--amber-bg)",
                        color:
                          admeData.druglikeness.lipinski.violations === 0
                            ? "var(--green)"
                            : "var(--amber)",
                      }}
                    >
                      {admeData.druglikeness.lipinski.status}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "6px",
                    }}
                  >
                    {admeData.druglikeness.lipinski.rules.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          background: r.pass ? "var(--surface-subtle)" : "var(--amber-bg)",
                          border: `1px solid ${r.pass ? "var(--border-light)" : "var(--amber-border)"}`,
                          fontSize: "11px",
                        }}
                      >
                        <span style={{ color: "var(--text-dim)" }}>
                          {r.label} ({r.criterion}):
                        </span>
                        <span style={{ fontWeight: 600, color: r.pass ? "var(--text)" : "var(--amber)" }}>
                          {r.value} {r.pass ? "✓" : "✗"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Veber's Rule */}
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>
                      Veber&apos;s Bioavailability Rules
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: admeData.druglikeness.veber.pass
                          ? "var(--green-bg)"
                          : "var(--amber-bg)",
                        color: admeData.druglikeness.veber.pass
                          ? "var(--green)"
                          : "var(--amber)",
                      }}
                    >
                      {admeData.druglikeness.veber.status}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "6px",
                    }}
                  >
                    {admeData.druglikeness.veber.rules.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          background: r.pass ? "var(--surface-subtle)" : "var(--amber-bg)",
                          border: `1px solid ${r.pass ? "var(--border-light)" : "var(--amber-border)"}`,
                          fontSize: "11px",
                        }}
                      >
                        <span style={{ color: "var(--text-dim)" }}>
                          {r.label} ({r.criterion}):
                        </span>
                        <span style={{ fontWeight: 600, color: r.pass ? "var(--text)" : "var(--amber)" }}>
                          {r.value} {r.pass ? "✓" : "✗"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Ghose Filter */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text)" }}>
                      Ghose Druglikeness Filter
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: admeData.druglikeness.ghose.pass
                          ? "var(--green-bg)"
                          : "var(--amber-bg)",
                        color: admeData.druglikeness.ghose.pass
                          ? "var(--green)"
                          : "var(--amber)",
                      }}
                    >
                      {admeData.druglikeness.ghose.status}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "6px",
                    }}
                  >
                    {admeData.druglikeness.ghose.rules.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          background: r.pass ? "var(--surface-subtle)" : "var(--amber-bg)",
                          border: `1px solid ${r.pass ? "var(--border-light)" : "var(--amber-border)"}`,
                          fontSize: "11px",
                        }}
                      >
                        <span style={{ color: "var(--text-dim)" }}>
                          {r.label} ({r.criterion}):
                        </span>
                        <span style={{ fontWeight: 600, color: r.pass ? "var(--text)" : "var(--amber)" }}>
                          {r.value} {r.pass ? "✓" : "✗"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Organ-Specific Toxicity Predictions Panel */}
          {admeData.organToxicity && (
            <OrganToxicityPanel
              organToxicity={admeData.organToxicity}
              onSelectPreset={handleSelectPreset}
            />
          )}

          {/* Scientific Citations & Methodology Card */}
          <div
            style={{
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "16px 20px",
              fontSize: "12px",
              color: "var(--text-dim)",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
              Scientific Methodology &amp; Citations
            </div>
            <p style={{ margin: "0 0 10px", lineHeight: 1.5 }}>
              TargetForge computes native ADME predictions entirely in your browser using RDKit compiled
              to WebAssembly. Algorithms adhere to published, peer-reviewed computational standards:
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.6 }}>
              {admeData.citations.map((c) => (
                <li key={c.model}>
                  <strong>{c.model}:</strong> {c.reference}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
