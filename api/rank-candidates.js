const { rankCandidatesLocal } = require("../src/scoreCandidates");

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

function compactCandidates(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 5).map((c, index) => {
    const pains = compactPains(c.pains || c.painsAlerts);
    const row = {
      rank_input: index + 1,
      name: clean(c.name, 180),
      cid: clean(c.cid, 40),
      smiles: clean(c.smiles, 1200),
      molecularFormula: clean(c.molecularFormula, 120),
      molecularWeight: c.molecularWeight,
      xlogp: c.xlogp,
      hbd: c.hbd,
      hba: c.hba,
      rotatableBonds: c.rotatableBonds,
      tpsa: c.tpsa,
    };
    if (pains) row.pains = pains;
    return row;
  });
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

function normalizeResult(result, allowedCids) {
  if (!result || typeof result !== "object") return null;
  const ranking = Array.isArray(result.ranking) ? result.ranking : [];
  const rankedCids = ranking.map((row) => String(row.cid));
  const sameSet =
    rankedCids.length === allowedCids.length &&
    allowedCids.every((cid) => rankedCids.includes(cid));
  const recommendedCid = String(result.recommended?.cid || "");
  if (!sameSet || !allowedCids.includes(recommendedCid)) return null;

  return {
    recommended: {
      cid: recommendedCid,
      score: Number(result.recommended.score),
      reason: clean(result.recommended.reason, 800),
    },
    ranking: ranking.map((row, index) => ({
      cid: String(row.cid),
      rank: Number(row.rank) || index + 1,
      score: Number(row.score),
      strengths: Array.isArray(row.strengths) ? row.strengths.map((s) => clean(s, 240)).slice(0, 4) : [],
      concerns: Array.isArray(row.concerns) ? row.concerns.map((s) => clean(s, 240)).slice(0, 4) : [],
    })),
    summary: clean(result.summary, 900),
    limitations: Array.isArray(result.limitations)
      ? result.limitations.map((s) => clean(s, 300)).slice(0, 6)
      : [],
    source: "llm",
  };
}

async function rankWithOpenAI(compact, protein, heuristic) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const system = `You are an assistant for early-stage computational drug discovery triage.
Rank the supplied small-molecule candidates for follow-up using ONLY the supplied data.
Do not invent docking scores, ADME results, toxicity, residue contacts, or experimental evidence.
If docking data are absent, say that binding affinity cannot be assessed from this dataset.
Treat Lipinski/Veber rules as screening heuristics, not proof of developability.
When a candidate includes pains alerts, those are deterministic RDKit substructure flags (PAINS catalogs and a small toxicophore list), not an LLM judgment. Mention them in concerns and you may deprioritize that molecule (e.g. "deprioritized due to PAINS alert: rhodanine"). Do not invent alerts that are not in the supplied data. Missing or unable-to-check status is not a clean pass. Alerts are warnings, not hard exclusions — some flagged chemotypes become real drugs.
Do not call a molecule a drug or clinically effective.
A PocketLink heuristic ranking is provided as a starting point — you may reorder if the properties justify it, but stay conservative.
Return valid JSON only with this schema:
{"recommended":{"cid":string,"score":number,"reason":string},"ranking":[{"cid":string,"rank":number,"score":number,"strengths":[string],"concerns":[string]}],"summary":string,"limitations":[string]}`;

  const user = `Rank these candidates from best to worst for computational follow-up against ${
    protein?.id ? `PDB ${protein.id} (${protein.title || "staged target"})` : "an unspecified target"
  }. Give each an overall prioritization score from 0 to 100.

Candidates:
${JSON.stringify(compact, null, 2)}

Heuristic ranking (from Lipinski/Veber physicochemical scoring):
${JSON.stringify(heuristic, null, 2)}`;

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

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const compact = compactCandidates(body.candidates);
    const protein = body.protein
      ? {
          id: clean(body.protein.id, 12),
          title: clean(body.protein.title, 240),
          method: clean(body.protein.method, 80),
          resolution: clean(body.protein.resolution, 40),
        }
      : null;

    if (compact.length < 2) {
      return json(res, 400, { error: "Select at least 2 candidates." });
    }

    const heuristic = rankCandidatesLocal(compact, protein);
    const allowedCids = compact.map((c) => String(c.cid));

    if (!process.env.OPENAI_API_KEY) {
      return json(res, 200, heuristic);
    }

    try {
      const llmRaw = await rankWithOpenAI(compact, protein, heuristic);
      const llm = normalizeResult(llmRaw, allowedCids);
      if (llm) return json(res, 200, llm);
    } catch (error) {
      // Fall through to the local model so the shortlist still gets an answer.
      heuristic.limitations = [
        ...(heuristic.limitations || []),
        `Language-model ranking was unavailable (${clean(error.message, 160)}), so PocketLink used its physicochemical model instead.`,
      ];
    }

    return json(res, 200, heuristic);
  } catch (error) {
    return json(res, 500, { error: error?.message || "Unexpected server error." });
  }
};
