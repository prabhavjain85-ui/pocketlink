import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rankCandidates, tryCachedRanking } from "./aiCandidateRanking";
import { checkPainsBatch } from "./painsCheck";
import { MAX_CANDIDATES, drugLikenessChecks } from "./scoreCandidates";
import { fetchAndScoreTargets, SCORE_FORMULA_TEXT } from "./targetSelectionScore";
import { targetDisplayName } from "./targetContext";

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

function PainsInfoTip() {
  return (
    <span className="score-tip">
      <button
        type="button"
        className="score-tip-btn"
        aria-label="How PAINS and toxicophore flags are calculated"
        aria-describedby="pains-tip-pop"
        title="Rules-based RDKit substructure screen: PAINS filter catalogs plus a small toxicophore SMARTS list. Warnings only — flagged compounds stay selectable."
      >
        i
      </button>
      <span className="score-tip-pop" id="pains-tip-pop" role="tooltip">
        <strong>PAINS &amp; toxicophore flags</strong>
        <span className="score-tip-lead">Deterministic RDKit substructure check. No AI call. Flags are warnings, not hard blocks.</span>
        <ul>
          <li><b>PAINS</b> — RDKit FilterCatalog families A/B/C (Baell &amp; Holloway). Frequent HTS false-positive chemotypes.</li>
          <li><b>Toxicophores</b> — small extra SMARTS list: Michael acceptors, aldehydes, epoxides, alkyl halides.</li>
          <li><b>Unable to check</b> — missing or invalid SMILES, or the checker was unreachable. Not treated as clean.</li>
        </ul>
      </span>
    </span>
  );
}

function PainsBadge({ result, tipId }) {
  const popId = tipId || "pains-pop";
  if (!result || result.status === "pending") {
    return (
      <span className="score-tip pains-tip">
        <span className="pains-badge pending">Checking…</span>
      </span>
    );
  }
  if (result.status === "unable") {
    return (
      <span className="score-tip pains-tip">
        <button type="button" className="pains-badge unable" aria-describedby={popId}>
          Unable to check
        </button>
        <span className="score-tip-pop" id={popId} role="tooltip">
          <strong>Unable to check</strong>
          <span className="score-tip-lead">
            {result.reason || "This structure could not be screened."} Missing or invalid SMILES is not treated as a clean pass.
          </span>
        </span>
      </span>
    );
  }
  if (result.hasAlerts || result.status === "alert") {
    const alerts = Array.isArray(result.alerts) ? result.alerts : [];
    return (
      <span className="score-tip pains-tip">
        <button type="button" className="pains-badge alert" aria-describedby={popId}>
          ⚠️ Alert(s) found
        </button>
        <span className="score-tip-pop" id={popId} role="tooltip">
          <strong>Substructure alerts</strong>
          <span className="score-tip-lead">
            Rules-based PAINS / toxicophore screen. This is a warning, not a hard block — some flagged compounds become real drugs.
          </span>
          <ul>
            {alerts.map((alert, i) => (
              <li key={`${alert.id || alert.name}-${i}`}>
                <b>{alert.name}</b>
                {alert.family === "pains" ? " · PAINS" : alert.family === "toxicophore" ? " · toxicophore" : ""}
                {" — "}
                {alert.explanation}
              </li>
            ))}
          </ul>
        </span>
      </span>
    );
  }
  return (
    <span className="score-tip pains-tip">
      <button type="button" className="pains-badge clean" aria-describedby={popId}>
        ✅ Clean
      </button>
      <span className="score-tip-pop" id={popId} role="tooltip">
        <strong>No PAINS or toxicophore alerts</strong>
        <span className="score-tip-lead">
          RDKit found no matches in the PAINS A/B/C catalogs or the curated reactive-group list. This is not proof of safety or inactivity.
        </span>
      </span>
    </span>
  );
}

function ScoreInfoTip() {
  return (
    <span className="score-tip">
      <button
        type="button"
        className="score-tip-btn"
        aria-label="How the target selection score is calculated"
        aria-describedby="score-tip-pop"
        title={SCORE_FORMULA_TEXT}
      >
        i
      </button>
      <span className="score-tip-pop" id="score-tip-pop" role="tooltip">
        <strong>Target Selection Score</strong>
        <span className="score-tip-lead">Rules-based total out of 100 from RCSB metadata. No AI call.</span>
        <ul>
          <li><b>Resolution (25)</b> — ≤2.0 Å = 25, ≤2.5 = 20, ≤3.0 = 15, ≤3.5 = 10, worse = 5, missing = 0</li>
          <li><b>Completeness (25)</b> — linear, 100% = 25 pts</li>
          <li><b>Ligand (20)</b> — real co-crystallized ligand = 20 (crystallization additives excluded)</li>
          <li><b>Pocket (15)</b> — residues within ~5 Å of a ligand = 15, unclear = 7, none = 0</li>
          <li><b>Method (15)</b> — X-ray = 15, Cryo-EM = 12, NMR = 8, other = 5</li>
        </ul>
      </span>
    </span>
  );
}

function compareScoreField(a, b, key) {
  const nullableNum = (va, vb) => {
    if (va == null && vb == null) return 0;
    if (va == null) return -1;
    if (vb == null) return 1;
    return va < vb ? -1 : va > vb ? 1 : 0;
  };
  if (key === "id") return String(a.id).localeCompare(String(b.id));
  if (key === "resolution") return nullableNum(a.resolutionValue, b.resolutionValue);
  if (key === "ligand") return Number(Boolean(a.hasLigand)) - Number(Boolean(b.hasLigand));
  if (key === "completeness") return nullableNum(a.completeness, b.completeness);
  if (key === "pocket") {
    const order = { detected: 2, unclear: 1, none: 0 };
    return (order[a.pocket] ?? -1) - (order[b.pocket] ?? -1);
  }
  if (key === "method") return String(a.methodLabel || "").localeCompare(String(b.methodLabel || ""));
  return (a.score ?? 0) - (b.score ?? 0);
}

function TargetScoreTable({ results, selectedId, recommendedId, sortKey, sortDir, onSort, onSelect }) {
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...results].sort((a, b) => {
      const cmp = compareScoreField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [results, sortKey, sortDir]);

  const cols = [
    { key: "id", label: "PDB ID" },
    { key: "resolution", label: "Resolution" },
    { key: "ligand", label: "Ligand" },
    { key: "completeness", label: "Completeness %" },
    { key: "pocket", label: "Pocket" },
    { key: "method", label: "Method" },
    { key: "score", label: "Score" },
  ];

  return (
    <div className="score-table-wrap">
      <table className="score-table">
        <thead>
          <tr>
            {cols.map((col) => {
              const active = sortKey === col.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              return (
                <th key={col.key} aria-sort={ariaSort}>
                  <button type="button" className={"score-th" + (active ? " active" : "")} onClick={() => onSort(col.key)}>
                    {col.label}
                    <span className="sort-ind" aria-hidden="true">
                      {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const selected = selectedId === r.id;
            const recommended = recommendedId === r.id;
            return (
              <tr
                key={r.id}
                className={(selected ? "selected" : "") + (recommended ? " recommended" : "")}
                onClick={() => onSelect(r)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r);
                  }
                }}
              >
                <td>
                  <div className="result-id">{r.id}</div>
                  <div className="score-title" title={r.title}>{r.title}</div>
                </td>
                <td className="mono">{r.resolution || "N/A"}</td>
                <td className="score-icon-cell">{r.ligandLabel || "❌"}</td>
                <td className="mono">{r.completenessLabel || "N/A"}</td>
                <td className="score-icon-cell">{r.pocketLabel || "?"}</td>
                <td>{r.methodLabel || "N/A"}</td>
                <td className="mono score-num">{r.score}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function compareCandidateField(a, b, key) {
  if (key === "compound") {
    return String(a.name || a.cid).localeCompare(String(b.name || b.cid));
  }
  return (a.score ?? 0) - (b.score ?? 0);
}

function CandidateScoreTable({ rows, selectedCid, recommendedCid, sortKey, sortDir, onSort, onSelect }) {
  const sorted = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const cmp = compareCandidateField(a, b, sortKey);
      if (cmp !== 0) return cmp * mul;
      return String(a.cid).localeCompare(String(b.cid));
    });
  }, [rows, sortKey, sortDir]);

  const cols = [
    { key: "compound", label: "Compound" },
    { key: "score", label: "Score" },
    { key: "reasons", label: "Key reasons" },
  ];

  return (
    <div className="score-table-wrap">
      <table className="score-table candidate-score-table">
        <thead>
          <tr>
            {cols.map((col) => {
              const active = sortKey === col.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              const sortable = col.key !== "reasons";
              return (
                <th key={col.key} aria-sort={ariaSort}>
                  {sortable ? (
                    <button type="button" className={"score-th" + (active ? " active" : "")} onClick={() => onSort(col.key)}>
                      {col.label}
                      <span className="sort-ind" aria-hidden="true">
                        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  ) : (
                    <span className="score-th">{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const selected = String(selectedCid) === String(r.cid);
            const recommended = String(recommendedCid) === String(r.cid);
            const reasons = r.reasoning && r.reasoning.length
              ? r.reasoning
              : [...(r.strengths || []), ...(r.concerns || [])];
            return (
              <tr
                key={r.cid}
                className={(selected ? "selected" : "") + (recommended ? " recommended" : "")}
                onClick={() => onSelect(r.cid)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(r.cid);
                  }
                }}
              >
                <td>
                  <div className="result-id">{r.name || `CID ${r.cid}`}</div>
                  <div className="score-title">CID {r.cid}</div>
                </td>
                <td className="mono score-num">{r.score}/100</td>
                <td>
                  <ul className="rank-bullets table-reasons">
                    {reasons.slice(0, 4).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CandidateRow({ candidate, selected, recommended, pains, onToggle, onRemove }) {
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
      <PainsBadge result={pains} tipId={`pains-pop-${candidate.CID}`} />
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
  const [scoreSort, setScoreSort] = useState({ key: "score", dir: "desc" });
  const [aiSort, setAiSort] = useState({ key: "score", dir: "desc" });
  const [painsByCid, setPainsByCid] = useState({});

  const reqId = useRef(0);

  const searchProtein = useCallback(async () => {
    const q = pQuery.trim();
    if (!q) return;
    const myReq = ++reqId.current;
    setPLoading(true);
    setPError("");
    setPResults([]);
    setScoreSort({ key: "score", dir: "desc" });
    try {
      let ids = [];
      const looksLikeId = PDB_ID_RE.test(q);
      if (looksLikeId) {
        ids = [q.toUpperCase()];
      }
      if (!ids.length) {
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
        ids = (data.result_set || []).map((r) => r.identifier);
      }
      if (!ids.length) {
        if (reqId.current === myReq) setPError(`No PDB entries matched "${q}". Try a protein name, gene, or a 4-character PDB ID.`);
        setPLoading(false);
        return;
      }
      let scored = await fetchAndScoreTargets(ids);
      if (reqId.current !== myReq) return;
      if (!scored.length && looksLikeId) {
        const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: { type: "terminal", service: "full_text", parameters: { value: q } },
            return_type: "entry",
            request_options: { paginate: { start: 0, rows: 6 } },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const searchIds = (data.result_set || []).map((r) => r.identifier);
          if (searchIds.length) scored = await fetchAndScoreTargets(searchIds);
        }
      }
      if (reqId.current !== myReq) return;
      if (!scored.length) {
        setPError(`No PDB entries matched "${q}". Try a protein name, gene, or a 4-character PDB ID.`);
        return;
      }
      setPResults(scored);
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

  useEffect(() => {
    const toCheck = [...candidates];
    if (cResult && !toCheck.some((c) => String(c.CID) === String(cResult.CID))) {
      toCheck.push(cResult);
    }
    if (!toCheck.length) return undefined;
    let cancelled = false;
    checkPainsBatch(toCheck).then((next) => {
      if (!cancelled) {
        setPainsByCid((prev) => ({ ...prev, ...next }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, cResult]);

  useEffect(() => {
    setAiSort({ key: "score", dir: "desc" });
    if (candidates.length < 2) {
      setAiResult(null);
      return;
    }
    const cached = tryCachedRanking(candidates, protein);
    setAiResult(cached);
    if (cached?.recommended?.cid) setHandoffCid(cached.recommended.cid);
  }, [protein, candidates]);

  const analyze = async () => {
    if (candidates.length < 2) return;
    setAiLoading(true);
    setAiError("");
    try {
      const latestPains = { ...painsByCid, ...(await checkPainsBatch(candidates)) };
      setPainsByCid((prev) => ({ ...prev, ...latestPains }));
      const data = await rankCandidates(candidates, protein, latestPains);
      setAiResult(data);
      if (data?.recommended?.cid) setHandoffCid(data.recommended.cid);
    } catch (e) {
      setAiError(e.message || "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const recommendedTarget = useMemo(() => {
    if (!pResults.length) return null;
    return pResults.reduce((best, row) => {
      if (!best) return row;
      if ((row.score ?? 0) > (best.score ?? 0)) return row;
      return best;
    }, null);
  }, [pResults]);

  const toggleScoreSort = (key) => {
    setScoreSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "id" || key === "method" ? "asc" : "desc" };
    });
  };

  const toggleAiSort = (key) => {
    setAiSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
      return { key, dir: key === "compound" ? "asc" : "desc" };
    });
  };

  const recommendedCid = aiResult?.recommended?.cid;
  const ranking = aiResult?.ranking || [];
  const rankingRows = ranking.map((row) => {
    const match = candidates.find((c) => String(c.CID) === String(row.cid));
    return { ...row, name: match?.displayName || row.name || `CID ${row.cid}` };
  });
  const fitTargetName = aiResult?.target?.name || (protein ? targetDisplayName(protein) : "");
  const fitPdbId = aiResult?.target?.pdb_id || protein?.id || "";
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
    <>
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

      <div className={"grid" + (pResults.length ? " with-scores" : "")}>
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
          <div className="hint">Live query against search.rcsb.org and data.rcsb.org. Matching structures are scored locally for docking/design suitability.</div>
          {pError && <div className="error-msg">{pError}</div>}
          {pResults.length > 0 && (
            <div className="score-block">
              <div className="score-toolbar">
                <span className="score-toolbar-label">Target selection score</span>
                <ScoreInfoTip />
              </div>
              {recommendedTarget && (
                <div className="recommend compact">
                  <div className="recommend-label">Recommended structure</div>
                  <div className="winner">🏆 Recommended structure: {recommendedTarget.id}</div>
                  <div className="winner-score">Target selection score {recommendedTarget.score}/100</div>
                  <ul className="rank-bullets">
                    {(recommendedTarget.reasons || []).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              <TargetScoreTable
                results={pResults}
                selectedId={protein?.id}
                recommendedId={recommendedTarget?.id}
                sortKey={scoreSort.key}
                sortDir={scoreSort.dir}
                onSort={toggleScoreSort}
                onSelect={(row) => setProtein({ ...row, queryName: pQuery.trim() })}
              />
              {protein && pResults.some((r) => r.id === protein.id) && (
                <div className="hint" style={{ margin: 0 }}>
                  Staged target: <span className="mono">{protein.id}</span>
                  {protein.title ? ` — ${protein.title}` : ""}
                </div>
              )}
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
                {painsByCid[String(cResult.CID)] && (
                  <div className="pains-preview">
                    <PainsBadge result={painsByCid[String(cResult.CID)]} tipId={`pains-preview-${cResult.CID}`} />
                    <span className="pains-preview-note">PAINS / toxicophore screen runs when a compound is searched or shortlisted. Alerts do not block adding it.</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {!cResult && !cLoading && !cError && candidates.length === 0 && (
            <div className="empty-state">No candidates staged yet. Search a compound and add it to the shortlist.</div>
          )}

          {candidates.length > 0 && (
            <>
              <div className="shortlist-head">
                <span className="shortlist-head-left">
                  Shortlist
                  <PainsInfoTip />
                </span>
                <span>{candidates.length}/5 selected{candidates.length < 2 ? " · add at least one more for AI" : " · ready for AI"}</span>
              </div>
              <div className="shortlist">
                {candidates.map((c) => (
                  <CandidateRow
                    key={c.CID}
                    candidate={c}
                    selected={String(compound?.CID) === String(c.CID)}
                    recommended={String(recommendedCid) === String(c.CID)}
                    pains={painsByCid[String(c.CID)] || { status: "pending" }}
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
        <Panel eyebrow="Station 3 — AI prioritization" title="Which molecule fits this target?" kind="handoff">
          <div className="ai-toolbar">
            <div>
              <div className="ai-kicker">Score the shortlist for this target</div>
              <div className="hint" style={{ margin: "6px 0 0" }}>
                Scores 2–5 molecules for the selected PDB structure using pocket/ligand context, known pharmacology, Lipinski/Veber drug-likeness, and PAINS flags. The same compound is scored differently against different targets. If an OpenAI key is configured, a language model writes the comparison; otherwise PocketLink uses its built-in target-aware model.
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
              Select 2–5 molecules in Station 2, then run analysis. PocketLink will score each compound for the staged target — not as a universal drug-likeness rank.
            </div>
          )}
          {aiResult && (
            <div className="score-block">
              <div className="recommend compact">
                <div className="recommend-label">Best fit for this structure</div>
                <div className="winner">
                  {fitPdbId
                    ? `🏆 Best fit for ${fitTargetName || "this target"} (${fitPdbId})`
                    : "🏆 Best fit (no structure selected — scores are not pocket-specific)"}
                </div>
                <div className="winner-score">
                  {winner?.displayName || (recommendedCid ? `CID ${recommendedCid}` : "—")} · {aiResult.recommended?.score ?? "—"}/100
                </div>
                <div className="winner-reason">{aiResult.recommended?.reason}</div>
              </div>
              <CandidateScoreTable
                rows={rankingRows}
                selectedCid={compound?.CID}
                recommendedCid={recommendedCid}
                sortKey={aiSort.key}
                sortDir={aiSort.dir}
                onSort={toggleAiSort}
                onSelect={setHandoffCid}
              />
              <div className="lipinski-note" style={{ marginTop: 12 }}>{aiResult.summary}</div>
              <div className="lipinski-note"><strong>Limitations:</strong> {(aiResult.limitations || []).join(" ")}</div>
              <div className="source-pill">
                {aiResult.source === "llm"
                  ? "Ranked with OpenAI for this specific target"
                  : aiResult.source === "cache"
                    ? "Reused cached scores for this (compound, PDB) pair"
                    : "Ranked with PocketLink's target-aware model"}
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

    </>
  );
}
