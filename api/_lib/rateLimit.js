/**
 * Per-client rate limiting for the compute endpoint.
 *
 * Best-effort only: serverless instances are ephemeral and run in parallel, so
 * counters are per-instance, not global. A determined caller spread across many
 * cold starts can exceed these numbers. This stops casual loops and accidental
 * retry storms; a shared store (Upstash/Redis) is the upgrade if abuse appears.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
// Long jobs (library screens, evolution campaigns) are capped harder because each
// one can hold a function for minutes.
const HEAVY_OPS = new Set(["screenApprovedLibrary", "runEvolutionCampaign", "runMolecularDocking"]);
const MAX_HEAVY_PER_WINDOW = 15;
const MAX_TRACKED_CLIENTS = 5000;

const hits = new Map();

function clientKey(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown";
}

function prune(now) {
  for (const [key, entry] of hits) {
    if (now - entry.start >= WINDOW_MS) hits.delete(key);
  }
  // Hard bound on memory if pruning cannot keep up with a burst of unique callers.
  if (hits.size > MAX_TRACKED_CLIENTS) {
    const excess = hits.size - MAX_TRACKED_CLIENTS;
    let removed = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/**
 * @returns {{ allowed: boolean, retryAfterSeconds?: number, reason?: string }}
 */
function checkRateLimit(req, op) {
  const now = Date.now();
  prune(now);

  const key = clientKey(req);
  let entry = hits.get(key);
  if (!entry || now - entry.start >= WINDOW_MS) {
    entry = { start: now, total: 0, heavy: 0 };
    hits.set(key, entry);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.start + WINDOW_MS - now) / 1000));
  const isHeavy = HEAVY_OPS.has(op);

  if (entry.total >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds, reason: `More than ${MAX_REQUESTS_PER_WINDOW} requests per minute.` };
  }
  if (isHeavy && entry.heavy >= MAX_HEAVY_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds,
      reason: `More than ${MAX_HEAVY_PER_WINDOW} long-running jobs per minute.`,
    };
  }

  entry.total += 1;
  if (isHeavy) entry.heavy += 1;
  return { allowed: true };
}

module.exports = {
  checkRateLimit,
  __testing: { WINDOW_MS, MAX_REQUESTS_PER_WINDOW, MAX_HEAVY_PER_WINDOW, reset: () => hits.clear() },
};
