#!/usr/bin/env node
/**
 * Build historical ClinicalTrials.gov trial completion base rates.
 *
 * Re-run monthly (or after major CT.gov data refreshes):
 *   node scripts/build-trial-success-rates.mjs
 *   npm run build:trial-rates
 *
 * Fetches interventional drug trials via API v2, aggregates completion rates
 * by phase for configured target/compound-class search terms, and writes
 * server/data/trialSuccessRates.json (committed artifact — not fetched at runtime).
 *
 * Metric: completion_rate = COMPLETED / (COMPLETED + TERMINATED + WITHDRAWN + SUSPENDED)
 * Excludes RECRUITING, ACTIVE_NOT_RECRUITING, UNKNOWN, etc. from the denominator.
 *
 * CT.gov "Completed" ≠ clinical efficacy or FDA approval. These are historical
 * non-early-termination completion base rates for similar trial classes.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "../server/data/trialSuccessRates.json");

const API_BASE = "https://clinicaltrials.gov/api/v2/studies";
const PAGE_SIZE = 100;
const DELAY_MS = 300;
const MAX_PAGES_PER_CATEGORY = 50; // up to 5,000 studies per category
const MIN_SAMPLE_SIZE = 10;
const REPORT_PHASES = ["PHASE1", "PHASE2", "PHASE3"];

const DENOMINATOR_STATUSES = new Set([
  "COMPLETED",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
]);

const CATEGORIES = [
  { key: "kinase_inhibitor", label: "Kinase inhibitors", query: "kinase inhibitor" },
  { key: "kinase_broad", label: "Tyrosine kinase inhibitors (broad)", query: "tyrosine kinase inhibitor" },
  { key: "egfr", label: "EGFR inhibitors", query: "EGFR inhibitor" },
  { key: "her2", label: "HER2 / ERBB2 inhibitors", query: "HER2 inhibitor" },
  { key: "abl", label: "ABL / BCR-ABL inhibitors", query: "BCR-ABL inhibitor" },
  { key: "braf", label: "BRAF inhibitors", query: "BRAF inhibitor" },
  { key: "gpcr", label: "GPCR-targeted drugs", query: "G protein-coupled receptor" },
  { key: "beta2_adrenergic", label: "Beta-2 adrenergic drugs", query: "beta-2 adrenergic" },
  { key: "protease_inhibitor", label: "Protease inhibitors", query: "protease inhibitor" },
  { key: "hiv_protease", label: "HIV protease inhibitors", query: "HIV protease inhibitor" },
  { key: "hdac_inhibitor", label: "HDAC inhibitors", query: "HDAC inhibitor" },
  { key: "pde5_inhibitor", label: "PDE5 inhibitors", query: "PDE5 inhibitor" },
  { key: "cox_inhibitor", label: "COX / NSAID drugs", query: "cyclooxygenase inhibitor" },
  { key: "statin", label: "HMG-CoA reductase inhibitors (statins)", query: "statin HMG-CoA reductase" },
  { key: "dpp4_inhibitor", label: "DPP-4 inhibitors", query: "DPP-4 inhibitor" },
  { key: "estrogen_receptor", label: "Estrogen receptor modulators", query: "estrogen receptor" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyPhaseBuckets() {
  const buckets = {};
  for (const phase of REPORT_PHASES) {
    buckets[phase] = {
      completed: 0,
      terminated: 0,
      withdrawn: 0,
      suspended: 0,
      n: 0,
      rate: null,
      reliable: false,
    };
  }
  return buckets;
}

function addStudy(buckets, study) {
  const proto = study?.protocolSection || {};
  const status = proto.statusModule?.overallStatus || "";
  if (!DENOMINATOR_STATUSES.has(status)) return;

  const phases = proto.designModule?.phases || [];
  const phase = phases.find((p) => REPORT_PHASES.includes(p));
  if (!phase) return;

  const bucket = buckets[phase];
  bucket.n += 1;
  if (status === "COMPLETED") bucket.completed += 1;
  else if (status === "TERMINATED") bucket.terminated += 1;
  else if (status === "WITHDRAWN") bucket.withdrawn += 1;
  else if (status === "SUSPENDED") bucket.suspended += 1;
}

function finalizeBuckets(buckets) {
  for (const phase of REPORT_PHASES) {
    const bucket = buckets[phase];
    if (bucket.n >= MIN_SAMPLE_SIZE) {
      bucket.rate = bucket.completed / bucket.n;
      bucket.reliable = true;
    } else {
      bucket.rate = bucket.n > 0 ? bucket.completed / bucket.n : null;
      bucket.reliable = false;
    }
    bucket.rate = bucket.rate != null ? Math.round(bucket.rate * 1000) / 1000 : null;
  }
  return buckets;
}

async function fetchCategoryStudies(query) {
  const filterAdvanced = "AREA[StudyType]Interventional AND AREA[InterventionType]Drug";
  let pageToken = null;
  let page = 0;
  let fetched = 0;
  const buckets = emptyPhaseBuckets();

  while (page < MAX_PAGES_PER_CATEGORY) {
    const params = new URLSearchParams({
      "query.term": query,
      "filter.advanced": filterAdvanced,
      pageSize: String(PAGE_SIZE),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `${API_BASE}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClinicalTrials.gov API ${res.status} for query "${query}"`);
    }
    const data = await res.json();
    const studies = data?.studies || [];
    for (const study of studies) addStudy(buckets, study);
    fetched += studies.length;
    page += 1;

    pageToken = data?.nextPageToken || null;
    if (!pageToken || studies.length === 0) break;
    await sleep(DELAY_MS);
  }

  return { fetched, phases: finalizeBuckets(buckets) };
}

async function main() {
  console.log(`Building trial success rates for ${CATEGORIES.length} categories…`);
  const categories = {};

  for (const cat of CATEGORIES) {
    console.log(`  → ${cat.key} ("${cat.query}")`);
    const { fetched, phases } = await fetchCategoryStudies(cat.query);
    categories[cat.key] = {
      label: cat.label,
      query: cat.query,
      fetched,
      phases,
    };
    const summary = REPORT_PHASES
      .map((p) => {
        const b = phases[p];
        return `${p}: n=${b.n}${b.reliable ? `, ${(b.rate * 100).toFixed(1)}%` : ""}`;
      })
      .join("; ");
    console.log(`     fetched ${fetched} · ${summary}`);
    await sleep(DELAY_MS);
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    source: "ClinicalTrials.gov API v2",
    metric: "trial_completion_rate",
    definition: "COMPLETED/(COMPLETED+TERMINATED+WITHDRAWN+SUSPENDED)",
    minSampleSize: MIN_SAMPLE_SIZE,
    disclaimer:
      "Historical trial completion (non-early-termination) base rate for similar class/phase. CT.gov Completed status does not imply clinical efficacy or regulatory approval.",
    categories,
  };

  writeFileSync(OUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
