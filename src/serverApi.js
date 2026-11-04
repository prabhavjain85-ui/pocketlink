/**
 * Browser bridge to server-side computation (api/compute.js).
 *
 * All scoring, screening and analysis code lives in server/ and never ships to
 * the browser. Each export here keeps the signature the UI already used, but
 * runs the work on the server:
 *   - function arguments (onProgress, onStepUpdate, ...) become callback markers;
 *     the server streams their invocations back and they fire here.
 *   - an AbortSignal (top-level or `options.signal`) cancels the request.
 *   - errors keep their message, name and code.
 */
import { saveHistoryEntry, setActiveState } from "./historyService";

const ENDPOINT = "/api/compute";

const CLIENT_EFFECTS = { saveHistoryEntry, setActiveState };

function isAbortSignal(value) {
  return typeof AbortSignal !== "undefined" && value instanceof AbortSignal;
}

/** Replace functions and AbortSignals (top level + one level into option objects). */
function encodeArgs(args) {
  const callbacks = [];
  let signal = null;

  const encodeValue = (value) => {
    if (typeof value === "function") {
      callbacks.push(value);
      return { __cb: callbacks.length - 1 };
    }
    if (isAbortSignal(value)) {
      signal = value;
      return { __signal: true };
    }
    return value;
  };

  const encoded = args.map((arg) => {
    if (arg && typeof arg === "object" && !Array.isArray(arg) && !isAbortSignal(arg)) {
      const out = {};
      for (const [k, v] of Object.entries(arg)) {
        if (v === undefined) continue;
        out[k] = encodeValue(v);
      }
      return out;
    }
    return encodeValue(arg);
  });

  return { encoded, callbacks, signal };
}

function toError(payload) {
  const err = new Error(payload?.message || "Server computation failed.");
  if (payload?.name) err.name = payload.name;
  if (payload?.code) err.code = payload.code;
  if (payload?.status) err.status = payload.status;
  return err;
}

export async function callServer(op, ...args) {
  const { encoded, callbacks, signal } = encodeArgs(args);
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, args: encoded }),
      signal: signal || undefined,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new Error("Could not reach the TargetForge server. Check your connection and try again.");
  }

  if (!response.ok || !response.body) {
    let message = `Server computation failed (${response.status}).`;
    try {
      const data = await response.json();
      if (data?.error) message = typeof data.error === "string" ? data.error : data.error.message || message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let settled = false;
  let result;

  const handleLine = (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    if (msg.t === "cb") {
      const fn = callbacks[msg.id];
      if (fn) fn(...(msg.args || []));
    } else if (msg.t === "effect") {
      const fn = CLIENT_EFFECTS[msg.name];
      if (fn) fn(...(msg.args || []));
    } else if (msg.t === "result") {
      settled = true;
      result = msg.value;
    } else if (msg.t === "error") {
      settled = true;
      throw toError(msg.error);
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
      nl = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);

  if (!settled) {
    if (signal?.aborted) {
      const err = new Error("The request was cancelled.");
      err.name = "AbortError";
      throw err;
    }
    throw new Error("The server stopped before finishing. The computation may have timed out — try a smaller run.");
  }
  return result;
}

const remote =
  (op) =>
  (...args) =>
    callServer(op, ...args);

// Staging bench
export const searchPdbTargets = remote("searchPdbTargets");
export const checkPainsBatch = remote("checkPainsBatch");
export const rankCandidates = remote("rankCandidates");
export const searchPubchemCompound = remote("searchPubchemCompound");
export const fetchPubchemPngDataUrl = remote("fetchPubchemPngDataUrl");
export const fetchStructureCoordinates = remote("fetchStructureCoordinates");
export const getEvolutionSeedPicks = remote("getEvolutionSeedPicks");

// Target discovery
export const searchDiseases = remote("searchDiseases");
export const runTargetDiscovery = remote("runTargetDiscovery");
export const getTargetExpressionProfile = remote("getTargetExpressionProfile");

// Compound libraries
export const listCompoundLibraries = remote("listCompoundLibraries");

// Repurposing / library screening
export const screenApprovedLibrary = remote("screenApprovedLibrary");
export const getDrugSafetyProfiles = remote("getDrugSafetyProfiles");
export const getTrialSuccessContext = remote("getTrialSuccessContext");

// ADME
export const calculateAdmeProperties = remote("calculateAdmeProperties");

// Evolution & structure depiction
export const runEvolutionCampaign = remote("runEvolutionCampaign");
export const probeSaScoreSupport = remote("probeSaScoreSupport");
export const probeReactionSupport = remote("probeReactionSupport");
export const renderMolSvg = remote("renderMolSvg");
export const renderMolSvgs = remote("renderMolSvgs");
export const noveltyForSmiles = remote("noveltyForSmiles");

// Docking & co-crystal analysis
export const fetchPdbFromRcsb = remote("fetchPdbFromRcsb");
export const runMolecularDocking = remote("runMolecularDocking");
export const fetchDockingRunCocrystalContext = remote("fetchDockingRunCocrystalContext");
export const analyzeExperimentalCocrystal = remote("analyzeExperimentalCocrystal");
export const resolveCocrystalSearchQuery = remote("resolveCocrystalSearchQuery");
export const searchPdbEntriesForChemComp = remote("searchPdbEntriesForChemComp");

// Hypothesis testing
export const parseHypothesisApi = remote("parseHypothesisApi");
export const evaluateHypothesisApi = remote("evaluateHypothesisApi");
