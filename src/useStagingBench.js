import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { rankCandidates, tryCachedRanking } from "./aiCandidateRanking";
import {
  ACTIVE_STATE_KEYS,
  getActiveState,
  saveHistoryEntry,
  setActiveState,
} from "./historyService";
import { prettyName, getCompoundSmiles } from "./benchUi";
import { checkPainsBatch } from "./painsCheck";
import { MAX_CANDIDATES, drugLikenessChecks } from "./scoreCandidates";
import { searchPdbTargets } from "./pdbSearch";
import { targetDisplayName } from "./targetContext";

const EGFR_DEMO_PDB = "1M17";
const EGFR_DEMO_COMPOUNDS = ["imatinib", "osimertinib"];

export function useStagingBench() {
  const [searchParams] = useSearchParams();
  const handoffQuery = searchParams.get("q") || "";
  const fromDiscovery = searchParams.get("from") === "target-discovery";

  const [demoTargetQuery, setDemoTargetQuery] = useState("");
  const [demoKey, setDemoKey] = useState(0);
  const [demoLoading, setDemoLoading] = useState(false);

  const savedActive = useMemo(() => {
    if (handoffQuery) return null;
    return getActiveState(ACTIVE_STATE_KEYS.BENCH);
  }, [handoffQuery]);

  const [protein, setProtein] = useState(() => savedActive?.protein || null);
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
      throw new Error(`PubChem has no compound named "${q}". Try the common or generic drug name (e.g. "ibuprofen", "imatinib").`);
    }
    const data = await res.json();
    const p = data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0];
    if (!p) {
      throw new Error(`PubChem returned no usable data for "${q}".`);
    }
    return { ...p, displayName: prettyName(p, q) };
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

  const stageCompound = useCallback((result) => {
    if (!result) return;
    setAiResult(null);
    setAiError("");
    setCandidates((prev) => {
      if (prev.some((c) => c.CID === result.CID)) return prev;
      if (prev.length >= MAX_CANDIDATES) return prev;
      return [...prev, result];
    });
  }, []);

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
  }, [fetchCompoundByName, scrollToBench]);

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
  const previewChecks = cResult ? drugLikenessChecks(cResult) : [];
  const previewPass = previewChecks.filter((c) => c.pass).length;
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
    handoffQuery, fromDiscovery,
    searchCompound, addOrRemovePreview, removeCandidate, analyze, toggleAiSort,
    loadEgfrCompareDemo, startBlankScreen,
    alreadyStaged, shortlistFull, recommendedCid, rankingRows,
    fitTargetName, fitPdbId, compound, smiles, previewChecks, previewPass,
    progress, winner, winnerRow, winnerCandidate,
  };
}
