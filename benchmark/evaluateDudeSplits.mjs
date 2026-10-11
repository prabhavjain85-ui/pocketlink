#!/usr/bin/env node
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const dir = dirname(fileURLToPath(import.meta.url));
const env = {
  ...process.env,
  HELDOUT_BENCHMARK_PATH: join(dir, "dude_heldout_eval.json"),
  HELDOUT_RESULTS_JSON: join(dir, "dude_split_results.json"),
  HELDOUT_RESULTS_MD: join(dir, "DUDE_SPLIT_RESULTS.md"),
  HELDOUT_RESULTS_TITLE: "DUD-E held-out benchmark (cluster headline)",
};
const r = spawnSync("node", [join(dir, "evaluateHeldoutSplits.mjs")], {
  env,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
