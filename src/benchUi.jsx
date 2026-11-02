import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { calculateAdmeProperties } from "./serverApi";
import { ADME_EXAMPLE_COMPOUNDS } from "./shared/admeDisplay";
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

  // Initialize from URL params or default example
  useEffect(() => {
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
 Methods: Server-side RDKit + rule-based cheminformatics, Lipinski (2001), Veber (2002), Ghose (1999), Daina & Zoete (2016), Delaney (2004), Martin (2005).`;

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
            Secure Cheminformatics
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Server-side RDKit analysis
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
          Calculate physicochemical properties, rule-based druglikeness filters (Lipinski, Veber, Ghose), and
          BOILED-Egg absorption models using secure server-side chemistry. The browser never downloads or executes the RDKit runtime.
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
              disabled={loading || !smilesInput.trim()}
              style={{
                padding: "9px 20px",
                fontWeight: 600,
                background: !smilesInput.trim() ? "var(--surface-muted)" : "var(--primary)",
                borderColor: !smilesInput.trim() ? "var(--border)" : "var(--primary)",
                color: !smilesInput.trim() ? "var(--text-muted)" : "#FFFFFF",
                cursor: !smilesInput.trim() || loading ? "not-allowed" : "pointer",
                boxShadow: !smilesInput.trim() ? "none" : "0 1px 2px rgba(15, 118, 110, 0.18)",
              }}
            >
              {loading ? "Calculating..." : "Predict ADME"}
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
            Processing molecular descriptors via secure backend…
          </div>
          <div style={{ fontSize: "12px" }}>
            Computing solubility, lipophilicity, and structure-derived scores without exposing chemical tooling to the browser.
          </div>
        </div>
      )}

      {!loading && admeData && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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

              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {/* badges omitted for brevity; same content as existing page */}
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

              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                Server-side ADME: calculations run in the backend and do not expose the RDKit runtime to visitors.
              </p>
            </div>

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
        </div>
      )}
    </div>
  );
}




















































































































































































