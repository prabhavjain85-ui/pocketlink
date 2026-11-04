/**
 * Compound libraries available to screen a staged target against.
 *
 * Each library is a committed JSON snapshot under server/data, loaded once per
 * server instance and cached. Nothing is fetched from an external API at
 * request time, so a screen cannot silently change because someone else's
 * database changed.
 *
 * Record shape is the same for every library, matching approvedDrugs.js:
 *   { id, name, cid, smiles, indication, class, mw, xlogp, hbd, hba, rot, tpsa }
 */
import { ensureApprovedDrugsLoaded, loadApprovedDrugs, APPROVED_DRUG_LIBRARY_COUNT } from "./approvedDrugs.js";
import { nodeRequire } from "./nodeRequire.js";

const CLINICAL_URL = `${process.env.PUBLIC_URL || ""}/data/clinicalLibrary.json`;

export const DEFAULT_LIBRARY_ID = "approved";

let clinicalCache = null;
let clinicalPromise = null;

async function loadClinicalLibrary() {
  if (clinicalCache) return clinicalCache;
  if (!clinicalPromise) {
    clinicalPromise = (async () => {
      let payload;
      try {
        const res = await fetch(CLINICAL_URL);
        if (!res.ok) throw new Error(`Failed to load clinical compound library (${res.status})`);
        payload = await res.json();
      } catch (err) {
        if (typeof globalThis.fetch?.mock === "object") throw err;
        const req = nodeRequire();
        const fs = req("fs");
        const path = req("path");
        const file = path.join(process.cwd(), "server", "data", "clinicalLibrary.json");
        payload = JSON.parse(fs.readFileSync(file, "utf8"));
      }
      const rows = Array.isArray(payload?.compounds) ? payload.compounds : [];
      clinicalCache = { rows, meta: payload };
      return clinicalCache;
    })().catch((err) => {
      clinicalPromise = null;
      throw err;
    });
  }
  return clinicalPromise;
}

/**
 * Registry. `count` is a committed estimate for UI before the fetch resolves;
 * the loader reports the real number once the snapshot is in memory.
 */
const LIBRARIES = {
  approved: {
    id: "approved",
    label: "Approved drugs",
    description: "Curated marketed small-molecule drugs, each with an approved indication.",
    source: "Curated from ChEMBL approved drugs plus supplemental entries",
    license: "ChEMBL data is released under CC BY-SA 3.0",
    approxCount: APPROVED_DRUG_LIBRARY_COUNT,
    async load() {
      await ensureApprovedDrugsLoaded();
      return { rows: loadApprovedDrugs(), meta: null };
    },
  },
  clinical: {
    id: "clinical",
    label: "Clinical-stage compounds",
    description:
      "Small molecules that reached Phase 2 or beyond, one entry per base drug name. Includes the approved set.",
    source: "ChEMBL REST API (EMBL-EBI)",
    license: "ChEMBL data is released under CC BY-SA 3.0",
    approxCount: 9409,
    load: loadClinicalLibrary,
  },
};

export function hasLibrary(id) {
  return Object.prototype.hasOwnProperty.call(LIBRARIES, String(id || ""));
}

export function resolveLibraryId(id) {
  const key = String(id || "").trim() || DEFAULT_LIBRARY_ID;
  return hasLibrary(key) ? key : DEFAULT_LIBRARY_ID;
}

/** Catalogue for the library picker. Does not load any compounds. */
export function listCompoundLibraries() {
  return Object.values(LIBRARIES).map((lib) => ({
    id: lib.id,
    label: lib.label,
    description: lib.description,
    source: lib.source,
    license: lib.license,
    approxCount: lib.approxCount,
  }));
}

/**
 * @returns {Promise<{id, label, rows, meta}>} compound rows for the library
 */
export async function loadCompoundLibrary(id) {
  const key = resolveLibraryId(id);
  const lib = LIBRARIES[key];
  const { rows, meta } = await lib.load();
  return {
    id: key,
    label: lib.label,
    source: lib.source,
    license: lib.license,
    generatedAt: meta?.generatedAt || null,
    selection: meta?.selection || null,
    rows: Array.isArray(rows) ? rows : [],
    meta,
  };
}
