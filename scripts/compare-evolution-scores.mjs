#!/usr/bin/env node
/**
 * Real before/after display scores on seed molecules (target-free mode).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEEDS = [
  { name: "Imatinib", smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Caffeine", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" },
  { name: "Ethanol", smiles: "CCO" },
  { name: "Benzene", smiles: "c1ccccc1" },
];

const runner = `
const init = require('@rdkit/rdkit/dist/RDKit_minimal.js');
const { scoreEvolvedMolecule } = require('./src/evolutionScore.js');
const seeds = JSON.parse(process.argv[2]);
init().then(async (RDKit) => {
  const out = [];
  for (const s of seeds) {
    const r = await scoreEvolvedMolecule({ smiles: s.smiles, parentSmiles: s.smiles, referenceSmiles: s.smiles, protein: null, RDKit, operator: 'seed' });
    out.push({ name: s.name, smiles: s.smiles, score: r.displayScore ?? r.score, ok: r.ok, error: r.error });
  }
  console.log(JSON.stringify(out, null, 2));
});
`;

const newScores = JSON.parse(
  execFileSync("node", ["-e", runner, JSON.stringify(SEEDS)], { cwd: ROOT, encoding: "utf8" })
);

console.log("Target-free display scores (Phase 1 desirability):");
for (const row of newScores) {
  console.log(`${row.name}: ${row.ok ? row.score : row.error}`);
}
