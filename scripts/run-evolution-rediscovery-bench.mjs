#!/usr/bin/env node
/**
 * Run full rediscovery benchmark (not smoke) and write benchmark/evolution/results/rediscovery.json
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function main() {
  process.env.CI = "true";
  const { runRediscoveryBenchmark } = require("../src/benchmark/evolutionRediscovery.js");
  const baseline = await runRediscoveryBenchmark({ smoke: false, ligandHypothesis: false });
  const withLigand = await runRediscoveryBenchmark({ smoke: false, ligandHypothesis: true });
  const ligandHelps =
    withLigand.summary?.meanEnrichment != null &&
    baseline.summary?.meanEnrichment != null &&
    withLigand.summary.meanEnrichment > baseline.summary.meanEnrichment &&
    (withLigand.summary.ci95?.[0] ?? -Infinity) > 0;
  const payload = {
    generated_at: new Date().toISOString(),
    baseline,
    withLigandHypothesis: withLigand,
    ligandHypothesisAddedToProduct: ligandHelps,
    ligandDecision: ligandHelps
      ? "Ligand-based hypothesis term improved enrichment lower CI above zero."
      : "Ligand-based hypothesis term not added — no clear enrichment gain over baseline.",
  };
  const outPath = path.join(process.cwd(), "benchmark/evolution/results/rediscovery.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log("Wrote", outPath);
  console.log(JSON.stringify(payload.baseline.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
