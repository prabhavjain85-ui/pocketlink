/**
 * Baseline tissue expression for a target, from real GTEx data.
 *
 * This module previously synthesised "realistic GTEx tissue expression" from a
 * hash of the gene symbol for every gene outside a 13-entry curated list, and
 * the UI charted those numbers under a "Baseline RNA (TPM)" heading. They were
 * not measurements. That generator has been removed: expression now comes from
 * the Open Targets Platform `baselineExpression` field (GTEx bulk RNA-seq,
 * median TPM per tissue), and when it is unavailable the profile reports that
 * instead of inventing values.
 *
 * Tissue specificity uses tau (Yanai et al., Bioinformatics 2005):
 *   tau = sum(1 - x_i / x_max) / (n - 1)
 * 0 = expressed evenly everywhere, 1 = confined to a single tissue.
 */
import { otGraphql } from "./openTargets.js";

const EXPRESSION_QUERY = `
query TargetBaselineExpression($ensemblId: String!, $size: Int!) {
  target(ensemblId: $ensemblId) {
    id
    approvedSymbol
    baselineExpression(page: { index: 0, size: $size }) {
      count
      rows {
        datasourceId
        unit
        median
        tissueBiosample { biosampleId biosampleName }
        tissueBiosampleParent { biosampleName }
      }
    }
  }
}
`;

// GTEx bulk RNA-seq reports ~51 tissues per gene; the API also returns
// single-cell rows in CPM, which are a different unit and must not be mixed in.
const GTEX_SOURCE = "gtex";
const GTEX_UNIT = "TPM";
const ROW_FETCH_SIZE = 2000;
const DISPLAY_TISSUES = 12;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHED = 500;
const cache = new Map();

function cacheGet(key) {
  const row = cache.get(key);
  if (!row) return undefined;
  if (Date.now() > row.expires) {
    cache.delete(key);
    return undefined;
  }
  return row.value;
}

function cacheSet(key, value) {
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Tau specificity index over the per-tissue expression vector.
 *
 * Computed on log2(TPM + 1), not raw TPM. RNA-seq spans orders of magnitude,
 * and on the raw scale a single high tissue dominates: GAPDH, expressed
 * everywhere, reads tau 0.81 ("enriched") on raw TPM because skeletal muscle
 * is ~8x the rest. On the log scale the same gene reads ~0.2 (ubiquitous),
 * which is the biologically correct answer for a housekeeping gene.
 */
export function tauSpecificity(values) {
  const xs = (values || []).filter((v) => Number.isFinite(v) && v >= 0);
  if (xs.length < 2) return null;
  const logged = xs.map((x) => Math.log2(x + 1));
  const max = Math.max(...logged);
  if (max <= 0) return null;
  return logged.reduce((sum, x) => sum + (1 - x / max), 0) / (logged.length - 1);
}

export function classifySpecificity(tau) {
  if (tau === null || tau === undefined) return { specificity: "unknown", specificityBadge: "Specificity unknown" };
  if (tau >= 0.85) return { specificity: "enriched", specificityBadge: "Tissue-Restricted (tau >= 0.85)" };
  if (tau >= 0.6) return { specificity: "group_enriched", specificityBadge: "Tissue-Enriched (tau 0.60-0.85)" };
  return { specificity: "ubiquitous", specificityBadge: "Broadly Expressed (tau < 0.60)" };
}

/** Collapse repeated biosamples (GTEx lists some tissues more than once). */
function aggregateByTissue(rows) {
  const byTissue = new Map();
  for (const row of rows) {
    const name = row?.tissueBiosample?.biosampleName;
    const value = Number(row?.median);
    if (!name || !Number.isFinite(value)) continue;
    if (!byTissue.has(name)) {
      byTissue.set(name, {
        id: row.tissueBiosample.biosampleId || name,
        name,
        organSystem: row.tissueBiosampleParent?.biosampleName || "",
        values: [],
      });
    }
    byTissue.get(name).values.push(value);
  }
  return [...byTissue.values()].map((t) => ({
    id: t.id,
    name: t.name,
    organSystem: t.organSystem,
    tpm: Math.round(median(t.values) * 10) / 10,
  }));
}

function unavailable(symbol, reason) {
  return {
    symbol,
    available: false,
    reason,
    source: null,
    tissues: [],
    tau: null,
    specificity: "unknown",
    specificityBadge: "No expression data",
    primaryTissue: null,
    primaryTpm: null,
    riskLevel: null,
    synthesis: `No baseline expression data is available for ${symbol || "this target"}, so tissue specificity was not assessed.`,
    maxTpm: null,
  };
}

/**
 * @param {string} symbol     gene symbol, for display
 * @param {object} [options]
 * @param {string} [options.ensemblId]  Open Targets needs this; without it we cannot look the gene up
 */
export async function getTargetExpressionProfile(symbol, options = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  const ensemblId = String(options.ensemblId || "").trim();

  if (!ensemblId) {
    return unavailable(sym, "No Ensembl gene id was supplied, so GTEx expression could not be looked up.");
  }

  const cached = cacheGet(ensemblId);
  if (cached !== undefined) return cached;

  let data;
  try {
    data = await otGraphql(EXPRESSION_QUERY, { ensemblId, size: ROW_FETCH_SIZE }, { signal: options.signal });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    return unavailable(sym, "Open Targets could not be reached for baseline expression.");
  }

  const allRows = data?.target?.baselineExpression?.rows || [];
  const gtexRows = allRows.filter((r) => r?.datasourceId === GTEX_SOURCE && r?.unit === GTEX_UNIT);
  if (!gtexRows.length) {
    const profile = unavailable(sym, "Open Targets holds no GTEx bulk RNA-seq profile for this gene.");
    cacheSet(ensemblId, profile);
    return profile;
  }

  const tissues = aggregateByTissue(gtexRows).sort((a, b) => b.tpm - a.tpm);
  const tau = tauSpecificity(tissues.map((t) => t.tpm));
  const { specificity, specificityBadge } = classifySpecificity(tau);

  const maxTpm = tissues[0]?.tpm || 0;
  const top = tissues[0];
  const second = tissues[1];
  const shown = tissues.slice(0, DISPLAY_TISSUES).map((t) => ({
    ...t,
    relativePercent: maxTpm > 0 ? Math.max(2, Math.round((t.tpm / maxTpm) * 100)) : 0,
  }));

  let riskLevel = "moderate";
  let synthesis = "";
  if (specificity === "enriched") {
    riskLevel = "lower";
    synthesis = `GTEx median expression is concentrated in ${top.name} (${top.tpm} TPM), with little expression elsewhere (tau ${tau.toFixed(2)}). A narrow expression footprint is generally associated with a lower risk of on-target effects in untargeted tissues.`;
  } else if (specificity === "group_enriched") {
    riskLevel = "moderate";
    synthesis = `GTEx median expression is highest in ${top.name} (${top.tpm} TPM), with substantial baseline in ${second?.name || "other tissues"} (${second?.tpm ?? "n/a"} TPM) and tau ${tau.toFixed(2)} — a moderately selective footprint.`;
  } else {
    riskLevel = "higher";
    synthesis = `GTEx median expression is spread broadly across tissues (highest in ${top.name} at ${top.tpm} TPM, tau ${tau.toFixed(2)}). Broad expression is generally associated with a higher risk of on-target effects outside the intended tissue.`;
  }

  const profile = {
    symbol: data?.target?.approvedSymbol || sym,
    ensemblId,
    available: true,
    reason: "",
    source: {
      name: "GTEx bulk RNA-seq via Open Targets Platform",
      unit: "median TPM",
      tissueCount: tissues.length,
    },
    tau: Math.round(tau * 1000) / 1000,
    specificity,
    specificityBadge,
    primaryTissue: top.name,
    primaryTpm: top.tpm,
    riskLevel,
    synthesis,
    tissues: shown,
    maxTpm,
  };
  cacheSet(ensemblId, profile);
  return profile;
}
