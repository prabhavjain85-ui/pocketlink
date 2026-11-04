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

  // Target discovery
  searchDiseases: lazy(() => import("./openTargets.js"), "searchDiseases"),
  runTargetDiscovery: lazy(() => import("./openTargets.js"), "runTargetDiscovery"),
  getTargetExpressionProfile: lazy(() => import("./geneExpression.js"), "getTargetExpressionProfile"),

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
    const value = await requestContext.run({ emit }, () => OPS[op](...decoded));
    emit({ t: "result", value: value === undefined ? null : value });
  } catch (err) {
    console.error(`[compute] ${op} failed:`, err?.stack || err);
    emit({ t: "error", error: serializeError(err) });
  }
}
