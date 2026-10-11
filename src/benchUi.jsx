import React, { useEffect, useMemo, useState } from "react";
import { getRDKit } from "./rdkitLoader";
import { SCORE_FORMULA_TEXT } from "./targetSelectionScore";

/** PubChem 2D PNG via PUG-REST (works in cross-site <img>; legacy imgsrv.fcgi blocks with 403). */
export function pubchemStructureImageUrl(cid) {
  const id = String(cid ?? "").trim();
  if (!id) return null;
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(id)}/PNG`;
}

function RdkitStructureFallback({ smiles, compact, cid }) {
  const [svg, setSvg] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    const raw = String(smiles || "").trim();
    if (!raw) {
      setFailed(true);
      return undefined;
    }

    (async () => {
      const RDKit = await getRDKit();
      if (cancelled) return;
      if (!RDKit) {
        setFailed(true);
        return;
      }
      let mol = null;
      try {
        mol = RDKit.get_mol(raw);
        if (!mol) {
          setFailed(true);
          return;
        }
        const w = compact ? 120 : 220;
        const h = compact ? 80 : 160;
        setSvg(mol.get_svg(w, h));
      } catch {
        setFailed(true);
      } finally {
        try {
          mol?.delete?.();
        } catch {
          // ignore
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [smiles, compact]);

  if (failed || !svg) {
    return (
      <div className={"pubchem-structure-fallback" + (compact ? " compact" : "")}>
        Structure image unavailable
      </div>
    );
  }

  return (
    <div
      className={"pubchem-structure-image rdkit-structure-svg" + (compact ? " compact" : "")}
      role="img"
      aria-label={cid ? `2D structure for CID ${cid}` : "2D molecular structure"}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PubChemStructureImage({ cid, smiles, compact }) {
  const [useRdkit, setUseRdkit] = useState(false);
  const [pubchemFailed, setPubchemFailed] = useState(false);

  const resolvedSmiles = useMemo(() => String(smiles || "").trim(), [smiles]);
  const imageUrl = useMemo(() => pubchemStructureImageUrl(cid), [cid]);

  useEffect(() => {
    setUseRdkit(false);
    setPubchemFailed(false);
  }, [cid, imageUrl]);

  if (!cid && !resolvedSmiles) {
    return (
      <div className={"pubchem-structure-fallback" + (compact ? " compact" : "")}>
        Structure image unavailable
      </div>
    );
  }

  if (pubchemFailed) {
    return (
      <div className={"pubchem-structure-fallback" + (compact ? " compact" : "")}>
        Structure image unavailable
      </div>
    );
  }

  if (useRdkit && resolvedSmiles) {
    return <RdkitStructureFallback smiles={resolvedSmiles} compact={compact} cid={cid} />;
  }

  if (!imageUrl) {
    if (resolvedSmiles) {
      return <RdkitStructureFallback smiles={resolvedSmiles} compact={compact} cid={cid} />;
    }
    return (
      <div className={"pubchem-structure-fallback" + (compact ? " compact" : "")}>
        Structure image unavailable
      </div>
    );
  }

  const handleImgError = () => {
    if (resolvedSmiles) setUseRdkit(true);
    else setPubchemFailed(true);
  };

  return (
    <img
      className={"pubchem-structure-image" + (compact ? " compact" : "")}
      src={imageUrl}
      alt={cid ? `PubChem structure for CID ${cid}` : "PubChem 2D structure"}
      title={cid ? `PubChem structure for CID ${cid}` : "PubChem 2D structure"}
      onError={handleImgError}
    />
  );
}

export function StationIcon({ kind }) {
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

export function CopyField({ label, value, mono = true }) {
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

export function getCompoundSmiles(compound) {
  if (!compound) return "";
  return compound.IsomericSMILES || compound.CanonicalSMILES || compound.SMILES || compound.ConnectivitySMILES || compound.smiles || "";
}

export function prettyName(result, query) {
  const q = (query || "").trim();
  if (q && q.length <= 48 && !q.includes(",") && q.split(" ").length <= 6) return q;
  if (result?.IUPACName) {
    return result.IUPACName.length > 52 ? `${result.IUPACName.slice(0, 50)}…` : result.IUPACName;
  }
  return result?.CID ? `CID ${result.CID}` : "Unknown compound";
}

export function Panel({ title, eyebrow, kind, children }) {
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

export function PainsInfoTip() {
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

export function PainsBadge({ result, tipId }) {
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

export function ScoreInfoTip() {
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
        <span className="score-tip-lead">
          Knowledge-based triage score (0–100) for prioritization — not a prediction of activity or binding. Legacy drug-name
          rules may apply as a weak prior for known drugs; ChEMBL similarity evidence is used when reference data exists.
        </span>
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

export function TargetScoreTable({ results, selectedId, recommendedId, sortKey, sortDir, onSort, onSelect }) {
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
