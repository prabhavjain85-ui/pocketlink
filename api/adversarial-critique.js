const { buildTargetContext, targetDisplayName } = require("../server/targetContext.js");
const { scoringCapabilities } = require("../server/scoreCandidates.js");
const { CURATED_HUMAN_PARALOGS } = require("../server/noveltyScore.js");
const { checkRateLimit } = require("./_lib/rateLimit");
const { applyCorsHeaders } = require("./_lib/security");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

let cachedGoogleGenAI = null;
async function getGoogleGenAI() {
  if (cachedGoogleGenAI) return cachedGoogleGenAI;
  try {
    const genaiMod = await import("@google/genai");
    cachedGoogleGenAI = genaiMod.GoogleGenAI;
    return cachedGoogleGenAI;
  } catch (err) {
    console.warn("[adversarial-critique] Failed to import @google/genai:", err.message);
    return null;
  }
}

function json(res, status, body, req = null) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  applyCorsHeaders(req, res, "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function clean(value, max = 4000) {
  return String(value ?? "").slice(0, max);
}

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function resolveTargetParalogs(raw, packedName) {
  const explicit = Array.isArray(raw?.paralogs)
    ? raw.paralogs
    : Array.isArray(raw?.discoveryContext?.paralogs)
      ? raw.discoveryContext.paralogs
      : [];
  if (explicit.length > 0) {
    return explicit
      .filter((p) => p && p.symbol && Number(p.identityPct) > 65)
      .map((p) => ({
        symbol: clean(p.symbol, 24).toUpperCase(),
        identityPct: Math.round(Number(p.identityPct) * 10) / 10,
      }))
      .slice(0, 4);
  }

  const candidateSymbols = [
    raw?.symbol,
    raw?.approvedSymbol,
    raw?.queryName,
    raw?.geneSymbol,
    packedName,
  ]
    .map((s) => String(s || "").trim().toUpperCase())
    .filter(Boolean);

  for (const sym of candidateSymbols) {
    if (CURATED_HUMAN_PARALOGS && CURATED_HUMAN_PARALOGS[sym]) {
      return CURATED_HUMAN_PARALOGS[sym]
        .filter((p) => Number(p.identityPct) > 65)
        .slice(0, 4);
    }
    for (const [geneKey, list] of Object.entries(CURATED_HUMAN_PARALOGS || {})) {
      if (sym.includes(geneKey)) {
        return list.filter((p) => Number(p.identityPct) > 65).slice(0, 4);
      }
    }
  }
  return [];
}

function compactTargetForAdversarial(raw) {
  if (!raw || typeof raw !== "object") {
    return { name: "Target", pdb_id: null, family: "unknown", paralogs: [], safetyProfile: null };
  }
  const packed = buildTargetContext(raw) || raw;
  const pdbId = clean(packed.pdb_id || packed.id, 12);
  const caps = scoringCapabilities(packed);
  const name = clean(packed.name || packed.queryName || targetDisplayName(packed) || "staged target", 240);
  const paralogs = resolveTargetParalogs(raw, name);
  const safetyProfile = clean(raw.safetyProfile || raw.discoveryContext?.safetyProfile || "", 60) || null;
  return {
    name,
    pdb_id: pdbId || null,
    title: clean(packed.title, 240),
    family: caps.family || "unknown",
    resolution: packed.resolution ? clean(packed.resolution, 40) : null,
    method: packed.method ? clean(packed.method, 80) : null,
    hasLigand: Boolean(packed.hasLigand || packed.ligand?.present),
    ligand: packed.ligand && packed.ligand.present ? {
      name: clean(packed.ligand.name, 120),
      compId: clean(packed.ligand.compId, 20),
      mw: packed.ligand.mw,
    } : { present: false },
    pocket: packed.pocket ? {
      status: clean(packed.pocket.status, 40),
      residueCount: packed.pocket.residueCount,
      hydrophobicity: packed.pocket.hydrophobicity,
    } : null,
    paralogs,
    safetyProfile,
    dataGaps: Array.isArray(packed.dataGaps) ? packed.dataGaps.slice(0, 6) : [],
  };
}

function compactCandidateForAdversarial(raw) {
  if (!raw || typeof raw !== "object") return null;
  const cid = clean(raw.cid || raw.compound_id || raw.CID, 40);
  const reasoning = Array.isArray(raw.reasoning)
    ? raw.reasoning.map((r) => clean(r, 300)).slice(0, 6)
    : [];
  return {
    compound_id: cid,
    cid,
    name: clean(raw.name || raw.displayName || `CID ${cid}`, 180),
    molecularWeight: raw.molecularWeight != null ? Number(raw.molecularWeight) : null,
    xlogp: raw.xlogp != null ? Number(raw.xlogp) : null,
    hbd: raw.hbd != null ? Number(raw.hbd) : null,
    hba: raw.hba != null ? Number(raw.hba) : null,
    rotatableBonds: raw.rotatableBonds != null ? Number(raw.rotatableBonds) : null,
    tpsa: raw.tpsa != null ? Number(raw.tpsa) : null,
    class: clean(raw.class || raw.drugClass, 120),
    indication: clean(raw.indication, 180),
    score: raw.score != null ? Number(raw.score) : null,
    reasoning,
    painsAlerts: Array.isArray(raw.pains?.alerts) ? raw.pains.alerts.slice(0, 5) : [],
  };
}

const ADVERSARIAL_SYSTEM_INSTRUCTION = `You are a critical pharmaceutical science reviewer and devil's advocate in early-stage computational drug discovery triage.
Your job is to rigorously identify potential failure modes, liabilities, and reasons why an apparently high-scoring candidate might fail in downstream preclinical or clinical development.
Return valid JSON only with this exact schema:
{
  "compound_id": string,
  "case_against": {
    "concerns": [
      { "issue": string, "detail": string }
    ],
    "overall_assessment": string
  }
}
compound_id must be the candidate's CID.
concerns should include 2 to 4 distinct, substantively grounded concerns.
issue should be a short, clear heading (3 to 6 words).
detail should be a thorough 1 to 3 sentence scientific explanation citing specific structural or pharmacological reasons.
overall_assessment should be a 2 to 3 sentence synthesis weighing the prior score against these counter-arguments.`;

function buildAdversarialPrompt(candidate, target) {
  const targetDesc = target.pdb_id
    ? `${target.name} (PDB ID: ${target.pdb_id}, family: ${target.family || "unspecified"})`
    : target.name || "Target";

  const paralogList = Array.isArray(target?.paralogs) ? target.paralogs : [];
  const paralogNote = paralogList.length
    ? `\nParalog Selectivity Context: This target has close human paralogs with >65% sequence identity (${paralogList
        .map((p) => `${p.symbol} ${p.identityPct}%`)
        .join(", ")}). Explicitly evaluate off-target family selectivity risks against these paralogs in your Case Against.`
    : "";

  const user = `You previously reasoned that this compound is a strong candidate for this target. Now argue the opposite case as rigorously as possible. Identify genuine weaknesses, risks, and reasons this candidate might fail — consider selectivity risk (could it hit unintended targets), synthetic accessibility concerns, known failure patterns for similar compound classes or targets, weak or missing evidence in the original reasoning, and any red flags a careful reviewer would raise. Do not simply restate PAINS alerts already shown elsewhere — go deeper into genuine scientific/practical concerns. Be honest — if you truly cannot find a substantive case against it, say so rather than inventing weak objections.${paralogNote}

Target Context (${targetDesc}):
${JSON.stringify(target, null, 2)}

Candidate Properties & Prior Evaluation:
${JSON.stringify(candidate, null, 2)}`;

  return { system: ADVERSARIAL_SYSTEM_INSTRUCTION, user };
}

function normalizeCritique(raw, expectedCid) {
  if (!raw || typeof raw !== "object") return null;
  const caseAgainst = raw.case_against || raw.caseAgainst;
  if (!caseAgainst || typeof caseAgainst !== "object") return null;

  const rawConcerns = Array.isArray(caseAgainst.concerns) ? caseAgainst.concerns : [];
  const concerns = rawConcerns
    .filter((c) => c && (c.issue || c.detail))
    .map((c) => ({
      issue: clean(c.issue || "Pharmacological liability", 100),
      detail: clean(c.detail || c.description || "", 600),
    }))
    .slice(0, 5);

  const overall = clean(caseAgainst.overall_assessment || caseAgainst.overallAssessment || caseAgainst.summary, 1000);

  if (!concerns.length && !overall) return null;

  return {
    compound_id: clean(raw.compound_id || expectedCid, 40),
    case_against: {
      concerns: concerns.length ? concerns : [
        {
          issue: "Downstream biological validation gap",
          detail: "While computational metrics appear favorable, experimental cell-permeability and binding kinetics data are required to confirm that target engagement translates into cellular efficacy.",
        },
      ],
      overall_assessment: overall || "Candidate shows high in silico affinity, but downstream off-target selectivity and ADMET profiling remain necessary to establish clinical viability.",
    },
    source: "ai",
  };
}

function generateHeuristicCritique(candidate, target) {
  const concerns = [];
  const mw = candidate.molecularWeight;
  const xlogp = candidate.xlogp;
  const rotBonds = candidate.rotatableBonds;
  const tpsa = candidate.tpsa;
  const fam = String(target?.family || "").toLowerCase();
  const paralogs = Array.isArray(target?.paralogs) ? target.paralogs : [];

  if (paralogs.length > 0) {
    const paralogSummary = paralogs.map((p) => `${p.symbol} (${p.identityPct}% identity)`).join(", ");
    concerns.push({
      issue: "Human paralog cross-reactivity and selectivity risk",
      detail: `Close human paralogs share high sequence conservation with ${target.name || "this target"} — specifically ${paralogSummary}. Orthosteric inhibitors risk off-target engagement across these family members, requiring counter-screening to avoid dose-limiting toxicity.`,
    });
  }

  if (target?.safetyProfile === "Pan-Essential Warning") {
    concerns.push({
      issue: "Pan-essential target therapeutic index constraint",
      detail: `${target.name || "This target"} exhibits pan-essentiality across DepMap/gnomAD profiles and broad vital-organ expression, narrowing the systemic therapeutic window and increasing on-target toxicity risk.`,
    });
  }

  if (fam.includes("kinase")) {
    concerns.push({
      issue: "Kinome cross-reactivity and selectivity liability",
      detail: `As an ATP-competitive scaffold against a kinase domain (${target.name || "target"}), there is substantial risk of off-target inhibition across homologous kinases sharing high ATP-binding pocket conservation, which may elicit off-target hematologic or cardiovascular toxicities.`,
    });
    concerns.push({
      issue: "Acquired gatekeeper and binding loop resistance",
      detail: "Clinical kinase inhibitors frequently suffer from rapid emergence of resistance mutations at gatekeeper residues or flexible loop regions that sterically impede binding.",
    });
  } else if (fam.includes("gpcr")) {
    concerns.push({
      issue: "GPCR sub-type selectivity and signaling bias",
      detail: `Achieving subtype selectivity across homologous GPCRs sharing transmembrane pocket homology is challenging. Furthermore, distinct functional selectivity (G-protein vs. beta-arrestin bias) could trigger undesirable physiological side effects.`,
    });
  } else if (fam.includes("protease")) {
    concerns.push({
      issue: "Peptidomimetic clearance and metabolic stability",
      detail: "Protease-targeting chemotypes frequently demonstrate elevated metabolic clearance by hepatic cytochromes or peptidases, requiring formulation optimization to maintain active plasma concentrations.",
    });
  }

  if (mw != null && mw > 450) {
    concerns.push({
      issue: "High molecular weight and optimization ceiling",
      detail: `At MW ${mw.toFixed(1)} g/mol, the molecule approaches the upper limit of drug-like chemical space, leaving minimal molecular weight budget for subsequent structural modifications to tune potency or solubility.`,
    });
  }

  if (xlogp != null && xlogp > 3.8) {
    concerns.push({
      issue: "Lipophilicity and non-specific binding risk",
      detail: `Elevated lipophilicity (XLogP ${xlogp.toFixed(1)}) increases the probability of non-specific plasma protein binding, rapid microsomal clearance, and promiscuous hERG channel liability.`,
    });
  } else if (rotBonds != null && rotBonds > 6) {
    concerns.push({
      issue: "Conformational flexibility and entropic penalty",
      detail: `With ${rotBonds} rotatable bonds, the candidate must overcome a substantial entropic penalty upon locking into the binding pocket conformation, which may reduce in vitro binding affinity.`,
    });
  }

  if (tpsa != null && tpsa > 110) {
    concerns.push({
      issue: "Passive membrane permeability constraints",
      detail: `Polar surface area of ${tpsa.toFixed(1)} Å² may impede passive cellular permeability, potentially dampening in vitro to in vivo translation in whole-cell phenotypic assays.`,
    });
  }

  if (!concerns.length) {
    concerns.push({
      issue: "Assay interference and target engagement validation",
      detail: "Computational target-fit heuristics cannot account for cell-contextual protein degradation, local cofactor displacement, or complex conformational dynamics.",
    });
    concerns.push({
      issue: "Selectivity profile across off-target receptors",
      detail: "Broad safety screening across off-target panels is required to confirm that the observed score is driven by specific pocket engagement rather than non-specific binding.",
    });
  }

  return {
    compound_id: candidate.cid,
    case_against: {
      concerns: concerns.slice(0, 3),
      overall_assessment: `While ${candidate.name || "this candidate"} demonstrates favorable initial scoring against ${target.name || "the target"}, its structural attributes present key liabilities—notably selectivity across conserved protein families and potential bioavailability trade-offs—that warrant counter-screening in secondary assays.`,
    },
    source: "heuristic",
  };
}

function withTimeout(promise, ms, label = "Request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function critiqueWithGemini(prompt, expectedCid) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const GoogleGenAIClass = await getGoogleGenAI();
  if (GoogleGenAIClass) {
    const ai = new GoogleGenAIClass({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            { role: "user", parts: [{ text: `${prompt.system}\n\n${prompt.user}` }] },
          ],
          config: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "LOW" },
          },
        }),
        8000,
        "Gemini critique"
      );

      const parsed = extractJson(response?.text);
      const normalized = normalizeCritique(parsed, expectedCid);
      if (normalized) return normalized;
    } catch (err) {
      console.warn("[adversarial-critique] Gemini SDK request error:", err.message);
    }
  }

  return null;
}

async function critiqueWithOpenAI(prompt, expectedCid) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || "OpenAI critique request failed.");
    err.status = response.status;
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(text);
  return normalizeCritique(parsed, expectedCid);
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const candidate = compactCandidateForAdversarial(body.candidate);
    const target = compactTargetForAdversarial(body.target);

    if (!candidate || !candidate.cid) {
      return json(res, 400, { error: "A candidate with a valid compound ID is required." });
    }

    const prompt = buildAdversarialPrompt(candidate, target);

    // 1. Try Gemini first if key is present
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiResult = await critiqueWithGemini(prompt, candidate.cid);
        if (geminiResult) return json(res, 200, geminiResult);
      } catch (err) {
        console.warn("[adversarial-critique] Gemini attempt failed, falling back:", err.message);
      }
    }

    // 2. Try OpenAI if key is present
    if (process.env.OPENAI_API_KEY) {
      try {
        const openAiResult = await critiqueWithOpenAI(prompt, candidate.cid);
        if (openAiResult) return json(res, 200, openAiResult);
      } catch (err) {
        console.warn("[adversarial-critique] OpenAI attempt failed, falling back:", err.message);
      }
    }

    // 3. Graceful target-aware heuristic fallback
    const fallback = generateHeuristicCritique(candidate, target);
    return json(res, 200, fallback);
  } catch (error) {
    return json(res, 500, { error: error?.message || "Internal critique error." });
  }
}

handler.buildAdversarialPrompt = buildAdversarialPrompt;
handler.normalizeCritique = normalizeCritique;
handler.compactCandidateForAdversarial = compactCandidateForAdversarial;
handler.compactTargetForAdversarial = compactTargetForAdversarial;
handler.generateHeuristicCritique = generateHeuristicCritique;
handler.ADVERSARIAL_SYSTEM_INSTRUCTION = ADVERSARIAL_SYSTEM_INSTRUCTION;

module.exports = handler;
