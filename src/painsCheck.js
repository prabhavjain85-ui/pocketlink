const MEMORY_CACHE = new Map();
const STORAGE_KEY = "pocketlink-pains-cache-v1";
const MAX_BATCH = 5;

export const LOCAL_PAINS_PATTERNS = [
  {
    id: "michael_acceptor",
    name: "Michael acceptor",
    family: "toxicophore",
    explanation:
      "α,β-unsaturated carbonyls can covalently modify nucleophilic residues and produce nonspecific assay activity.",
    match: (s) => /C=C.*C(=O)|C=CC=O|C=CC(=S)/i.test(s),
  },
  {
    id: "aldehyde",
    name: "Aldehyde",
    family: "toxicophore",
    explanation:
      "Aldehydes form Schiff bases with protein amines and are a common source of assay interference.",
    match: (s) => /O=C[c]1|O=C[H]|\[CH\]=O|C\(=O\)H|O=Cc|C=CC=O/i.test(s),
  },
  {
    id: "epoxide",
    name: "Epoxide",
    family: "toxicophore",
    explanation: "Epoxides are electrophilic and can covalently bind proteins.",
    match: (s) => /C1CO1|C1OC1|O1CC1/i.test(s),
  },
  {
    id: "alkyl_halide",
    name: "Alkyl halide",
    family: "toxicophore",
    explanation: "Reactive alkyl chlorides, bromides, and iodides can alkylate nucleophilic residues.",
    match: (s) => /(?:^|[^a-z0-9])(?:C|CC|CCC)(?:Cl|Br|I)(?:$|[^a-z0-9])/i.test(s) && !/c(?:Cl|Br|I)/.test(s),
  },
  {
    id: "quinone",
    name: "Quinone",
    family: "pains",
    catalog: "PAINS",
    explanation: "Quinones are frequent false positives in high-throughput screens due to redox cycling.",
    match: (s) => /O=C1C=CC\(=O\)C=C1|O=C1C=CC=CC1=O/i.test(s),
  },
  {
    id: "rhodanine",
    name: "Rhodanine",
    family: "pains",
    catalog: "PAINS",
    explanation: "Rhodanines are frequent false positives due to nonspecific reactivity.",
    match: (s) => /O=C1CSC\(=S\)N1|O=C1NC\(=S\)SC1/i.test(s),
  },
  {
    id: "catechol",
    name: "Catechol",
    family: "pains",
    catalog: "PAINS",
    explanation: "Catechols can oxidize to reactive quinones and interfere across many assay formats.",
    match: (s) => /c1cc\(O\)c\(O\)cc1|Oc1ccccc1O|c1c\(O\)c\(O\)ccc1/i.test(s),
  },
  {
    id: "azo",
    name: "Azo compound",
    family: "pains",
    catalog: "PAINS",
    explanation: "Azo dyes can interfere photometrically and via redox chemistry.",
    match: (s) => /[^N]N=N[^N]/i.test(s),
  },
  {
    id: "thiourea",
    name: "Thiourea",
    family: "pains",
    catalog: "PAINS",
    explanation: "Thioureas can chelate metals and interfere in biochemical assays.",
    match: (s) => /NC\(=S\)N/i.test(s),
  },
  {
    id: "diketone",
    name: "β-Diketone",
    family: "pains",
    catalog: "PAINS",
    explanation: "β-Diketones chelate metals and can generate false positives in metal-dependent assays.",
    match: (s) => /C\(=O\)CC\(=O\)/i.test(s),
  },
  {
    id: "hydrazone",
    name: "Hydrazone",
    family: "pains",
    catalog: "PAINS",
    explanation: "Hydrazones can hydrolyze or chelate metals.",
    match: (s) => /C=NN/i.test(s),
  },
];

export function compoundSmiles(compound) {
  if (!compound) return "";
  return String(
    compound.IsomericSMILES ||
      compound.CanonicalSMILES ||
      compound.SMILES ||
      compound.ConnectivitySMILES ||
      compound.smiles ||
      ""
  ).trim();
}

export function painsCacheKey(compound) {
  const cid = compound?.CID ?? compound?.cid;
  if (cid != null && String(cid) !== "") return `cid:${cid}`;
  const smiles = compoundSmiles(compound);
  return smiles ? `smiles:${smiles}` : null;
}

function unableResult(compound, reason) {
  return {
    cid: String(compound?.CID ?? compound?.cid ?? ""),
    smiles: compoundSmiles(compound),
    status: "unable",
    hasAlerts: false,
    checked: false,
    alerts: [],
    reason: reason || "Unable to check",
  };
}

let painsSessionLoaded = false;

function ensurePainsSessionLoaded() {
  if (painsSessionLoaded) return;
  painsSessionLoaded = true;
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
    for (const [k, v] of Object.entries(raw)) {
      if (!MEMORY_CACHE.has(k)) MEMORY_CACHE.set(k, v);
    }
  } catch {
    // ignore
  }
}

export function getCachedPains(compound) {
  const key = painsCacheKey(compound);
  if (!key) return unableResult(compound, "Missing SMILES");
  ensurePainsSessionLoaded();
  if (MEMORY_CACHE.has(key)) return MEMORY_CACHE.get(key);
  return null;
}

function remember(result) {
  const cidKey = result.cid ? `cid:${result.cid}` : null;
  const smilesKey = result.smiles ? `smiles:${result.smiles}` : null;
  if (cidKey) MEMORY_CACHE.set(cidKey, result);
  if (smilesKey) MEMORY_CACHE.set(smilesKey, result);
}

export function compactPainsForRanking(result) {
  if (!result || typeof result !== "object") return null;
  return {
    status: result.status || "unable",
    hasAlerts: Boolean(result.hasAlerts),
    alerts: Array.isArray(result.alerts)
      ? result.alerts.slice(0, 8).map((alert) => ({
          family: alert.family || "",
          catalog: alert.catalog || "",
          name: alert.name || "Alert",
          explanation: alert.explanation || "",
        }))
      : [],
    reason: result.reason || null,
  };
}

export function checkPainsFast(compound) {
  const cid = String(compound?.CID ?? compound?.cid ?? "");
  const smiles = compoundSmiles(compound);
  if (!smiles) return unableResult(compound, "Missing SMILES");

  const cached = getCachedPains(compound);
  if (cached) return cached;

  const alerts = [];
  for (const pat of LOCAL_PAINS_PATTERNS) {
    try {
      if (pat.match(smiles)) {
        alerts.push({
          family: pat.family,
          catalog: pat.catalog || pat.family,
          name: pat.name,
          explanation: pat.explanation,
        });
      }
    } catch {
      // ignore
    }
  }

  const result = {
    cid,
    smiles,
    status: alerts.length > 0 ? "alert" : "clean",
    hasAlerts: alerts.length > 0,
    checked: true,
    alerts,
    reason: null,
  };
  remember(result);
  return result;
}

export const LIBRARY_PAINS_BATCH = 100;

export async function checkPainsBatch(candidates, maxBatch = MAX_BATCH) {
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, maxBatch);
  const byCid = {};
  const toFetch = [];

  for (const compound of list) {
    const cid = String(compound?.CID ?? compound?.cid ?? "");
    const smiles = compoundSmiles(compound);
    const key = cid || smiles;
    if (!smiles) {
      const result = unableResult(compound, "Missing SMILES");
      remember(result);
      if (key) byCid[cid || key] = result;
      continue;
    }
    const cached = getCachedPains(compound);
    if (cached) {
      if (cid) byCid[cid] = cached;
      continue;
    }
    toFetch.push({ cid, smiles });
  }

  if (toFetch.length) {
    try {
      const response = await fetch("/api/pains-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compounds: toFetch }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.results)) {
        throw new Error(data?.error || "PAINS check failed.");
      }
      for (const row of data.results) {
        const result = {
          cid: String(row.cid || ""),
          smiles: String(row.smiles || ""),
          status: row.status || "unable",
          hasAlerts: Boolean(row.hasAlerts),
          checked: Boolean(row.checked),
          alerts: Array.isArray(row.alerts) ? row.alerts : [],
          reason: row.reason || null,
        };
        remember(result);
        if (result.cid) byCid[result.cid] = result;
      }
    } catch {
      for (const item of toFetch) {
        byCid[item.cid] = unableResult(item, "PAINS service unavailable");
      }
    }
  }

  return byCid;
}

/**
 * Screen an arbitrary-length library in non-blocking batches.
 * When screened at full library scale (>100 compounds), uses instant local evaluation
 * to avoid dozens of sequential HTTP requests that cause timeouts.
 */
export async function checkPainsLibrary(candidates, { onProgress } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const byCid = {};

  if (list.length > LIBRARY_PAINS_BATCH) {
    for (let i = 0; i < list.length; i += 1) {
      const candidate = list[i];
      const cid = String(candidate?.CID ?? candidate?.cid ?? "");
      const res = checkPainsFast(candidate);
      if (cid) byCid[cid] = res;
    }
    if (typeof onProgress === "function") {
      onProgress({ done: list.length, total: list.length });
    }
    return byCid;
  }

  for (let i = 0; i < list.length; i += LIBRARY_PAINS_BATCH) {
    const chunk = list.slice(i, i + LIBRARY_PAINS_BATCH);
    Object.assign(byCid, await checkPainsBatch(chunk, LIBRARY_PAINS_BATCH));
    if (typeof onProgress === "function") {
      onProgress({ done: Math.min(i + LIBRARY_PAINS_BATCH, list.length), total: list.length });
    }
  }
  return byCid;
}

export function clearPainsCache() {
  MEMORY_CACHE.clear();
  painsSessionLoaded = false;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
