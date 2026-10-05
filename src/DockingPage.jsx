import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  DOCKING_REFERENCE_TARGETS,
  fetchPdbFromRcsb,
  runMolecularDocking,
} from "./dockingEngine";
import DockingViewer from "./DockingViewer";
import { getActiveState, ACTIVE_STATE_KEYS } from "./historyService";
export default function DockingPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Target State
  const [pdbIdInput, setPdbIdInput] = useState(searchParams.get("pdb") || "1IEP");
  const [targetTitle, setTargetTitle] = useState("Abl Tyrosine Kinase Domain");
  const [customCenter, setCustomCenter] = useState(null);
  const [boxSize, setBoxSize] = useState(20);

  // Ligand State
  const [smilesInput, setSmilesInput] = useState(
    searchParams.get("smiles") || DOCKING_REFERENCE_TARGETS[0].referenceSmiles
  );
  const [compoundNameInput, setCompoundNameInput] = useState(
    searchParams.get("name") || "Imatinib"
  );
  const [cidInput, setCidInput] = useState(searchParams.get("cid") || "5291");

  // Docking Execution State
  const [searchExhaustiveness, setSearchExhaustiveness] = useState(8);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState(null);
  const [dockingResults, setDockingResults] = useState(null);
  const [activePose, setActivePose] = useState(null);
  const [copiedReport, setCopiedReport] = useState(false);

  // Active bench target & candidates
  const benchTarget = useMemo(() => {
    try {
      return getActiveState(ACTIVE_STATE_KEYS.BENCH)?.protein || null;
    } catch {
      return null;
    }
  }, []);

  const benchCandidates = useMemo(() => {
    try {
      const cands = getActiveState(ACTIVE_STATE_KEYS.BENCH)?.candidates;
      return Array.isArray(cands) ? cands : [];
    } catch {
      return [];
    }
  }, []);

  // Run the full docking workflow
  const executeDocking = async (targetId, smiles, name, centerOverride = null) => {
    const targetPdb = (targetId || pdbIdInput).trim().toUpperCase();
    const ligandSmiles = (smiles || smilesInput).trim();

    if (!targetPdb || targetPdb.length !== 4) {
      setError("Please specify a valid 4-character PDB code (e.g. 1IEP, 1M17, 3SN6).");
      return;
    }
    if (!ligandSmiles) {
      setError("Please provide a valid chemical SMILES string for the ligand.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgressPercent(5);
    setProgressMsg(`Downloading crystallographic structure for ${targetPdb} from RCSB PDB...`);

    try {
      const pdbText = await fetchPdbFromRcsb(targetPdb);

      const res = await runMolecularDocking(pdbText, ligandSmiles, {
        customCenter: centerOverride || customCenter,
        boxSize,
        searchExhaustiveness,
        onProgress: (p) => {
          setProgressPercent(p.percent);
          setProgressMsg(p.message);
        },
      });

      setDockingResults(res);
      setActivePose(res.bestPose);
      setTargetTitle(res.target.title || targetTitle);
    } catch (err) {
      setError(err?.message || "An unexpected error occurred during molecular docking.");
      setDockingResults(null);
      setActivePose(null);
    } finally {
      setLoading(false);
    }
  };

  // Run on first mount or when URL search parameters change
  useEffect(() => {
    const urlPdb = searchParams.get("pdb");
    const urlSmiles = searchParams.get("smiles");
    const urlName = searchParams.get("name");
    const urlCid = searchParams.get("cid");

    if (urlPdb || urlSmiles) {
      if (urlPdb) setPdbIdInput(urlPdb);
      if (urlSmiles) setSmilesInput(urlSmiles);
      if (urlName) setCompoundNameInput(urlName);
      if (urlCid) setCidInput(urlCid);

      const matchPreset = DOCKING_REFERENCE_TARGETS.find(
        (t) => t.id.toUpperCase() === (urlPdb || "").toUpperCase()
      );

      executeDocking(
        urlPdb || pdbIdInput,
        urlSmiles || smilesInput,
        urlName || compoundNameInput,
        matchPreset ? matchPreset.center : null
      );
    } else {
      // Run default reference docking (1IEP with Imatinib)
      executeDocking(
        DOCKING_REFERENCE_TARGETS[0].id,
        DOCKING_REFERENCE_TARGETS[0].referenceSmiles,
        "Imatinib",
        DOCKING_REFERENCE_TARGETS[0].center
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preset Selection Handlers
  const handleSelectTargetPreset = (preset) => {
    setPdbIdInput(preset.id);
    setTargetTitle(preset.name);
    setCustomCenter(preset.center);
    setBoxSize(preset.boxSize || 20);
    setSmilesInput(preset.referenceSmiles);
    setCompoundNameInput(preset.referenceLigand.split(" ")[0]);
    setSearchParams({
      pdb: preset.id,
      smiles: preset.referenceSmiles,
      name: preset.referenceLigand.split(" ")[0],
    });
    executeDocking(preset.id, preset.referenceSmiles, preset.referenceLigand, preset.center);
  };

  const handleSelectBenchTarget = () => {
    if (!benchTarget?.id) return;
    setPdbIdInput(benchTarget.id);
    setTargetTitle(benchTarget.name || benchTarget.title || "Bench Target");
    setCustomCenter(null);
    executeDocking(benchTarget.id, smilesInput, compoundNameInput, null);
  };

  const handleSelectBenchCandidate = (cand) => {
    const s = cand.canonicalSmiles || cand.smiles || "";
    const n = cand.displayName || cand.name || "Candidate";
    const c = cand.CID || cand.cid || "";
    setSmilesInput(s);
    setCompoundNameInput(n);
    setCidInput(String(c));
    setSearchParams({
      pdb: pdbIdInput,
      smiles: s,
      name: n,
      ...(c ? { cid: String(c) } : {}),
    });
    executeDocking(pdbIdInput, s, n, customCenter);
  };

  const handleCopyReport = () => {
    if (!dockingResults || !activePose) return;
    const rep = `TargetForge Native Molecular Docking Report
Target: ${targetTitle} (PDB: ${pdbIdInput})
Ligand: ${compoundNameInput} (SMILES: ${smilesInput})

Selected Binding Mode (Pose ${activePose.rank}):
- Predicted Free Energy (ΔG_bind): ${activePose.deltaG} kcal/mol
- Estimated Dissociation Constant (Ki): ${activePose.kiFormatted}
- RMSD to Best Pose: ${activePose.rmsd} Å
- Hydrogen Bonds Formed: ${activePose.hbondCount}
- Hydrophobic Contacts: ${activePose.hydrophobicCount}

Energy Components Breakdown:
- Van der Waals (Steric): ${activePose.components.vdw} kcal/mol
- Hydrogen Bonding: ${activePose.components.hbond} kcal/mol
- Electrostatic: ${activePose.components.electrostatic} kcal/mol
- Desolvation Reward: ${activePose.components.desolvation} kcal/mol
- Torsional Penalty: +${activePose.components.torsional} kcal/mol

Interacting Residues:
${activePose.residueBreakdown
  .slice(0, 8)
  .map((r) => `• ${r.resName}-${r.resSeq} (${r.minDistance} Å): ${r.energy} kcal/mol [HB: ${r.hbonds}]`)
  .join("\n")}

Method: Empirical Force Field Scoring (Trott & Olson 2010, Morris et al. 2009) via TargetForge In-Browser Engine.`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(rep).then(() => {
        setCopiedReport(true);
        setTimeout(() => setCopiedReport(false), 2500);
      });
    }
  };

  return (
    <div className="docking-page-container" style={{ maxWidth: "1120px", margin: "0 auto 48px" }}>
      {/* Page Title & Mission */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              background: "var(--violet-bg, #EEF2FF)",
              color: "var(--violet, #4338CA)",
              border: "1px solid var(--violet-border, #C7D2FE)",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Native Molecular Docking
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            In-Browser Empirical Force Field &amp; Pose Minimization
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
          Receptor-Ligand Molecular Docking
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "var(--text-dim)",
            lineHeight: 1.5,
            maxWidth: "840px",
          }}
        >
          Compute binding free energy (ΔG_bind), estimate inhibition constants (Ki), and inspect 3D poses in
          crystallographic binding pockets — simulated in-browser. Supports structure-based prioritization, not
          experimental binding confirmation.
        </p>
      </div>

      {/* Target & Ligand Configuration Panel */}
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
            marginBottom: "16px",
          }}
        >
          {/* Station A: Target Receptor */}
          <div>
            <label
              htmlFor="docking-pdb-input"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "6px",
              }}
            >
              1. Target Receptor (PDB ID)
            </label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input
                id="docking-pdb-input"
                type="text"
                className="mono"
                value={pdbIdInput}
                onChange={(e) => setPdbIdInput(e.target.value.toUpperCase())}
                placeholder="e.g. 1IEP"
                maxLength={4}
                style={{
                  width: "90px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  fontWeight: 700,
                  textAlign: "center",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-muted)",
                  color: "var(--text)",
                }}
              />
              <input
                type="text"
                value={targetTitle}
                onChange={(e) => setTargetTitle(e.target.value)}
                placeholder="Target Name / Description"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "13px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-muted)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Presets & Active Target linkage */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
                Presets:
              </span>
              {DOCKING_REFERENCE_TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`chip ${pdbIdInput === t.id ? "active" : ""}`}
                  onClick={() => handleSelectTargetPreset(t)}
                  style={{ fontSize: "11px", padding: "3px 7px" }}
                >
                  {t.id} ({t.name.split(" ")[0]})
                </button>
              ))}
              {benchTarget && (
                <button
                  type="button"
                  className="chip"
                  onClick={handleSelectBenchTarget}
                  style={{
                    fontSize: "11px",
                    padding: "3px 7px",
                    borderColor: "var(--primary-border)",
                    color: "var(--primary)",
                  }}
                >
                  Active: {benchTarget.id}
                </button>
              )}
            </div>
          </div>

          {/* Station B: Small Molecule Ligand */}
          <div>
            <label
              htmlFor="docking-smiles-input"
              style={{
                display: "block",
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "6px",
              }}
            >
              2. Small Molecule Ligand (SMILES)
            </label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
              <input
                id="docking-smiles-input"
                type="text"
                className="mono"
                value={smilesInput}
                onChange={(e) => setSmilesInput(e.target.value)}
                placeholder="e.g. Cc1ccc(NC(=O)c2ccc...)cc1"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "12px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-muted)",
                  color: "var(--text)",
                }}
              />
              <input
                type="text"
                value={compoundNameInput}
                onChange={(e) => setCompoundNameInput(e.target.value)}
                placeholder="Ligand Name"
                style={{
                  width: "120px",
                  padding: "8px 12px",
                  fontSize: "13px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface-muted)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Bench candidates pills */}
            {benchCandidates.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>
                  Bench Candidates:
                </span>
                {benchCandidates.slice(0, 5).map((c) => (
                  <button
                    key={c.CID || c.cid}
                    type="button"
                    className="chip"
                    onClick={() => handleSelectBenchCandidate(c)}
                    style={{ fontSize: "11px", padding: "3px 7px" }}
                  >
                    {c.displayName || c.name || `CID ${c.CID}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Docking Controls & Parameters Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
            paddingTop: "14px",
            borderTop: "1px solid var(--border-light)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
                Grid Cavity Box:
              </span>
              <select
                value={boxSize}
                onChange={(e) => setBoxSize(parseInt(e.target.value, 10))}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <option value={16}>16 Å (Focused pocket)</option>
                <option value={20}>20 Å (Standard binding site)</option>
                <option value={24}>24 Å (Expanded cavity)</option>
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 600 }}>
                Search Exhaustiveness:
              </span>
              <select
                value={searchExhaustiveness}
                onChange={(e) => setSearchExhaustiveness(parseInt(e.target.value, 10))}
                style={{
                  padding: "4px 8px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <option value={4}>4 (Fast preview)</option>
                <option value={8}>8 (Standard triage)</option>
                <option value={16}>16 (Thorough sampling)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => executeDocking(pdbIdInput, smilesInput, compoundNameInput, customCenter)}
            disabled={loading || !pdbIdInput.trim() || !smilesInput.trim()}
            style={{ padding: "9px 24px", fontSize: "13px" }}
          >
            {loading ? "Simulating Docking..." : "Run Molecular Docking"}
          </button>
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
          <span style={{ fontWeight: 700 }}>Docking Error:</span>
          <span>{error}</span>
        </div>
      )}

      {/* Progress & Loading State */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: "36px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            marginBottom: "24px",
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text)", marginBottom: "8px" }}>
            {progressMsg || "Calculating receptor-ligand interactions..."}
          </div>
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              height: "8px",
              background: "var(--surface-muted)",
              borderRadius: "4px",
              margin: "0 auto 12px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: "100%",
                background: "var(--primary)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Simulating Lennard-Jones vdW interactions, hydrogen bonding, and rotatable bond entropy.
          </div>
        </div>
      )}

      {/* Results Dashboard */}
      {!loading && dockingResults && activePose && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Top KPI Cards Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            {/* 1. Binding Affinity */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                Predicted Binding Affinity (ΔG)
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: activePose.deltaG < -7.0 ? "var(--green)" : "var(--amber)",
                  margin: "4px 0",
                }}
              >
                {activePose.deltaG} <span style={{ fontSize: "14px", fontWeight: 500 }}>kcal/mol</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Pose {activePose.rank} of {dockingResults.rankedPoses.length} evaluated
              </div>
            </div>

            {/* 2. Estimated Ki */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                Estimated Dissociation (Ki)
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: "4px 0",
                }}
              >
                {activePose.kiFormatted}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                Ki = exp(ΔG / RT) at 298.15 K
              </div>
            </div>

            {/* 3. Hydrogen Bonds */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                Key Hydrogen Bonds
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--teal, #0D9488)",
                  margin: "4px 0",
                }}
              >
                {activePose.hbondCount} <span style={{ fontSize: "14px", fontWeight: 500 }}>contacts</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {activePose.hydrophobicCount} hydrophobic contact residues
              </div>
            </div>

            {/* 4. Torsional Penalty */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 20px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
                Torsional Entropy Cost
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--text-dim)",
                  margin: "4px 0",
                }}
              >
                +{activePose.components.torsional} <span style={{ fontSize: "14px", fontWeight: 500 }}>kcal/mol</span>
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                {dockingResults.ligand.numRotatableBonds} rotatable bonds frozen
              </div>
            </div>
          </div>

          {/* Interactive 3D Viewer & Pose Inspector */}
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
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: "0 0 4px",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  3D Receptor Cavity &amp; Binding Pose Viewer
                </h2>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                  Target: {targetTitle} (PDB: {pdbIdInput}) · {dockingResults.target.pocketResiduesCount}{" "}
                  pocket residues analyzed within {dockingResults.target.boxSize} Å cavity.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyReport}
                  style={{ fontSize: "12px", padding: "6px 12px" }}
                >
                  {copiedReport ? "Report Copied ✓" : "Copy Docking Report"}
                </button>
                <Link
                  to={`/adme?smiles=${encodeURIComponent(smilesInput)}&name=${encodeURIComponent(compoundNameInput)}&cid=${cidInput}`}
                  className="btn btn-secondary"
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    textDecoration: "none",
                  }}
                >
                  Predict ADME Profile →
                </Link>
              </div>
            </div>

            {/* 3D Docking Viewer */}
            <DockingViewer
              targetName={`${targetTitle} (${pdbIdInput})`}
              ligandName={compoundNameInput}
              pocketAtoms={dockingResults.pocketAtoms}
              activePose={activePose}
              rankedPoses={dockingResults.rankedPoses}
              onSelectPose={(p) => setActivePose(p)}
            />
          </div>

          {/* Two-Column Deep Analytics: Energy Components & Residue Contacts */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
              gap: "24px",
              alignItems: "start",
            }}
          >
            {/* Left: Pose Ranking & Free Energy Terms Decomposition */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Conformational Poses Table */}
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
                    margin: "0 0 14px",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Conformational Pose Clusters
                </h3>

                <div className="score-table-wrap">
                  <table className="score-table" style={{ width: "100%", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        <th>Pose</th>
                        <th>ΔG (kcal/mol)</th>
                        <th>Est. Ki</th>
                        <th>RMSD (Å)</th>
                        <th>H-Bonds</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dockingResults.rankedPoses.map((p) => {
                        const isSelected = activePose.rank === p.rank;
                        return (
                          <tr
                            key={p.rank}
                            style={{
                              background: isSelected ? "var(--primary-subtle, #F0FDF4)" : undefined,
                              fontWeight: isSelected ? 600 : 400,
                            }}
                          >
                            <td className="mono">
                              Pose {p.rank} {p.rank === 1 ? "★" : ""}
                            </td>
                            <td
                              className="mono"
                              style={{
                                color: p.deltaG < -7 ? "var(--green)" : "var(--amber)",
                                fontWeight: 700,
                              }}
                            >
                              {p.deltaG}
                            </td>
                            <td className="mono">{p.kiFormatted}</td>
                            <td className="mono">{p.rmsd.toFixed(2)}</td>
                            <td>{p.hbondCount}</td>
                            <td>
                              <button
                                type="button"
                                className={`chip ${isSelected ? "active" : ""}`}
                                onClick={() => setActivePose(p)}
                                style={{ fontSize: "11px", padding: "2px 6px" }}
                              >
                                {isSelected ? "Viewing" : "View"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Energy Term Decomposition */}
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
                    margin: "0 0 14px",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Free Energy Terms Decomposition (Pose {activePose.rank})
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Van der Waals / Steric Complementarity (Evdw):</span>
                    <strong className="mono">{activePose.components.vdw} kcal/mol</strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Hydrogen Bonding Potential (Ehbond):</span>
                    <strong className="mono" style={{ color: "var(--green)" }}>
                      {activePose.components.hbond} kcal/mol
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Electrostatic Attraction / Dielectric (Eelec):</span>
                    <strong className="mono">{activePose.components.electrostatic} kcal/mol</strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Hydrophobic Desolvation Surface Burial:</span>
                    <strong className="mono" style={{ color: "var(--teal, #0D9488)" }}>
                      {activePose.components.desolvation} kcal/mol
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--surface-muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "12px",
                    }}
                  >
                    <span>Torsional Entropy Loss (+0.315 kcal/mol per rot bond):</span>
                    <strong className="mono" style={{ color: "var(--amber)" }}>
                      +{activePose.components.torsional} kcal/mol
                    </strong>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      background: "var(--surface-subtle)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius)",
                      fontSize: "13px",
                      fontWeight: 700,
                    }}
                  >
                    <span>Total Predicted Binding Free Energy (ΔG_bind):</span>
                    <span className="mono" style={{ color: "var(--primary)" }}>
                      {activePose.deltaG} kcal/mol
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Key Interacting Residues in Binding Cavity */}
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
                  margin: "0 0 6px",
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--text)",
                }}
              >
                Pocket Residue Contact Breakdown (Pose {activePose.rank})
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: "12px", color: "var(--text-muted)" }}>
                Key amino acids contributing to steric fit, hydrogen bonding, and hydrophobic contact.
              </p>

              {activePose.residueBreakdown.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-dim)", padding: "12px 0" }}>
                  No close contact residues detected for this pose.
                </div>
              ) : (
                <div className="score-table-wrap">
                  <table className="score-table" style={{ width: "100%", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        <th>Residue</th>
                        <th>Min Dist</th>
                        <th>Type</th>
                        <th>Energy Contrib</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activePose.residueBreakdown.map((res) => (
                        <tr key={`${res.resName}-${res.resSeq}`}>
                          <td style={{ fontWeight: 600 }}>
                            {res.resName}-{res.resSeq}
                          </td>
                          <td className="mono">{res.minDistance} Å</td>
                          <td>
                            {res.hbonds > 0 ? (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "var(--green-bg)",
                                  color: "var(--green)",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                }}
                              >
                                H-Bond ({res.hbonds})
                              </span>
                            ) : res.hydrophobic > 0 ? (
                              <span
                                style={{
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  background: "var(--amber-bg)",
                                  color: "var(--amber)",
                                  fontSize: "11px",
                                }}
                              >
                                Hydrophobic
                              </span>
                            ) : (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                Steric / vdW
                              </span>
                            )}
                          </td>
                          <td
                            className="mono"
                            style={{
                              color: res.energy < 0 ? "var(--green)" : "var(--text)",
                              fontWeight: 600,
                            }}
                          >
                            {res.energy} kcal/mol
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Specific Hydrogen Bonds Detail */}
              {activePose.hbondInteractions.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: "6px",
                    }}
                  >
                    Identified Hydrogen Bonds:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "11px", lineHeight: 1.6, color: "var(--text-dim)" }}>
                    {activePose.hbondInteractions.map((hb, i) => (
                      <li key={i}>
                        Ligand atom <strong>{hb.ligandAtom}</strong> → Receptor residue{" "}
                        <strong>{hb.residue}</strong> ({hb.proteinAtom}) at distance{" "}
                        <strong>{hb.distance} Å</strong> ({hb.energy} kcal/mol)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Scientific Methodology & Citations */}
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
              Scientific Methodology &amp; Mathematical Force Field
            </div>
            <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>
              TargetForge&apos;s native docking engine computes empirical binding free energies (ΔG)
              using an open empirical potential parameterized on crystallographic complexes:
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.6 }}>
              <li>
                <strong>Steric Potential &amp; vdW:</strong> Lennard-Jones 12-6 potential with a soft-core linear
                repulsion boundary to model van der Waals complementarity without unphysical divergence during sampling.
              </li>
              <li>
                <strong>Directional Hydrogen Bonding:</strong> Angle- and distance-dependent Gaussian potential
                parameterized for donor-acceptor distances between 2.4 and 3.6 Å.
              </li>
              <li>
                <strong>Electrostatics:</strong> Coulombic attraction and repulsion screened by a distance-dependent
                effective dielectric (ε(r) = 4r).
              </li>
              <li>
                <strong>Torsional Entropy Penalty:</strong> +0.315 kcal/mol penalty per frozen rotatable bond
                derived from empirical macromolecular conformational thermodynamics (Trott &amp; Olson 2010; Morris et al. 2009).
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
