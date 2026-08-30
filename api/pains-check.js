/**
 * Vercel Node function: POST /api/pains-check
 *
 * Accepts `{ "smiles": "..." }` or `{ "compounds": [{ "cid", "smiles" }] }`
 * and returns deterministic RDKit-JS PAINS + toxicophore matches.
 *
 * Run locally with `npm run pains-api` (listens on PORT, default 8787).
 */

const http = require("http");
const { checkCompounds, checkSmiles, engineInfo } = require("../src/painsEngine");

const ALLOWED_ORIGIN = "*";

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

async function runCheck(body) {
  if (Array.isArray(body.compounds)) {
    return { status: 200, payload: { ...(await engineInfo()), results: await checkCompounds(body.compounds) } };
  }
  if (Object.prototype.hasOwnProperty.call(body, "smiles")) {
    return {
      status: 200,
      payload: { ...(await engineInfo()), results: [await checkSmiles(body.smiles, body.cid || "")] },
    };
  }
  return { status: 400, payload: { error: "Provide smiles or compounds: [{ cid, smiles }]." } };
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET") {
    try {
      return json(res, 200, { ok: true, ...(await engineInfo()), usage: 'POST {"smiles":"..."} or {"compounds":[{"cid":"...","smiles":"..."}]}' });
    } catch (error) {
      return json(res, 503, { ok: false, error: error?.message || "RDKit-JS unavailable." });
    }
  }
  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!body || typeof body !== "object") return json(res, 400, { error: "Invalid JSON body." });
    const { status, payload } = await runCheck(body);
    return json(res, status, payload);
  } catch (error) {
    return json(res, 500, { error: error?.message || "Unexpected server error." });
  }
};

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw) {
        try {
          req.body = JSON.parse(raw);
        } catch {
          return json(res, 400, { error: "Invalid JSON body." });
        }
      } else {
        req.body = {};
      }
      module.exports(req, res);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`PAINS checker listening on http://127.0.0.1:${port}/api/pains-check`);
  });
}
