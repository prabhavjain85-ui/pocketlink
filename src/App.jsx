import React, { useCallback, useMemo, useRef, useState } from "react";
import { rankCandidates } from "./aiCandidateRanking";
import { MAX_CANDIDATES, drugLikenessChecks } from "./scoreCandidates";

function PubChemStructureImage({ cid, compact }) {
  const [failed, setFailed] = useState(false);

  if (!cid || failed) {
    return (
      <div className={"pubchem-structure-fallback" + (compact ? " compact" : "")}>
        Structure image unavailable
      </div>
    );
  }

  return (
    <img
      className={"pubchem-structure-image" + (compact ? " compact" : "")}
      src={`https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid=${cid}&t=l`}
      alt={`PubChem structure for CID ${cid}`}
      title={`PubChem structure for CID ${cid}`}
      onError={() => setFailed(true)}
    />
  );
}

const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;

function StationIcon({ kind }) {
  if (kind === "target") {
    return (
      <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
        <path d="M6 16c0-6 4-10 10-10s10 4 10 10-4 10-10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M11 16c0-3.5 2-6 5-6s5 2.5 5 6-2 6-5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="16" cy="16" r="1.6" fill="currentColor" />
      </svg>
    );
  }
  if (kind === "candidate") {
    return (
      <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
        <circle cx="9" cy="11" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="21" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="17" cy="21" r="2.6" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11.2 12.4L18.8 9.6M11 13.2l4.5 6M19 11.3l-1 7" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
      <path d="M6 10h8M6 16h8M6 22h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 10h4a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M22 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M23 13l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      // clipboard blocked — field remains selectable
    }
  };
  return (
    <div className="copyfield">
      <div className="copyfield-label">{label}</div>
      <div className="copyfield-row">
        <div className={"copyfield-value" + (mono ? " mono" : "")}>{value}</div>
        <button className="copy-btn" onClick={doCopy} type="button">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function getCompoundSmiles(compound) {
  if (!compound) return "";
  return compound.IsomericSMILES || compound.CanonicalSMILES || compound.SMILES || compound.ConnectivitySMILES || "";
}

function prettyName(result, query) {
  const q = (query || "").trim();
  if (q && q.length <= 48 && !q.includes(",") && q.split(" ").length <= 6) return q;
  if (result?.IUPACName) {
    return result.IUPACName.length > 52 ? `${result.IUPACName.slice(0, 50)}…` : result.IUPACName;
  }
  return result?.CID ? `CID ${result.CID}` : "Unknown compound";
}

function Panel({ title, eyebrow, kind, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className={"station-icon icon-" + kind}>
          <StationIcon kind={kind} />
        </span>
        <div>
          <div className="panel-eyebrow">{eyebrow}</div>
          <div className="panel-title">{title}</div>
        </div>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function CandidateRow({ candidate, selected, recommended, onToggle, onRemove }) {
  const checks = drugLikenessChecks(candidate);
  const pass = checks.filter((c) => c.pass).length;
  return (
    <div className={"shortlist-card" + (selected ? " selected" : "") + (recommended ? " recommended" : "")}>
      <button type="button" className="shortlist-main" onClick={onToggle}>
        <PubChemStructureImage cid={candidate.CID} compact />
        <div className="shortlist-copy">
          <div className="shortlist-top">
            <strong>{candidate.displayName || prettyName(candidate)}</strong>
            <span className="cid">CID {candidate.CID}</span>
          </div>
          <div className="shortlist-formula">{candidate.MolecularFormula}</div>
          <div className="shortlist-smiles">{getCompoundSmiles(candidate)}</div>
          <div className="shortlist-meta">
            MW {Number(candidate.MolecularWeight).toFixed(1)} · XLogP {candidate.XLogP ?? "n/a"} · HBD {candidate.HBondDonorCount} · HBA {candidate.HBondAcceptorCount} · TPSA {candidate.TPSA}
          </div>
          <div className={"shortlist-pass " + (pass >= 5 ? "good" : "warn")}>{pass}/6 drug-likeness checks pass{recommended ? " · AI pick" : ""}</div>
        </div>
      </button>
      <button type="button" className="shortlist-remove" onClick={onRemove} aria-label="Remove from shortlist">
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [pQuery, setPQuery] = useState("");
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");
  const [pResults, setPResults] = useState([]);
  const [protein, setProtein] = useState(null);

  const [cQuery, setCQuery] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");
  const [cResult, setCResult] = useState(null);
  const [candidates, setCandidates] = useState([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const [handoffCid, setHandoffCid] = useState(null);

  const [dockCopied, setDockCopied] = useState(false);
  const [admeCopied, setAdmeCopied] = useState(false);

  const reqId = useRef(0);

  const fetchEntrySummary = async (id) => {
    const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
    if (!res.ok) return null;
    const d = await res.json();
    const method = (d.exptl && d.exptl[0] && d.exptl[0].method) || "—";
    const res_ = d.rcsb_entry_info && d.rcsb_entry_info.resolution_combined;
    const resolution = res_ && res_.length ? `${res_[0]} Å` : "—";
    const title = (d.struct && d.struct.title) || "Untitled entry";
    const date = (d.rcsb_accession_info && d.rcsb_accession_info.initial_release_date) || "";
    return { id, title, method, resolution, date: date ? date.slice(0, 4) : "—" };
  };

  const searchProtein = useCallback(async () => {
    const q = pQuery.trim();
    if (!q) return;
    const myReq = ++reqId.current;
    setPLoading(true);
    setPError("");
    setPResults([]);
    try {
      if (PDB_ID_RE.test(q)) {
        const direct = await fetchEntrySummary(q.toUpperCase());
        if (direct) {
          if (reqId.current === myReq) setPResults([direct]);
          setPLoading(false);
          return;
        }
      }
      const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: { type: "terminal", service: "full_text", parameters: { value: q } },
          return_type: "entry",
          request_options: { paginate: { start: 0, rows: 6 } },
        }),
      });
      if (!res.ok) throw new Error("search failed");
      const data = await res.json();
      const ids = (data.result_set || []).map((r) => r.identifier);
      if (!ids.length) {
        if (reqId.current === myReq) setPError(`No PDB entries matched "${q}". Try a protein name, gene, or a 4-character PDB ID.`);
        setPLoading(false);
        return;
      }
      const summaries = await Promise.all(ids.map(fetchEntrySummary));
      if (reqId.current === myReq) setPResults(summaries.filter(Boolean));
    } catch (e) {
      if (reqId.current === myReq) setPError("Couldn't reach RCSB PDB. Check your connection and try again.");
    } finally {
      if (reqId.current === myReq) setPLoading(false);
    }
  }, [pQuery]);

  const searchCompound = useCallback(async () => {
    const q = cQuery.trim();
    if (!q) return;
    setCLoading(true);
    setCError("");
    setCResult(null);
    try {
      const props = [
        "MolecularFormula",
        "MolecularWeight",
        "CanonicalSMILES",
        "IsomericSMILES",
        "XLogP",
        "HBondDonorCount",
        "HBondAcceptorCount",
        "RotatableBondCount",
        "TPSA",
        "IUPACName",
      ].join(",");
      const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/${props}/JSON`;
      const res = await fetch(url);
      if (!res.ok) {
        setCError(`PubChem has no compound named "${q}". Try the common or generic drug name (e.g. "ibuprofen", "imatinib").`);
        setCLoading(false);
        return;
      }
      const data = await res.json();
      const p = data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0];
      if (!p) {
        setCError(`PubChem returned no usable data for "${q}".`);
        setCLoading(false);
        return;
      }
      setCResult({ ...p, displayName: prettyName(p, q) });
    } catch (e) {
      setCError("Couldn't reach PubChem. Check your connection and try again.");
    } finally {
      setCLoading(false);
    }
  }, [cQuery]);

  const alreadyStaged = cResult && candidates.some((c) => c.CID === cResult.CID);
  const shortlistFull = candidates.length >= MAX_CANDIDATES && !alreadyStaged;

  const addOrRemovePreview = () => {
    if (!cResult) return;
    setAiResult(null);
    setAiError("");
    setCandidates((prev) => {
      if (prev.some((c) => c.CID === cResult.CID)) {
        const next = prev.filter((c) => c.CID !== cResult.CID);
        setHandoffCid((cid) => (String(cid) === String(cResult.CID) ? (next[0]?.CID ?? null) : cid));
        return next;
      }
      if (prev.length >= MAX_CANDIDATES) return prev;
      return [...prev, cResult];
    });
  };

  const removeCandidate = (cid) => {
    setAiResult(null);
    setAiError("");
    setCandidates((prev) => prev.filter((c) => c.CID !== cid));
    setHandoffCid((current) => (String(current) === String(cid) ? null : current));
  };

  const analyze = async () => {
    if (candidates.length < 2) return;
    setAiLoading(true);
    setAiError("");
    try {
      const data = await rankCandidates(candidates, protein);
      setAiResult(data);
      if (data?.recommended?.cid) setHandoffCid(data.recommended.cid);
    } catch (e) {
      setAiError(e.message || "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const recommendedCid = aiResult?.recommended?.cid;
  const ranking = aiResult?.ranking || [];
  const compound = useMemo(() => {
    if (!candidates.length) return null;
    const fromHandoff = candidates.find((c) => String(c.CID) === String(handoffCid));
    const fromAi = candidates.find((c) => String(c.CID) === String(recommendedCid));
    return fromHandoff || fromAi || candidates[0];
  }, [candidates, handoffCid, recommendedCid]);

  const smiles = getCompoundSmiles(compound);
  const previewChecks = cResult ? drugLikenessChecks(cResult) : [];
  const previewPass = previewChecks.filter((c) => c.pass).length;
  const progress =
    (protein ? 0.25 : 0) +
    (candidates.length ? 0.25 : 0) +
    (aiResult ? 0.25 : 0) +
    (protein && compound ? 0.25 : 0);

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      return false;
    }
  };

  const openSwissDock = () => {
    window.open("https://www.swissdock.ch/", "_blank", "noopener,noreferrer");
    if (protein) {
      copyToClipboard(protein.id).then((ok) => {
        setDockCopied(ok);
        if (ok) setTimeout(() => setDockCopied(false), 4000);
      });
    }
  };
  const openSwissADME = () => {
    window.open("https://www.swissadme.ch/", "_blank", "noopener,noreferrer");
    if (smiles) {
      copyToClipboard(smiles).then((ok) => {
        setAdmeCopied(ok);
        if (ok) setTimeout(() => setAdmeCopied(false), 4000);
      });
    }
  };

  const winner = recommendedCid
    ? candidates.find((c) => String(c.CID) === String(recommendedCid))
    : null;

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        :root {
          --bg: #0B1420;
          --surface: #121E30;
          --surface-raised: #192840;
          --border: #28394F;
          --text: #E7EDF5;
          --text-dim: #8CA0B8;
          --cyan: #4FD8C4;
          --amber: #F0A855;
          --violet: #9C90EE;
          --green: #6FCF97;
          --red: #E2725B;
        }
        * { box-sizing: border-box; }
        .app {
          background: radial-gradient(1200px 500px at 80% -10%, #16273E 0%, var(--bg) 55%), var(--bg);
          color: var(--text);
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100%;
          padding: 40px 24px 64px;
        }
        .mono { font-family: 'IBM Plex Mono', monospace; }

        .hero { max-width: 1040px; margin: 0 auto 36px; }
        .hero-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--cyan);
          margin-bottom: 14px;
        }
        .hero h1 {
          font-family: 'Fraunces', serif;
          font-weight: 500;
          font-size: clamp(32px, 5vw, 48px);
          line-height: 1.08;
          margin: 0 0 14px;
          letter-spacing: -0.01em;
        }
        .hero p {
          color: var(--text-dim);
          font-size: 16px;
          line-height: 1.55;
          max-width: 720px;
          margin: 0;
        }

        .trace-wrap { max-width: 1040px; margin: 0 auto 20px; }
        .trace { display: flex; align-items: center; gap: 0; padding: 0 6px; }
        .trace-node {
          width: 30px; height: 30px; border-radius: 50%;
          border: 1.5px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-dim);
          background: var(--surface);
          flex-shrink: 0;
          transition: border-color .3s, color .3s;
        }
        .trace-node.lit { border-color: var(--cyan); color: var(--cyan); }
        .trace-line {
          flex: 1; height: 1.5px; background: var(--border);
          position: relative; margin: 0 6px; overflow: hidden;
        }
        .trace-line-fill {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, var(--cyan), var(--amber));
          width: 0%; transition: width .5s ease;
        }

        .grid { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 780px) { .grid { grid-template-columns: 1fr; } }

        .panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 22px;
          display: flex;
          flex-direction: column;
        }
        .panel-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
        .station-icon {
          width: 34px; height: 34px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          background: var(--surface-raised);
          border: 1px solid var(--border);
        }
        .icon-target { color: var(--cyan); }
        .icon-candidate { color: var(--amber); }
        .icon-handoff { color: var(--violet); }
        .panel-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--text-dim);
        }
        .panel-title { font-family: 'Fraunces', serif; font-size: 19px; margin-top: 2px; }

        .search-row { display: flex; gap: 8px; margin-bottom: 14px; }
        .search-row input {
          flex: 1;
          min-width: 0;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 10px 12px;
          color: var(--text);
          font-size: 14px;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .search-row input:focus { outline: 2px solid var(--cyan); outline-offset: 1px; }
        .search-row input::placeholder { color: var(--text-dim); }
        .btn {
          border: none;
          border-radius: 7px;
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'IBM Plex Sans', sans-serif;
          transition: opacity .15s, transform .1s;
        }
        .btn:active { transform: scale(0.97); }
        .btn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
        .btn-target { background: var(--cyan); color: #06201C; }
        .btn-candidate { background: var(--amber); color: #331C04; }
        .btn-handoff { background: var(--violet); color: #1C1740; }
        .btn:disabled { opacity: .5; cursor: default; }
        .btn-ghost { background: transparent; border: 1px solid var(--border); color: var(--text); }

        .hint { color: var(--text-dim); font-size: 12.5px; margin: -6px 0 14px; }
        .error-msg { color: var(--red); font-size: 13.5px; margin: 4px 0 10px; line-height: 1.5; }

        .result-list { display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; }
        .result-card {
          border: 1px solid var(--border);
          background: var(--surface-raised);
          border-radius: 8px;
          padding: 12px 14px;
          cursor: pointer;
          text-align: left;
          color: var(--text);
        }
        .result-card:hover { border-color: var(--cyan); }
        .result-card.selected { border-color: var(--cyan); background: #16342E; }
        .result-card-top { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
        .result-id { font-family: 'IBM Plex Mono', monospace; color: var(--cyan); font-size: 13px; font-weight: 500; }
        .result-meta { color: var(--text-dim); font-size: 11.5px; font-family: 'IBM Plex Mono', monospace; }
        .result-title { font-size: 13.5px; margin-top: 4px; color: var(--text); line-height: 1.4; }

        .compound-card {
          border: 1px solid var(--border);
          background: var(--surface-raised);
          border-radius: 8px;
          padding: 16px;
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .compound-visual { flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
        .pubchem-structure-image,
        .pubchem-structure-fallback {
          width: 200px;
          height: 160px;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .pubchem-structure-image {
          display: block;
          object-fit: contain;
          padding: 8px;
        }
        .pubchem-structure-image.compact,
        .pubchem-structure-fallback.compact {
          width: 64px;
          height: 64px;
          padding: 4px;
        }
        .pubchem-structure-fallback {
          align-items: center;
          color: var(--red);
          display: flex;
          font-size: 12px;
          justify-content: center;
          padding: 12px;
          text-align: center;
        }
        .compound-thumb-label { font-size: 10.5px; color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; }
        .compound-name { font-family: 'Fraunces', serif; font-size: 17px; margin-bottom: 2px; }
        .compound-formula { font-family: 'IBM Plex Mono', monospace; color: var(--amber); font-size: 13px; margin-bottom: 8px; }
        .compound-smiles {
          background: rgba(79, 216, 196, 0.08);
          border: 1px solid rgba(79, 216, 196, 0.18);
          border-radius: 7px;
          color: var(--cyan);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          line-height: 1.45;
          margin-bottom: 10px;
          padding: 8px 10px;
          word-break: break-all;
        }
        .compound-smiles-label { color: var(--text-dim); display: block; font-size: 10px; letter-spacing: .08em; margin-bottom: 3px; text-transform: uppercase; }
        .compound-props { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px; font-size: 12.5px; color: var(--text-dim); }
        .compound-props b { color: var(--text); font-weight: 500; }

        .checklist { margin-top: 14px; border-top: 1px solid var(--border); padding-top: 14px; }
        .checklist-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .checklist-title { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); font-family: 'IBM Plex Mono', monospace; }
        .checklist-score { font-family: 'IBM Plex Mono', monospace; font-size: 12px; padding: 2px 8px; border-radius: 5px; }
        .score-good { background: #163425; color: var(--green); }
        .score-warn { background: #3A2A17; color: var(--amber); }
        .check-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; border-bottom: 1px dashed var(--border); }
        .check-row:last-child { border-bottom: none; }
        .check-label { color: var(--text-dim); display: flex; align-items: center; gap: 7px; }
        .check-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .dot-pass { background: var(--green); }
        .dot-fail { background: var(--red); }
        .check-value { font-family: 'IBM Plex Mono', monospace; color: var(--text); }
        .lipinski-note { color: var(--text-dim); font-size: 11.5px; margin-top: 10px; line-height: 1.5; }

        .shortlist-head {
          margin-top: 16px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 8px;
          font-size: 12px;
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          letter-spacing: .06em;
          text-transform: uppercase;
        }
        .shortlist { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .shortlist-card {
          display: flex;
          gap: 8px;
          align-items: stretch;
          border: 1px solid var(--border);
          background: var(--surface-raised);
          border-radius: 8px;
          overflow: hidden;
        }
        .shortlist-card.selected { border-color: var(--amber); }
        .shortlist-card.recommended { border-color: var(--green); }
        .shortlist-main {
          flex: 1;
          min-width: 0;
          display: flex;
          gap: 10px;
          text-align: left;
          background: transparent;
          border: 0;
          color: var(--text);
          padding: 10px;
          cursor: pointer;
        }
        .shortlist-copy { min-width: 0; flex: 1; }
        .shortlist-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .shortlist-top strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cid { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--text-dim); }
        .shortlist-formula { font-family: 'IBM Plex Mono', monospace; color: var(--amber); font-size: 11px; margin-top: 2px; }
        .shortlist-smiles {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: var(--cyan);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 3px;
        }
        .shortlist-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
        .shortlist-pass { font-size: 11px; margin-top: 4px; }
        .shortlist-pass.good { color: var(--green); }
        .shortlist-pass.warn { color: var(--amber); }
        .shortlist-remove {
          width: 36px;
          border: 0;
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
          font-size: 20px;
        }
        .shortlist-remove:hover { color: var(--red); }

        .ai-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .ai-kicker { font-family: 'Fraunces', serif; font-size: 22px; }
        .recommend {
          border: 1px solid var(--green);
          background: #14291F;
          border-radius: 9px;
          padding: 16px;
        }
        .recommend-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: .1em;
          text-transform: uppercase;
          color: var(--green);
          margin-bottom: 6px;
        }
        .winner { font-family: 'Fraunces', serif; font-size: 24px; color: var(--green); }
        .winner-score { font-family: 'IBM Plex Mono', monospace; color: var(--green); margin: 4px 0 8px; }
        .winner-reason { font-size: 14px; line-height: 1.55; color: var(--text); }
        .ranking { margin-top: 16px; display: flex; flex-direction: column; gap: 0; }
        .rank-row {
          display: grid;
          grid-template-columns: 42px 1fr auto;
          gap: 10px;
          align-items: start;
          border-bottom: 1px dashed var(--border);
          padding: 10px 0;
        }
        .rank-num { font-family: 'IBM Plex Mono', monospace; color: var(--text-dim); padding-top: 2px; }
        .rank-name { font-size: 14px; font-weight: 500; }
        .rank-score { font-family: 'IBM Plex Mono', monospace; color: var(--cyan); padding-top: 2px; }
        .rank-bullets { margin: 6px 0 0; padding-left: 18px; color: var(--text-dim); font-size: 12.5px; line-height: 1.5; }
        .source-pill {
          display: inline-block;
          margin-top: 12px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--violet);
          border: 1px solid rgba(156, 144, 238, 0.4);
          border-radius: 999px;
          padding: 3px 8px;
        }

        .handoff-panel { max-width: 1040px; margin: 20px auto 0; }
        .copyfield { margin-bottom: 14px; }
        .copyfield-label { font-size: 11.5px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .08em; font-family: 'IBM Plex Mono', monospace; margin-bottom: 6px; }
        .copyfield-row { display: flex; gap: 8px; align-items: center; }
        .copyfield-value {
          flex: 1;
          background: var(--surface-raised);
          border: 1px solid var(--border);
          border-radius: 7px;
          padding: 9px 12px;
          font-size: 13.5px;
          word-break: break-all;
        }
        .copy-btn {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 7px;
          padding: 9px 12px;
          font-size: 12.5px;
          cursor: pointer;
          flex-shrink: 0;
          font-family: 'IBM Plex Mono', monospace;
        }
        .copy-btn:hover { border-color: var(--cyan); color: var(--cyan); }

        .handoff-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
        .handoff-pick { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
        .chip {
          border: 1px solid var(--border);
          background: var(--surface-raised);
          color: var(--text);
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .chip.active { border-color: var(--violet); color: var(--violet); }
        .empty-state { color: var(--text-dim); font-size: 14px; line-height: 1.6; text-align: center; padding: 20px 10px; }

        .footer-note { max-width: 1040px; margin: 40px auto 0; color: var(--text-dim); font-size: 12.5px; line-height: 1.6; border-top: 1px solid var(--border); padding-top: 18px; }
        .footer-note a { color: var(--cyan); }

        .spinner {
          width: 14px; height: 14px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.25);
          border-top-color: currentColor;
          animation: spin .7s linear infinite;
          display: inline-block;
          vertical-align: middle;
          margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (prefers-reduced-motion: reduce) {
          .spinner { animation: none; }
          .trace-line-fill { transition: none; }
        }
        @media (max-width: 780px) {
          .app { padding: 28px 14px 48px; }
          .compound-card { flex-direction: column; }
          .ai-toolbar { flex-direction: column; }
        }
      `}</style>

      <div className="hero">
        <div className="hero-eyebrow">PocketLink · discovery staging bench</div>
        <h1>Stage a target, shortlist up to five molecules,<br />then let AI pick the strongest follow-up.</h1>
        <p>
          Search live PDB structures and PubChem compounds, compare up to five candidates on drug-likeness,
          and generate a transparent recommendation before handing the winner to SwissDock and SwissADME.
        </p>
      </div>

      <div className="trace-wrap">
        <div className="trace">
          <span className={"trace-node" + (protein ? " lit" : "")}>1</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: protein ? "100%" : "0%" }} /></span>
          <span className={"trace-node" + (candidates.length ? " lit" : "")}>2</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: candidates.length >= 2 ? "100%" : candidates.length ? "50%" : "0%" }} /></span>
          <span className={"trace-node" + (aiResult ? " lit" : "")}>3</span>
          <span className="trace-line"><span className="trace-line-fill" style={{ width: progress >= 1 ? "100%" : aiResult ? "50%" : "0%" }} /></span>
          <span className={"trace-node" + (protein && compound ? " lit" : "")}>4</span>
        </div>
      </div>

      <div className="grid">
        <Panel eyebrow="Station 1 — RCSB PDB" title="Find a target" kind="target">
          <div className="search-row">
            <input
              placeholder="Protein name, gene, or PDB ID (e.g. EGFR, 1M17)"
              value={pQuery}
              onChange={(e) => setPQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchProtein()}
            />
            <button className="btn btn-target" onClick={searchProtein} disabled={pLoading}>
              {pLoading ? <span className="spinner" /> : null}Search
            </button>
          </div>
          <div className="hint">Live query against search.rcsb.org and data.rcsb.org.</div>
          {pError && <div className="error-msg">{pError}</div>}
          {pResults.length > 0 && (
            <div className="result-list">
              {pResults.map((r) => (
                <button
                  key={r.id}
                  className={"result-card" + (protein && protein.id === r.id ? " selected" : "")}
                  onClick={() => setProtein(r)}
                  type="button"
                >
                  <div className="result-card-top">
                    <span className="result-id">{r.id}</span>
                    <span className="result-meta">{r.method} · {r.resolution} · {r.date}</span>
                  </div>
                  <div className="result-title">{r.title}</div>
                </button>
              ))}
            </div>
          )}
          {!pResults.length && !pLoading && !pError && (
            <div className="empty-state">No target staged yet.</div>
          )}
        </Panel>

        <Panel eyebrow="Station 2 — PubChem" title="Build a 5-molecule shortlist" kind="candidate">
          <div className="search-row">
            <input
              placeholder="Compound name (e.g. imatinib, caffeine)"
              value={cQuery}
              onChange={(e) => setCQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchCompound()}
            />
            <button className="btn btn-candidate" onClick={searchCompound} disabled={cLoading}>
              {cLoading ? <span className="spinner" /> : null}Search
            </button>
          </div>
          <div className="hint">Search one compound at a time and add it to the shortlist. AI ranking unlocks at 2–5 molecules.</div>
          {cError && <div className="error-msg">{cError}</div>}
          {cResult && (
            <div>
              <div className="compound-card">
                <div className="compound-visual">
                  <PubChemStructureImage cid={cResult.CID} />
                  <span className="compound-thumb-label">PubChem reference structure</span>
                </div>
                <div>
                  <div className="compound-name">{cResult.displayName}</div>
                  <div className="compound-formula">{cResult.MolecularFormula} · CID {cResult.CID}</div>
                  <div className="compound-smiles">
                    <span className="compound-smiles-label">Selected structure SMILES</span>
                    {getCompoundSmiles(cResult) || "SMILES unavailable"}
                  </div>
                  <div className="compound-props">
                    <span>MW <b>{Number(cResult.MolecularWeight).toFixed(1)}</b></span>
                    <span>XLogP <b>{cResult.XLogP !== undefined ? cResult.XLogP : "n/a"}</b></span>
                    <span>HBD <b>{cResult.HBondDonorCount}</b></span>
                    <span>HBA <b>{cResult.HBondAcceptorCount}</b></span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <button
                  className={"btn " + (alreadyStaged ? "btn-ghost" : "btn-candidate")}
                  onClick={addOrRemovePreview}
                  type="button"
                  disabled={shortlistFull}
                  style={{ width: "100%" }}
                >
                  {alreadyStaged ? "Remove from shortlist" : shortlistFull ? "Shortlist is full (5/5)" : `Add to shortlist (${candidates.length}/5)`}
                </button>
              </div>

              <div className="checklist">
                <div className="checklist-head">
                  <span className="checklist-title">Quick drug-likeness screen</span>
                  <span className={"checklist-score " + (previewPass >= 5 ? "score-good" : "score-warn")}>{previewPass}/6 pass</span>
                </div>
                {previewChecks.map((c) => (
                  <div className="check-row" key={c.label}>
                    <span className="check-label">
                      <span className={"check-dot " + (c.pass ? "dot-pass" : "dot-fail")} />
                      {c.label}
                    </span>
                    <span className="check-value">{c.value}</span>
                  </div>
                ))}
                <div className="lipinski-note">
                  Lipinski Rule-of-Five + Veber criteria, computed from PubChem's own properties — a fast pre-screen,
                  not a substitute for SwissADME's full pharmacokinetic model.
                </div>
              </div>
            </div>
          )}
          {!cResult && !cLoading && !cError && candidates.length === 0 && (
            <div className="empty-state">No candidates staged yet. Search a compound and add it to the shortlist.</div>
          )}

          {candidates.length > 0 && (
            <>
              <div className="shortlist-head">
                <span>Shortlist</span>
                <span>{candidates.length}/5 selected{candidates.length < 2 ? " · add at least one more for AI" : " · ready for AI"}</span>
              </div>
              <div className="shortlist">
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.CID}
                    candidate={c}
                    selected={String(compound?.CID) === String(c.CID)}
                    recommended={String(recommendedCid) === String(c.CID)}
                    onToggle={() => setHandoffCid(c.CID)}
                    onRemove={() => removeCandidate(c.CID)}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 3 — AI prioritization" title="Which molecule should we take forward?" kind="handoff">
          <div className="ai-toolbar">
            <div>
              <div className="ai-kicker">Compare the shortlist</div>
              <div className="hint" style={{ margin: "6px 0 0" }}>
                Ranks 2–5 molecules from the supplied PubChem properties. If an OpenAI key is configured on Vercel, a language model writes the comparison; otherwise PocketLink uses its built-in drug-likeness model.
              </div>
            </div>
            <button className="btn btn-handoff" onClick={analyze} disabled={candidates.length < 2 || aiLoading} type="button">
              {aiLoading ? <span className="spinner" /> : null}
              {aiLoading ? "Analyzing…" : `Analyze ${candidates.length || ""} candidate${candidates.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {aiError && <div className="error-msg">{aiError}</div>}
          {!aiResult && !aiLoading && (
            <div className="empty-state">
              Select 2–5 molecules in Station 2, then run analysis. PocketLink will recommend the best computational follow-up and explain why.
            </div>
          )}
          {aiResult && (
            <div className="recommend">
              <div className="recommend-label">Recommended candidate</div>
              <div className="winner">{winner?.displayName || (recommendedCid ? `CID ${recommendedCid}` : "—")}</div>
              <div className="winner-score">Prioritization score {aiResult.recommended?.score ?? "—"}/100</div>
              <div className="winner-reason">{aiResult.recommended?.reason}</div>
              <div className="ranking">
                {ranking.map((row) => {
                  const match = candidates.find((c) => String(c.CID) === String(row.cid));
                  return (
                    <div className="rank-row" key={row.cid}>
                      <div className="rank-num">#{row.rank}</div>
                      <div>
                        <div className="rank-name">{match?.displayName || `CID ${row.cid}`}</div>
                        <ul className="rank-bullets">
                          {(row.strengths || []).slice(0, 2).map((item, i) => <li key={`s${i}`}>{item}</li>)}
                          {(row.concerns || []).slice(0, 1).map((item, i) => <li key={`c${i}`}>Concern: {item}</li>)}
                        </ul>
                      </div>
                      <div className="rank-score">{row.score}/100</div>
                    </div>
                  );
                })}
              </div>
              <div className="lipinski-note" style={{ marginTop: 12 }}>{aiResult.summary}</div>
              <div className="lipinski-note"><strong>Limitations:</strong> {(aiResult.limitations || []).join(" ")}</div>
              <div className="source-pill">
                {aiResult.source === "llm" ? "Ranked with OpenAI, grounded in supplied properties" : "Ranked with PocketLink's drug-likeness model"}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="handoff-panel">
        <Panel eyebrow="Station 4 — handoff" title="Send the chosen molecule to SwissDock & SwissADME" kind="handoff">
          {!protein && !candidates.length && (
            <div className="empty-state">
              Stage a target and a shortlist above — PocketLink will prepare the exact inputs to paste into
              SwissDock and SwissADME.
            </div>
          )}
          {(protein || candidates.length > 0) && (
            <div>
              <div className="lipinski-note" style={{ marginTop: 0, marginBottom: 14 }}>
                The ranking is a triage aid. It does not replace docking, ADME prediction, toxicity assessment, or experimental validation.
              </div>
              {candidates.length > 1 && (
                <div className="handoff-pick">
                  {candidates.map((c) => (
                    <button
                      key={c.CID}
                      type="button"
                      className={"chip" + (String(compound?.CID) === String(c.CID) ? " active" : "")}
                      onClick={() => setHandoffCid(c.CID)}
                    >
                      {c.displayName}{String(recommendedCid) === String(c.CID) ? " · AI pick" : ""}
                    </button>
                  ))}
                </div>
              )}
              {protein && <CopyField label="Target — PDB ID" value={protein.id} />}
              {compound && <CopyField label={`${compound.displayName} — SMILES`} value={smiles} />}
              <div className="handoff-actions">
                <button className="btn btn-handoff" onClick={openSwissDock} disabled={!protein} type="button">
                  {dockCopied ? "PDB ID copied ✓" : "Open SwissDock →"}
                </button>
                <button className="btn btn-handoff" onClick={openSwissADME} disabled={!compound} type="button">
                  {admeCopied ? "SMILES copied ✓" : "Open SwissADME →"}
                </button>
              </div>
              <div className="lipinski-note" style={{ marginTop: 14 }}>
                Clicking either button copies the value to your clipboard automatically, then opens the tool
                in a new tab. Neither tool offers a public API for automatic submission, so a manual paste
                into their own page is still the last step.
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="footer-note">
        Structures from the <a href="https://www.rcsb.org" target="_blank" rel="noreferrer">RCSB Protein Data Bank</a>.
        Compound data from <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noreferrer">PubChem</a> (NCBI).
        Docking via <a href="https://www.swissdock.ch" target="_blank" rel="noreferrer">SwissDock</a> and ADME
        prediction via <a href="https://www.swissadme.ch" target="_blank" rel="noreferrer">SwissADME</a> (SIB Swiss
        Institute of Bioinformatics) — both run on their own servers and are opened here, not embedded.
        AI output is computational prioritization only and should not be treated as evidence of biological activity or clinical efficacy.
      </div>
    </div>
  );
}
