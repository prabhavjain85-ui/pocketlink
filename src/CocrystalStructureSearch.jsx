import React, { useCallback, useState } from "react";
import CocrystalMolstarViewer from "./CocrystalMolstarViewer";
import DockingInteractionsPanel from "./DockingInteractionsPanel";
import { analyzeExperimentalCocrystal } from "./cocrystalAnalysis";
import {
  normalizeResolutionCombined,
  resolveCocrystalSearchQuery,
  searchPdbEntriesForChemComp,
} from "./rcsbCocrystalSearch";
import { rcsbStructurePageUrl } from "./cocrystalMolstar";

export default function CocrystalStructureSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolveResult, setResolveResult] = useState(null);
  const [selectedCompId, setSelectedCompId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  const [activeEntry, setActiveEntry] = useState(null);
  const [activeLigand, setActiveLigand] = useState(null);
  const [instances, setInstances] = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [pocketCount, setPocketCount] = useState(null);

  const resetAnalysis = () => {
    setActiveEntry(null);
    setActiveLigand(null);
    setInstances([]);
    setSelectedInstance(null);
    setBundle(null);
    setAnalysisError(null);
    setPocketCount(null);
  };

  const loadStructure = async (pdbId, ligandCode, instancePick = null) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    setBundle(null);
    setPocketCount(null);
    setActiveEntry(pdbId);
    setActiveLigand(ligandCode);
    try {
      const result = await analyzeExperimentalCocrystal(pdbId, ligandCode, {
        instancePick: instancePick || undefined,
      });
      if (!result.ok) {
        setAnalysisError(result.error || "Analysis failed.");
        setInstances(result.instances || []);
        return;
      }
      setBundle(result.bundle);
      setPocketCount(result.pocketResidueCount);
      setInstances(result.instances || []);
      setSelectedInstance(result.pick);
    } catch (e) {
      setAnalysisError(e?.message || "Could not fetch or parse the structure from RCSB.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    resetAnalysis();
    setResolveResult(null);
    try {
      const result = await resolveCocrystalSearchQuery(q);
      setResolveResult(result);
      if (result.message && !result.entries?.length && !result.candidates?.length) {
        setError(result.message);
        setEntries([]);
        return;
      }
      if (result.mode === "pdb_entry") {
        setSelectedCompId(null);
        setEntries(result.entries || []);
        setTotalCount(1);
        if (result.ligands?.length === 1) {
          await loadStructure(result.pdbId, result.ligands[0].compId);
        }
      } else {
        const comp = result.selectedCompId || result.candidates?.[0]?.compId;
        setSelectedCompId(comp);
        setEntries(result.entries || []);
        setTotalCount(result.totalCount ?? result.entries?.length ?? 0);
        if (result.message && !result.entries?.length) setError(result.message);
      }
    } catch (e) {
      setError(e?.message || "Search failed. Check your network connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const pickChemComp = async (compId) => {
    setSelectedCompId(compId);
    resetAnalysis();
    setLoading(true);
    setError(null);
    try {
      const { entries: rows, totalCount: total } = await searchPdbEntriesForChemComp(compId);
      setEntries(rows);
      setTotalCount(total);
      if (!rows.length) {
        setError(`No PDB structures contain ligand ${compId}.`);
      }
    } catch (e) {
      setError(e?.message || "Could not list PDB entries for this ligand.");
    } finally {
      setLoading(false);
    }
  };

  const handleEntryClick = async (row) => {
    resetAnalysis();
    if (resolveResult?.mode === "pdb_entry" && resolveResult.ligands?.length > 1 && !activeLigand) {
      setAnalysisError("Select which ligand to analyze in this PDB entry.");
      return;
    }
    const comp = selectedCompId || resolveResult?.selectedCompId;
    if (!comp) {
      setAnalysisError("Select a chemical component first.");
      return;
    }
    await loadStructure(row.pdbId, comp);
  };

  const handleLigandPick = async (compId) => {
    setActiveLigand(compId);
    if (activeEntry || resolveResult?.pdbId) {
      await loadStructure(activeEntry || resolveResult.pdbId, compId);
    }
  };

  return (
    <div
      className="panel"
      style={{
        marginTop: 24,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: "20px",
      }}
    >
      <h2 style={{ margin: "0 0 6px", fontSize: "18px", fontWeight: 700 }}>
        Co-crystal structure search (experimental)
      </h2>
      <p style={{ margin: "0 0 14px", fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.5 }}>
        Find measured protein–ligand complexes in the PDB by drug name,{" "}
        <a href="https://www.rcsb.org/docs/programmatic-access/web-apis-overview" target="_blank" rel="noreferrer">
          CCD
        </a>{" "}
        code, or PDB ID. Results use author residue numbering and a single bound ligand copy — not docked poses.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="e.g. imatinib, STI, 1IEP, sildenafil"
          style={{ flex: "1 1 220px", minWidth: 200, padding: "8px 10px", fontSize: "13px" }}
          aria-label="Drug name, CCD code, or PDB ID"
        />
        <button type="button" className="btn btn-primary" onClick={runSearch} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: "12px", color: "var(--red, #B91C1C)", marginBottom: 10 }}>
          {error}
        </p>
      )}

      {resolveResult?.candidates?.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: 6 }}>Matching chemical components (CCD)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {resolveResult.candidates.slice(0, 8).map((c) => (
              <button
                key={c.compId}
                type="button"
                className={`chip ${selectedCompId === c.compId ? "active" : ""}`}
                onClick={() => pickChemComp(c.compId)}
                style={{ fontSize: "11px" }}
              >
                <span className="mono">{c.compId}</span>
                {c.name ? ` — ${c.name.slice(0, 40)}${c.name.length > 40 ? "…" : ""}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {resolveResult?.mode === "pdb_entry" && resolveResult.ligands?.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: 6 }}>
            Choose ligand in {resolveResult.pdbId}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {resolveResult.ligands.map((l) => (
              <button
                key={l.compId}
                type="button"
                className={`chip ${activeLigand === l.compId ? "active" : ""}`}
                onClick={() => handleLigandPick(l.compId)}
                style={{ fontSize: "11px" }}
              >
                <span className="mono">{l.compId}</span> {l.name ? `— ${l.name.slice(0, 36)}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="score-table-wrap" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: 6 }}>
            {totalCount > entries.length
              ? `Showing ${entries.length} of ${totalCount} PDB entries (best resolution first).`
              : `${entries.length} PDB entr${entries.length === 1 ? "y" : "ies"}.`}
          </div>
          <table className="score-table" style={{ width: "100%", fontSize: "11px" }}>
            <thead>
              <tr>
                <th>PDB</th>
                <th>Title</th>
                <th>Protein</th>
                <th>Organism</th>
                <th>Res (Å)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.pdbId}>
                  <td className="mono">
                    <a href={rcsbStructurePageUrl(row.pdbId)} target="_blank" rel="noreferrer">
                      {row.pdbId}
                    </a>
                  </td>
                  <td>{row.title}</td>
                  <td>{row.proteinName}</td>
                  <td>{row.organism}</td>
                  <td className="mono">
                    {(() => {
                      const res = normalizeResolutionCombined(row.resolution);
                      return res != null ? res.toFixed(2) : "—";
                    })()}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="chip"
                      style={{ fontSize: "10px" }}
                      onClick={() => handleEntryClick(row)}
                    >
                      View pocket
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {instances.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: 6 }}>
            Ligand copies in this entry (author chain / resSeq)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {instances.map((inst) => (
              <button
                key={inst.instanceKey}
                type="button"
                className={`chip ${
                  selectedInstance?.instanceKey === inst.instanceKey ? "active" : ""
                }`}
                style={{ fontSize: "11px" }}
                onClick={() =>
                  loadStructure(activeEntry, activeLigand, {
                    chainId: inst.chainId,
                    resSeq: inst.resSeq,
                  })
                }
              >
                Chain <span className="mono">{inst.chainId}</span> res{" "}
                <span className="mono">{inst.resSeq}</span> ({inst.heavyAtomCount} atoms)
              </button>
            ))}
          </div>
        </div>
      )}

      {analysisLoading && (
        <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>Loading structure and computing measured contacts…</p>
      )}
      {analysisError && (
        <p role="alert" style={{ fontSize: "12px", color: "var(--red, #B91C1C)" }}>
          {analysisError}
        </p>
      )}

      {activeEntry && activeLigand && (
        <>
          <CocrystalMolstarViewer
            pdbId={activeEntry}
            ligandCode={activeLigand}
            cocrystalLigand={bundle?.bindingSiteSanity?.cocrystalLigand}
          />
          {bundle && (
            <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "8px 0" }}>
              Pocket residues within 4.5 Å: <span className="mono">{pocketCount}</span> · Measured contacts:{" "}
              <span className="mono">{bundle.interactions?.length ?? 0}</span>
            </p>
          )}
          {bundle && (
            <DockingInteractionsPanel
              interactionBundle={bundle}
              showMethodology
              title="Measured co-crystal contacts"
              experimental
            />
          )}
        </>
      )}
    </div>
  );
}
