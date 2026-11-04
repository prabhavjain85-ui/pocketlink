#!/usr/bin/env node
/**
 * Build the clinical-stage compound library from ChEMBL.
 *
 * Re-run when you want a fresher snapshot:
 *   node scripts/build-clinical-library.mjs
 *
 * Scope: small molecules that reached Phase 3 or approval (max_phase >= 3).
 * That is a defined, checkable set — not "all drugs" — and it is a superset of
 * the curated approved library already shipped in approvedDrugs.json.
 *
 * Writes public/data/clinicalLibrary.json. Nothing is fetched at request time;
 * the app only ever reads this committed snapshot.
 *
 * ChEMBL data is released under CC BY-SA 3.0. Keep the attribution in the
 * artifact's `license` field if you redistribute it.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../public/data/clinicalLibrary.json");

const API = "https://www.ebi.ac.uk/chembl/api/data/molecule.json";
const PAGE_SIZE = 1000;
const MIN_PHASE = 2;
const DELAY_MS = 250;
// Guard rails: anything outside these is not a useful small-molecule entry.
const MIN_MW = 100;
const MAX_MW = 900;

const SALT_WORDS =
  /\b(HYDROCHLORIDE|DIHYDROCHLORIDE|HYDROBROMIDE|MESYLATE|BESYLATE|TOSYLATE|SODIUM|POTASSIUM|CALCIUM|MAGNESIUM|TARTRATE|BITARTRATE|MALEATE|FUMARATE|SUCCINATE|CITRATE|SULFATE|SULPHATE|ACETATE|PHOSPHATE|NITRATE|BROMIDE|CHLORIDE|IODIDE|OXALATE|LACTATE|GLUCONATE|PAMOATE|STEARATE|TRIHYDRATE|DIHYDRATE|MONOHYDRATE|HYDRATE|ANHYDROUS)\b/g;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(SALT_WORDS, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function cleanChemblName(raw) {
  // ChEMBL encodes Greek letters as ".Alpha." / ".Beta." inside names.
  return String(raw || "")
    .replace(/.(alpha|beta|gamma|delta|omega|epsilon|iota|tau)./gi, (_m, g) => g.charAt(0).toUpperCase() + g.slice(1).toLowerCase() + "-")
    .replace(/^[.-s]+/, "")
    .replace(/s{2,}/g, " ")
    .trim();
}

function titleCase(str) {
  const s = cleanChemblName(str);
  if (!s) return "";
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) return s;
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Reject mixtures, salts written as components, and obviously non-organic entries. */
function usableStructure(smiles) {
  const s = String(smiles || "").trim();
  if (!s || s.length < 3) return false;
  if (s.includes(".")) return false; // multi-component: salt or mixture
  if (!/[Cc]/.test(s)) return false;
  let paren = 0;
  let bracket = 0;
  for (const ch of s) {
    if (ch === "(") paren++;
    else if (ch === ")") paren--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (paren < 0 || bracket < 0) return false;
  }
  return paren === 0 && bracket === 0;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    max_phase__gte: String(MIN_PHASE),
    molecule_type: "Small molecule",
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const url = `${API}?${params}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "TargetForge/1.0" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw err;
      await sleep(attempt * 1500);
    }
  }
  return null;
}

function toRecord(mol) {
  const smiles = mol?.molecule_structures?.canonical_smiles;
  if (!usableStructure(smiles)) return null;

  const name = titleCase(mol.pref_name);
  if (!name) return null;

  const props = mol.molecule_properties || {};
  const mw = num(props.full_mwt) ?? num(props.mw_freebase);
  if (mw === null || mw < MIN_MW || mw > MAX_MW) return null;

  // ATC level-4 description is the closest thing ChEMBL gives to a drug class.
  const atc = Array.isArray(mol.atc_classifications) ? mol.atc_classifications : [];
  const phase = num(mol.max_phase);

  return {
    id: mol.molecule_chembl_id,
    name,
    cid: mol.molecule_chembl_id,
    chemblId: mol.molecule_chembl_id,
    smiles: smiles.trim(),
    indication: phase === 4 ? "Approved small-molecule drug" : `Reached clinical phase ${phase ?? "3+"}`,
    class: atc.length ? String(atc[0]) : "",
    maxPhase: phase,
    mw: Math.round(mw * 10) / 10,
    xlogp: num(props.alogp),
    hbd: num(props.hbd),
    hba: num(props.hba),
    rot: num(props.rtb),
    tpsa: num(props.psa),
  };
}

async function main() {
  console.log(`Fetching ChEMBL small molecules with max_phase >= ${MIN_PHASE}...`);
  const byName = new Map();
  let offset = 0;
  let total = Infinity;
  let seen = 0;
  let rejected = 0;

  while (offset < total) {
    const page = await fetchPage(offset);
    if (!page) break;
    total = page.page_meta?.total_count ?? 0;
    const molecules = page.molecules || [];
    if (!molecules.length) break;

    for (const mol of molecules) {
      seen += 1;
      const record = toRecord(mol);
      if (!record) {
        rejected += 1;
        continue;
      }
      // Keep one entry per base drug name, preferring the later clinical phase.
      const key = normalizeName(record.name);
      const existing = byName.get(key);
      if (!existing || (record.maxPhase ?? 0) > (existing.maxPhase ?? 0)) byName.set(key, record);
    }

    offset += molecules.length;
    process.stdout.write(`\r  ${Math.min(offset, total)}/${total} scanned, ${byName.size} kept`);
    await sleep(DELAY_MS);
  }
  console.log("");

  const compounds = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const artifact = {
    schemaVersion: 1,
    id: "clinical",
    label: "Clinical-stage compounds (ChEMBL)",
    description: `Small molecules that reached Phase ${MIN_PHASE} or approval, one entry per base drug name.`,
    source: "ChEMBL REST API (EMBL-EBI)",
    license: "ChEMBL data is released under CC BY-SA 3.0",
    generatedAt: new Date().toISOString(),
    selection: {
      maxPhaseAtLeast: MIN_PHASE,
      moleculeType: "Small molecule",
      molecularWeightRange: [MIN_MW, MAX_MW],
      excluded: "multi-component SMILES (salts and mixtures), entries without a preferred name",
    },
    counts: { scanned: seen, rejected, kept: compounds.length },
    compounds,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 0)}\n`, "utf8");
  const phases = compounds.reduce((acc, c) => {
    acc[c.maxPhase] = (acc[c.maxPhase] || 0) + 1;
    return acc;
  }, {});
  console.log(`scanned ${seen}, rejected ${rejected}, kept ${compounds.length}`);
  console.log("by phase:", JSON.stringify(phases));
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
