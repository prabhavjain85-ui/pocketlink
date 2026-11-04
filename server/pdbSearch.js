import { PDB_ID_RE } from "./targetContext.js";
import { fetchAndScoreTargets } from "./targetSelectionScore.js";

export const NO_EXPERIMENTAL_STRUCTURE_MSG =
  "No experimental structure currently available — this target may require AlphaFold-predicted structure support in a future update";

export const EXPERIMENTAL_QUALITY_THRESHOLD = 45;

export const GENE_TO_UNIPROT = {
  EGFR: "P00533",
  ABL1: "P00519",
  BRAF: "P15056",
  KRAS: "P01116",
  NRAS: "P01111",
  HRAS: "P01112",
  TP53: "P04637",
  ERBB2: "P04626",
  PIK3CA: "P42336",
  AKT1: "P31749",
  MTOR: "P42345",
  JAK2: "O60674",
  BTK: "Q06187",
  BCL2: "P10415",
  CDK4: "P11802",
  CDK6: "Q00534",
  HDAC1: "Q13547",
  PARP1: "P09874",
  PDE5A: "O76074",
  HMGCR: "P04035",
  PTGS2: "P35354",
  DPP4: "P27487",
  SLC5A2: "P31639",
  ACE2: "Q9BYF1",
  ADRB2: "P07550",
  DRD2: "P14416",
  ESR1: "P03372",
  AR: "P10275",
  VHL: "P40337",
  BRCA1: "P38398",
  BRCA2: "P51587",
  PALB2: "Q86YC2",
  SMAD4: "Q13485",
  PTEN: "P60484",
  CFTR: "P13569",
  GBA1: "P04062",
  PCSK9: "Q8NBP7",
  BACE1: "P56817",
  APP: "P05067",
  MAPT: "P10636",
  SNCA: "P37840",
  LRRK2: "Q5S007",
  SOD1: "P00441",
  TARDBP: "Q13148",
  NRG1: "Q02297",
  SH2B3: "Q9UQQ2",
  ALK: "Q9UM73",
  MET: "P08581",
  RET: "P07949",
  FGFR1: "P11362",
  FGFR2: "P21802",
  FGFR3: "P22607",
  KDR: "P35968",
  FLT3: "P36888",
  KIT: "P10721",
  IDH1: "O75874",
  IDH2: "P48735",
  EZH2: "Q15910",
};

const UNIPROT_ACC_RE =
  /^(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})$/i;
const AF_ENTRY_RE = /^AF-([A-Z0-9]+)-F\d+/i;

export function classifyPlddtTier(score) {
  const s = Number(score) || 0;
  if (s >= 90) {
    return {
      tier: "very_high",
      label: "Very High (pLDDT ≥ 90)",
      badge: "Very High Confidence (pLDDT ≥ 90)",
      shortLabel: "Very High",
      color: "#0053D6",
      disordered: false,
    };
  }
  if (s >= 70) {
    return {
      tier: "confident",
      label: "Confident (70 ≤ pLDDT < 90)",
      badge: "Confident (70 ≤ pLDDT < 90)",
      shortLabel: "Confident",
      color: "#65CBF3",
      disordered: false,
    };
  }
  if (s >= 50) {
    return {
      tier: "low",
      label: "Low (50 ≤ pLDDT < 70)",
      badge: "Low Confidence (50 ≤ pLDDT < 70)",
      shortLabel: "Low",
      color: "#FFDB13",
      disordered: false,
    };
  }
  return {
    tier: "very_low",
    label: "Very Low (pLDDT < 50 — likely disordered)",
    badge: "Very Low Confidence (pLDDT < 50 — likely disordered)",
    shortLabel: "Very Low",
    color: "#FF7D45",
    disordered: true,
  };
}

export function resolveUniProtAccession(query, options = {}) {
  if (options?.uniprotId && UNIPROT_ACC_RE.test(String(options.uniprotId).trim())) {
    return String(options.uniprotId).trim().toUpperCase();
  }
  const q = String(query || "").trim();
  if (!q) return null;
  const afMatch = q.match(AF_ENTRY_RE);
  if (afMatch) return afMatch[1].toUpperCase();
  const upper = q.toUpperCase();
  if (GENE_TO_UNIPROT[upper]) return GENE_TO_UNIPROT[upper];
  if (UNIPROT_ACC_RE.test(upper)) return upper;
  return null;
}

/**
 * Query AlphaFold DB (`https://alphafold.ebi.ac.uk/api/prediction/{uniprotId}`)
 * and build a scored target structure record with 4-tier pLDDT confidence metadata.
 */
export async function fetchAlphaFoldFallback(query, options = {}) {
  let uniprotId = resolveUniProtAccession(query, options);
  const cleanQuery = String(query || "").trim();

  if (!uniprotId && /^[A-Z0-9-]{2,12}$/i.test(cleanQuery) && !PDB_ID_RE.test(cleanQuery)) {
    try {
      const uniRes = await fetch(
        `https://rest.uniprot.org/uniprotkb/search?query=gene_exact:${encodeURIComponent(
          cleanQuery
        )}+AND+organism_id:9606+AND+reviewed:true&fields=accession,gene_names,protein_name&format=json&size=1`
      );
      if (uniRes && uniRes.ok && uniRes.status !== 204) {
        let parsed = null;
        if (typeof uniRes.text === "function") {
          const text = await uniRes.text();
          if (text && text.trim()) parsed = JSON.parse(text);
        } else if (typeof uniRes.json === "function") {
          parsed = await uniRes.json();
        }
        const primary = parsed?.results?.[0]?.primaryAccession;
        if (primary && UNIPROT_ACC_RE.test(primary)) {
          uniprotId = primary.toUpperCase();
        }
      }
    } catch {
      /* ignore UniProt lookup failure */
    }
  }

  if (!uniprotId) return null;

  try {
    const res = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`);
    if (!res || !res.ok || res.status === 204) return null;
    let data = null;
    if (typeof res.text === "function") {
      const text = await res.text();
      if (!text || !text.trim()) return null;
      data = JSON.parse(text);
    } else if (typeof res.json === "function") {
      data = await res.json();
    }
    if (!data) return null;
    const pred = Array.isArray(data) ? data[0] : data?.entryId ? data : null;
    if (!pred || !pred.entryId) return null;

    const meanPlddt = Number(pred.globalMetricValue ?? pred.pLDDT ?? 0);
    const fractionVeryHigh = Number(pred.fractionPlddtVeryHigh ?? pred.pLddtVeryHigh ?? 0);
    const fractionConfident = Number(pred.fractionPlddtConfident ?? pred.pLddtConfident ?? 0);
    const fractionLow = Number(pred.fractionPlddtLow ?? pred.pLddtLow ?? 0);
    const fractionVeryLow = Number(pred.fractionPlddtVeryLow ?? pred.pLddtVeryLow ?? 0);

    const orderedFraction = fractionVeryHigh + fractionConfident;
    const bindingRegionPlddt =
      orderedFraction > 0.05
        ? (fractionVeryHigh * 94 + fractionConfident * 80) / orderedFraction
        : meanPlddt;

    const tierInfo = classifyPlddtTier(meanPlddt);
    const disorderWarning =
      fractionVeryLow >= 0.3 || meanPlddt < 60
        ? `High predicted disorder (${Math.round(fractionVeryLow * 100)}% of residues have pLDDT < 50) — inspect local pocket confidence before docking.`
        : null;

    const score = Math.round(
      Math.max(25, Math.min(78, meanPlddt * 0.72 + (orderedFraction >= 0.7 ? 6 : 0)))
    );

    const geneSymbol = pred.gene || cleanQuery.toUpperCase();
    const desc = pred.uniprotDescription || `${geneSymbol} protein`;

    const reasons = [
      `AlphaFold DB model staged (${pred.entryId}) — ${tierInfo.label}`,
      `Mean pLDDT ${meanPlddt.toFixed(1)} · Ordered core pLDDT ${bindingRegionPlddt.toFixed(1)}`,
      disorderWarning || "Predicted apo structure (no experimental co-crystallized ligand)",
    ];

    return {
      id: pred.entryId,
      isAlphaFold: true,
      source: "AlphaFold DB",
      uniprotId,
      queryName: geneSymbol,
      title: `${desc} (AlphaFold DB ${pred.entryId})`,
      date: pred.modelCreatedDate ? String(pred.modelCreatedDate).slice(0, 4) : "AFDB",
      method: "ALPHAFOLD PREDICTION",
      methodKind: "alphafold",
      methodLabel: "AlphaFold DB",
      resolution: `pLDDT ${meanPlddt.toFixed(1)}`,
      resolutionValue: null,
      rFree: null,
      rFreeLabel: "N/A",
      rFreeQuality: null,
      completeness: 100,
      completenessLabel: "100%",
      hasLigand: false,
      ligandLabel: "❌",
      pocket: bindingRegionPlddt >= 70 ? "unclear" : "none",
      pocketLabel: bindingRegionPlddt >= 70 ? `pLDDT ${Math.round(bindingRegionPlddt)}` : "Low pLDDT",
      pocketStats: {
        status: bindingRegionPlddt >= 70 ? "unclear" : "none",
        available: false,
        residueCount: null,
        hydrophobicity: null,
        sizeLabel: null,
        hydrophobicityLabel: null,
      },
      pocketClass: bindingRegionPlddt >= 70 ? "Orthosteric / Catalytic" : "Shallow / PPI Surface",
      druggabilityTier:
        bindingRegionPlddt >= 85
          ? "High Druggability"
          : bindingRegionPlddt >= 70
            ? "Moderate Druggability"
            : "Low / Challenging",
      conformationTag: "Predicted Apo / AlphaFold",
      pocketCenter: [0, 0, 0],
      hasMissingPocketResidues: fractionVeryLow >= 0.35,
      breakdown: {
        resolution: Math.round((meanPlddt / 100) * 20),
        completeness: 25,
        ligand: 0,
        pocket: bindingRegionPlddt >= 70 ? 7 : 0,
        method: 10,
      },
      score,
      targetSelectionScore: score,
      ligands: [],
      meanPlddt: Number(meanPlddt.toFixed(1)),
      plddtTier: tierInfo,
      disorderWarning,
      plddt: {
        mean: Number(meanPlddt.toFixed(1)),
        bindingRegion: Number(bindingRegionPlddt.toFixed(1)),
        tier: tierInfo.tier,
        label: tierInfo.label,
        badge: tierInfo.badge,
        shortLabel: tierInfo.shortLabel,
        color: tierInfo.color,
        fractionVeryHigh: Number(fractionVeryHigh.toFixed(3)),
        fractionConfident: Number(fractionConfident.toFixed(3)),
        fractionLow: Number(fractionLow.toFixed(3)),
        fractionVeryLow: Number(fractionVeryLow.toFixed(3)),
        disorderWarning,
      },
      alphaFoldUrls: {
        cifUrl: pred.cifUrl || `https://alphafold.ebi.ac.uk/files/${pred.entryId}-model_v4.cif`,
        bcifUrl: pred.bcifUrl || `https://alphafold.ebi.ac.uk/files/${pred.entryId}-model_v4.bcif`,
        pdbUrl: pred.pdbUrl || `https://alphafold.ebi.ac.uk/files/${pred.entryId}-model_v4.pdb`,
      },
      reasons,
    };
  } catch {
    return null;
  }
}

export function noPdbMatchMessage(query, { noStructureHint } = {}) {
  if (noStructureHint) return NO_EXPERIMENTAL_STRUCTURE_MSG;
  return `No PDB entries matched "${query}". Try a protein name, gene, or a 4-character PDB ID.`;
}

async function parseRcsbSearchResponse(res) {
  // RCSB returns 204 No Content (empty body) when the query has zero hits.
  if (res.status === 204) return { result_set: [] };
  if (!res.ok) throw new Error("search failed");
  const text = await res.text();
  if (!text.trim()) return { result_set: [] };
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("search failed");
  }
}

/**
 * Search RCSB for a protein name / gene / PDB ID and return scored structures.
 * Automatically falls back to AlphaFold DB when no experimental RCSB structure
 * is found or when all experimental structures fall below the quality threshold.
 */
export async function searchPdbTargets(query, options = {}) {
  const q = String(query || "").trim();
  if (!q) return { results: [], error: "" };
  const emptyError = noPdbMatchMessage(q, options);

  if (AF_ENTRY_RE.test(q)) {
    const af = await fetchAlphaFoldFallback(q, options);
    if (af) return { results: [af], error: "", alphaFoldFallbackUsed: true };
  }

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
    const data = await parseRcsbSearchResponse(res);
    ids = (data.result_set || []).map((r) => r.identifier);
  }
  if (!ids.length) {
    if (options.allowAlphaFoldFallback !== false) {
      const af = await fetchAlphaFoldFallback(q, options);
      if (af) {
        return { results: [af], error: "", alphaFoldFallbackUsed: true };
      }
    }
    return {
      results: [],
      error: emptyError,
    };
  }

  let scored = await fetchAndScoreTargets(ids);
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
      const data = await parseRcsbSearchResponse(res);
      const searchIds = (data.result_set || []).map((r) => r.identifier);
      if (searchIds.length) scored = await fetchAndScoreTargets(searchIds);
    }
  }
  if (!scored.length) {
    if (options.allowAlphaFoldFallback !== false) {
      const af = await fetchAlphaFoldFallback(q, options);
      if (af) {
        return { results: [af], error: "", alphaFoldFallbackUsed: true };
      }
    }
    return {
      results: [],
      error: emptyError,
    };
  }

  const bestExperimentalScore = Math.max(...scored.map((s) => Number(s.score) || 0));
  if (
    bestExperimentalScore < EXPERIMENTAL_QUALITY_THRESHOLD &&
    options.allowAlphaFoldFallback !== false &&
    !looksLikeId
  ) {
    const af = await fetchAlphaFoldFallback(q, options);
    if (af) {
      return {
        results: [af, ...scored],
        error: "",
        alphaFoldFallbackUsed: true,
      };
    }
  }

  return { results: scored, error: "", alphaFoldFallbackUsed: false };
}

export { PDB_ID_RE };
