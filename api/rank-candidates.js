const { rankCandidatesLocal, drugLikenessChecks, scoringCapabilities, resolveTargetRule } = require("../src/scoreCandidates");
const { TARGET_SPECIFIC_INSTRUCTION, buildTargetContext, targetDisplayName } = require("../src/targetContext");

const ALLOWED_ORIGIN = "*";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function clean(value, max = 4000) {
  return String(value ?? "").slice(0, max);
}

function compactPains(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const alerts = Array.isArray(raw.alerts)
    ? raw.alerts.slice(0, 8).map((alert) => ({
        family: clean(alert.family, 40),
        catalog: clean(alert.catalog, 40),
        name: clean(alert.name, 80),
        explanation: clean(alert.explanation, 240),
      }))
    : [];
  return {
    status: clean(raw.status, 20),
    hasAlerts: Boolean(raw.hasAlerts),
    alerts,
    reason: raw.reason ? clean(raw.reason, 160) : null,
  };
}

function compactCandidates(raw, limit = 5) {
  const cap = Number.isFinite(limit) ? Math.max(1, Math.min(30, limit)) : 5;
  return (Array.isArray(raw) ? raw : []).slice(0, cap).map((c, index) => {
    const pains = compactPains(c.pains || c.painsAlerts);
    const checks = drugLikenessChecks(c);
    const row = {
      rank_input: index + 1,
      name: clean(c.name, 180),
      cid: clean(c.cid, 40),
      compound_id: clean(c.cid, 40),
      smiles: clean(c.smiles, 1200),
      molecularFormula: clean(c.molecularFormula, 120),
      molecularWeight: c.molecularWeight,
      xlogp: c.xlogp,
      hbd: c.hbd,
      hba: c.hba,
      rotatableBonds: c.rotatableBonds,
      tpsa: c.tpsa,
      class: clean(c.class || c.drugClass, 80),
      indication: clean(c.indication, 160),
      lipinskiVeber: {
        passCount: checks.filter((x) => x.pass).length,
        violations: checks.filter((x) => !x.pass).length,
      },
    };
    if (pains) row.pains = pains;
    return row;
  });
}

function compactLigand(raw) {
  if (!raw || typeof raw !== "object" || raw.present === false) return { present: false };
  const groups = Array.isArray(raw.functionalGroups)
    ? raw.functionalGroups.slice(0, 8).map((g) => clean(g, 80))
    : [];
  const mw = raw.mw == null || raw.mw === "" ? null : Number(raw.mw);
  return {
    present: true,
    name: clean(raw.name, 180),
    compId: clean(raw.compId || raw.comp_id, 20),
    mw: Number.isFinite(mw) ? mw : null,
    functionalGroups: groups,
  };
}

function compactPocket(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      status: "unclear",
      available: false,
      residueCount: null,
      hydrophobicity: null,
      sizeLabel: null,
      hydrophobicityLabel: null,
    };
  }
  const residueCount = raw.residueCount == null ? null : Number(raw.residueCount);
  const hydrophobicity = raw.hydrophobicity == null ? null : Number(raw.hydrophobicity);
  return {
    status: clean(raw.status, 20) || "unclear",
    available: Boolean(raw.available),
    residueCount: Number.isFinite(residueCount) ? residueCount : null,
    hydrophobicity: Number.isFinite(hydrophobicity) ? hydrophobicity : null,
    sizeLabel: raw.sizeLabel ? clean(raw.sizeLabel, 20) : null,
    hydrophobicityLabel: raw.hydrophobicityLabel ? clean(raw.hydrophobicityLabel, 20) : null,
  };
}

function compactProtein(raw) {
  if (!raw || typeof raw !== "object") return null;
  // Always normalize through buildTargetContext. PDB search rows have
  // `pocket` as a status string ("detected") and `ligands[]` rather than
  // packed ligand/pocket objects. Treating that string as "already packed"
  // dropped ligand MW and pocket hydrophobicity, so every target's prompt
  // looked the same except for the name — the model then scored general
  // drug-likeness and a molecule like alprazolam won every screen.
  const packed = buildTargetContext(raw) || raw;
  const ligand = compactLigand(packed.ligand);
  const pocket = compactPocket(packed.pocket);
  const gaps = Array.isArray(packed.dataGaps)
    ? packed.dataGaps.map((s) => clean(s, 200)).slice(0, 6)
    : [];
  const pdbId = clean(packed.pdb_id || packed.id, 12);
  const scoreRaw = packed.targetSelectionScore ?? packed.score;
  const score = scoreRaw == null || scoreRaw === "" ? null : Number(scoreRaw);
  const packedOut = {
    name: clean(packed.name || packed.queryName || packed.title, 240),
    queryName: packed.queryName ? clean(packed.queryName, 80) : "",
    gene: clean(packed.gene || raw?.gene || raw?.symbol || "", 80),
    pdb_id: pdbId,
    id: pdbId,
    title: clean(packed.title, 240),
    targetSelectionScore: Number.isFinite(score) ? score : null,
    resolution: packed.resolution ? clean(packed.resolution, 40) : null,
    method: packed.method ? clean(packed.method, 80) : null,
    hasLigand: Boolean(ligand.present),
    ligand,
    pocket,
    dataGaps: gaps,
  };
  const caps = scoringCapabilities(packedOut);
  packedOut.family = caps.family;
  packedOut.targetRule = caps.targetRule;
  return packedOut;
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

function rowCid(row) {
  return String(row?.compound_id ?? row?.cid ?? "");
}

function rowReasoning(row) {
  if (Array.isArray(row?.reasoning) && row.reasoning.length) {
    return row.reasoning.map((s) => clean(s, 240)).slice(0, 6);
  }
  const mixed = [...(row?.strengths || []), ...(row?.concerns || [])];
  return mixed.map((s) => clean(s, 240)).slice(0, 6);
}

function mergeBatchLlmReasoning(heuristic, llm) {
  const llmByCid = new Map((llm?.ranking || []).map((row) => [String(row.cid), row]));
  const ranking = (heuristic.ranking || []).map((row) => {
    const extra = llmByCid.get(String(row.cid));
    if (!extra) return row;
    const reasoning = extra.reasoning && extra.reasoning.length ? extra.reasoning : row.reasoning;
    return {
      ...row,
      reasoning,
      strengths: extra.strengths && extra.strengths.length ? extra.strengths : row.strengths,
      concerns: extra.concerns && extra.concerns.length ? extra.concerns : row.concerns,
    };
  });
  return {
    ...heuristic,
    ranking,
    candidates: ranking.map((row) => ({
      compound_id: row.cid,
      score: row.score,
      reasoning: row.reasoning,
    })),
    limitations: [
      ...(heuristic.limitations || []),
      "Numeric scores come from TargetForge's target-aware model so every batch shares one scale. Language-model notes were attached as reasoning only — independent per-batch 0–100 LLM scores are not comparable across the library.",
    ],
    source: "heuristic-v2",
    llmReasoning: Boolean(llm),
  };
}

function logRankPrompt(system, user, protein) {
  const pdb = protein?.pdb_id || protein?.id || "none";
  const name = protein?.name || protein?.queryName || "";
  const caps = scoringCapabilities(protein);
  console.log(`[rank-candidates] Full prompt for ${name} (PDB ${pdb})`);
  console.log(
    `[rank-candidates] structural data: rule=${caps.targetRule || "none"} family=${caps.family} ligand=${caps.hasLigand} pocket=${caps.hasPocket} degraded=${caps.degraded} gaps=${JSON.stringify(caps.dataGaps)}`
  );
  console.log(`[rank-candidates] --- system ---\n${system}`);
  console.log(`[rank-candidates] --- user ---\n${user}`);
}

function normalizeResult(result, allowedCids, protein) {
  if (!result || typeof result !== "object") return null;
  const fromCandidates = Array.isArray(result.candidates) ? result.candidates : [];
  const fromRanking = Array.isArray(result.ranking) ? result.ranking : [];
  const sourceRows = fromCandidates.length ? fromCandidates : fromRanking;
  if (!sourceRows.length) return null;

  const byCid = new Map();
  for (const row of sourceRows) {
    const cid = rowCid(row);
    if (!allowedCids.includes(cid) || byCid.has(cid)) continue;
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const reasoning = rowReasoning(row);
    byCid.set(cid, {
      cid,
      compound_id: cid,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasoning,
      strengths: Array.isArray(row.strengths) ? row.strengths.map((s) => clean(s, 240)).slice(0, 4) : reasoning.slice(0, 3),
      concerns: Array.isArray(row.concerns) ? row.concerns.map((s) => clean(s, 240)).slice(0, 4) : [],
    });
  }

  if (byCid.size !== allowedCids.length) return null;
  const ranking = allowedCids
    .map((cid) => byCid.get(cid))
    .sort((a, b) => b.score - a.score || String(a.cid).localeCompare(String(b.cid)))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const recommendedCid = String(result.recommended?.cid || ranking[0].cid);
  if (!allowedCids.includes(recommendedCid)) return null;
  const recommendedRow = ranking.find((r) => r.cid === recommendedCid) || ranking[0];
  const targetName = protein ? targetDisplayName(protein) : clean(result.target?.name, 240);
  const pdbId = protein?.pdb_id || protein?.id || result.target?.pdb_id || null;

  return {
    target: { name: targetName || "", pdb_id: pdbId || null },
    candidates: ranking.map((row) => ({
      compound_id: row.compound_id,
      score: row.score,
      reasoning: row.reasoning,
    })),
    recommended: {
      cid: recommendedRow.cid,
      score: recommendedRow.score,
      reason: clean(result.recommended?.reason, 800) || recommendedRow.reasoning.join(" "),
    },
    ranking,
    summary: clean(result.summary, 900),
    limitations: Array.isArray(result.limitations)
      ? result.limitations.map((s) => clean(s, 300)).slice(0, 6)
      : [],
    source: "llm",
  };
}

function formatSimilarityBlock(similarityByCid) {
  if (!similarityByCid?.size) return "ChEMBL reference similarity: not available for this target (build reference_sets.json).";
  const lines = [];
  for (const [cid, row] of similarityByCid.entries()) {
    if (!row?.evidence?.length) continue;
    const top = row.evidence[0];
    lines.push(
      `- ${cid}: max Tanimoto ${(row.maxTanimoto ?? 0).toFixed(3)} vs reference ${top.chembl_id || "active"} (${(top.smiles || "").slice(0, 60)}…)`
    );
  }
  return lines.length
    ? `ChEMBL reference similarity (Morgan r=2, 2048 bits; cite these real actives instead of drug-name recognition):\n${lines.join("\n")}`
    : "ChEMBL reference similarity: fingerprints unavailable for these SMILES.";
}

function buildRankPrompt(compact, protein, heuristic, similarityByCid) {
  const targetLabel = protein?.pdb_id
    ? `${protein.name || targetDisplayName(protein) || "staged target"} (PDB ${protein.pdb_id})`
    : "an unspecified target (no PDB structure staged)";
  const caps = scoringCapabilities(protein);
  const family = caps.family || "unknown";
  const rule = resolveTargetRule(protein);

  const gaps = protein?.dataGaps?.length
    ? `Missing target data:\n${protein.dataGaps.map((g) => `- ${g}`).join("\n")}\nGraceful fallback: no reference ligand and/or pocket geometry is available. Score using known pharmacology for this target family plus drug-likeness. Explicitly note in every candidate's reasoning that target-fit assessment is limited without pocket/ligand data. Do not fabricate a confident geometric fit. Do not rank by general drug-likeness alone — a benzodiazepine or anthelmintic must not outrank a known class match just because it is more Lipinski-compliant.`
    : "Pocket and/or reference-ligand data are available — use them for size and polarity matching, and still require genuine pharmacological relevance.";

  const familyLine = rule
    ? `Specific target rule resolved: ${rule.name} (family: ${rule.family}). On-target drugs (${rule.onTargetDrugs.join(", ")}) must be prioritized over off-target or same-family drugs. For example, EGFR inhibitors like erlotinib/gefitinib must score above ABL inhibitors like imatinib against EGFR, and vice versa against ABL.`
    : `Recognized target family: ${family}. Pharmacological class match for THIS family must drive the ranking. A generally drug-like molecule with no class match (for example alprazolam against HIV protease or COX-2) must score well below a known class match.`;

  const system = `You are an assistant for early-stage computational drug discovery triage.
Score each supplied small-molecule candidate for how well it fits THIS specific target / PDB structure, not how drug-like it is in general.
${TARGET_SPECIFIC_INSTRUCTION}

Scoring (integer 0–100) is a weighted combination of:
1. Target/pocket fit (~55%): size and polarity match relative to the pocket and the co-crystallized reference ligand when available, AND evidence of relevance (prefer supplied ChEMBL similarity to reference actives; legacy drug-name priors may apply only to listed approved drugs). Use real chemical knowledge — do not invent activity.
2. Drug-likeness (~30%): Lipinski Rule-of-Five and Veber compliance from the supplied properties. This is a tie-breaker, not the ranking.
3. PAINS/toxicophore penalty: deduct points if flagged (typically 8–15). Never hard-zero a score solely because of an alert — some flagged chemotypes become real drugs.

You may use established pharmacological knowledge about compound classes and protein families. Do not invent docking scores, IC50 values, ADME results, residue contacts, or unpublished experimental evidence. Do not call a molecule a drug or clinically effective against this target.
When a candidate includes pains alerts, those are deterministic RDKit substructure flags, not an LLM judgment. Mention them in reasoning. Do not invent alerts that are not in the supplied data.
A TargetForge heuristic ranking is provided as a starting point — you may reorder if target fit and pharmacology justify it.

Return valid JSON only with this schema:
{"target":{"name":string,"pdb_id":string},"candidates":[{"compound_id":string,"score":number,"reasoning":[string]}],"summary":string,"limitations":[string]}
compound_id must be the supplied cid. Include every candidate exactly once. reasoning should be 3–6 short factual bullets explaining what drove the score up or down.`;

  const user = `Score these candidates for ${targetLabel}.
${TARGET_SPECIFIC_INSTRUCTION}

${familyLine}

Selected structure:
${JSON.stringify(protein, null, 2)}

${gaps}

Candidates (PubChem properties + Lipinski/Veber + PAINS):
${JSON.stringify(compact, null, 2)}

Heuristic ranking (knowledge-based triage — not a potency prediction):
${JSON.stringify(heuristic, null, 2)}

${formatSimilarityBlock(similarityByCid)}`;

  return { system, user };
}

async function rankWithOpenAI(compact, protein, heuristic, similarityByCid) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const { system, user } = buildRankPrompt(compact, protein, heuristic, similarityByCid);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data?.error?.message || "OpenAI request failed.");
    err.status = response.status;
    throw err;
  }

  const text = data?.choices?.[0]?.message?.content || "";
  return extractJson(text);
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const isBatch = body.mode === "batch";
    const batchLimit = isBatch ? 30 : 5;
    const compact = compactCandidates(body.candidates, batchLimit);
    const protein = compactProtein(body.protein);

    if (compact.length < (isBatch ? 1 : 2)) {
      return json(res, 400, { error: isBatch ? "Select at least 1 candidate." : "Select at least 2 candidates." });
    }

    let similarityByCid = new Map();
    try {
      process.env.NODE_ENV = "test";
      const { buildSimilarityMap } = await import("../benchmark/similarityForBench.mjs");
      similarityByCid = await buildSimilarityMap(
        compact.map((c) => ({ smiles: c.smiles, name: c.name, chembl_id: c.cid })),
        protein
      );
    } catch {
      similarityByCid = new Map();
    }

    const heuristic = rankCandidatesLocal(compact, protein, {
      maxCandidates: batchLimit,
      minCandidates: isBatch ? 1 : 2,
      similarityByCid,
    });
    const allowedCids = compact.map((c) => String(c.cid));
    const prompt = buildRankPrompt(compact, protein, heuristic, similarityByCid);
    logRankPrompt(prompt.system, prompt.user, protein);

    if (!process.env.OPENAI_API_KEY) {
      return json(res, 200, heuristic);
    }

    try {
      const llmRaw = await rankWithOpenAI(compact, protein, heuristic, similarityByCid);
      const llm = normalizeResult(llmRaw, allowedCids, protein);
      if (llm) {
        // Shortlist (2–5): the LLM ranks a single comparable set.
        // Library batches (20–30): independent 0–100 LLM scores cannot be
        // concatenated — that is what made one highly drug-like molecule
        // (alprazolam) win every target. Keep target-aware local scores
        // and attach LLM notes as reasoning only.
        // Also guard against LLM returning tied family scores (e.g. all 87).
        const topScores = llm.ranking.slice(0, 3).map((r) => r.score);
        const allTied = topScores.length > 1 && topScores.every((s) => s === topScores[0]);
        if (isBatch || allTied) return json(res, 200, mergeBatchLlmReasoning(heuristic, llm));
        return json(res, 200, llm);
      }
      heuristic.aiError = "The AI returned malformed or incomplete ranking data.";
      heuristic.limitations = [
        ...(heuristic.limitations || []),
        "Language-model ranking returned malformed data, so TargetForge used its target-aware physicochemical model instead.",
      ];
    } catch (error) {
      heuristic.aiError = clean(error.message, 160) || "The AI ranking request failed.";
      heuristic.limitations = [
        ...(heuristic.limitations || []),
        `Language-model ranking was unavailable (${heuristic.aiError}), so TargetForge used its target-aware physicochemical model instead.`,
      ];
    }

    return json(res, 200, heuristic);
  } catch (error) {
    return json(res, 500, { error: error?.message || "Unexpected server error." });
  }
}

handler.buildRankPrompt = buildRankPrompt;
handler.normalizeResult = normalizeResult;
handler.compactProtein = compactProtein;
handler.compactCandidates = compactCandidates;
handler.mergeBatchLlmReasoning = mergeBatchLlmReasoning;
handler.logRankPrompt = logRankPrompt;
module.exports = handler;
