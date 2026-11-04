#!/usr/bin/env node
/**
 * Build historical ClinicalTrials.gov phase transition rates and trial
 * completion rates by drug intervention list.
 *
 * Re-run manually when refreshing committed ClinicalTrials.gov statistics:
 *   node scripts/build-trial-success-rates.mjs
 *   npm run build:trial-rates
 *
 * Queries interventional drug trials via ClinicalTrials.gov API v2 using
 * `query.intr` with the curated on-target drug list from TARGET_RULES, filters
 * fetched studies so only trials whose listed interventions actually match one
 * of those drugs (case-insensitive, ignoring salt forms) are kept, and writes
 * server/data/trialSuccessRates.json.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  SCHEMA_VERSION,
  MIN_SAMPLE_SIZE,
  CENSOR_YEARS,
  CATEGORY_SPECS,
  LIMITATION_NOTE,
  getCategoryDrugList,
  summarizeCategoryStudies,
} from "../server/trialSuccessContext.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../server/data/trialSuccessRates.json");

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 1000;
const DELAY_MS = 300;
const MAX_PAGES_PER_CATEGORY = 10; // up to 10,000 studies per category
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildInterventionQuery(drugs) {
  return drugs
    .map((d) => {
      const trimmed = String(d || "").trim();
      return /[\s-]/.test(trimmed) ? `"${trimmed}"` : trimmed;
    })
    .join(" OR ");
}

async function fetchWithRetry(url, label) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        attempt += 1;
        const backoffMs = DELAY_MS * Math.pow(2, attempt);
        console.warn(`  [retry ${attempt}/${MAX_RETRIES}] HTTP ${res.status} for ${label}; waiting ${backoffMs}ms…`);
        await sleep(backoffMs);
        continue;
      }
      throw new Error(`ClinicalTrials.gov API ${res.status} for ${label}`);
    } catch (err) {
      if (attempt < MAX_RETRIES && !String(err.message || "").includes("API 4")) {
        attempt += 1;
        const backoffMs = DELAY_MS * Math.pow(2, attempt);
        console.warn(`  [retry ${attempt}/${MAX_RETRIES}] ${err.message}; waiting ${backoffMs}ms…`);
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
}

async function fetchCategoryRawStudies(intrQuery, label) {
  const filterAdvanced = "AREA[StudyType]Interventional AND AREA[InterventionType]Drug";
  const fields = "NCTId,IdentificationModule,StatusModule,DesignModule,ConditionsModule,ArmsInterventionsModule";
  let pageToken = null;
  let page = 0;
  const studies = [];
  const seenNctIds = new Set();

  while (page < MAX_PAGES_PER_CATEGORY) {
    const params = new URLSearchParams({
      "query.intr": intrQuery,
      "filter.advanced": filterAdvanced,
      fields,
      pageSize: String(PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${API_BASE}?${params.toString()}`;
    const data = await fetchWithRetry(url, label);
    const batch = data?.studies || [];
    for (const study of batch) {
      const nctId = study?.protocolSection?.identificationModule?.nctId;
      if (nctId) {
        if (seenNctIds.has(nctId)) continue;
        seenNctIds.add(nctId);
      }
      studies.push(study);
    }
    page += 1;

    pageToken = data?.nextPageToken || null;
    await sleep(DELAY_MS);
    if (!pageToken || batch.length === 0) break;
  }

  return studies;
}

async function main() {
  const generatedAt = new Date().toISOString();
  console.log(`Building historical trial transition & completion rates for ${CATEGORY_SPECS.length} categories…`);
  const categories = {};

  for (const spec of CATEGORY_SPECS) {
    const drugs = getCategoryDrugList(spec.key);
    const intrQuery = buildInterventionQuery(drugs);
    console.log(`  → ${spec.key} (${drugs.length} drugs: ${drugs.join(", ")})`);

    const rawStudies = await fetchCategoryRawStudies(intrQuery, spec.key);
    const summary = summarizeCategoryStudies(rawStudies, drugs, {
      generatedAt,
      minSampleSize: MIN_SAMPLE_SIZE,
      censorYears: CENSOR_YEARS,
    });

    categories[spec.key] = {
      label: spec.label,
      query: intrQuery,
      drugs: summary.drugs,
      fetched: summary.fetched,
      kept: summary.kept,
      discarded: summary.discarded,
      transitions: summary.transitions,
      completion: summary.completion,
      phases: summary.phases,
      byDiseaseArea: summary.byDiseaseArea,
    };

    const t1 = summary.transitions.PHASE1;
    const t2 = summary.transitions.PHASE2;
    const c1 = summary.completion.PHASE1;
    const c2 = summary.completion.PHASE2;
    const c3 = summary.completion.PHASE3;
    console.log(
      `     fetched=${summary.fetched}, kept=${summary.kept}, discarded=${summary.discarded} | ` +
        `transitions Ph1→2+: ${t1.numerator}/${t1.denominator} (censored=${t1.censored}), Ph2→3+: ${t2.numerator}/${t2.denominator} (censored=${t2.censored}) | ` +
        `completion Ph1=${c1.completed}/${c1.n}, Ph2=${c2.completed}/${c2.n}, Ph3=${c3.completed}/${c3.n}, Combined=${summary.completion.COMBINED.completed}/${summary.completion.COMBINED.n}`
    );
  }

  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: "ClinicalTrials.gov API v2",
    metric: "phase_transition_and_trial_completion",
    definition: {
      phaseTransition:
        "Fraction of on-target drugs with Phase k trials that also have at least one trial at Phase > k (drugs without advancement whose latest Phase-k trial started within 3 years are right-censored). Phase 3 → approval is not measurable from ClinicalTrials.gov.",
      trialCompletion:
        "COMPLETED / (COMPLETED + TERMINATED + WITHDRAWN + SUSPENDED), with separate combined-phase bucket, whyStopped classification (efficacy, safety, operational, unknown), excluding-operational completion rate, and UNKNOWN-status sensitivity rate.",
    },
    minSampleSize: MIN_SAMPLE_SIZE,
    censorYears: CENSOR_YEARS,
    disclaimer: LIMITATION_NOTE,
    categories,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
