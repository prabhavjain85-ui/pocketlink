#!/usr/bin/env node
/**
 * Regenerate benchmark/evolution/fixtures/chembl_rediscovery_panel.json from ChEMBL REST.
 * Split rule matches benchmark/docking/scripts/run_enrichment.py (MD5 chembl_id, train_frac=0.55).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENRICHMENT_PANEL = [
  {
    target_id: "egfr",
    gene: "EGFR",
    chembl_target: "CHEMBL203",
    reference_smiles: "COc1cc2ncnc(Nc3ccc(F)cc3Cl)c2cc1OCCCN1CCOCC1",
  },
  {
    target_id: "jak2",
    gene: "JAK2",
    chembl_target: "CHEMBL2971",
    reference_smiles:
      "Cc1cnc(nc1Nc2cccc(c2)S(=O)(=O)NC(C)(C)C)Nc3ccc(cc3)N4CCN(CC4)C",
  },
  {
    target_id: "pde5a",
    gene: "PDE5A",
    chembl_target: "CHEMBL1827",
    reference_smiles:
      "CCCc1c2c(n(n1)C)C(=O)NC(=N2)c3cc(ccc3OCC)S(=O)(=O)N4CCN(CC4)C",
  },
];

const MAX_ACTIVES = 36;
const TRAIN_FRAC = 0.55;

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url} => ${res.status}`);
  return res.json();
}

async function fetchActives(targetChembl) {
  const params = new URLSearchParams({
    target_chembl_id: targetChembl,
    standard_type__in: "Ki,IC50",
    standard_relation: "=",
    pchembl_value__gte: "6",
    pchembl_value__isnull: "false",
    limit: "250",
  });
  const url = `https://www.ebi.ac.uk/chembl/api/data/activity.json?${params}`;
  const data = await getJson(url);
  const seen = new Set();
  const out = [];
  for (const act of data.activities || []) {
    const mid = act.molecule_chembl_id;
    if (!mid || seen.has(mid)) continue;
    const smi = act.canonical_smiles;
    if (!smi) continue;
    seen.add(mid);
    out.push({ chembl_id: mid, smiles: smi, pchembl: act.pchembl_value });
  }
  return out;
}

function trainTestSplit(items, trainFrac = TRAIN_FRAC) {
  const train = [];
  const test = [];
  for (const it of items) {
    const h = parseInt(crypto.createHash("md5").update(it.chembl_id).digest("hex"), 16) % 100;
    if (h < Math.floor(trainFrac * 100)) train.push(it);
    else test.push(it);
  }
  return { train, test };
}

async function main() {
  const targets = [];
  for (const panel of ENRICHMENT_PANEL) {
    const actives = (await fetchActives(panel.chembl_target)).slice(0, MAX_ACTIVES);
    const { train, test } = trainTestSplit(actives);
    targets.push({
      target_id: panel.target_id,
      gene: panel.gene,
      chembl_target: panel.chembl_target,
      reference_smiles: panel.reference_smiles,
      train_actives: train,
      test_actives: test,
    });
    console.log(panel.target_id, "train", train.length, "test", test.length);
  }
  const payload = {
    generated_at: new Date().toISOString(),
    source: "benchmark/docking/scripts/run_enrichment.py ENRICHMENT_PANEL + ChEMBL REST (pchembl>=6 actives)",
    train_frac: TRAIN_FRAC,
    split_rule:
      "MD5(chembl_id) % 100 < int(train_frac*100) => train (matches benchmark/docking/scripts/run_enrichment.py)",
    targets,
  };
  const outPath = path.join(
    process.cwd(),
    "benchmark/evolution/fixtures/chembl_rediscovery_panel.json"
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
