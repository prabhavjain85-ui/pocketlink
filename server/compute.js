/**
 * Server-side computation entry point used by api/compute.js.
 *
 * OPS is the complete allow-list of functions the browser may call. Each entry
 * lazily imports its module so a cold start only loads what the request needs.
 */
import "./runtime.js";
import { requestContext } from "./requestContext.js";

const lazy = (load, name) => async (...args) => (await load())[name](...args);

const MAX_EVOLUTION_WORK = 1600;

function prettyCompoundName(result, query) {
  const q = String(query || "").trim();
  if (q && q.length <= 48 && !q.includes(",") && q.split(" ").length <= 6) return q;
  if (result?.IUPACName) {
    return result.IUPACName.length > 52 ? `${result.IUPACName.slice(0, 50)}…` : result.IUPACName;
  }
  return result?.CID ? `CID ${result.CID}` : "Unknown compound";
}

function sanitizeTargetRowDto(row) {
  if (!row || typeof row !== "object") return row;
  const {
    breakdown: _breakdown,
    unobservedResidues: _unobservedResidues,
    ...rest
  } = row;
  return rest;
}

function sanitizeDiscoveryRowDto(row) {
  if (!row || typeof row !== "object") return row;
  const {
    noveltyComponents: _noveltyComponents,
    datasourceScores: _datasourceScores,
    biologySignal: _biologySignal,
    essentiality: _essentiality,
    ...rest
  } = row;
  return rest;
}

function sanitizeRankingRowDto(row) {
  if (!row || typeof row !== "object") return row;
  const {
    targetBonus: _targetBonus,
    ligandBonus: _ligandBonus,
    druglikePts: _druglikePts,
    alertPenalty: _alertPenalty,
    moaPenalty: _moaPenalty,
    checks: _checks,
    ...rest
  } = row;
  return rest;
}

export function sanitizeComputeResult(op, value) {
  if (!value || typeof value !== "object") return value;
  if (op === "searchPdbTargets" && Array.isArray(value.results)) {
    return {
      ...value,
      results: value.results.map(sanitizeTargetRowDto),
    };
  }
  if (op === "runTargetDiscovery") {
    return {
      ...value,
      all: Array.isArray(value.all) ? value.all.map(sanitizeDiscoveryRowDto) : [],
      novelty: Array.isArray(value.novelty) ? value.novelty.map(sanitizeDiscoveryRowDto) : [],
      established: Array.isArray(value.established)
        ? value.established.map(sanitizeDiscoveryRowDto)
        : [],
    };
  }
  if (op === "rankCandidates" || op === "screenApprovedLibrary") {
    return {
      ...value,
      source: value.source === "heuristic-v2" ? "target-triage" : value.source,
      ranking: Array.isArray(value.ranking) ? value.ranking.map(sanitizeRankingRowDto) : [],
    };
  }
  return value;
}

const OPS = Object.assign(Object.create(null), {
  // Staging bench
  searchPdbTargets: lazy(() => import("./pdbSearch.js"), "searchPdbTargets"),
  checkPainsBatch: lazy(() => import("./painsCheck.js"), "checkPainsBatch"),
  async rankCandidates(candidates, protein, painsByCid) {
    const { rankCandidates } = await import("./aiCandidateRanking.js");
    const { annotateStructuralSimilarity } = await import("./structuralSimilarity.js");
    // Compare the shortlist to the staged structure's co-crystal ligand before
    // scoring, so unnamed compounds still get a target-specific signal.
    await annotateStructuralSimilarity(candidates, protein);
    return rankCandidates(candidates, protein, painsByCid);
  },

  async searchPubchemCompound(query) {
    const q = String(query || "").trim();
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
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
      q
    )}/property/${props}/JSON`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `PubChem has no compound named "${q}". Try the common or generic drug name (e.g. "ibuprofen", "imatinib").`
      );
    }
    const data = await res.json();
    const p = data?.PropertyTable?.Properties?.[0];
    if (!p) {
      throw new Error(`PubChem returned no usable data for "${q}".`);
    }
    const { drugLikenessChecks } = await import("./scoreCandidates.js");
    const checks = drugLikenessChecks(p);
    let structureSvg = null;
    const smi = p.IsomericSMILES || p.CanonicalSMILES || p.SMILES || "";
    if (smi) {
      try {
        const { getRDKit } = await import("./rdkitLoader.js");
        const { molSvg } = await import("./evolutionTransforms.js");
        const RDKit = await getRDKit();
        if (RDKit) structureSvg = molSvg(RDKit, smi, 220, 160);
      } catch {
        /* optional SVG pre-render */
      }
    }
    return {
      ...p,
      displayName: prettyCompoundName(p, q),
      previewChecks: checks,
      previewPass: checks.filter((c) => c.pass).length,
      structureSvg,
    };
  },

  async fetchPubchemPngDataUrl(cid) {
    const id = String(cid ?? "").trim();
    if (!/^\d+$/.test(id)) return null;
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${encodeURIComponent(
      id
    )}/PNG`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    return `data:image/png;base64,${buf.toString("base64")}`;
  },

  async fetchStructureCoordinates(structureId) {
    const id = String(structureId || "").trim().toUpperCase();
    if (!id) throw new Error("Missing structure ID.");
    const isAf = /^AF-[A-Z0-9]+-F\d+/i.test(id);
    const urls = isAf
      ? [
          { url: `https://alphafold.ebi.ac.uk/files/${id}-model_v4.bcif`, isBinary: true },
          { url: `https://alphafold.ebi.ac.uk/files/${id}-model_v4.cif`, isBinary: false },
        ]
      : [{ url: `https://models.rcsb.org/${id}.bcif`, isBinary: true }];

    let lastStatus = 0;
    for (const candidate of urls) {
      let res;
      try {
        res = await fetch(candidate.url);
      } catch {
        continue;
      }
      lastStatus = res.status;
      if (!res.ok) continue;
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("text/html")) {
        throw new Error(`Structure host returned an HTML page instead of coordinate data for ${id}.`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf || buf.byteLength < 64) {
        continue;
      }
      return {
        id,
        base64: buf.toString("base64"),
        format: "mmcif",
        isBinary: candidate.isBinary,
      };
    }
    throw new Error(
      `Structure download failed for ${id}${lastStatus ? ` (HTTP ${lastStatus})` : ""}.`
    );
  },

  async getEvolutionSeedPicks() {
    const { ensureApprovedDrugsLoaded, loadApprovedDrugs } = await import("./approvedDrugs.js");
    await ensureApprovedDrugsLoaded();
    return loadApprovedDrugs()
      .filter((d) => /imatinib|dasatinib|nilotinib|gefitinib|erlotinib/i.test(d.name))
      .map((d) => ({ smiles: d.smiles, name: d.name, source: "Approved library" }));
  },

  // Target discovery
  searchDiseases: lazy(() => import("./openTargets.js"), "searchDiseases"),
  runTargetDiscovery: lazy(() => import("./openTargets.js"), "runTargetDiscovery"),
  getTargetExpressionProfile: lazy(() => import("./geneExpression.js"), "getTargetExpressionProfile"),
  // Clinical history for one target, fetched lazily when a row is expanded.
  fetchTargetClinicalActivity: lazy(() => import("./clinicalActivity.js"), "fetchTargetClinicalActivity"),

  // Compound libraries
  listCompoundLibraries: lazy(() => import("./compoundLibraries.js"), "listCompoundLibraries"),

  // Repurposing / library screening. The staging bench and the repurposing
  // page share this op; they differ only in which library they pass.
  screenApprovedLibrary: lazy(() => import("./repurposingScreen.js"), "screenApprovedLibrary"),
  async getDrugSafetyProfiles(drugs) {
    const { getDrugSafetyProfile } = await import("./safetyProfiles.js");
    return (Array.isArray(drugs) ? drugs.slice(0, 200) : []).map((d) => getDrugSafetyProfile(d));
  },
  getTrialSuccessContext: lazy(() => import("./trialSuccessContext.js"), "getTrialSuccessContext"),

  // ADME
  calculateAdmeProperties: lazy(() => import("./admeCalculator.js"), "calculateAdmeProperties"),

  // Evolution
  async runEvolutionCampaign(params = {}) {
    const { runEvolutionCampaign, clampSettings } = await import("./evolutionEngine.js");
    const cfg = clampSettings(params.settings || {});
    // Work scales with generations × variants × runs. The default (5 × 20 × 5 = 500)
    // takes ~70 s on one core; keep requests well inside the 300 s function limit.
    const work = cfg.generations * cfg.variantsPerGeneration * cfg.independentRuns;
    if (work > MAX_EVOLUTION_WORK) {
      return {
        ok: false,
        error: `This campaign is too large to run on the server in one go (${cfg.generations} generations × ${cfg.variantsPerGeneration} variants × ${cfg.independentRuns} runs). Reduce generations, variants per generation, or independent runs so their product is at most ${MAX_EVOLUTION_WORK}.`,
      };
    }
    return runEvolutionCampaign({ ...params, settings: cfg });
  },
  probeSaScoreSupport: lazy(() => import("./evolution/saScorer.js"), "probeSaScoreSupport"),
  async probeReactionSupport() {
    const { getRDKit } = await import("./rdkitLoader.js");
    const { detectReactionSupport } = await import("./evolutionTransforms.js");
    const RDKit = await getRDKit();
    return detectReactionSupport(RDKit);
  },
  async renderMolSvg(smiles, width = 220, height = 160) {
    const { getRDKit } = await import("./rdkitLoader.js");
    const { molSvg } = await import("./evolutionTransforms.js");
    const RDKit = await getRDKit();
    return molSvg(RDKit, smiles, width, height);
  },
  async renderMolSvgs(smilesList, width = 220, height = 160) {
    const { getRDKit } = await import("./rdkitLoader.js");
    const { molSvg } = await import("./evolutionTransforms.js");
    const RDKit = await getRDKit();
    const out = {};
    if (!RDKit) return out;
    const list = Array.isArray(smilesList) ? smilesList.slice(0, 64) : [];
    for (const smi of list) {
      const key = String(smi || "").trim();
      if (!key || out[key] !== undefined) continue;
      out[key] = molSvg(RDKit, key, width, height);
    }
    return out;
  },
  async noveltyForSmiles(smiles) {
    const { ensureApprovedDrugsLoaded } = await import("./approvedDrugs.js");
    const { lookupPubChemExact, noveltyBadge } = await import("./evolutionScore.js");
    await ensureApprovedDrugsLoaded();
    const pubchem = await lookupPubChemExact(smiles);
    return noveltyBadge({ smiles, pubchem });
  },

  // Docking & co-crystal analysis
  fetchPdbFromRcsb: lazy(() => import("./dockingEngine.js"), "fetchPdbFromRcsb"),
  runMolecularDocking: lazy(() => import("./dockingEngine.js"), "runMolecularDocking"),
  fetchDockingRunCocrystalContext: lazy(() => import("./dockingRunCocrystal.js"), "fetchDockingRunCocrystalContext"),
  analyzeExperimentalCocrystal: lazy(() => import("./cocrystalAnalysis.js"), "analyzeExperimentalCocrystal"),
  resolveCocrystalSearchQuery: lazy(() => import("./rcsbCocrystalSearch.js"), "resolveCocrystalSearchQuery"),
  searchPdbEntriesForChemComp: lazy(() => import("./rcsbCocrystalSearch.js"), "searchPdbEntriesForChemComp"),

  // Hypothesis testing
  parseHypothesisApi: lazy(() => import("./hypothesis/hypothesisService.js"), "parseHypothesisApi"),
  evaluateHypothesisApi: lazy(() => import("./hypothesis/hypothesisService.js"), "evaluateHypothesisApi"),
});

export function hasOp(op) {
  return typeof op === "string" && Object.prototype.hasOwnProperty.call(OPS, op);
}

/** Rebuild callback / signal markers produced by src/serverApi.js. */
function decodeArgs(args, emit, signal) {
  const decodeValue = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (Number.isInteger(value.__cb) && Object.keys(value).length === 1) {
        const id = value.__cb;
        return (...cbArgs) => emit({ t: "cb", id, args: cbArgs });
      }
      if (value.__signal === true && Object.keys(value).length === 1) return signal;
    }
    return value;
  };
  return (Array.isArray(args) ? args : []).map((arg) => {
    if (arg && typeof arg === "object" && !Array.isArray(arg)) {
      const direct = decodeValue(arg);
      if (direct !== arg) return direct;
      const out = {};
      for (const [k, v] of Object.entries(arg)) out[k] = decodeValue(v);
      return out;
    }
    return decodeValue(arg);
  });
}

function serializeError(err) {
  return {
    message: String(err?.message || "Server computation failed.").slice(0, 2000),
    name: err?.name && err.name !== "Error" ? String(err.name) : undefined,
    code: err?.code ? String(err.code) : undefined,
    status: Number.isInteger(err?.status) ? err.status : undefined,
  };
}

/**
 * Run one op. `emit` receives every outgoing message ({t:"cb"|"effect"|"result"|"error"}).
 */
export async function runOp(op, args, { emit, signal }) {
  if (!hasOp(op)) {
    emit({ t: "error", error: { message: `Unknown operation: ${String(op).slice(0, 60)}` } });
    return;
  }
  const decoded = decodeArgs(args, emit, signal);
  try {
    const rawValue = await requestContext.run({ emit }, () => OPS[op](...decoded));
    const value = sanitizeComputeResult(op, rawValue);
    emit({ t: "result", value: value === undefined ? null : value });
  } catch (err) {
    console.error(`[compute] ${op} failed:`, err?.stack || err);
    emit({ t: "error", error: serializeError(err) });
  }
}
