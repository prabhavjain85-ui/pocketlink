const ALLOWED_ORIGIN = "*";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function clean(value, max = 4000) {
  return String(value ?? "").slice(0, max);
}

function serviceBaseUrl() {
  const raw = process.env.DOCKING_SERVICE_URL || "";
  return raw.replace(/\/+$/, "");
}

function serviceHeaders() {
  const headers = { "Content-Type": "application/json" };
  const key = process.env.DOCKING_SERVICE_API_KEY;
  if (key) headers["X-API-Key"] = key;
  return headers;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function forward(method, path, body) {
  const base = serviceBaseUrl();
  if (!base) {
    return { status: 503, body: { error: "Docking service is not configured (DOCKING_SERVICE_URL)." } };
  }
  const url = `${base}${path}`;
  const init = { method, headers: serviceHeaders() };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(url, init);
  const data = await readJson(response);
  return { status: response.status, body: data };
}

function parsePdbId(raw) {
  const pdbId = clean(raw, 8).trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(pdbId)) return null;
  return pdbId;
}

function parseSmiles(raw) {
  const smiles = clean(raw, 2000).trim();
  return smiles || null;
}

async function handleSubmit(req, res) {
  const raw = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const pdbId = parsePdbId(raw.pdbId);
  const smiles = parseSmiles(raw.smiles);
  if (!pdbId) return json(res, 400, { error: "Invalid or missing pdbId (4-character PDB code)." });
  if (!smiles) return json(res, 400, { error: "Invalid or missing smiles." });

  const proxied = await forward("POST", "/v1/jobs", { pdbId, smiles });
  return json(res, proxied.status, proxied.body);
}

async function handleStatus(req, res, jobId) {
  const id = clean(jobId, 80).trim();
  if (!id) return json(res, 400, { error: "Missing job id." });
  const proxied = await forward("GET", `/v1/jobs/${encodeURIComponent(id)}`);
  return json(res, proxied.status, proxied.body);
}

async function handleResults(req, res, jobId) {
  const id = clean(jobId, 80).trim();
  if (!id) return json(res, 400, { error: "Missing job id." });
  const proxied = await forward("GET", `/v1/jobs/${encodeURIComponent(id)}/results`);
  return json(res, proxied.status, proxied.body);
}

module.exports = {
  json,
  handleSubmit,
  handleStatus,
  handleResults,
  forward,
  parsePdbId,
  parseSmiles,
  serviceBaseUrl,
};
