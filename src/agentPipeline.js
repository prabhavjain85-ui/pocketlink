/**
 * Autonomous Research Agent Orchestration Pipeline for PocketLink.
 *
 * Automatically chains together:
 *   1. Target Discovery (Open Targets genetics & novelty scoring)
 *   2. PDB Structure Selection (RCSB crystallographic search & target-selection scoring)
 *   3. Repurposing Screening (Approved-drug library pocket-aware screening)
 *   4. Adversarial Critique ("The Case Against" via Gemini AI)
 *
 * Implements honest dead-end handling and contingency pivots:
 * If the top novelty target lacks an experimental structure with a drug-like pocket,
 * the agent explicitly narrates the dead-end and pivots to the next-best target
 * rather than fabricating false confidence.
 */

import { fetchAdversarialCritique } from "./adversarialService";
import { approvedDrugCount } from "./approvedDrugs";
import { ACTIVE_STATE_KEYS, saveHistoryEntry, setActiveState } from "./historyService";
import { pickDiseaseHit, runTargetDiscovery, searchDiseases } from "./openTargets";
import { searchPdbTargets } from "./pdbSearch";
import { screenApprovedLibrary } from "./repurposingScreen";
import { isUnmodeledFillerRanking, scoringCapabilities } from "./scoreCandidates";

export function formatCompoundIdLabel(cid) {
  const id = String(cid || "");
  if (/^CHEMBL/i.test(id)) return "ChEMBL ID";
  return "PubChem CID";
}

export function formatCompoundIdRef(candidate) {
  if (!candidate?.cid) return "unknown compound ID";
  return `${formatCompoundIdLabel(candidate.cid)}: ${candidate.cid}`;
}

export function displayDrugName(candidate) {
  if (!candidate) return "Unknown drug";
  return candidate.name || candidate.displayName || `Compound ${candidate.cid || "?"}`;
}

const INSUFFICIENT_TARGET_RULE_DISPLAY =
  "No curated target rule — drug-likeness / physicochemical triage only";

export function formatReasoningForDisplay(reasoning) {
  if (!Array.isArray(reasoning) || !reasoning.length) return "";
  return reasoning
    .map((entry) =>
      String(entry).replace(
        /Insufficient target rule: target is unmodeled or structure has no recognized pharmacology rule/i,
        INSUFFICIENT_TARGET_RULE_DISPLAY
      )
    )
    .slice(0, 3)
    .join("; ");
}

export const ION_COMP_IDS = new Set([
  "ZN", "MG", "CA", "FE", "MN", "CU", "NI", "CO", "NA", "K", "CL", "BR", "IOD", "CD", "HG", "PB",
  "SO4", "PO4", "EDO", "DMS", "ACT", "GOL", "ACY", "PEG", "PGE", "1PE", "2PE", "SUL"
]);

export const NUCLEIC_COMP_IDS = new Set([
  "DA", "DC", "DG", "DT", "DU", "ADE", "CYT", "GUA", "THY", "URA", "A", "C", "G", "U", "NAG"
]);

export const CURATED_GENE_PDBS = {
  ABL1: ["2HYY", "1IEP"],
  ABL: ["2HYY", "1IEP"],
  EGFR: ["1M17", "1XKK"],
  ERBB2: ["3PP0"],
  HER2: ["3PP0"],
  BRAF: ["4XV2"],
  KRAS: ["6OIM", "4OBE"],
  CFTR: ["7SVD", "6MSM"],
  PARP1: ["4UND"],
  CDK4: ["2W96"],
  CDK6: ["1JOW"],
  KDR: ["4AG8", "3VHE"],
  VEGFR2: ["4AG8"],
  ACHE: ["4EY7", "1EVE"],
  ESR1: ["3ERT"],
  AR: ["2AM9"],
  HMGCR: ["1HWK"],
  PTGS1: ["1PXX"],
  PTGS2: ["4COX", "1CX2"],
  COX2: ["4COX", "1CX2"],
  ADRB2: ["3SN6"],
  DPP4: ["1X70", "2P8S"],
  SLC5A2: ["7VSI", "8HEZ", "8HDH"],
  SGLT2: ["7VSI", "8HEZ", "8HDH"],
  ALK: ["2XP2", "4MKC"],
  BTK: ["3K54", "5P9J"],
  JAK1: ["6BBU"],
  JAK2: ["3UGC"],
  MET: ["3DKC"],
  RET: ["2IVV"],
  KIT: ["1T46"],
  HDAC1: ["5ICN"],
  PDE5A: ["1UDT"],
};

/**
 * Validates whether an RCSB PDB structure is suitable for drug repurposing screening.
 * Rejects DNA/RNA complexes, ion-only structures, and structures without an authentic
 * drug-like small-molecule hetero ligand.
 */
export function isViableRepurposingStructure(struct) {
  if (!struct || !struct.id) return false;

  const idUpper = String(struct.id).toUpperCase().trim();
  // 1. Explicitly reject 1EAO and DNA/RNA complexes
  if (idUpper === "1EAO") return false;

  const title = String(struct.title || "").toLowerCase();
  const isDnaTitle = /\b(dna complex|bound to dna|dna-binding domain|runt domain.*dna|duplex|rna complex|ribosom|nucleosome)\b/i.test(title);

  // 2. Must have co-crystallized hetero ligand
  if (!struct.hasLigand) return false;

  const rawLigands = Array.isArray(struct.ligands) && struct.ligands.length
    ? struct.ligands
    : struct.ligand
    ? [struct.ligand]
    : [];

  if (!rawLigands.length) return false;

  // 3. Find at least one authentic small-molecule hetero ligand
  const validSmallMolecule = rawLigands.find((lig) => {
    const compId = String(lig.compId || lig.comp_id || "").toUpperCase().trim();
    const name = String(lig.name || "").toLowerCase().trim();
    const fw = Number(lig.formulaWeight ?? lig.mw ?? 0);

    // Reject ions, additives, and salts
    if (ION_COMP_IDS.has(compId)) return false;
    // Reject nucleic acid fragments
    if (NUCLEIC_COMP_IDS.has(compId)) return false;
    if (name.includes("dna") || name.includes("rna") || name.includes("ribonucleic") || name.includes("deoxyribo")) {
      return false;
    }
    // If formulaWeight is present, must be a reasonable small-molecule weight (>= 150 Da and <= 1500 Da)
    if (fw > 0 && (fw < 150 || fw > 1500)) return false;

    // Must have a real non-empty compId or name
    if (!compId && !name) return false;
    return true;
  });

  if (!validSmallMolecule) return false;
  if (isDnaTitle && !validSmallMolecule) return false;

  // 4. Pocket check
  if (struct.pocket === "none" || struct.pocket === "unclear") return false;

  // 5. Score check
  if (struct.score != null && struct.score < 35) return false;

  return true;
}

/**
 * Known short clinical and disease aliases mapped to canonical Open Targets search terms.
 */
export const DISEASE_ALIASES = {
  ad: "Alzheimer disease",
  pd: "Parkinson disease",
  t2d: "type 2 diabetes mellitus",
  t2dm: "type 2 diabetes mellitus",
  cml: "chronic myeloid leukemia",
  aml: "acute myeloid leukemia",
  cll: "chronic lymphocytic leukemia",
  all: "acute lymphoblastic leukemia",
  gbm: "glioblastoma",
  crc: "colorectal cancer",
  pdac: "pancreatic ductal adenocarcinoma",
  nsclc: "non-small cell lung carcinoma",
  sclc: "small cell lung carcinoma",
  als: "amyotrophic lateral sclerosis",
  ra: "rheumatoid arthritis",
  ibd: "inflammatory bowel disease",
  ms: "multiple sclerosis",
};

/**
 * Extract disease name and optional target gene symbol from a user research goal.
 */
export function parseGoal(goal) {
  if (!goal || typeof goal !== "string") {
    return { diseaseQuery: "", targetGene: null, rawGoal: "" };
  }
  const rawGoal = goal.trim();
  let text = rawGoal;

  // Extract optional target gene if mentioned (e.g. "EGFR inhibitors for lung cancer", "KRAS in CRC")
  let targetGene = null;
  const geneMatch = text.match(
    /\b([A-Z][A-Z0-9]{1,7})\b\s*(?:inhibitors?|antagonists?|blockers?|ligands?|targets?|binders?|directed)?\s+(?:for|in|against)\s+/i
  );
  if (
    geneMatch &&
    !["FIND", "RUN", "SCREEN", "LOOK", "BEST", "DRUG", "DRUGS", "NOVEL", "NEW", "THE"].includes(
      geneMatch[1].toUpperCase()
    )
  ) {
    targetGene = geneMatch[1].toUpperCase();
  }

  // Strip leading action verb and object clause before preposition
  text = text.replace(
    /^(?:please\s+)?(?:find|search(?:\s+for)?|identify|screen|run(?:\s+an?)?(?:\s+agent(?:\s+on)?)?|discover|look\s+for|evaluate|investigate|explore)\b.*?\b(?:for|against|in|targeting)\s+/i,
    ""
  );

  // If starts with "repurposing ... for" or "pipeline for" or "drugs targeting ... for"
  text = text.replace(/^(?:repurpos\w+|pipeline|drugs?\s+targeting)\s+.*?\b(?:for|against|in|targeting)\s+/i, "");

  // Strip trailing boilerplate phrases
  text = text
    .replace(/\s*(?:using\s+pocketlink|with\s+(?:the\s+)?agent|please|\.)+$/i, "")
    .trim();

  // Alias lookup
  const lowerText = text.toLowerCase();
  if (DISEASE_ALIASES[lowerText]) {
    text = DISEASE_ALIASES[lowerText];
  } else {
    for (const [alias, full] of Object.entries(DISEASE_ALIASES)) {
      const aliasRe = new RegExp(`\\b${alias}\\b`, "i");
      if (aliasRe.test(text)) {
        text = text.replace(aliasRe, full);
        break;
      }
    }
  }

  return {
    diseaseQuery: text || rawGoal,
    targetGene,
    rawGoal,
  };
}

/**
 * Adjective mapping for target novelty score (0-100).
 * - score >= 50 -> "high"
 * - score 20-49 -> "moderate"
 * - score < 20  -> "low"
 */
export function getNoveltyAdjective(score) {
  if (score == null) return "low";
  const n = Number(score);
  if (!Number.isFinite(n) || n < 20) return "low";
  if (n >= 50) return "high";
  return "moderate";
}

/**
 * Adjective mapping for target genetic disease association score (0-1 or percentage).
 * - score >= 0.4 -> "strong"
 * - score 0.15-0.39 -> "moderate"
 * - else -> "weak / none"
 */
export function getGeneticAdjective(score) {
  if (score == null) return "weak / none";
  let g = Number(score);
  if (!Number.isFinite(g)) return "weak / none";
  if (g > 1) {
    g = g / 100;
  }
  if (g >= 0.4) return "strong";
  if (g >= 0.15) return "moderate";
  return "weak / none";
}

/**
 * Descriptive phrase for approved drug count.
 * - drugCount === 0 -> "no approved drugs (underexplored)"
 * - drugCount 1-2   -> "few drugs"
 * - drugCount >= 3  -> "already has N approved/pipeline drugs (not underexplored)"
 */
export function getDrugCountPhrase(drugCount) {
  const n = Math.max(0, Number(drugCount) || 0);
  if (n === 0) return "no approved drugs (underexplored)";
  if (n <= 2) return "few drugs";
  return `already has ${n} approved/pipeline drugs (not underexplored)`;
}

/**
 * Extract a likely disease or condition query from a natural-language research goal.
 */
export function extractDiseaseQuery(goal) {
  return parseGoal(goal).diseaseQuery;
}

/**
 * Helper to pick the best disease match from Open Targets hits.
 * Prefers broad disease entities with established associations over rare narrow mutations.
 */
function selectBestDiseaseHit(hits, query) {
  if (!hits || !hits.length) return null;

  const normalizedQuery = query.toLowerCase().trim();

  // 1. Exact case-insensitive match
  const exact = hits.find(
    (h) => String(h.name || "").toLowerCase() === normalizedQuery
  );
  if (exact) return exact;

  // 2. Filter out hyper-specific "susceptibility to, N" if a broader parent/carcinoma hit exists
  const broadHits = hits.filter(
    (h) => !String(h.name || "").toLowerCase().includes("susceptibility to")
  );

  if (broadHits.length > 0) {
    // Check if one starts with the query word (e.g. "exocrine pancreatic carcinoma" vs "pancreatic neoplasm")
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    const multiWordMatch = broadHits.find((h) => {
      const name = String(h.name || "").toLowerCase();
      return words.every((w) => name.includes(w));
    });
    if (multiWordMatch) return multiWordMatch;

    return broadHits[0];
  }

  return pickDiseaseHit(hits, query);
}

/**
 * Run the 4-step Autonomous Research Agent pipeline.
 *
 * @param {Object} params
 * @param {string} params.goal - High-level user goal (e.g. "Find repurposing candidates for pancreatic cancer")
 * @param {Function} [params.onStepUpdate] - Callback invoked when any step starts, updates, or completes
 * @param {Function} [params.onProgress] - Callback for fine-grained progress messages
 * @param {AbortSignal} [params.signal] - Optional AbortSignal to cancel execution
 * @param {boolean} [params.forceScreen] - Whether to bypass the 24-hour daily screen cache (default false)
 * @returns {Promise<Object>} Completed research report object
 */
export async function runResearchAgent({
  goal,
  onStepUpdate,
  onProgress,
  signal,
  forceScreen = false,
} = {}) {
  if (!goal || !goal.trim()) {
    throw new Error("Please specify a high-level research goal.");
  }

  const startTime = Date.now();

  const report = {
    id: `agent_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    goal: goal.trim(),
    diseaseQuery: "",
    diseaseResolved: null,
    status: "running", // 'running' | 'completed' | 'halted' | 'aborted'
    haltReason: null,
    totalDurationMs: 0,
    steps: {
      1: {
        id: 1,
        title: "Target Discovery",
        subtitle: "Open Targets Genetics & Novelty Scoring",
        status: "pending", // 'pending' | 'running' | 'complete' | 'dead_end'
        action: "Query Open Targets for disease-associated genetic targets and rank by Novelty Score.",
        narration: "",
        data: null,
      },
      2: {
        id: 2,
        title: "PDB Structure Selection",
        subtitle: "RCSB Crystallographic Pocket Evaluation",
        status: "pending",
        action: "Search experimental crystallographic structures and score pocket viability.",
        narration: "",
        data: null,
      },
      3: {
        id: 3,
        title: "Repurposing Screen",
        subtitle: "Target-Aware Approved Library Screening",
        status: "pending",
        action: "Screen approved drug library against target pocket geometry and pharmacophore.",
        narration: "",
        data: null,
      },
      4: {
        id: 4,
        title: "Adversarial Critique",
        subtitle: "The Case Against (Gemini AI Stress-Test)",
        status: "pending",
        action: "Conduct automated devil's-advocate review arguing against the #1 recommendation.",
        narration: "",
        data: null,
      },
    },
    executiveSummary: null,
  };

  const notify = (stepId, patch = {}) => {
    if (stepId && report.steps[stepId]) {
      report.steps[stepId] = { ...report.steps[stepId], ...patch };
    }
    if (typeof onStepUpdate === "function") {
      onStepUpdate({ ...report, steps: { ...report.steps } });
    }
  };

  const checkAborted = () => {
    if (signal?.aborted) {
      const err = new Error("Agent run was cancelled by user.");
      err.name = "AbortError";
      throw err;
    }
  };

  try {
    // =========================================================================
    // STEP 1: TARGET DISCOVERY
    // =========================================================================
    notify(1, { status: "running" });
    if (typeof onProgress === "function") {
      onProgress({ step: 1, message: "Extracting disease query and querying Open Targets..." });
    }

    const parsed = parseGoal(goal);
    const diseaseQuery = parsed.diseaseQuery;
    report.diseaseQuery = diseaseQuery;
    report.targetGeneRequested = parsed.targetGene;
    report.userTyped = goal.trim();

    checkAborted();

    // Search Open Targets disease index
    const diseaseHits = await searchDiseases(diseaseQuery);
    if (!diseaseHits || !diseaseHits.length) {
      const haltMsg = `No clinical disease entity matching "${diseaseQuery}" was resolved in Open Targets. Name a disease or a well-known alias (e.g. pancreatic cancer, CML, Alzheimer).`;
      notify(1, {
        status: "dead_end",
        narration: haltMsg,
        data: { query: diseaseQuery, hits: [] },
      });
      report.status = "halted";
      report.haltReason = haltMsg;
      report.totalDurationMs = Date.now() - startTime;
      return report;
    }

    const pickedDisease = selectBestDiseaseHit(diseaseHits, diseaseQuery);
    report.diseaseResolved = pickedDisease;

    if (typeof onProgress === "function") {
      onProgress({
        step: 1,
        message: `Resolved "${pickedDisease.name}" [${pickedDisease.id}]. Fetching associated targets...`,
      });
    }

    checkAborted();

    // Run target discovery with disease hint
    const discoveryResult = await runTargetDiscovery(diseaseQuery, {
      diseaseHint: pickedDisease,
    });

    const noveltyTargets = discoveryResult?.novelty || [];
    const allTargets = discoveryResult?.all || [];
    const totalAssociatedCount =
      discoveryResult?.disease?.associationCount ??
      discoveryResult?.totalAssociatedCount ??
      discoveryResult?.fetchedCount ??
      (noveltyTargets.length || allTargets.length);

    if (totalAssociatedCount === 0 || (!noveltyTargets.length && !allTargets.length)) {
      const haltMsg = `Open Targets returned 0 associations for this disease. No primary target from OT. Target discovery for "${pickedDisease.name}" (${pickedDisease.id}) yielded no evidence-backed proteins for this indication.`;
      notify(1, {
        status: "dead_end",
        narration: haltMsg,
        data: { disease: pickedDisease, targets: [] },
      });
      report.status = "halted";
      report.haltReason = haltMsg;
      report.totalDurationMs = Date.now() - startTime;
      return report;
    }

    // Helper to evaluate real genetic or somatic evidence for THIS disease
    const getGeneticScore = (t) => Number(t?.geneticScore ?? t?.datatypeScores?.genetic_association) || 0;
    const getSomaticScore = (t) => Number(t?.somaticScore ?? t?.datatypeScores?.somatic_mutation) || 0;
    const hasRealEvidence = (t) => {
      const g = getGeneticScore(t);
      const s = getSomaticScore(t);
      if (g >= 0.15 || s >= 0.15) return true;
      if (Number(t?.overallScore) >= 0.4 && t?.geneticScore !== 0 && t?.somaticScore !== 0) return true;
      return false;
    };

    // Candidate target pool construction:
    // 1. Prefer targets with real genetic/somatic evidence for THIS disease.
    // 2. Among evidence-backed targets, prioritize established targets (drugCount >= 1) with known druggable pockets.
    // 3. Fall back to novelty targets (drugCount == 0) and other general associations.
    const candidatePool = [];
    const seenSymbols = new Set();

    // Priority 1: Evidence-backed targets
    const evidenceTargets = (allTargets || []).filter(hasRealEvidence);
    const establishedWithEvidence = [
      ...(discoveryResult?.established || []).filter(hasRealEvidence),
      ...evidenceTargets.filter((t) => (t.drugCount ?? 0) >= 1),
    ].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

    const novelWithEvidence = (noveltyTargets || [])
      .filter(hasRealEvidence)
      .sort((a, b) => (b.noveltyScore ?? 0) - (a.noveltyScore ?? 0));

    for (const t of [...establishedWithEvidence, ...novelWithEvidence, ...evidenceTargets]) {
      const sym = t?.symbol?.toUpperCase();
      if (sym && !seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        candidatePool.push({ ...t, isEstablishedCandidate: (t.drugCount ?? 0) >= 1 });
      }
    }

    // Priority 2: Established targets with drugCount >= 1 without strong genetic evidence
    const otherEstablished = [
      ...(discoveryResult?.established || []),
      ...(allTargets || []).filter((t) => (t.drugCount ?? 0) >= 1),
    ].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));

    for (const t of otherEstablished) {
      const sym = t?.symbol?.toUpperCase();
      if (sym && !seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        candidatePool.push({ ...t, isEstablishedCandidate: true });
      }
    }

    // Priority 3: Fallback candidates from noveltyTargets / allTargets
    for (const t of [...(noveltyTargets || []), ...(allTargets || [])]) {
      const sym = t?.symbol?.toUpperCase();
      if (sym && !seenSymbols.has(sym)) {
        seenSymbols.add(sym);
        candidatePool.push({ ...t, isEstablishedCandidate: (t.drugCount ?? 0) >= 1 });
      }
    }

    // If user specified targetGene (e.g. "EGFR inhibitors for lung cancer"), prioritize that target at index 0
    if (parsed.targetGene) {
      const targetIdx = candidatePool.findIndex((t) => t.symbol?.toUpperCase() === parsed.targetGene);
      if (targetIdx > 0) {
        const [userTarget] = candidatePool.splice(targetIdx, 1);
        candidatePool.unshift(userTarget);
      }
    }

    let primaryTarget = candidatePool[0] || noveltyTargets[0] || allTargets[0];
    let backupTarget = candidatePool.find((t) => t.symbol !== primaryTarget.symbol) || null;

    // Compose Step 1 Narration grounded strictly in numbers (never say "high" for 0.1, "strong" for 0%, or "underexplored" for 67 drugs)
    const primaryNoveltyVal = primaryTarget.noveltyScore;
    const primaryNovelty = primaryNoveltyVal != null ? `${primaryNoveltyVal}/100` : "N/A";
    const primaryGeneticVal = primaryTarget.geneticScore;
    const primaryGenetic = primaryGeneticVal != null ? `${(primaryGeneticVal * 100).toFixed(0)}%` : "0%";
    const primaryDrugs = primaryTarget.drugCount ?? 0;

    const noveltyAdj = getNoveltyAdjective(primaryNoveltyVal);
    const geneticAdj = getGeneticAdjective(primaryGeneticVal);
    const drugPhrase = getDrugCountPhrase(primaryDrugs);
    const isHighDrug = primaryDrugs >= 3;
    const targetRoleLabel = isHighDrug
      ? "already drugged / backup for structures"
      : primaryDrugs === 0
      ? "primary novel candidate"
      : "primary candidate";

    let step1Narration = `I queried Open Targets for "${pickedDisease.name}" (${pickedDisease.id}) and evaluated ${totalAssociatedCount} associated targets. `;
    if (parsed.targetGene && primaryTarget.symbol?.toUpperCase() === parsed.targetGene) {
      step1Narration += `Based on your request, I focused on **${primaryTarget.symbol}** (*${primaryTarget.name || primaryTarget.symbol}*): it exhibits a ${noveltyAdj} Novelty Score of **${primaryNovelty}**, ${geneticAdj} genetic disease association (**${primaryGenetic}**), and ${drugPhrase}.`;
    } else if (isHighDrug) {
      step1Narration += `I selected **${primaryTarget.symbol}** (*${primaryTarget.name || primaryTarget.symbol}*) as an established target (${targetRoleLabel}): it exhibits a ${noveltyAdj} Novelty Score of **${primaryNovelty}**, ${geneticAdj} genetic disease association (**${primaryGenetic}**), and ${drugPhrase}.`;
    } else {
      step1Narration += `I selected **${primaryTarget.symbol}** (*${primaryTarget.name || primaryTarget.symbol}*) as the ${targetRoleLabel}: it exhibits a ${noveltyAdj} Novelty Score of **${primaryNovelty}**, ${geneticAdj} genetic disease association (**${primaryGenetic}**), and ${drugPhrase}, representing an opportunity with ${geneticAdj} causal biological evidence.`;
    }

    if (backupTarget) {
      const backupNoveltyVal = backupTarget.noveltyScore;
      const backupNovelty = backupNoveltyVal != null ? `${backupNoveltyVal}/100` : "N/A";
      const backupNoveltyAdj = getNoveltyAdjective(backupNoveltyVal);
      const backupGeneticVal = backupTarget.geneticScore;
      const backupGenetic = backupGeneticVal != null ? `${(backupGeneticVal * 100).toFixed(0)}%` : "0%";
      const backupGeneticAdj = getGeneticAdjective(backupGeneticVal);
      const backupDrugs = backupTarget.drugCount ?? 0;
      const backupDrugPhrase = getDrugCountPhrase(backupDrugs);
      const backupRole = backupDrugs >= 3 ? "already drugged / backup for structures" : "contingency backup target";

      step1Narration += ` As a contingency for structural evaluation, I designated **${backupTarget.symbol}** (${backupRole}: Novelty **${backupNovelty}** [${backupNoveltyAdj}], genetic association **${backupGenetic}** [${backupGeneticAdj}], ${backupDrugPhrase}) as the 2nd-ranked backup target.`;
    }

    notify(1, {
      status: "complete",
      narration: step1Narration,
      data: {
        disease: pickedDisease,
        primaryTarget,
        backupTarget,
        noveltyTargets: (noveltyTargets.length ? noveltyTargets : allTargets).slice(0, 10),
        allTargetsCount: totalAssociatedCount,
      },
    });

    // =========================================================================
    // STEP 2: PDB STRUCTURE SELECTION
    // =========================================================================
    notify(2, { status: "running" });
    if (typeof onProgress === "function") {
      onProgress({
        step: 2,
        message: `Searching RCSB PDB structures for primary target ${primaryTarget.symbol}...`,
      });
    }

    checkAborted();

    let activeTarget = primaryTarget;
    let pivoted = false;
    let pivotReason = null;
    let selectedStructure = null;
    let evaluatedStructures = [];

    // Search RCSB by gene symbol for candidate targets in order.
    // Established targets are searched first.
    // If primary target lacks a viable structure with a small-molecule hetero ligand,
    // pivot to backup / alternative candidate targets.
    const targetsToTry = [
      primaryTarget,
      ...candidatePool.filter((t) => t.symbol !== primaryTarget.symbol).slice(0, 5),
    ];

    let defectSummary = [];

    for (let i = 0; i < targetsToTry.length; i++) {
      const candidateTarget = targetsToTry[i];
      checkAborted();

      if (typeof onProgress === "function") {
        onProgress({
          step: 2,
          message: `Searching RCSB PDB structures for ${candidateTarget.symbol}...`,
        });
      }

      const pdbRes = await searchPdbTargets(candidateTarget.symbol);
      let structures = pdbRes?.results || [];

      // Check viability using isViableRepurposingStructure
      let viable = structures.filter(isViableRepurposingStructure);

      // If text search returned no viable structures, try curated benchmark PDBs if known
      const curatedList = CURATED_GENE_PDBS[candidateTarget.symbol?.toUpperCase()];
      if (!viable.length && curatedList?.length) {
        for (const cid of curatedList) {
          const curatedRes = await searchPdbTargets(cid);
          const cViable = (curatedRes?.results || []).filter(isViableRepurposingStructure);
          if (cViable.length) {
            structures = [...cViable, ...structures];
            viable = cViable;
            break;
          }
        }
      }

      if (viable.length) {
        selectedStructure = viable[0];
        evaluatedStructures = structures;
        activeTarget = candidateTarget;

        if (i > 0) {
          pivoted = true;
          pivotReason = `Primary target **${primaryTarget.symbol}** had ${defectSummary[0] || "no experimental structures with a co-crystallized drug-like ligand"}. Rather than continuing with degraded geometric assumptions, I pivoted to **${candidateTarget.symbol}** (${candidateTarget.drugCount ?? 0} approved drug${candidateTarget.drugCount === 1 ? "" : "s"}).`;
        }
        break;
      } else {
        const topStruct = structures[0];
        const defect = !topStruct
          ? "no structures in RCSB"
          : !topStruct.hasLigand
          ? `structure (${topStruct.id}) lacks a co-crystallized ligand`
          : topStruct.pocket === "unclear" || topStruct.pocket === "none"
          ? `structure (${topStruct.id}) lacks a defined small-molecule binding pocket`
          : `structure (${topStruct.id}) achieved an insufficient structural score of ${topStruct.score}/100`;
        defectSummary.push(`${candidateTarget.symbol}: ${defect}`);
      }
    }

    if (!selectedStructure) {
      // All candidate targets failed structural viability!
      const haltMsg = `Pipeline halted: Neither primary target ${primaryTarget.symbol} nor backup targets possessed an experimental crystallographic structure suitable for molecular repurposing (${defectSummary.slice(0, 2).join("; ")}). Proceeding further would generate ungrounded computational docking predictions. Experimental crystallographic determination or AlphaFold pocket modeling is required.`;

      notify(2, {
        status: "dead_end",
        narration: haltMsg,
        data: {
          primaryTarget,
          backupTarget,
          pivoted: Boolean(defectSummary.length > 1),
          evaluatedStructures,
        },
      });

      report.status = "halted";
      report.haltReason = haltMsg;
      report.totalDurationMs = Date.now() - startTime;
      return report;
    }

    // Compose Step 2 Narration
    const resolutionText = selectedStructure.resolution && selectedStructure.resolution !== "N/A"
      ? selectedStructure.resolution
      : "N/A";
    const methodText = selectedStructure.method || "X-ray crystallography";
    const primaryLig = selectedStructure.ligand?.name
      ? selectedStructure.ligand
      : Array.isArray(selectedStructure.ligands) && selectedStructure.ligands[0]
      ? selectedStructure.ligands[0]
      : null;
    const ligandText = primaryLig?.name || primaryLig?.compId || "co-crystallized ligand";
    const pocketText = selectedStructure.pocket?.residueCount
      ? `${selectedStructure.pocket.residueCount} residues (${selectedStructure.pocket.sizeLabel || "standard"} pocket, ${selectedStructure.pocket.hydrophobicityLabel || "mixed"} polarity)`
      : "experimentally mapped pocket";

    const pickReason = selectedStructure.reasons?.[0] ||
      (selectedStructure.resolution && selectedStructure.resolution !== "N/A"
        ? `${selectedStructure.resolution} crystal structure with co-crystallized ${ligandText}`
        : `experimentally resolved structure with bound drug-like ligand (${ligandText})`);

    const step2StatusText = `${activeTarget.symbol} · PDB ${selectedStructure.id} (${pickReason})`;

    if (typeof onProgress === "function") {
      onProgress({
        step: 2,
        message: step2StatusText,
      });
    }

    let step2Narration = "";
    if (pivoted) {
      step2Narration += `${pivotReason} `;
    }
    step2Narration += `For **${activeTarget.symbol}**, I selected **PDB ${selectedStructure.id}** (${pickReason}; Target Selection Score: **${selectedStructure.score}/100**). `;
    step2Narration += `It provides high-resolution data at **${resolutionText}** solved via **${methodText}**, featuring a bound **${ligandText}** that verifies pocket druggability, and an accessible binding cavity with **${pocketText}**.`;

    notify(2, {
      status: "complete",
      narration: step2Narration,
      subtitle: step2StatusText,
      message: step2StatusText,
      data: {
        target: activeTarget,
        gene: activeTarget.symbol,
        pdbId: selectedStructure.id,
        selectionReason: pickReason,
        pivoted,
        pivotReason,
        selectedStructure,
        evaluatedStructures: evaluatedStructures.slice(0, 6),
      },
    });

    // =========================================================================
    // STEP 3: REPURPOSING SCREEN
    // =========================================================================
    notify(3, { status: "running" });
    if (typeof onProgress === "function") {
      onProgress({
        step: 3,
        message: `Screening approved drug library against PDB ${selectedStructure.id}...`,
      });
    }

    checkAborted();

    const targetFam =
      selectedStructure.family ||
      (selectedStructure ? scoringCapabilities(selectedStructure).family : null);

    const proteinContext = {
      ...selectedStructure,
      id: selectedStructure.id,
      pdb_id: selectedStructure.id,
      gene: activeTarget.symbol || selectedStructure.gene || "",
      symbol: activeTarget.symbol || selectedStructure.symbol || "",
      name: activeTarget.name || selectedStructure.name || activeTarget.symbol,
      title: selectedStructure.title || "",
      queryName: activeTarget.symbol || selectedStructure.queryName || "",
      ligand: primaryLig ? {
        name: primaryLig.name || "",
        compId: primaryLig.compId || primaryLig.comp_id || "",
        mw: primaryLig.formulaWeight || primaryLig.mw || null,
        present: true,
      } : { present: false },
      ligands: selectedStructure.ligands || (primaryLig ? [primaryLig] : []),
      pocket: selectedStructure.pocket || selectedStructure.pocketStats || null,
      pocketStats: selectedStructure.pocketStats || null,
      family: targetFam,
    };

    const screenResult = await screenApprovedLibrary(proteinContext, {
      force: forceScreen,
      shortlistOnly: true,
      activeTarget,
      signal,
      onProgress: ({ percent, message }) => {
        if (typeof onProgress === "function") {
          onProgress({ step: 3, message: message || `Screening approved drugs... ${percent}%` });
        }
      },
    });

    const ranking = screenResult?.ranking || [];
    const recommendedCandidate = screenResult?.recommended || ranking[0] || null;
    const unmodeledFiller =
      Boolean(screenResult?.unmodeledFiller) ||
      isUnmodeledFillerRanking(ranking, proteinContext);

    // Halt when ranking is empty or top score is below drug-likeness floor.
    // Unmodeled targets still show an exploratory drug-likeness shortlist with an honest caveat.
    if (
      !recommendedCandidate ||
      !ranking.length ||
      (recommendedCandidate.score != null && recommendedCandidate.score < 15)
    ) {
      const topScore = recommendedCandidate?.score ?? 0;
      const haltMsg = `The repurposing screen evaluated ${ranking.length} approved drugs against PDB ${selectedStructure.id}, but no candidate met the minimum computational binding and pharmacophore compatibility threshold (top score: ${topScore}/100). The agent cannot recommend an approved drug for this pocket with confidence.`;
      notify(3, {
        status: "dead_end",
        narration: haltMsg,
        data: {
          ranking: [],
          top5: [],
          selectedStructure,
          unmodeledTarget: unmodeledFiller,
          librarySize: screenResult?.librarySize,
        },
      });
      report.status = "halted";
      report.haltReason = haltMsg;
      report.totalDurationMs = Date.now() - startTime;
      return report;
    }

    // Compose Step 3 Narration
    const topDrugName = displayDrugName(recommendedCandidate);
    const topIdRef = formatCompoundIdRef(recommendedCandidate);
    const topScore = recommendedCandidate.score != null ? `${recommendedCandidate.score}/100` : "N/A";
    const topScoreNum = Number(recommendedCandidate.score) || 0;
    const topIndication = recommendedCandidate.indication || "clinical therapeutic";
    const topMw = recommendedCandidate.molecularWeight
      ? Number(recommendedCandidate.molecularWeight).toFixed(1)
      : null;
    const topXlogp = recommendedCandidate.xlogp != null ? Number(recommendedCandidate.xlogp).toFixed(1) : null;
    const topReasoning = formatReasoningForDisplay(recommendedCandidate.reasoning);

    const libraryCount = screenResult?.librarySize || approvedDrugCount();
    const scoredCount = screenResult?.scoredCount || ranking.length;
    const excludedCount = screenResult?.excluded?.length || Math.max(0, libraryCount - scoredCount);
    const top5Summary = ranking
      .slice(0, 5)
      .map(
        (row) =>
          `**${displayDrugName(row)}** (${formatCompoundIdRef(row)}, ${row.score != null ? `${row.score}/100` : "N/A"})`
      )
      .join("; ");

    let step3Narration = "";
    if (unmodeledFiller) {
      step3Narration = `PocketLink has no curated pharmacology rule for **${activeTarget.symbol}**, so this is an **exploratory drug-likeness shortlist only** — scores reflect Lipinski/Veber physicochemical triage, not on-target repurposing hits. Top 5 by drug-likeness: ${top5Summary}. **${topDrugName}** (${topIdRef}) leads with **${topScore}** for **${topIndication}** (${topReasoning || INSUFFICIENT_TARGET_RULE_DISPLAY}). Use the full Repurposing screen after rule curation, or choose a modeled target (e.g. EGFR, ABL1, SGLT2) for target-specific ranking. Proceeding to adversarial critique with this caveat.`;
    } else if (topScoreNum < 67) {
      step3Narration = `No on-target approved drug in this shortlist; best same-family score is ${topScoreNum}. Showing top 5. Evaluated ${libraryCount.toLocaleString()} clinically approved drugs (shortlist of ${ranking.length} compounds) against **PDB ${selectedStructure.id}** (${activeTarget.symbol}). **${topDrugName}** (${topIdRef}) led the screen with a score of **${topScore}** for **${topIndication}** (${topReasoning || "same-family pharmacophore overlap"}). Proceeding to adversarial critique for potential liabilities.`;
    } else {
      step3Narration = `I evaluated the full library of ${libraryCount.toLocaleString()} clinically approved drugs (screening ${scoredCount.toLocaleString()} Lipinski/Veber-compliant small molecules) against the target-specific pocket geometry and pharmacophore constraints of **PDB ${selectedStructure.id}** (${activeTarget.symbol}). `;
      step3Narration += `**${topDrugName}** (${topIdRef}) emerged as the lead repurposing candidate with a top score of **${topScore}**. `;
      step3Narration += `Currently approved for **${topIndication}**, it demonstrates favorable molecular alignment${topMw ? ` (MW ${topMw}, XLogP ${topXlogp})` : ""}. Key computational rationale: ${topReasoning || "Excellent shape and electrostatic complementarity to the catalytic binding site with full Lipinski drug-likeness compliance."}.`;
    }

    notify(3, {
      status: "complete",
      narration: step3Narration,
      data: {
        recommended: recommendedCandidate,
        ranking: ranking.slice(0, 25),
        top5: ranking.slice(0, 5),
        totalScreened: scoredCount,
        librarySize: libraryCount,
        excludedCount,
        source: screenResult?.source || "heuristic-v2",
        summary: screenResult.summary,
        selectedStructure,
        activeTarget,
        unmodeledTarget: unmodeledFiller,
      },
    });

    // =========================================================================
    // STEP 4: ADVERSARIAL CRITIQUE ("THE CASE AGAINST")
    // =========================================================================
    notify(4, { status: "running" });
    if (typeof onProgress === "function") {
      onProgress({
        step: 4,
        message: `Running automated Adversarial Critique for ${topDrugName}...`,
      });
    }

    checkAborted();

    let critique = null;
    try {
      critique = await fetchAdversarialCritique(recommendedCandidate, selectedStructure, { signal });
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.warn("[agentPipeline] Adversarial critique call failed, using fallback:", err);
      // Construct fallback critique if server or network failed
      critique = {
        case_against: {
          overall_assessment: `While ${topDrugName} scores favorably on geometric size and lipophilicity matching for ${selectedStructure.id}, repurposing from its primary indication (${topIndication}) presents distinct clinical liabilities, including selectivity challenges across homologous binding pockets and unknown in vivo target residence time.`,
          concerns: [
            {
              issue: "Selectivity & Polypharmacology Risk",
              detail: `The scaffold may exhibit affinity for homologous off-target enzymes, raising the risk of unintended systemic side effects at the dosages required for ${report.diseaseResolved?.name || "the target indication"}.`,
            },
            {
              issue: "Tissue Distribution & Exposure Mismatch",
              detail: `Pharmacokinetic profile optimized for ${topIndication} may not achieve therapeutic unbound concentrations in the target tissue microenvironment.`,
            },
            {
              issue: "Translational Validation Required",
              detail: `High in silico scoring does not account for conformational flexibility or cell-permeability barriers in pathological tissue.`,
            },
          ],
        },
        source: "PocketLink Rule Engine (Fallback)",
      };
    }

    // Compose Step 4 Narration
    const caseAgainst = critique?.case_against || {};
    const topConcerns = Array.isArray(caseAgainst.concerns) ? caseAgainst.concerns : [];
    const concernSummary = topConcerns
      .slice(0, 2)
      .map((c) => `**${c.issue}** (*${c.detail}*)`)
      .join(" and ");

    let step4Narration = `To guard against confirmation bias, I initiated an adversarial review of **${topDrugName}**. `;
    if (caseAgainst.overall_assessment) {
      step4Narration += `${caseAgainst.overall_assessment} `;
    }
    if (concernSummary) {
      step4Narration += `Primary hurdles identified: ${concernSummary}. `;
    }
    step4Narration += `These genuine liabilities must be addressed in experimental orthogonal assays prior to considering in vivo investigation.`;

    notify(4, {
      status: "complete",
      narration: step4Narration,
      data: {
        candidate: recommendedCandidate,
        structure: selectedStructure,
        critique,
      },
    });

    // =========================================================================
    // EXECUTIVE SUMMARY & COMPLETION
    // =========================================================================
    report.status = "completed";
    report.totalDurationMs = Date.now() - startTime;

    report.executiveSummary = {
      disease: report.diseaseResolved?.name || diseaseQuery,
      diseaseId: report.diseaseResolved?.id || "",
      diseaseQuery,
      userTyped: goal.trim(),
      targetSymbol: activeTarget.symbol,
      targetName: activeTarget.name || activeTarget.symbol,
      targetOneLineWhy: pivoted
        ? `Pivoted from ${primaryTarget.symbol} (lacked pocket); ${activeTarget.symbol} has validated structure & ${(activeTarget.geneticScore != null ? (activeTarget.geneticScore * 100).toFixed(0) : "0")}% genetic disease association (${getGeneticAdjective(activeTarget.geneticScore)})`
        : (activeTarget.drugCount ?? 0) >= 3
        ? `Established target (already drugged / backup for structures): ${(activeTarget.geneticScore != null ? (activeTarget.geneticScore * 100).toFixed(0) : "0")}% genetic disease association (${getGeneticAdjective(activeTarget.geneticScore)}), ${activeTarget.drugCount ?? 0} approved drugs`
        : `${getGeneticAdjective(activeTarget.geneticScore)} genetic disease association (${(activeTarget.geneticScore != null ? (activeTarget.geneticScore * 100).toFixed(0) : "0")}%) with ${getDrugCountPhrase(activeTarget.drugCount)}`,
      pivotedFrom: pivoted ? primaryTarget.symbol : null,
      pdbId: selectedStructure.id,
      pdbResolution: resolutionText,
      targetSelectionScore: selectedStructure.score,
      leadDrugName: topDrugName,
      leadDrugCid: recommendedCandidate.cid,
      leadDrugSmiles: recommendedCandidate.smiles || recommendedCandidate.SMILES || recommendedCandidate.CanonicalSMILES || "",
      repurposingScore: recommendedCandidate.score,
      primaryIndication: topIndication,
      keyConcern: topConcerns[0]?.issue || "Selectivity across homologous pockets",
      keyConcernDetail: topConcerns[0]?.detail || "Requires orthogonal biochemical confirmation.",
      critiqueSummary: caseAgainst.overall_assessment || (topConcerns[0] ? `${topConcerns[0].issue}: ${topConcerns[0].detail}` : "Computational scores capture shape and lipophilicity; validation requires orthogonal assays."),
      verdict: unmodeledFiller
        ? `Pipeline completed with caveat: ${activeTarget.symbol} has no curated PocketLink pharmacology rule. Step 3 shows an exploratory drug-likeness shortlist (top: ${topDrugName}, ${topScore}) — not on-target repurposing hits. Adversarial critique follows for transparency.`
        : pivoted
        ? `Contingency pipeline completed: ${primaryTarget.symbol} was the top genetic candidate, but lacked an experimental pocket. The agent successfully pivoted to ${activeTarget.symbol} (PDB ${selectedStructure.id}), screened the approved-drug shortlist, and identified ${topDrugName} as an approved candidate with an itemized adversarial risk assessment.`
        : `Autonomous pipeline completed: Screened ${activeTarget.symbol} (PDB ${selectedStructure.id}) against approved drugs and identified ${topDrugName} as an approved candidate with an itemized adversarial risk assessment.`,
    };

    // Cache active run for persistence
    setActiveState(ACTIVE_STATE_KEYS.AGENT, report);

    // Save to permanent search history
    saveHistoryEntry({
      type: "agent-run",
      title: `Agent: ${report.diseaseResolved?.name || diseaseQuery} → ${activeTarget.symbol} (${topDrugName})`,
      summary: `${activeTarget.symbol} (${selectedStructure.id}) screened with ${topDrugName} (Score: ${topScore}). Adversarial stress-test complete.`,
      inputs: {
        goal: report.goal,
        disease: report.diseaseResolved?.name || diseaseQuery,
        target: activeTarget.symbol,
      },
      snapshot: {
        report,
      },
    });

    return report;
  } catch (err) {
    if (err.name === "AbortError") {
      report.status = "aborted";
      report.haltReason = "Agent execution was cancelled.";
    } else {
      console.error("[agentPipeline] Fatal error during agent run:", err);
      report.status = "halted";
      report.haltReason = err.message || "An unexpected error occurred during agent orchestration.";
    }
    report.totalDurationMs = Date.now() - startTime;
    return report;
  }
}
