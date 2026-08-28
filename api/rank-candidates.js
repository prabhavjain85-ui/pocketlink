const ALLOWED_ORIGIN = "*";

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

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  if (!process.env.OPENAI_API_KEY) {
    return json(res, 500, {
      error: "AI is not configured yet. Add OPENAI_API_KEY to the Vercel project environment variables."
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const candidates = Array.isArray(body?.candidates) ? body.candidates.slice(0, 5) : [];

    if (candidates.length < 2) {
      return json(res, 400, { error: "Select at least 2 candidates." });
    }

    const compact = candidates.map((c, index) => ({
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
      dockingScore: c.dockingScore === "" || c.dockingScore == null ? null : Number(c.dockingScore)
    }));

    const system = `You are an AI assistant for early-stage computational drug discovery prioritization.\n\nYour job is to rank the supplied small-molecule candidates for follow-up. Use ONLY the supplied data. Do not invent docking scores, ADME results, toxicity results, targets, residue interactions, or experimental evidence. A lower (more negative) docking score is better only when a docking score is actually supplied. If docking data are absent, explicitly say that binding affinity cannot be assessed from this dataset.\n\nPrioritize a balanced profile: drug-likeness, physicochemical properties, and any supplied docking evidence. Treat Lipinski/Veber-style rules as screening heuristics, not proof of developability. Do not call a molecule a drug or clinically effective. Return valid JSON only.\n\nOutput schema:\n{\"recommended\":{\"cid\":string,\"score\":number,\"reason\":string},\"ranking\":[{\"cid\":string,\"rank\":number,\"score\":number,\"strengths\":[string],\"concerns\":[string]}],\"summary\":string,\"limitations\":[string]}`;

    const user = `Rank these candidates from best to worst for computational follow-up. Give each an overall prioritization score from 0 to 100.\n\nCandidates:\n${JSON.stringify(compact, null, 2)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_output_tokens: 1800
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return json(res, response.status, {
        error: data?.error?.message || "OpenAI request failed."
      });
    }

    const output = data.output_text || data.output?.flatMap((item) => item.content || [])?.map((part) => part.text || "").join("") || "";
    const cleaned = output.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return json(res, 502, { error: "The AI returned an invalid ranking response." });
    }

    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, { error: error?.message || "Unexpected server error." });
  }
};
