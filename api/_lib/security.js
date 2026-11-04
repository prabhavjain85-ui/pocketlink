/**
 * Shared CORS origin validation and request schema helpers for /api/* routes.
 * Replaces permissive Access-Control-Allow-Origin: "*" with an explicit origin allowlist.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  "https://www.targetforge.in",
  "https://targetforge.in",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function isOriginAllowed(origin) {
  if (!origin) return true; // Same-origin or server-to-server/test invocation without Origin header
  const allowed = getAllowedOrigins();
  if (allowed.has(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (
      parsed.hostname.endsWith(".targetforge.in") ||
      parsed.hostname.endsWith(".vercel.app") ||
      parsed.hostname.endsWith(".ai.studio") ||
      parsed.hostname.endsWith(".run.app") ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1"
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function resolveAllowedOriginHeader(req) {
  const origin = req?.headers?.origin;
  if (!origin) return DEFAULT_ALLOWED_ORIGINS[0];
  return isOriginAllowed(origin) ? origin : "null";
}

function applyCorsHeaders(req, res, methods = "POST, OPTIONS") {
  const allowOrigin = resolveAllowedOriginHeader(req);
  if (typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", methods);
  }
  return allowOrigin !== "null";
}

function validateComputePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false, error: "Request body must be a JSON object." };
  }
  if (typeof body.op !== "string" || !body.op.trim() || body.op.length > 80) {
    return { valid: false, error: "Invalid or missing operation name." };
  }
  if (body.args !== undefined && !Array.isArray(body.args)) {
    return { valid: false, error: "'args' must be an array when provided." };
  }
  return { valid: true };
}

module.exports = {
  isOriginAllowed,
  resolveAllowedOriginHeader,
  applyCorsHeaders,
  validateComputePayload,
};
