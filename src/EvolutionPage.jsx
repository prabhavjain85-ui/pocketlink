import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PdbTargetSearch from "./PdbTargetSearch";
import { Panel, PainsBadge } from "./benchUi";
import AdversarialCritique from "./AdversarialCritique";
import { DEFAULT_EVOLUTION_SETTINGS, clampSettings } from "./shared/evolutionSettings";
import {
  noveltyForSmiles,
  probeReactionSupport,
  probeSaScoreSupport,
  renderMolSvgs,
  runEvolutionCampaign,
} from "./serverApi";
import { getHistory, saveHistoryEntry } from "./historyService";
import { ensureApprovedDrugsLoaded, loadApprovedDrugs } from "./approvedDrugs";
import { targetDisplayName } from "./shared/targetLabels";
import "./evolution.css";

const IMATINIB =
  "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";

const FEATURE_TITLE = "Local search around a seed under drug-likeness and synthesizability heuristics";

const HYPOTHESIS_NOTE =
  "Untested computational hypotheses only. There is no binding or potency term in this score. The SA score is Ertl & Schuffenhauer’s 2009 fragment-frequency estimate — it does not check retrosynthesis, purchasability, or route feasibility. Chemistry is limited to the curated edit library. Outputs are ideas for follow-up, not validated leads.";

function ProvenanceBadge({ text }) {
  return <span className="history-type-badge badge-pdb" title={text}>{text}</span>;
}

function ScoreBreakdown({ fitness, saScore, qed, provenance }) {
  if (!fitness) return null;
  return (
    <div className="evo-breakdown">
      <div className="hint">
        <ProvenanceBadge text={provenance || "Heuristic"} /> · {fitness.formula}
      </div>
      <ul className="methodology-bullet-list">
        {fitness.contributions?.map((c) => (
          <li key={c.key}>
            {c.key}: d={Number(c.d).toFixed(2)} (w={c.w}) · log contrib {Number(c.logContribution).toFixed(3)}
            {c.raw != null ? ` · raw ${Number(c.raw).toFixed(3)}` : ""}
          </li>
        ))}
      </ul>
      <div className="hint">SA {saScore ?? "n/a"} · QED {qed != null ? Number(qed).toFixed(2) : "n/a"} · composite {fitness.displayScore}/100</div>
    </div>
  );
}

function ScoreChart({ history }) {
  const points = history || [];
  if (!points.length) return null;
  const w = 640;
  const h = 200;
  const pad = 32;
  const maxY = Math.max(
    100,
    ...points.map((p) => Math.max(p.best || 0, p.average || 0)),
    ...points.map((p) => (p.meanSeedSimilarity ?? 0) * 100),
    ...points.map((p) => (p.painsAlerts ?? 0) * 10)
  );
  const minY = 0;
  const xs = (i) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const ys = (v) => h - pad - ((v - minY) / (maxY - minY || 1)) * (h - pad * 2);
  const bestPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys(p.best)}`).join(" ");
  const simPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys((p.meanSeedSimilarity ?? 0) * 100)}`)
    .join(" ");
  const painsPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xs(i)},${ys((p.painsAlerts ?? 0) * 10)}`)
    .join(" ");
  return (
    <svg className="evo-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Goodhart check: score, seed similarity, PAINS">
      <text x={pad} y={16} fontSize="11" fill="currentColor">Goodhart check (same axis scale)</text>
      <text x={pad} y={30} fontSize="10" fill="#64748b">Blue: best heuristic score · Orange: mean seed Tanimoto×100 · Red: PAINS count×10</text>
      <path d={bestPath} fill="none" stroke="#2563eb" strokeWidth="2" />
      <path d={simPath} fill="none" stroke="#ea580c" strokeWidth="1.8" strokeDasharray="5 3" />
      <path d={painsPath} fill="none" stroke="#dc2626" strokeWidth="1.5" />
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
  const [runMetrics, setRunMetrics] = useState([]);
  const [repeatSummary, setRepeatSummary] = useState(null);
  const [protectedInfo, setProtectedInfo] = useState(null);
  const [targetFree, setTargetFree] = useState(true);
  const [rngSeed, setRngSeed] = useState(42);
  const [svgs, setSvgs] = useState({});
  const abortRef = useRef(0);

  const [pickList, setPickList] = useState(() =>
    historyMolecules().slice(0, 16).map((m) => ({ ...m, source: m.source || "History" }))
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureApprovedDrugsLoaded();
        if (cancelled) return;
        const approved = loadApprovedDrugs()
          .filter((d) => /imatinib|dasatinib|nilotinib|gefitinib|erlotinib/i.test(d.name))
          .map((d) => ({ smiles: d.smiles, name: d.name, source: "Approved library" }));
        setPickList([...approved, ...historyMolecules()].slice(0, 16));
      } catch {
        // keep history-only picks
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rxn, sa] = await Promise.all([
          probeReactionSupport().catch((err) => ({
            reactions: false,
            reason: err?.message || "Server RDKit check failed",
          })),
          probeSaScoreSupport().catch((err) => ({
            saScore: false,
            reason: err?.message || "Server SA check failed",
          })),
        ]);
        if (cancelled) return;
        setReactionSupport(rxn);
        setSaSupport(sa);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const renderSvgs = async (rows) => {
    const next = {};
    const missing = [];
    for (const row of rows) {
      if (!row?.smiles) continue;
      if (row.svg) {
        next[row.smiles] = row.svg;
      } else {
        missing.push(row.smiles);
      }
    }
    if (missing.length) {
      try {
        const rendered = await renderMolSvgs(missing);
        Object.assign(next, rendered);
      } catch {
        // ignore
      }
    }
    setSvgs((prev) => ({ ...prev, ...next }));
  };

  const run = async () => {
    const cfg = clampSettings({ ...settings, rngSeed });
    const my = ++abortRef.current;
    setRunning(true);
    setError("");
    setHistory([]);
    setFinals([]);
    setRuntimeLog([]);
    setRunMetrics([]);
    setRepeatSummary(null);
    setProtectedInfo(null);
    setTargetFree(!protein?.id);
    setProgress("Seeding parent…");
    try {
      const campaign = await runEvolutionCampaign({
        smiles,
        name,
        protein,
        settings: cfg,
        onProgress: (p) => {
          if (my !== abortRef.current) return;
          if (p.phase === "seed") {
            setProgress(`Run ${p.run + 1} of ${p.runs}: seeding…`);
          } else {
            setProgress(`Run ${p.run + 1}/${p.runs} · generation ${p.generation}/${cfg.generations}`);
          }
        },
      });
      if (my !== abortRef.current) return;
      if (!campaign.ok) {
        setError(campaign.error || "Could not run local search.");
        return;
      }

      const primary = campaign.primaryRun;
      setSeed(primary.seed);
      setProtectedInfo(campaign.protectedQuery);
      setHistory(primary.history);
      setRepeatSummary(campaign.repeats);
      setRunMetrics(
        primary.history
          .filter((h) => h.generation > 0)
          .map((h) => ({
            generation: h.generation,
            meanSeedSimilarity: h.meanSeedSimilarity,
            uniqueScaffoldsArchive: h.uniqueScaffoldsArchive,
            painsAlerts: h.painsAlerts,
            diversity: h.diversity,
          }))
      );
      setRuntimeLog(
        primary.history.map(
          (h) =>
            `Gen ${h.generation}: best ${h.best} · mean seed sim ${h.meanSeedSimilarity ?? "n/a"} · unique scaffolds (archive) ${h.uniqueScaffoldsArchive ?? "n/a"} · PAINS alerts ${h.painsAlerts ?? 0}`
        )
      );

      const last = primary.finals;
      const withNovelty = [];
      for (const row of last) {
        withNovelty.push({ ...row, novelty: await noveltyForSmiles(row.smiles) });
      }
      setFinals(withNovelty);
      await renderSvgs([primary.seed, ...withNovelty]);

      const targetLabel = protein ? targetDisplayName(protein) || protein.id : "unspecified target";
      saveHistoryEntry({
        type: "evolution-run",
        title: `${FEATURE_TITLE}: ${name || "seed"} × ${targetLabel}`,
        summary: `Best ${withNovelty[0]?.score ?? "n/a"}/100 after ${cfg.generations} generations (${cfg.independentRuns} independent runs)`,
        inputs: { smiles: primary.seed.smiles, pdbId: protein?.id, settings: cfg },
        snapshot: {
          protein,
          seed: primary.seed,
          history: primary.history,
          finals: withNovelty.slice(0, 10),
          repeats: campaign.repeats,
        },
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
        <div className="hero-eyebrow">TargetForge · local molecular search</div>
        <h1>{FEATURE_TITLE}</h1>
        <p>
          Start from a valid seed, apply curated medicinal-chemistry SMARTS edits in RDKit, and re-score drug-likeness
          and synthesizability heuristics each generation. Structures are never invented by a language model. This is not
          docking, binding optimization, or validated potency prediction.
        </p>
      </div>

      <div className="limitation-callout" style={{ marginBottom: 20 }}>
        <div className="limitation-header">
          <span className="limitation-badge">Honest labeling</span>
          {targetFree && <span className="history-type-badge badge-discovery" style={{ marginLeft: 8 }}>Property optimization only — no target staged</span>}
        </div>
        <p className="limitation-body">
          {HYPOTHESIS_NOTE}{" "}
          Variants below the Morgan (radius 2, 2048-bit) Tanimoto similarity floor are rejected, and edits must preserve
          the protected substructure (default: RDKit Murcko scaffold of the seed). An offline retrosynthesis check (e.g.
          AiZynthFinder) on the final top 5 is a possible later step but is too heavy for the live app.
        </p>
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
            <label>Independent runs<input type="number" min={1} max={12} value={settings.independentRuns ?? 5} onChange={(e) => setSettings((s) => ({ ...s, independentRuns: e.target.value }))} /></label>
            <label>RNG seed<input type="number" min={1} max={999999} value={rngSeed} onChange={(e) => setRngSeed(Number(e.target.value) || 42)} /></label>
            <label>Seed similarity floor<input type="number" min={0} max={1} step={0.05} value={settings.seedSimilarityFloor ?? 0.4} onChange={(e) => setSettings((s) => ({ ...s, seedSimilarityFloor: e.target.value }))} /></label>
            <label>Diversity pick
              <select value={settings.diversityMethod || "maxmin"} onChange={(e) => setSettings((s) => ({ ...s, diversityMethod: e.target.value }))}>
                <option value="maxmin">MaxMin</option>
                <option value="butina">Butina leaders</option>
              </select>
            </label>
          </div>
          <label className="hint" htmlFor="evo-protected-smarts">Protected substructure (SMARTS; leave blank for Murcko scaffold)</label>
          <input
            id="evo-protected-smarts"
            className="evo-smiles"
            value={settings.protectedSmarts || ""}
            onChange={(e) => setSettings((s) => ({ ...s, protectedSmarts: e.target.value }))}
            placeholder="Optional SMARTS query"
          />
          {protectedInfo?.smarts && (
            <div className="hint">Active protection ({protectedInfo.source}): <span className="mono">{protectedInfo.smarts}</span></div>
          )}
          <button type="button" className="btn btn-primary" disabled={running || !smiles.trim()} onClick={run}>
            {running ? "Evolving…" : "Run evolution"}
          </button>
          {progress ? <div className="hint" role="status">{progress}</div> : null}
          {error ? <div className="error-msg">{error}</div> : null}
          <div className="hint">
            RDKit reactions: {reactionSupport ? (reactionSupport.reactions ? "available" : `unavailable (${reactionSupport.reason})`) : "checking…"}
            {" · "}
            SA score: {saSupport ? (saSupport.saScore ? saSupport.reason : "unavailable") : "checking…"}
          </div>
          {seed?.fitness && <ScoreBreakdown fitness={seed.fitness} saScore={seed.saScore} qed={seed.qed} provenance={seed.provenance} />}
        </Panel>
      </div>

      {history.length > 0 && (
        <Panel eyebrow="Trajectory" title="Goodhart check & generation metrics" kind="target">
          <ScoreChart history={history} />
          <ul className="methodology-bullet-list">
            {history.map((p) => (
              <li key={p.generation}>
                Gen {p.generation}: best {p.best} · avg {p.average} · mean seed sim {p.meanSeedSimilarity ?? "—"} · unique scaffolds {p.uniqueScaffoldsArchive ?? "—"} · PAINS {p.painsAlerts ?? 0}
              </li>
            ))}
          </ul>
          {runtimeLog.length > 0 && <pre className="mono" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{runtimeLog.join("\n")}</pre>}
          {runMetrics.length > 0 && (
            <table className="score-table" style={{ marginTop: 12 }}>
              <thead>
                <tr><th>Gen</th><th>Mean seed sim</th><th>Unique scaffolds</th><th>PAINS</th><th>Diversity</th></tr>
              </thead>
              <tbody>
                {runMetrics.map((m) => (
                  <tr key={m.generation}>
                    <td>{m.generation}</td>
                    <td>{m.meanSeedSimilarity}</td>
                    <td>{m.uniqueScaffoldsArchive}</td>
                    <td>{m.painsAlerts}</td>
                    <td>{m.diversity ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

      {repeatSummary && (repeatSummary.recurring?.length || repeatSummary.scoreSpread?.length > 1) && (
        <Panel eyebrow="Repeat runs" title="Cross-run stability" kind="target">
          {repeatSummary.scoreSpread?.length > 1 && (
            <>
              <div className="hint">Run-to-run variability of survivor heuristic scores (per independent RNG seed):</div>
              <ul className="methodology-bullet-list">
                {repeatSummary.scoreSpread.map((row) => (
                  <li key={row.runIndex}>
                    Run {row.runIndex + 1} (seed {row.rngSeed}): best {Number(row.best).toFixed(1)} · mean {Number(row.mean).toFixed(1)} · stdev {Number(row.stdev).toFixed(2)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {repeatSummary.recurring?.length > 0 && (
            <>
              <div className="hint">Variants that appeared as survivors in more than one run:</div>
              <ul className="methodology-bullet-list">
                {repeatSummary.recurring.slice(0, 8).map((row) => (
                  <li key={row.smiles}>
                    <span className="mono">{row.smiles}</span> · {row.runCount} runs ({row.runs.map((r) => r + 1).join(", ")}) · score {Number(row.scoreMin).toFixed(1)}–{Number(row.scoreMax).toFixed(1)} (mean {Number(row.scoreMean).toFixed(1)})
                  </li>
                ))}
              </ul>
            </>
          )}
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
                  <th>Score / seed sim</th>
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
                    <td className="mono">
                      <ProvenanceBadge text={row.provenance || "Heuristic"} />
                      Pareto rank {row.rank ?? "—"} · {row.score}/100 · seed Tanimoto {row.seedSimilarity != null ? Number(row.seedSimilarity).toFixed(3) : "—"}
                      <ScoreBreakdown fitness={row.fitness} saScore={row.saScore} qed={row.qed} provenance={row.provenance} />
                    </td>
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
                <span className="mono">{row.smiles}</span> ← {row.lineage?.operator || "mutation"} ({row.lineage?.label || row.editLabel}) parent(s): {(row.lineage?.parents || [row.parentSmiles]).join(" + ")} Δ {row.delta >= 0 ? "+" : ""}{Number(row.delta || 0).toFixed(1)}
              </li>
            ))}
          </ul>
          <Link to="/methodology#molecule-local-search">Methodology for this feature</Link>
        </Panel>
      )}
    </div>
  );
}
