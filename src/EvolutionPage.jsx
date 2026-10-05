import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PdbTargetSearch from "./PdbTargetSearch";
import { Panel, PainsBadge } from "./benchUi";
import AdversarialCritique from "./AdversarialCritique";
import { getRDKit } from "./rdkitLoader";
import { molSvg, detectReactionSupport } from "./evolutionTransforms";
import {
  DEFAULT_EVOLUTION_SETTINGS,
  clampSettings,
  runEvolutionGeneration,
  seedParent,
} from "./evolutionEngine";
import { detectSaScoreSupport, lookupPubChemExact, noveltyBadge } from "./evolutionScore";
import { getHistory, saveHistoryEntry } from "./historyService";
import { loadApprovedDrugs } from "./approvedDrugs";
import { targetDisplayName } from "./targetContext";
import "./evolution.css";

const IMATINIB =
  "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";

const HYPOTHESIS_NOTE =
  "These are computationally generated hypotheses scored by heuristic models. They have not been synthesized or tested, may be difficult or impossible to make, and the scores are for prioritizing ideas, not evidence of activity.";

function ScoreChart({ history }) {
  const points = history || [];
  if (!points.length) return null;
  const w = 640;
  const h = 180;
  const pad = 28;
  const maxY = Math.max(100, ...points.map((p) => Math.max(p.best || 0, p.average || 0)));
  const minY = 0;
  const xs = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((v - minY) / (maxY - minY || 1)) * (h - pad * 2);
  const bestPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.best)}`).join(" ");
  const avgPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.average)}`).join(" ");
  return (
    <svg className="evo-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Score over generations">
      <text x={pad} y={16} fontSize="11" fill="currentColor">Best vs average score</text>
      <path d={bestPath} fill="none" stroke="#2563eb" strokeWidth="2" />
      <path d={avgPath} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />
      {points.map((p, i) => (
        <g key={p.generation}>
          <circle cx={xs(i)} cy={ys(p.best)} r="3.5" fill="#2563eb" />
          <text x={xs(i)} y={h - 8} fontSize="10" textAnchor="middle" fill="currentColor">
            G{p.generation}
          </text>
        </g>
      ))}
    </svg>
  );
}

function historyMolecules() {
  const out = [];
  for (const item of getHistory()) {
    const snap = item.snapshot || {};
    const lists = [snap.candidates, snap.topCandidates, snap.aiResult?.ranking].filter(Boolean);
    for (const list of lists) {
      for (const row of list) {
        const smiles = row.canonicalSmiles || row.CanonicalSMILES || row.smiles || row.SMILES || row.IsomericSMILES;
        const name = row.name || row.displayName || row.compound_id;
        if (smiles) out.push({ smiles, name: name || "History molecule", source: item.title });
      }
    }
  }
  return out.slice(0, 12);
}

export default function EvolutionPage() {
  const [protein, setProtein] = useState(null);
  const [smiles, setSmiles] = useState(IMATINIB);
  const [name, setName] = useState("Imatinib");
  const [settings, setSettings] = useState(DEFAULT_EVOLUTION_SETTINGS);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [seed, setSeed] = useState(null);
  const [history, setHistory] = useState([]);
  const [finals, setFinals] = useState([]);
  const [runtimeLog, setRuntimeLog] = useState([]);
  const [reactionSupport, setReactionSupport] = useState(null);
  const [saSupport, setSaSupport] = useState(null);
  const [svgs, setSvgs] = useState({});
  const abortRef = useRef(0);

  const pickList = useMemo(() => {
    const approved = loadApprovedDrugs()
      .filter((d) => /imatinib|dasatinib|nilotinib|gefitinib|erlotinib/i.test(d.name))
      .map((d) => ({ smiles: d.smiles, name: d.name, source: "Approved library" }));
    return [...approved, ...historyMolecules()].slice(0, 16);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const RDKit = await getRDKit();
      if (cancelled || !RDKit) return;
      setReactionSupport(detectReactionSupport(RDKit));
      setSaSupport(detectSaScoreSupport(RDKit));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderSvgs = async (rows) => {
    const RDKit = await getRDKit();
    if (!RDKit) return;
    const next = {};
    for (const row of rows) next[row.smiles] = molSvg(RDKit, row.smiles);
    setSvgs((prev) => ({ ...prev, ...next }));
  };

  const run = async () => {
    const cfg = clampSettings(settings);
    const my = ++abortRef.current;
    setRunning(true);
    setError("");
    setHistory([]);
    setFinals([]);
    setRuntimeLog([]);
    setProgress("Seeding parent…");
    try {
      const seeded = await seedParent({ smiles, protein, name });
      if (my !== abortRef.current) return;
      if (!seeded.ok) {
        setError(seeded.error || "Could not seed starting molecule.");
        return;
      }
      setSeed(seeded.parent);
      await renderSvgs([seeded.parent]);
      const seen = new Set([seeded.parent.smiles]);
      let parents = [seeded.parent];
      const hist = [{ generation: 0, best: seeded.parent.score, average: seeded.parent.score, valid: 1, discarded: 0 }];
      setHistory(hist);
      let lastSupport = reactionSupport;

      for (let g = 1; g <= cfg.generations; g += 1) {
        setProgress(`Generation ${g} of ${cfg.generations}: generating variants…`);
        const result = await runEvolutionGeneration({
          parents,
          protein,
          referenceSmiles: seeded.parent.smiles,
          seen,
          variantsPerGeneration: cfg.variantsPerGeneration,
          survivors: cfg.survivors,
          generationIndex: g,
        });
        if (my !== abortRef.current) return;
        if (!result.ok) {
          setError(result.error);
          break;
        }
        lastSupport = result.reactionSupport || lastSupport;
        setReactionSupport(lastSupport);
        hist.push(result.historyPoint);
        setHistory([...hist]);
        setRuntimeLog((prev) => [
          ...prev,
          `Generation ${g}: ${result.valid} valid, ${result.discardedTotal} discarded, ${result.ms} ms`,
        ]);
        setProgress(
          `Generation ${g} of ${cfg.generations}: ${result.valid} valid variants scored (${result.discardedTotal} discarded, ${result.ms} ms)`
        );
        if (!result.survivors.length) {
          setError("No valid novel variants this generation. Stopping.");
          break;
        }
        parents = result.survivors;
        await renderSvgs(result.survivors);
      }

      const last = parents.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      const withNovelty = [];
      for (const row of last) {
        const pubchem = await lookupPubChemExact(row.smiles);
        withNovelty.push({ ...row, novelty: noveltyBadge({ smiles: row.smiles, pubchem }) });
      }
      setFinals(withNovelty);
      await renderSvgs(withNovelty);

      const targetLabel = protein ? targetDisplayName(protein) || protein.id : "unspecified target";
      saveHistoryEntry({
        type: "evolution-run",
        title: `Molecule Evolution: ${name || "seed"} × ${targetLabel}`,
        summary: `Best ${withNovelty[0]?.score ?? "n/a"}/100 after ${cfg.generations} generations`,
        inputs: { smiles: seeded.parent.smiles, pdbId: protein?.id, settings: cfg },
        snapshot: { protein, seed: seeded.parent, history: hist, finals: withNovelty.slice(0, 10) },
      });
    } catch (err) {
      setError(err?.message || "Evolution failed.");
    } finally {
      if (my === abortRef.current) {
        setRunning(false);
        setProgress("");
      }
    }
  };

  const best = finals[0] || seed;

  return (
    <div className="evo-page">
      <div className="hero">
        <div className="hero-eyebrow">TargetForge · molecule evolution</div>
        <h1>Molecule Evolution</h1>
        <p>
          Start from a valid seed, apply curated medicinal-chemistry SMARTS edits in RDKit, and re-score cheap
          heuristic filters each generation. Structures are never invented by a language model.
        </p>
      </div>

      <div className="limitation-callout" style={{ marginBottom: 20 }}>
        <div className="limitation-header">
          <span className="limitation-badge">Honest labeling</span>
        </div>
        <p className="limitation-body">{HYPOTHESIS_NOTE}</p>
      </div>

      <div className="evo-grid">
        <PdbTargetSearch
          protein={protein}
          onSelect={setProtein}
          eyebrow="Station 1 — target"
          title="Select a target"
          hint="Reuse of the shared PDB search and Target Selection Score. Example: ABL / 1IEP with imatinib."
          emptyText="Optional but recommended. Without a target the score is physicochemical only."
        />

        <Panel eyebrow="Station 2 — seed" title="Starting molecule" kind="candidate">
          <label className="hint" htmlFor="evo-smiles">SMILES</label>
          <textarea id="evo-smiles" className="evo-smiles" rows={3} value={smiles} onChange={(e) => setSmiles(e.target.value)} />
          <label className="hint" htmlFor="evo-name">Label</label>
          <input id="evo-name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="hint" style={{ marginTop: 10 }}>Pick from approved kinase inhibitors or recent History / repurposing rows:</div>
          <div className="snapshot-tag-list" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {pickList.map((row) => (
              <button key={`${row.source}-${row.smiles}`} type="button" className="snapshot-tag" onClick={() => { setSmiles(row.smiles); setName(row.name); }}>
                {row.name}
              </button>
            ))}
          </div>
          <div className="evo-settings">
            <label>Generations<input type="number" min={1} max={8} value={settings.generations} onChange={(e) => setSettings((s) => ({ ...s, generations: e.target.value }))} /></label>
            <label>Variants / generation<input type="number" min={4} max={40} value={settings.variantsPerGeneration} onChange={(e) => setSettings((s) => ({ ...s, variantsPerGeneration: e.target.value }))} /></label>
            <label>Survivors<input type="number" min={1} max={10} value={settings.survivors} onChange={(e) => setSettings((s) => ({ ...s, survivors: e.target.value }))} /></label>
          </div>
          <button type="button" className="btn btn-primary" disabled={running || !smiles.trim()} onClick={run}>
            {running ? "Evolving…" : "Run evolution"}
          </button>
          {progress ? <div className="hint" role="status">{progress}</div> : null}
          {error ? <div className="error-msg">{error}</div> : null}
          <div className="hint">
            RDKit reactions: {reactionSupport ? (reactionSupport.reactions ? "available" : `unavailable (${reactionSupport.reason})`) : "checking…"}
            {" · "}
            SA score: {saSupport ? (saSupport.saScore ? "available" : "not in this WASM build — skipped") : "checking…"}
          </div>
        </Panel>
      </div>

      {history.length > 0 && (
        <Panel eyebrow="Trajectory" title="Score over generations" kind="target">
          <ScoreChart history={history} />
          <ul className="methodology-bullet-list">
            {history.map((p) => (
              <li key={p.generation}>Gen {p.generation}: best {p.best} · avg {p.average} · valid {p.valid} · discarded {p.discarded}</li>
            ))}
          </ul>
          {runtimeLog.length > 0 && <pre className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{runtimeLog.join("\n")}</pre>}
        </Panel>
      )}

      {best && (
        <Panel eyebrow="Structures" title="Seed versus best evolved" kind="candidate">
          <div className="evo-compare">
            {seed && (
              <div>
                <div className="hint">Starting molecule</div>
                <div className="evo-svg" dangerouslySetInnerHTML={{ __html: svgs[seed.smiles] || "" }} />
                <div className="mono">{seed.smiles}</div>
                <div>{seed.score}/100</div>
              </div>
            )}
            {finals.slice(0, 3).map((row, i) => (
              <div key={row.smiles}>
                <div className="hint">Evolved #{i + 1} · {row.editLabel}</div>
                <div className="evo-svg" dangerouslySetInnerHTML={{ __html: svgs[row.smiles] || "" }} />
                <div className="mono">{row.smiles}</div>
                <div>{row.score}/100 {row.delta >= 0 ? `+${Number(row.delta).toFixed(1)}` : Number(row.delta).toFixed(1)}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {finals.length > 0 && (
        <Panel eyebrow="Final survivors" title="Candidates" kind="candidate">
          <p className="hint">{HYPOTHESIS_NOTE}</p>
          <div className="score-table-wrap">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Structure / SMILES</th>
                  <th>Score</th>
                  <th>ADME / tox</th>
                  <th>PAINS</th>
                  <th>Novelty</th>
                </tr>
              </thead>
              <tbody>
                {finals.map((row) => (
                  <tr key={row.smiles}>
                    <td>
                      <div className="evo-svg" dangerouslySetInnerHTML={{ __html: svgs[row.smiles] || "" }} />
                      <div className="mono">{row.smiles}</div>
                      <div className="hint">{row.editLabel}</div>
                    </td>
                    <td className="mono">{row.score}/100</td>
                    <td>
                      Lipinski {row.admeFlags?.lipinskiPass ? "pass" : "flag"} · Veber {row.admeFlags?.veberPass ? "pass" : "flag"}
                      {row.organFlags?.length ? ` · organ: ${row.organFlags.join(", ")}` : " · no organ flags"}
                    </td>
                    <td><PainsBadge result={row.pains} tipId={`evo-pains-${row.smiles.slice(0, 12)}`} /></td>
                    <td>
                      <span className={row.novelty?.kind === "novel" ? "history-type-badge badge-discovery" : "history-type-badge badge-pdb"}>
                        {row.novelty?.label || "—"}
                      </span>
                      <div className="hint">{row.novelty?.detail}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {finals[0] && (
            <AdversarialCritique
              candidate={{ ...finals[0], displayName: name || "Best evolved", cid: "evo-best", CID: "evo-best" }}
              target={protein}
            />
          )}
          <div className="hint" style={{ marginTop: 12 }}>Lineage (parent → edit → Δscore):</div>
          <ul className="methodology-bullet-list">
            {finals.map((row) => (
              <li key={`lin-${row.smiles}`}>
                <span className="mono">{row.smiles}</span> from {row.parentSmiles || "seed"} via {row.editLabel} ({row.delta >= 0 ? "+" : ""}{Number(row.delta || 0).toFixed(1)})
              </li>
            ))}
          </ul>
          <Link to="/methodology">Methodology for this feature</Link>
        </Panel>
      )}
    </div>
  );
}
