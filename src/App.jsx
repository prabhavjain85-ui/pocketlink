import React, { useCallback, useRef, useState } from "react";

const PDB_ID_RE = /^[0-9][A-Za-z0-9]{3}$/;
const MAX_CANDIDATES = 5;

function smilesOf(c) {
  return c?.IsomericSMILES || c?.CanonicalSMILES || c?.SMILES || c?.ConnectivitySMILES || "";
}

function Panel({ eyebrow, title, kind, children }) {
  return <section className="panel"><div className="panel-head"><div className={`station-icon icon-${kind}`}>{kind === "target" ? "◎" : kind === "candidate" ? "◇" : "✦"}</div><div><div className="panel-eyebrow">{eyebrow}</div><div className="panel-title">{title}</div></div></div>{children}</section>;
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return <div className="copyfield"><div className="copyfield-label">{label}</div><div className="copyfield-row"><div className="copyfield-value mono">{value}</div><button className="copy-btn" onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }}>{copied ? "Copied" : "Copy"}</button></div></div>;
}

function CandidateCard({ c, selected, onToggle }) {
  const checks = [c.MolecularWeight <= 500, c.XLogP === undefined || c.XLogP <= 5, c.HBondDonorCount <= 5, c.HBondAcceptorCount <= 10, c.RotatableBondCount <= 10, c.TPSA <= 140];
  const pass = checks.filter(Boolean).length;
  return <button type="button" className={`candidate-card ${selected ? "candidate-selected" : ""}`} onClick={onToggle}>
    <img className="candidate-img" src={`https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid=${c.CID}&t=l`} alt="" />
    <div className="candidate-main"><div className="candidate-top"><strong>{c.displayName || `CID ${c.CID}`}</strong><span className="cid">CID {c.CID}</span></div><div className="formula">{c.MolecularFormula}</div><div className="smiles">{smilesOf(c)}</div><div className="mini-props">MW {Number(c.MolecularWeight).toFixed(1)} · XLogP {c.XLogP ?? "n/a"} · HBD {c.HBondDonorCount} · HBA {c.HBondAcceptorCount} · TPSA {c.TPSA}</div><div className="pass-pill">{pass}/6 drug-likeness checks pass</div></div><div className="select-mark">{selected ? "✓" : "+"}</div>
  </button>;
}

export default function App() {
  const [pQuery, setPQuery] = useState("");
  const [pResults, setPResults] = useState([]);
  const [protein, setProtein] = useState(null);
  const [pLoading, setPLoading] = useState(false);
  const [pError, setPError] = useState("");

  const [cQuery, setCQuery] = useState("");
  const [cResult, setCResult] = useState(null);
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");
  const [candidates, setCandidates] = useState([]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);
  const reqId = useRef(0);

  const fetchEntrySummary = async (id) => {
    const res = await fetch(`https://data.rcsb.org/rest/v1/core/entry/${id}`);
    if (!res.ok) return null;
    const d = await res.json();
    const resolution = d.rcsb_entry_info?.resolution_combined?.[0];
    return { id, title: d.struct?.title || "Untitled entry", method: d.exptl?.[0]?.method || "—", resolution: resolution ? `${resolution} Å` : "—", date: d.rcsb_accession_info?.initial_release_date?.slice(0, 4) || "—" };
  };

  const searchProtein = useCallback(async () => {
    const q = pQuery.trim(); if (!q) return;
    const id = ++reqId.current; setPLoading(true); setPError(""); setPResults([]);
    try {
      if (PDB_ID_RE.test(q)) { const direct = await fetchEntrySummary(q.toUpperCase()); if (direct) { setPResults([direct]); setPLoading(false); return; } }
      const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: { type: "terminal", service: "full_text", parameters: { value: q } }, return_type: "entry", request_options: { paginate: { start: 0, rows: 6 } } }) });
      if (!res.ok) throw new Error();
      const data = await res.json(); const ids = (data.result_set || []).map(x => x.identifier);
      const summaries = await Promise.all(ids.map(fetchEntrySummary));
      if (id === reqId.current) setPResults(summaries.filter(Boolean));
    } catch { if (id === reqId.current) setPError("Couldn't reach RCSB PDB. Check your connection and try again."); }
    finally { if (id === reqId.current) setPLoading(false); }
  }, [pQuery]);

  const searchCompound = useCallback(async () => {
    const q = cQuery.trim(); if (!q) return;
    setCLoading(true); setCError(""); setCResult(null);
    try {
      const props = ["MolecularFormula","MolecularWeight","CanonicalSMILES","IsomericSMILES","XLogP","HBondDonorCount","HBondAcceptorCount","RotatableBondCount","TPSA","IUPACName"].join(",");
      const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(q)}/property/${props}/JSON`);
      if (!res.ok) throw new Error(`PubChem has no compound named "${q}".`);
      const p = (await res.json()).PropertyTable?.Properties?.[0]; if (!p) throw new Error("PubChem returned no usable compound data.");
      setCResult({ ...p, displayName: p.IUPACName || q });
    } catch (e) { setCError(e.message || "Couldn't reach PubChem."); }
    finally { setCLoading(false); }
  }, [cQuery]);

  const toggleCandidate = () => {
    if (!cResult) return;
    setAiResult(null); setAiError("");
    setCandidates(prev => prev.some(x => x.CID === cResult.CID) ? prev.filter(x => x.CID !== cResult.CID) : prev.length < MAX_CANDIDATES ? [...prev, cResult] : prev);
  };

  const analyze = async () => {
    if (candidates.length < 2) return;
    setAiLoading(true); setAiError(""); setAiResult(null);
    try {
      const response = await fetch("/api/rank-candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidates: candidates.map(c => ({ name: c.displayName, cid: c.CID, smiles: smilesOf(c), molecularFormula: c.MolecularFormula, molecularWeight: c.MolecularWeight, xlogp: c.XLogP, hbd: c.HBondDonorCount, hba: c.HBondAcceptorCount, rotatableBonds: c.RotatableBondCount, tpsa: c.TPSA })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "AI analysis failed."); setAiResult(data);
    } catch (e) { setAiError(e.message || "AI analysis failed."); }
    finally { setAiLoading(false); }
  };

  const progress = (protein ? 1 : 0) + candidates.length ? 1 : 0;
  const recommended = aiResult?.recommended;
  const ranking = aiResult?.ranking || [];

  return <div className="app">
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
      :root{--bg:#0B1420;--surface:#121E30;--raised:#192840;--border:#28394F;--text:#E7EDF5;--dim:#8CA0B8;--cyan:#4FD8C4;--amber:#F0A855;--violet:#9C90EE;--green:#6FCF97;--red:#E2725B}*{box-sizing:border-box}body{margin:0}.app{min-height:100vh;background:radial-gradient(1000px 500px at 80% -10%,#16273E 0%,var(--bg) 55%);color:var(--text);font-family:'IBM Plex Sans',sans-serif;padding:40px 24px 64px}.mono{font-family:'IBM Plex Mono',monospace}.hero,.trace,.grid,.handoff,.footer{max-width:1040px;margin-left:auto;margin-right:auto}.hero{margin-bottom:30px}.eyebrow,.panel-eyebrow,.copyfield-label,.section-label{font:11px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}.hero .eyebrow{color:var(--cyan);margin-bottom:14px}.hero h1{font:500 clamp(32px,5vw,48px)/1.08 Fraunces,serif;margin:0 0 14px}.hero p{max-width:720px;color:var(--dim);line-height:1.6;margin:0}.trace{display:flex;align-items:center;margin-bottom:20px}.node{width:30px;height:30px;border:1px solid var(--border);border-radius:50%;display:grid;place-items:center;background:var(--surface);color:var(--dim)}.node.lit{border-color:var(--cyan);color:var(--cyan)}.line{height:1px;background:var(--border);flex:1;margin:0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:22px}.panel-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:18px}.station-icon{width:34px;height:34px;border:1px solid var(--border);background:var(--raised);border-radius:8px;display:grid;place-items:center;font-size:19px}.icon-target{color:var(--cyan)}.icon-candidate{color:var(--amber)}.icon-handoff{color:var(--violet)}.panel-title{font:500 20px Fraunces,serif;margin-top:2px}.search-row{display:flex;gap:8px;margin-bottom:12px}.search-row input{min-width:0;flex:1;background:var(--raised);border:1px solid var(--border);border-radius:7px;color:var(--text);padding:11px 12px;font:14px 'IBM Plex Sans'}.search-row input:focus{outline:2px solid var(--cyan)}.btn{border:0;border-radius:7px;padding:10px 15px;font:500 14px 'IBM Plex Sans';cursor:pointer}.btn:disabled{opacity:.45;cursor:not-allowed}.target-btn{background:var(--cyan);color:#06201C}.candidate-btn{background:var(--amber);color:#331C04}.ai-btn{background:var(--violet);color:#1C1740}.ghost{background:transparent;border:1px solid var(--border);color:var(--text)}.hint,.note{font-size:12px;line-height:1.5;color:var(--dim)}.error{color:var(--red);font-size:13px;line-height:1.5;margin:10px 0}.results{display:grid;gap:8px;max-height:300px;overflow:auto}.result{width:100%;text-align:left;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:12px;color:var(--text);cursor:pointer}.result:hover,.result.selected{border-color:var(--cyan)}.result-id{font:500 13px 'IBM Plex Mono';color:var(--cyan)}.result-meta{float:right;color:var(--dim);font:11px 'IBM Plex Mono'}.result-title{margin-top:5px;font-size:13px;line-height:1.4}.compound-preview{margin-top:14px;border:1px solid var(--border);background:var(--raised);border-radius:8px;padding:12px;display:flex;gap:12px}.compound-preview img{width:130px;height:110px;background:#fff;border-radius:6px;object-fit:contain}.compound-name{font:500 17px Fraunces,serif}.formula{font:13px 'IBM Plex Mono';color:var(--amber);margin:4px 0 8px}.smiles{font:11px 'IBM Plex Mono';color:var(--cyan);word-break:break-all;line-height:1.4}.props{font-size:12px;color:var(--dim);margin-top:8px;line-height:1.6}.stage-row{display:flex;gap:8px;margin-top:12px}.candidate-count{margin-top:12px;padding:10px;border:1px dashed var(--border);border-radius:7px;color:var(--dim);font-size:12px}.candidate-list{margin-top:12px;display:grid;gap:8px}.candidate-card{width:100%;display:flex;gap:10px;align-items:center;text-align:left;background:var(--raised);border:1px solid var(--border);border-radius:8px;padding:9px;color:var(--text);cursor:pointer}.candidate-card:hover{border-color:var(--amber)}.candidate-selected{border-color:var(--amber);background:#2b2519}.candidate-img{width:54px;height:54px;background:#fff;border-radius:5px;object-fit:contain;flex-shrink:0}.candidate-main{min-width:0;flex:1}.candidate-top{display:flex;justify-content:space-between;gap:8px}.candidate-top strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cid{font:10px 'IBM Plex Mono';color:var(--dim)}.candidate-card .formula{font-size:10px;margin:2px 0}.candidate-card .smiles{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mini-props{font-size:10px;color:var(--dim);margin-top:3px}.pass-pill{font-size:10px;color:var(--green);margin-top:3px}.select-mark{width:24px;height:24px;border:1px solid var(--border);border-radius:50%;display:grid;place-items:center;color:var(--amber);flex-shrink:0}.ai-section{margin-top:20px}.ai-controls{display:flex;justify-content:space-between;gap:12px;align-items:center}.ai-title{font:500 22px Fraunces,serif}.ai-sub{color:var(--dim);font-size:12px;margin-top:3px}.recommend{margin-top:18px;border:1px solid var(--green);background:#14291F;border-radius:9px;padding:16px}.recommend .winner{font:500 23px Fraunces,serif;color:var(--green)}.score{font:500 13px 'IBM Plex Mono';color:var(--green);margin:4px 0 8px}.ranking{margin-top:14px;display:grid;gap:7px}.rank-row{display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;border-bottom:1px dashed var(--border);padding:9px 0}.rank-num{font:500 12px 'IBM Plex Mono';color:var(--dim)}.rank-name{font-size:13px}.rank-score{font:500 12px 'IBM Plex Mono';color:var(--cyan)}.reason{font-size:12px;color:var(--dim);line-height:1.5}.bullets{margin:6px 0 0;padding-left:17px;color:var(--dim);font-size:11.5px;line-height:1.5}.handoff{margin-top:20px}.copyfield{margin-bottom:13px}.copyfield-label{margin-bottom:6px}.copyfield-row{display:flex;gap:8px}.copyfield-value{flex:1;background:var(--raised);border:1px solid var(--border);border-radius:7px;padding:9px 11px;font-size:12px;word-break:break-all}.copy-btn{background:transparent;border:1px solid var(--border);color:var(--text);border-radius:7px;padding:8px 11px;cursor:pointer}.actions{display:flex;gap:8px;flex-wrap:wrap}.empty{padding:18px;text-align:center;color:var(--dim);font-size:13px}.footer{margin-top:38px;border-top:1px solid var(--border);padding-top:18px;color:var(--dim);font-size:11.5px;line-height:1.6}.footer a{color:var(--cyan)}@media(max-width:780px){.grid{grid-template-columns:1fr}.app{padding:28px 14px}.compound-preview{flex-direction:column}.ai-controls{align-items:flex-start;flex-direction:column}}
    `}</style>

    <div className="hero"><div className="eyebrow">PocketLink · discovery staging bench</div><h1>Stage targets and candidates,<br/>then let AI prioritize the shortlist.</h1><p>Search live structures on RCSB PDB and compounds on PubChem, screen drug-likeness, select up to five molecules, and generate an AI-assisted computational prioritization before handing the finalists to SwissDock and SwissADME.</p></div>

    <div className="trace"><span className={`node ${protein ? "lit" : ""}`}>1</span><span className="line"/><span className={`node ${candidates.length ? "lit" : ""}`}>2</span><span className="line"/><span className={`node ${aiResult ? "lit" : ""}`}>3</span></div>

    <div className="grid">
      <Panel eyebrow="Station 1 — RCSB PDB" title="Find a target" kind="target">
        <div className="search-row"><input placeholder="Protein name, gene, or PDB ID (e.g. IKK beta, 4KIK)" value={pQuery} onChange={e=>setPQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchProtein()}/><button className="btn target-btn" onClick={searchProtein} disabled={pLoading}>{pLoading?"Searching…":"Search"}</button></div><div className="hint">Live query against RCSB PDB.</div>{pError&&<div className="error">{pError}</div>}
        {pResults.length>0&&<div className="results">{pResults.map(r=><button key={r.id} className={`result ${protein?.id===r.id?'selected':''}`} onClick={()=>setProtein(r)}><span className="result-id">{r.id}</span><span className="result-meta">{r.method} · {r.resolution} · {r.date}</span><div className="result-title">{r.title}</div></button>)}</div>}
        {!pResults.length&&!pLoading&&!pError&&<div className="empty">No target staged yet.</div>}
      </Panel>

      <Panel eyebrow="Station 2 — PubChem" title="Build a candidate shortlist" kind="candidate">
        <div className="search-row"><input placeholder="Compound name (e.g. imatinib, caffeine)" value={cQuery} onChange={e=>setCQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&searchCompound()}/><button className="btn candidate-btn" onClick={searchCompound} disabled={cLoading}>{cLoading?"Searching…":"Search"}</button></div><div className="hint">Search and stage up to 5 molecules for comparison.</div>{cError&&<div className="error">{cError}</div>}
        {cResult&&<><div className="compound-preview"><img src={`https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid=${cResult.CID}&t=l`} alt=""/><div><div className="compound-name">{cResult.displayName}</div><div className="formula">{cResult.MolecularFormula} · CID {cResult.CID}</div><div className="smiles">{smilesOf(cResult)}</div><div className="props">MW {Number(cResult.MolecularWeight).toFixed(1)} · XLogP {cResult.XLogP??"n/a"} · HBD {cResult.HBondDonorCount} · HBA {cResult.HBondAcceptorCount} · RotB {cResult.RotatableBondCount} · TPSA {cResult.TPSA}</div></div></div><div className="stage-row"><button className="btn candidate-btn" onClick={toggleCandidate} disabled={!candidates.some(x=>x.CID===cResult.CID)&&candidates.length>=5}>{candidates.some(x=>x.CID===cResult.CID)?"Remove from shortlist":"Add to shortlist"}</button></div></>}
        <div className="candidate-count">{candidates.length}/5 candidates selected {candidates.length<2?"· select at least 2 to run AI analysis":"· ready for AI comparison"}</div>
        {candidates.length>0&&<div className="candidate-list">{candidates.map(c=><CandidateCard key={c.CID} c={c} selected onToggle={()=>{setCandidates(prev=>prev.filter(x=>x.CID!==c.CID));setAiResult(null)}}/>)}</div>}
      </Panel>
    </div>

    <div className="ai-section"><Panel eyebrow="Station 3 — AI prioritization" title="Which molecule should we take forward?" kind="handoff">
      <div className="ai-controls"><div><div className="ai-title">AI Candidate Analysis</div><div className="ai-sub">Compares the supplied molecular properties and produces a transparent prioritization score.</div></div><button className="btn ai-btn" onClick={analyze} disabled={candidates.length<2||aiLoading}>{aiLoading?"Analyzing…":"✦ Analyze candidates"}</button></div>
      {aiError&&<div className="error">{aiError}</div>}
      {!aiResult&&!aiLoading&&<div className="empty">Select 2–5 molecules above, then run AI Candidate Analysis.</div>}
      {aiResult&&<div className="recommend"><div className="section-label">Recommended candidate</div><div className="winner">{recommended?.cid ? (candidates.find(c=>String(c.CID)===String(recommended.cid))?.displayName || `CID ${recommended.cid}`) : "—"}</div><div className="score">Prioritization score {recommended?.score ?? "—"}/100</div><div className="reason">{recommended?.reason}</div><div className="ranking">{ranking.map(r=><div className="rank-row" key={r.cid}><div className="rank-num">#{r.rank}</div><div><div className="rank-name">{candidates.find(c=>String(c.CID)===String(r.cid))?.displayName || `CID ${r.cid}`}</div><ul className="bullets">{(r.strengths||[]).slice(0,2).map((x,i)=><li key={i}>{x}</li>)}{(r.concerns||[]).slice(0,1).map((x,i)=><li key={`c${i}`}>Concern: {x}</li>)}</ul></div><div className="rank-score">{r.score}/100</div></div>)}</div><div className="note" style={{marginTop:12}}>{aiResult.summary}</div><div className="note" style={{marginTop:8}}><strong>Limitations:</strong> {(aiResult.limitations||[]).join(" ")}</div></div>}
    </Panel></div>

    <div className="handoff"><Panel eyebrow="Station 4 — handoff" title="Send selected molecule to SwissDock & SwissADME" kind="handoff">
      {!protein&&!candidates.length?<div className="empty">Stage a target and candidates above to prepare the next step.</div>:<><div className="note" style={{marginBottom:14}}>The AI ranking is a prioritization aid. It does not replace docking, ADME prediction, toxicity assessment, or experimental validation.</div>{protein&&<CopyField label="Target — PDB ID" value={protein.id}/>} {candidates.length>0&&<div className="candidate-list">{candidates.map(c=><CopyField key={c.CID} label={`${c.displayName} — SMILES`} value={smilesOf(c)}/>)}</div>}<div className="actions">{protein&&<button className="btn ai-btn" onClick={()=>{navigator.clipboard?.writeText(protein.id);window.open("https://www.swissdock.ch/","_blank","noopener,noreferrer")}}>Open SwissDock →</button>}{candidates.length>0&&<button className="btn ghost" onClick={()=>{navigator.clipboard?.writeText(smilesOf(candidates[0]));window.open("https://www.swissadme.ch/","_blank","noopener,noreferrer")}}>Open SwissADME →</button>}</div></>}
    </Panel></div>

    <div className="footer">Structures from <a href="https://www.rcsb.org" target="_blank" rel="noreferrer">RCSB Protein Data Bank</a>. Compound data from <a href="https://pubchem.ncbi.nlm.nih.gov" target="_blank" rel="noreferrer">PubChem</a>. Docking via <a href="https://www.swissdock.ch" target="_blank" rel="noreferrer">SwissDock</a> and ADME via <a href="https://www.swissadme.ch" target="_blank" rel="noreferrer">SwissADME</a>. AI output is computational prioritization only and should not be treated as evidence of biological activity or clinical efficacy.</div>
  </div>;
}
