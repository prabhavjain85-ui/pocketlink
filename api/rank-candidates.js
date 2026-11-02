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

function extractLlmReasoningOnly(result, allowedCids) {
  if (!result || typeof result !== "object") return null;
  const fromCandidates = Array.isArray(result.candidates) ? result.candidates : [];
  const fromRanking = Array.isArray(result.ranking) ? result.ranking : [];
  const sourceRows = fromCandidates.length ? fromCandidates : fromRanking;
  if (!sourceRows.length) return null;

  const byCid = new Map();
  for (const row of sourceRows) {
    const cid = rowCid(row);
    if (!allowedCids.includes(cid) || byCid.has(cid)) continue;
    const reasoning = rowReasoning(row);
    if (!reasoning.length) continue;
    byCid.set(cid, {
      cid,
      reasoning,
      strengths: Array.isArray(row.strengths) ? row.strengths.map((s) => clean(s, 240)).slice(0, 4) : reasoning.slice(0, 3),
      concerns: Array.isArray(row.concerns) ? row.concerns.map((s) => clean(s, 240)).slice(0, 4) : [],
    });
  }
  if (!byCid.size) return null;
  const ranking = allowedCids.map((cid) => byCid.get(cid)).filter(Boolean);
  if (!ranking.length) return null;
  return {
    ranking,
    summary: clean(result.summary, 900),
    limitations: Array.isArray(result.limitations)
      ? result.limitations.map((s) => clean(s, 300)).slice(0, 6)
      : [],
  };
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

function buildRankPrompt(compact, protein, heuristic) {
  const targetLabel = protein?.pdb_id
    ? `${protein.name || targetDisplayName(protein) || "staged target"} (PDB ${protein.pdb_id})`
    : "an unspecified target (no PDB structure staged)";
  const caps = scoringCapabilities(protein);
  const family = caps.family || "unknown";
  const rule = resolveTargetRule(protein);

  const gaps = protein?.dataGaps?.length
    ? `Missing target data:\n${protein.dataGaps.map((g) => `- ${g}`).join("\n")}\nGraceful fallback: no reference ligand metadata is available. Write rationale from known pharmacology for this target family and PubChem drug-likeness only — do not claim pocket geometry, residue contacts, or binding affinity. Note in reasoning that structural context is limited. Do not rank by general drug-likeness alone — a benzodiazepine or anthelmintic must not sound like a better fit than a known class match just because it is more Lipinski-compliant.`
    : "Reference-ligand metadata may be present for context only; triage does not compute pocket geometry. Ground rationale in curated target-class rules and supplied properties.";

  const familyLine = rule
    ? `Specific target rule resolved: ${rule.name} (family: ${rule.family}). On-target drugs (${rule.onTargetDrugs.join(", ")}) are pharmacologically relevant to this target. Explain how each candidate aligns or conflicts with that class — do not invent numeric scores or binding data.`
    : `Recognized target family: ${family}. Discuss pharmacological class relevance for THIS family. A generally drug-like molecule with no class match (for example alprazolam against HIV protease or COX-2) should be described as a weak hypothesis, not a top lead.`;

  const system = `You are an assistant for early-stage computational drug discovery triage.
Write plain-language comparison notes for the supplied candidates against THIS specific target / PDB context.
${TARGET_SPECIFIC_INSTRUCTION}

Do NOT assign numeric scores, ranks, or probabilities. TargetForge's heuristic-v2 model (provided below) is the only source of scores and ordering.

Focus each candidate's reasoning on:
1. Whether the compound matches the resolved target-class rule (on-target, same-family/demoted, or unrelated).
2. Lipinski/Veber drug-likeness and any PAINS/toxicophore flags in the supplied data.
3. Co-crystallized reference ligand name matches when relevant — this is a string/name check, not a geometric fit.

You may use established pharmacological knowledge about compound classes and protein families. Do not invent docking scores, IC50 values, ADME results, residue contacts, pocket fit, or unpublished experimental evidence. Do not call a molecule a drug or clinically effective against this target.
When a candidate includes pains alerts, those are deterministic substructure flags from the app, not your judgment. Mention them in reasoning. Do not invent alerts that are not in the supplied data.

Return valid JSON only with this schema:
{"target":{"name":string,"pdb_id":string},"candidates":[{"compound_id":string,"reasoning":[string]}],"summary":string,"limitations":[string]}
compound_id must be the supplied cid. Include every candidate exactly once. reasoning should be 3–6 short factual bullets.`;

  const user = `Write comparison notes for these candidates for ${targetLabel}.
${TARGET_SPECIFIC_INSTRUCTION}

${familyLine}

Selected structure:
${JSON.stringify(protein, null, 2)}

${gaps}

Candidates (PubChem properties + Lipinski/Veber + PAINS):
${JSON.stringify(compact, null, 2)}

Heuristic ranking (target-aware physicochemical + class match, for reference only):
${JSON.stringify(heuristic, null, 2)}`;

  return { system, user };
}

async function rankWithOpenAI(compact, protein, heuristic) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const { system, user } = buildRankPrompt(compact, protein, heuristic);

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

    const heuristic = rankCandidatesLocal(compact, protein, {
      maxCandidates: batchLimit,
      minCandidates: isBatch ? 1 : 2,
    });
    const allowedCids = compact.map((c) => String(c.cid));
    const prompt = buildRankPrompt(compact, protein, heuristic);
    logRankPrompt(prompt.system, prompt.user, protein);

    if (!process.env.OPENAI_API_KEY) {
      return json(res, 200, heuristic);
    }

    try {
      const llmRaw = await rankWithOpenAI(compact, protein, heuristic);
      const llmNotes = extractLlmReasoningOnly(llmRaw, allowedCids);
      if (llmNotes) {
        const merged = mergeBatchLlmReasoning(heuristic, llmNotes);
        if (llmNotes.summary) merged.summary = llmNotes.summary;
        if (llmNotes.limitations?.length) {
          merged.limitations = [...(heuristic.limitations || []), ...llmNotes.limitations].filter(
            (item, index, arr) => arr.indexOf(item) === index
          );
        }
        return json(res, 200, merged);
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
handler.extractLlmReasoningOnly = extractLlmReasoningOnly;
handler.logRankPrompt = logRankPrompt;
module.exports = handler;
