import { execFileSync } from "child_process";
import path from "path";
import { getRDKit } from "../rdkitLoader";
import { calculateSaScore } from "../../server/evolution/saScorer";

const SAMPLES = [
  "CCO",
  "c1ccccc1",
  "CC(=O)Oc1ccccc1C(=O)O",
  "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
  "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
];

function pythonAvailable() {
  try {
    execFileSync("python3", ["-c", "import rdkit"], { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

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

test("SA scorer sparse Morgan tracks RDKit sascorer when Python RDKit is available", async () => {
  const RDKit = await getRDKit();
  expect(RDKit).toBeTruthy();
  if (!pythonAvailable()) {
    // eslint-disable-next-line no-console
    console.warn("[saScorer] skipping Python parity — RDKit not installed in CI");
    const js = await calculateSaScore(RDKit, "CCO");
    expect(js.ok).toBe(true);
    return;
  }
  let within = 0;
  const need = Math.min(50, SAMPLES.length);
  for (const smi of SAMPLES.slice(0, need)) {
    const py = pythonSa(smi);
    const js = await calculateSaScore(RDKit, smi);
    expect(js.ok).toBe(true);
    const diff = Math.abs(js.saScore - py);
    if (diff <= 0.2) within += 1;
  }
  expect(within).toBeGreaterThanOrEqual(Math.floor(need * 0.75));
});
