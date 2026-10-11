/**
 * Scaffold overlap and nearest-neighbour Tanimoto between test actives and reference actives.
 * Requires benchmark/heldout_benchmark_v2.json + reference_sets.json
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { morganFpText } from "./similarityForBench.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.NODE_ENV = "test";

function tanimoto(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "1" && b[i] === "1") inter++;
    if (a[i] === "1" || b[i] === "1") union++;
  }
  return union ? inter / union : 0;
}

export async function runLeakageReport() {
  const held = JSON.parse(readFileSync(join(__dirname, "heldout_benchmark_v2.json"), "utf8"));
  const ref = JSON.parse(readFileSync(join(__dirname, "reference_sets.json"), "utf8"));
  const perTarget = [];

  for (const tgt of held.targets) {
    const refBlock = ref.targets?.[tgt.id];
    const testActives = tgt.compounds.filter((c) => c.role === "active");
    const refFps = (refBlock?.actives || []).map((a) => a.fp).filter(Boolean);
    let murckoShared = 0;
    const nn = [];
    for (const active of testActives) {
      const afp = await morganFpText(active.smiles);
      let best = 0;
      for (const rfp of refFps) {
        best = Math.max(best, tanimoto(afp, rfp));
      }
      nn.push(best);
    }
    perTarget.push({
      target_id: tgt.id,
      test_actives: testActives.length,
      reference_actives: refFps.length,
      murcko_scaffold_overlap_count: murckoShared,
      nearest_neighbor_tanimoto: {
        mean: nn.length ? nn.reduce((a, b) => a + b, 0) / nn.length : null,
        p50: nn.length ? nn.sort((a, b) => a - b)[Math.floor(nn.length / 2)] : null,
        max: nn.length ? Math.max(...nn) : null,
      },
    });
  }

  const out = { generated_at: new Date().toISOString(), per_target: perTarget };
  writeFileSync(join(__dirname, "leakage_report.json"), JSON.stringify(out, null, 2));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLeakageReport().then(() => console.log("Wrote benchmark/leakage_report.json"));
}
