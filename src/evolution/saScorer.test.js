import { execFileSync } from "child_process";
import path from "path";
import { getRDKit } from "../rdkitLoader";
import { calculateSaScore } from "./saScorer";

const SAMPLES = ["CCO", "c1ccccc1", "CC(=O)Oc1ccccc1C(=O)O", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"];

function pythonSa(smiles) {
  const script = path.join(process.cwd(), "scripts/sa_reference.py");
  const out = execFileSync("python3", [script], {
    input: JSON.stringify({ smiles }),
    encoding: "utf8",
  });
  const data = JSON.parse(out.trim());
  if (!data.ok) throw new Error(data.error || "python sa failed");
  return data.score;
}

test("SA scorer tracks RDKit sascorer on sample (calibrated folded FP)", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  let within = 0;
  for (const smi of SAMPLES) {
    const py = pythonSa(smi);
    const js = await calculateSaScore(RDKit, smi);
    expect(js.ok).toBe(true);
    const diff = Math.abs(js.saScore - py);
    if (diff <= 0.45) within += 1;
  }
  expect(within).toBeGreaterThanOrEqual(Math.floor(SAMPLES.length * 0.75));
});
