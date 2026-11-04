import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  rankCandidates,
  checkPainsBatch,
  searchPdbTargets,
  listCompoundLibraries,
  screenApprovedLibrary,
  searchPubchemCompound,
} from "./serverApi";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
import { prettyName, getCompoundSmiles } from "./benchUi";
import { MAX_CANDIDATES, drugLikenessChecks } from "./shared/drugLikeness";
import { targetDisplayName } from "./shared/targetLabels";

const EGFR_DEMO_PDB = "1M17";
const EGFR_DEMO_COMPOUNDS = ["imatinib", "osimertinib"];

// Rankings are computed on the server; remember finished ones for this tab so
// revisiting the same target + shortlist restores the result instantly.
const BENCH_RANKING_STORAGE_KEY = "targetforge_bench_rankings_v1";
const MAX_CACHED_RANKINGS = 20;

function benchRankingKey(candidates, protein) {
  const pdb = String(protein?.id || protein?.pdb_id || "none").toUpperCase();
  const moa = String(protein?.expectedMoA || "").toLowerCase();
  const cids = candidates.map((c) => String(c.CID ?? c.cid ?? "")).sort();
  return `${pdb}|${moa}|${cids.join(",")}`;
}

function readBenchRankings() {
  try {
    if (typeof sessionStorage === "undefined") return {};
    return JSON.parse(sessionStorage.getItem(BENCH_RANKING_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function tryCachedRanking(candidates, protein) {
  return readBenchRankings()[benchRankingKey(candidates, protein)] || null;
}

function rememberBenchRanking(candidates, protein, data) {
  try {
    if (typeof sessionStorage === "undefined" || !data?.ranking) return;
    const all = readBenchRankings();
    all[benchRankingKey(candidates, protein)] = data;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_CACHED_RANKINGS))) delete all[key];
    sessionStorage.setItem(BENCH_RANKING_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked — caching is best-effort
  }
}

export function useStagingBench() {
  const [searchParams] = useSearchParams();
  const handoffQuery = searchParams.get("q") || "";
  const handoffMoA = searchParams.get("moa") || "";
  const handoffUniprot = searchParams.get("uniprot") || "";
  const fromDiscovery = searchParams.get("from") === "target-discovery";

  const [demoTargetQuery, setDemoTargetQuery] = useState("");
  const [demoKey, setDemoKey] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);

  const savedActive = useMemo(() => {
    if (handoffQuery) return null;
    return getActiveState(ACTIVE_STATE_KEYS.BENCH);
  }, [handoffQuery]);

  const [protein, setProteinState] = useState(() => savedActive?.protein || null);
  const setProtein = useCallback(
    (next) => {
      if (!next) {
        setProteinState(null);
        return;
      }
      setProteinState({
        ...next,
        expectedMoA: next.expectedMoA || handoffMoA || undefined,
        uniprotId: next.uniprotId || handoffUniprot || undefined,
      });
    },
    [handoffMoA, handoffUniprot]
  );
  const [hasTargetResults, setHasTargetResults] = useState(false);

  const [cQuery, setCQuery] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [cError, setCError] = useState("");
  const [cResult, setCResult] = useState(null);
  const [candidates, setCandidates] = useState(() => savedActive?.candidates || []);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(() => savedActive?.aiResult || null);
  const [handoffCid, setHandoffCid] = useState(() => savedActive?.handoffCid || null);

  const [aiSort, setAiSort] = useState({ key: "score", dir: "desc" });
  const [painsByCid, setPainsByCid] = useState({});

  useEffect(() => {
    setActiveState(ACTIVE_STATE_KEYS.BENCH, {
      protein,
      candidates,
      aiResult,
      handoffCid,
    });
  }, [protein, candidates, aiResult, handoffCid]);

  const fetchCompoundByName = useCallback(async (name) => {
    const q = String(name || "").trim();
    if (!q) return null;
    const p = await searchPubchemCompound(q);
    if (!p) {
      throw new Error(`PubChem returned no usable data for "${q}".`);
    }
    return { ...p, displayName: p.displayName || prettyName(p, q) };
  }, []);

  const searchCompound = useCallback(async (rawName) => {
    const q = String(rawName ?? cQuery).trim();
    if (!q) return;
    setCQuery(q);
    setCLoading(true);
    setCError("");
    setCResult(null);
    try {
      const result = await fetchCompoundByName(q);
      setCResult(result);
      return result;
    } catch (e) {
      setCError(e.message || "Couldn't reach PubChem. Check your connection and try again.");
      return null;
    } finally {
      setCLoading(false);
    }
  }, [cQuery, fetchCompoundByName]);

  const scrollToBench = useCallback(() => {
    document.getElementById("staging-bench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const startBlankScreen = useCallback(() => {
    scrollToBench();
    window.setTimeout(() => {
      document.getElementById("target-search-input")?.focus();
    }, 250);
  }, [scrollToBench]);

  const loadEgfrCompareDemo = useCallback(async () => {
    setDemoLoading(true);
    setDemoTargetQuery(EGFR_DEMO_PDB);
    setDemoKey((n) => n + 1);
    setCError("");
    setAiError("");
    setAiResult(null);
    setCandidates([]);
    setProtein(null);
    setCResult(null);
    setHandoffCid(null);
    scrollToBench();
    try {
      const { results, error: pdbError } = await searchPdbTargets(EGFR_DEMO_PDB);
      if (pdbError || !results?.length) {
        throw new Error(pdbError || `No PDB structure found for ${EGFR_DEMO_PDB}.`);
      }
      const row = results.find((r) => r.id === EGFR_DEMO_PDB) || results[0];
      const staged = { ...row, queryName: EGFR_DEMO_PDB };
      setProtein(staged);
      saveHistoryEntry({
        type: "pdb-search",
        title: `PDB Target: ${staged.id} (${staged.title || EGFR_DEMO_PDB})`,
        summary: `${staged.id} · Score ${staged.targetSelectionScore ?? staged.score}/100 · ${staged.resolution || "resolution n/a"} · ${staged.method || "METHOD"}`,
        inputs: { query: EGFR_DEMO_PDB, pdbId: staged.id },
        snapshot: { protein: staged, query: EGFR_DEMO_PDB },
      });

      const compounds = await Promise.all(EGFR_DEMO_COMPOUNDS.map((name) => fetchCompoundByName(name)));
      setCandidates(compounds);
      const osimertinib = compounds.find((c) => /osimertinib/i.test(c.displayName || ""));
      setCQuery("osimertinib");
      setCResult(osimertinib || compounds[compounds.length - 1]);

      const latestPains = await checkPainsBatch(compounds);
      setPainsByCid((prev) => ({ ...prev, ...latestPains }));
      const data = await rankCandidates(compounds, staged, latestPains);
      setAiResult(data);
      if (data?.aiError) {
        setAiError(
          `Unable to score against this target with the language model (${data.aiError}). TargetForge used its target-aware model instead.`
        );
      }
      if (data?.recommended?.cid) setHandoffCid(data.recommended.cid);

      const winnerRow =
        data?.ranking?.find((r) => String(r.cid) === String(data?.recommended?.cid)) || data?.ranking?.[0];
      const winnerCandidate = compounds.find((c) => String(c.CID) === String(winnerRow?.cid));
      const winnerName =
        winnerCandidate?.displayName || winnerCandidate?.name || winnerRow?.name || `CID ${winnerRow?.cid}`;
      const targetLabel = targetDisplayName(staged);
      saveHistoryEntry({
        type: "staging-bench",
        title: `Staging Bench: ${targetLabel} (${compounds.length} compounds)`,
        summary: `Winner: ${winnerName} (${winnerRow?.score ?? "n/a"}/100) · ${compounds.length} candidates scored against ${targetLabel}`,
        inputs: {
          target: targetLabel,
          pdbId: staged.id,
          compoundCount: compounds.length,
          compoundNames: compounds.map((c) => c.displayName || c.name || `CID ${c.CID}`),
        },
        snapshot: {
          protein: staged,
          candidates: compounds,
          aiResult: data,
          handoffCid: data?.recommended?.cid,
        },
      });

      window.setTimeout(() => {
        document.querySelector(".handoff-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);
    } catch (e) {
      setCError(e.message || "Couldn't load the EGFR comparison demo. Check your connection and try again.");
    } finally {
      setDemoLoading(false);
    }
  }, [fetchCompoundByName, scrollToBench, setProtein]);

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

  // ---- Library screening mode -------------------------------------------
  // "manual" keeps the original up-to-5 shortlist. "library" screens a whole
  // committed compound set against the staged structure on the server.
  const [benchMode, setBenchMode] = useState("manual");
  const [libraries, setLibraries] = useState([]);
  const [libraryId, setLibraryId] = useState("clinical");
  const [libraryRunning, setLibraryRunning] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [libraryProgress, setLibraryProgress] = useState(null);
  const [libraryResult, setLibraryResult] = useState(null);
  const [libraryAbort, setLibraryAbort] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listCompoundLibraries()
      .then((rows) => {
        if (!cancelled) setLibraries(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // A screen is only meaningful for the structure it ran against.
  useEffect(() => {
    setLibraryResult(null);
    setLibraryError("");
  }, [protein?.id, libraryId]);

  const runLibraryScreen = async ({ force = false } = {}) => {
    if (!protein) {
      setLibraryError("Stage a target structure first.");
      return;
    }
    const controller = new AbortController();
    setLibraryAbort(controller);
    setLibraryRunning(true);
    setLibraryError("");
    setLibraryResult(null);
    setLibraryProgress({ percent: 0, message: "Starting screen…" });
    try {
      const data = await screenApprovedLibrary(protein, {
        libraryId,
        force,
        signal: controller.signal,
        onProgress: (p) => setLibraryProgress(p),
      });
      setLibraryResult(data);
      const label = data?.library?.label || "library";
      saveHistoryEntry({
        type: "library-screen",
        title: `Library screen: ${targetDisplayName(protein) || protein.id} × ${label}`,
        summary: `${data?.ranking?.length ?? 0} of ${data?.librarySize ?? 0} compounds scored; lead ${data?.ranking?.[0]?.name ?? "n/a"} (${data?.ranking?.[0]?.score ?? "n/a"}/100)`,
        inputs: { pdbId: protein.id, libraryId, librarySize: data?.librarySize },
        snapshot: { protein, top: (data?.ranking || []).slice(0, 25) },
      });
    } catch (err) {
      if (err?.name === "AbortError") setLibraryError("Screen cancelled.");
      else setLibraryError(err?.message || "Library screen failed.");
    } finally {
      setLibraryRunning(false);
      setLibraryProgress(null);
      setLibraryAbort(null);
    }
  };

  const cancelLibraryScreen = () => {
    if (libraryAbort) libraryAbort.abort();
  };

  /** Move the top hits into the manual shortlist so Station 3 can compare them. */
  const promoteTopHits = (count = MAX_CANDIDATES) => {
    const rows = (libraryResult?.ranking || []).slice(0, count);
    if (!rows.length) return;
    setCandidates(
      rows.map((row) => ({
        CID: row.cid,
        cid: String(row.cid),
        name: row.name,
        displayName: row.name,
        IsomericSMILES: row.smiles,
        CanonicalSMILES: row.smiles,
        SMILES: row.smiles,
        MolecularWeight: row.mw,
        XLogP: row.xlogp,
        HBondDonorCount: row.hbd,
        HBondAcceptorCount: row.hba,
        RotatableBondCount: row.rot,
        TPSA: row.tpsa,
        indication: row.indication,
        drugClass: row.class,
        structuralSimilarity: row.structuralSimilarity,
      }))
    );
    setBenchMode("manual");
    setAiResult(null);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        document.getElementById("staging-bench")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    }
  };

  const analyze = async () => {
    if (candidates.length < 2) return;
    setAiLoading(true);
    setAiError("");
    try {
      const latestPains = { ...painsByCid, ...(await checkPainsBatch(candidates)) };
      setPainsByCid((prev) => ({ ...prev, ...latestPains }));
      const data = await rankCandidates(candidates, protein, latestPains);
      setAiResult(data);
      rememberBenchRanking(candidates, protein, data);
      if (data?.aiError) {
        setAiError(`Unable to score against this target with the language model (${data.aiError}). TargetForge used its target-aware model instead.`);
      }
      if (data?.recommended?.cid) setHandoffCid(data.recommended.cid);
      const winnerRow = data?.ranking?.find((r) => String(r.cid) === String(data?.recommended?.cid)) || data?.ranking?.[0];
      const winnerCandidate = candidates.find((c) => String(c.CID) === String(winnerRow?.cid));
      const winnerName = winnerCandidate?.displayName || winnerCandidate?.name || winnerRow?.name || `CID ${winnerRow?.cid}`;
      const targetLabel = protein ? targetDisplayName(protein) : "Target";
      saveHistoryEntry({
        type: "staging-bench",
        title: `Staging Bench: ${targetLabel} (${candidates.length} compounds)`,
        summary: `Winner: ${winnerName} (${winnerRow?.score ?? "n/a"}/100) · ${candidates.length} candidates scored against ${targetLabel}`,
        inputs: {
          target: targetLabel,
          pdbId: protein?.id,
          compoundCount: candidates.length,
          compoundNames: candidates.map((c) => c.displayName || c.name || `CID ${c.CID}`),
        },
        snapshot: {
          protein,
          candidates,
          aiResult: data,
          handoffCid: data?.recommended?.cid,
        },
      });
    } catch (e) {
      setAiError(e.message || "AI analysis failed.");
    } finally {
      setAiLoading(false);
    }
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
  const previewChecks = cResult
    ? Array.isArray(cResult.previewChecks)
      ? cResult.previewChecks
      : drugLikenessChecks(cResult)
    : [];
  const previewPass =
    cResult && Number.isInteger(cResult.previewPass)
      ? cResult.previewPass
      : previewChecks.filter((c) => c.pass).length;
  const progress =
    (protein ? 0.25 : 0) +
    (candidates.length ? 0.25 : 0) +
    (aiResult ? 0.25 : 0) +
    (protein && compound ? 0.25 : 0);

  const winner = recommendedCid
    ? candidates.find((c) => String(c.CID) === String(recommendedCid))
    : null;
  const winnerRow = aiResult?.ranking?.find((r) => String(r.cid) === String(recommendedCid));
  const winnerCandidate = winner
    ? { ...winner, cid: winner.CID, score: aiResult?.recommended?.score, reasoning: winnerRow?.reasoning || [aiResult?.recommended?.reason] }
    : null;

  return {
    protein, setProtein, hasTargetResults, setHasTargetResults,
    cQuery, setCQuery, cLoading, cError, cResult, candidates,
    aiLoading, aiError, aiResult, handoffCid, setHandoffCid,
    aiSort, painsByCid, demoKey, demoTargetQuery, demoLoading,
    handoffQuery, handoffMoA, handoffUniprot, fromDiscovery,
    benchMode, setBenchMode,
    libraries, libraryId, setLibraryId,
    libraryRunning, libraryError, libraryProgress, libraryResult,
    runLibraryScreen, cancelLibraryScreen, promoteTopHits,
    searchCompound, addOrRemovePreview, removeCandidate, analyze, toggleAiSort,
    loadEgfrCompareDemo, startBlankScreen,
    alreadyStaged, shortlistFull, recommendedCid, rankingRows,
    fitTargetName, fitPdbId, compound, smiles, previewChecks, previewPass,
    progress, winner, winnerRow, winnerCandidate,
  };
}
