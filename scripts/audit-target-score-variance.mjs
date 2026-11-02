/**
 * Target Selection Score variance audit.
 *
 * The score splits 100 points as resolution 25, completeness 25, ligand 20,
 * pocket 15, method 15. If most deposited structures look alike on an axis,
 * that axis spends points without separating anything. This samples real PDB
 * entries and reports how much each axis actually varies, so the weights can
 * be set from evidence instead of intuition.
 *
 *   node scripts/audit-target-score-variance.mjs [sampleSize]
 */
import "../server/runtime.js";

const { rcsbSearch } = await import("../server/rcsbCocrystalSearch.js");
const { fetchAndScoreTargets, WEIGHTS } = await import("../server/targetSelectionScore.js");

const SAMPLE = Number(process.argv[2]) || 300;
const BATCH = 25;

const AXES = [
  { key: "resolution", label: "Resolution", max: WEIGHTS.resolution },
  { key: "completeness", label: "Completeness", max: WEIGHTS.completeness },
  { key: "ligand", label: "Ligand", max: WEIGHTS.ligand },
  { key: "pocket", label: "Pocket", max: WEIGHTS.pocket },
  { key: "method", label: "Method", max: WEIGHTS.method },
];

function stats(values) {
  const n = values.length;
  if (!n) return { mean: 0, sd: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, sd: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

console.log(`Sampling ${SAMPLE} PDB entries...`);
// Any broad query works; the point is a cross-section of deposited entries,
// not a curated set. Sorting by release date keeps it reproducible-ish.
const search = await rcsbSearch({
  query: {
    type: "terminal",
    service: "text",
    parameters: { attribute: "rcsb_entry_info.polymer_entity_count_protein", operator: "greater", value: 0 },
  },
  return_type: "entry",
  request_options: {
    paginate: { start: 0, rows: SAMPLE },
    results_content_type: ["experimental"],
    sort: [{ sort_by: "rcsb_accession_info.initial_release_date", direction: "desc" }],
  },
});

const ids = (search?.result_set || []).map((r) => r.identifier).filter(Boolean);
if (!ids.length) {
  console.error("RCSB returned no entries; cannot audit.");
  process.exit(1);
}

const scored = [];
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH);
  try {
    scored.push(...(await fetchAndScoreTargets(batch)));
  } catch (err) {
    console.warn(`  batch ${i / BATCH + 1} failed: ${err.message}`);
  }
  process.stdout.write(`\r  scored ${scored.length}/${ids.length}`);
}
console.log("");

if (!scored.length) {
  console.error("No structures could be scored.");
  process.exit(1);
}

const totals = scored.map((s) => Number(s.score) || 0);
const totalStats = stats(totals);
console.log(`\nScored ${scored.length} structures.`);
console.log(`Total score: mean ${totalStats.mean.toFixed(1)}  sd ${totalStats.sd.toFixed(1)}  range ${totalStats.min}–${totalStats.max}\n`);

const totalVariance = totalStats.sd ** 2 || 1;
console.log("axis          weight   mean    sd     range      share of spread");
for (const axis of AXES) {
  const values = scored.map((s) => Number(s.breakdown?.[axis.key]) || 0);
  const st = stats(values);
  const share = ((st.sd ** 2) / totalVariance) * 100;
  console.log(
    `${axis.label.padEnd(13)} ${String(axis.max).padStart(5)}   ${st.mean.toFixed(1).padStart(5)}  ${st.sd
      .toFixed(2)
      .padStart(5)}   ${st.min.toFixed(1).padStart(4)}–${st.max.toFixed(1).padEnd(5)} ${share.toFixed(1).padStart(5)}%`
  );
}

console.log(
  "\nAn axis with a near-zero sd assigns the same points to almost every structure:\n" +
    "its weight is spent without changing any ranking. Consider rescaling it, or\n" +
    "replacing it with something that varies across real deposited entries."
);
