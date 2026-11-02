/**
 * POST /api/compute  { op, args }
 *
 * Runs one server-side computation (see server/compute.js for the allow-list)
 * and streams newline-delimited JSON back: callback invocations and client
 * effects as they happen, then a final {t:"result"} or {t:"error"} line.
 */
const { checkRateLimit } = require("./_lib/rateLimit");

const MAX_BODY_BYTES = 4 * 1024 * 1024;

let computePromise = null;
function loadCompute() {
  if (!computePromise) computePromise = import("../server/compute.js");
  return computePromise;
}

function jsonReplacer(_key, value) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return Array.from(value);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return Array.from(value);
  if (typeof value === "bigint") return Number(value);
  return value;
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(JSON.parse(req.body || "{}"));
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request too large."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch (err) {
        reject(Object.assign(new Error("Invalid JSON body."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "POST required" }));
    return;
  }

  let body;
  let compute;
  try {
    [body, compute] = await Promise.all([readBody(req), loadCompute()]);
  } catch (err) {
    res.statusCode = err?.status || 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err?.message || "Server error." }));
    return;
  }

  if (!compute.hasOp(body?.op)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unknown operation." }));
    return;
  }

  const limit = checkRateLimit(req, body.op);
  if (!limit.allowed) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.end(
      JSON.stringify({
        error: `Rate limit reached (${limit.reason}) Please wait ${limit.retryAfterSeconds}s and try again.`,
      })
    );
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");

  const controller = new AbortController();
  let finished = false;
  res.on("close", () => {
    if (!finished) controller.abort();
  });

  const emit = (msg) => {
    if (res.writableEnded) return;
    let line;
    try {
      line = JSON.stringify(msg, jsonReplacer);
    } catch (err) {
      line = JSON.stringify({ t: "error", error: { message: `Unserializable server response: ${err.message}` } });
    }
    res.write(`${line}\n`);
    if (typeof res.flush === "function") res.flush();
  };

  await compute.runOp(body.op, body.args, { emit, signal: controller.signal });
  finished = true;
  res.end();
}

module.exports = handler;
