import {
  submitDockingJob,
  pollDockingJob,
  getDockingJobResults,
  DockingServiceUnavailableError,
} from "../dockingApi";
import { pdbIdOf } from "../rankingCache";

const sessionCache = new Map();

export function affinityCacheKey(pdbId, smiles) {
  return `${String(pdbId || "").toUpperCase()}|${String(smiles || "").trim()}`;
}

export function getCachedAffinity(pdbId, smiles) {
  return sessionCache.get(affinityCacheKey(pdbId, smiles)) || null;
}

export function setCachedAffinity(pdbId, smiles, row) {
  sessionCache.set(affinityCacheKey(pdbId, smiles), row);
}

export async function dockOne(pdbId, smiles, { onProgress } = {}) {
  const key = affinityCacheKey(pdbId, smiles);
  if (sessionCache.has(key)) return sessionCache.get(key);
  try {
    const submit = await submitDockingJob({ pdbId, smiles });
    await pollDockingJob(submit.jobId, { onProgress, intervalMs: 2000, timeoutMs: 300000 });
    const results = await getDockingJobResults(submit.jobId);
    const pose = results?.result?.poses?.[0];
    const deltaG = Number(pose?.scoreKcalMol);
    const row = {
      ok: true,
      deltaG,
      docked: true,
      source: "vina",
      jobId: submit.jobId,
    };
    sessionCache.set(key, row);
    return row;
  } catch (err) {
    if (err instanceof DockingServiceUnavailableError || err?.serviceUnavailable) {
      const row = { ok: false, unavailable: true, docked: false };
      sessionCache.set(key, row);
      return row;
    }
    return { ok: false, error: err?.message || "Docking failed", docked: false };
  }
}

export function ligandEfficiency(deltaG, heavyAtoms) {
  const ha = Math.max(1, Number(heavyAtoms) || 1);
  if (!Number.isFinite(deltaG)) return null;
  return (-deltaG) / ha;
}

/** Heuristic only: Vina ΔG (kcal/mol) minus logP — not true LLE. */
export function affinityLogPAdjusted(deltaG, logp) {
  if (!Number.isFinite(deltaG) || !Number.isFinite(logp)) return null;
  return -deltaG - logp;
}

/**
 * Select candidates to dock: exploitation, uncertainty, diversity, elite re-dock.
 */
export function selectDockingCandidates(rows, { budget = 24, rng, dockedSmiles = new Set() }) {
  if (typeof rng !== "function") {
    throw new Error("selectDockingCandidates requires a seeded rng function");
  }
  const undocked = rows.filter((r) => r.smiles && !dockedSmiles.has(r.smiles));
  if (!undocked.length) return [];

  const byYhat = undocked.slice().sort((a, b) => (b.surrogateYhat ?? 0) - (a.surrogateYhat ?? 0));
  const bySigma = undocked.slice().sort((a, b) => (b.surrogateSigma ?? 0) - (a.surrogateSigma ?? 0));

  const buckets = new Map();
  for (const r of undocked) {
    const b = r.bucket || "unknown";
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(r);
  }
  const diversityPicks = [];
  for (const [, list] of buckets) {
    const best = list.slice().sort((a, b) => (b.surrogateYhat ?? 0) - (a.surrogateYhat ?? 0))[0];
    if (best && !diversityPicks.find((x) => x.smiles === best.smiles)) diversityPicks.push(best);
  }

  const nExploit = Math.floor(budget * 0.5);
  const nUnc = Math.floor(budget * 0.25);
  const nDiv = Math.floor(budget * 0.17);
  const nElite = Math.max(0, budget - nExploit - nUnc - nDiv);

  const chosen = [];
  const seen = new Set();

  const take = (list, n) => {
    for (const r of list) {
      if (chosen.length >= budget) break;
      if (seen.has(r.smiles)) continue;
      seen.add(r.smiles);
      chosen.push(r);
      if (chosen.filter((c) => list.includes(c)).length >= n) break;
    }
  };

  take(byYhat, nExploit);
  take(bySigma, nUnc);
  take(diversityPicks.sort(() => rng() - 0.5), nDiv);
  const elite = rows
    .filter((r) => r.docked)
    .sort((a, b) => (b.le ?? 0) - (a.le ?? 0))
    .slice(0, nElite);
  for (const e of elite) {
    if (!seen.has(e.smiles) && chosen.length < budget) {
      seen.add(e.smiles);
      chosen.push(e);
    }
  }

  while (chosen.length < budget && chosen.length < undocked.length) {
    const rest = undocked.filter((r) => !seen.has(r.smiles));
    if (!rest.length) break;
    const pick = rest[Math.floor(rng() * rest.length)];
    seen.add(pick.smiles);
    chosen.push(pick);
  }

  return chosen.slice(0, budget);
}

export async function dockBatchForTarget(protein, candidates, { onProgress, concurrency = 4 } = {}) {
  const pdbId = pdbIdOf(protein);
  if (!pdbId) return { docked: [], unavailable: true };
  const out = [];
  let unavailable = false;
  const queue = [...candidates];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const row = queue.shift();
      if (!row) break;
      const res = await dockOne(pdbId, row.smiles, { onProgress });
      if (res.unavailable) unavailable = true;
      out.push({ ...row, affinity: res });
    }
  });
  await Promise.all(workers);
  return { docked: out, unavailable, pdbId };
}
