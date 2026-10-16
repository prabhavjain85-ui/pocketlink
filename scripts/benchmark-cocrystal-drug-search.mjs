#!/usr/bin/env node
/**
 * Live network benchmark for co-crystal drug search (standalone, no CRA imports).
 * Run: node scripts/benchmark-cocrystal-drug-search.mjs
 */

const DRUG_ALIASES = {
  imatinib: "STI",
  gefitinib: "IRE",
  sitagliptin: "715",
  ruxolitinib: "RXT",
  celecoxib: "CLX",
  sildenafil: "VIA",
  "4-hydroxytamoxifen": "OHT",
  atorvastatin: "117",
  oseltamivir: "OTV",
};

async function searchEntries(compId) {
  const res = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        type: "terminal",
        service: "text",
        parameters: {
          attribute: "rcsb_nonpolymer_entity_container_identifiers.nonpolymer_comp_id",
          operator: "exact_match",
          value: compId,
        },
      },
      return_type: "entry",
      request_options: {
        paginate: { start: 0, rows: 3 },
        sort: [{ sort_by: "rcsb_entry_info.resolution_combined", direction: "asc" }],
      },
    }),
  });
  const data = await res.json();
  return { total: data.total_count ?? 0, ids: (data.result_set || []).map((r) => r.identifier) };
}

async function pocketCount(pdbId, compId) {
  const pdb = await fetch(`https://files.rcsb.org/download/${pdbId}.pdb`).then((r) => r.text());
  const protein = [];
  const lig = [];
  for (const line of pdb.split("\n")) {
    if (line.startsWith("ATOM  ")) {
      protein.push({
        resName: line.slice(17, 20).trim(),
        chainId: line.slice(21, 22).trim() || "A",
        resSeq: parseInt(line.slice(22, 26), 10),
        x: +line.slice(30, 38),
        y: +line.slice(38, 46),
        z: +line.slice(46, 54),
        el: (line.slice(76, 78).trim() || "C").toUpperCase(),
      });
    }
    if (line.startsWith("HETATM") && line.slice(17, 20).trim() === compId) {
      const el = (line.slice(76, 78).trim() || "C").toUpperCase();
      if (el === "H") continue;
      lig.push({
        x: +line.slice(30, 38),
        y: +line.slice(38, 46),
        z: +line.slice(46, 54),
      });
    }
  }
  if (!lig.length) return null;
  const keys = new Set();
  for (const pa of protein) {
    if (pa.el === "H") continue;
    for (const la of lig) {
      const d = Math.hypot(pa.x - la.x, pa.y - la.y, pa.z - la.z);
      if (d <= 4.5) {
        keys.add(`${pa.resName}-${pa.resSeq}-${pa.chainId}`);
        break;
      }
    }
  }
  return keys.size;
}

async function resolveDrug(drug) {
  const key = drug.toLowerCase();
  if (DRUG_ALIASES[key]) return { compId: DRUG_ALIASES[key], source: "alias" };
  const cc = await fetch(`https://data.rcsb.org/rest/v1/core/chemcomp/${drug.toUpperCase()}`);
  if (cc.ok) return { compId: drug.toUpperCase(), source: "ccd" };
  return null;
}

const DRUGS = [
  "imatinib",
  "gefitinib",
  "sitagliptin",
  "ruxolitinib",
  "celecoxib",
  "sildenafil",
  "4-hydroxytamoxifen",
  "atorvastatin",
  "oseltamivir",
  "fictitiousinib-zz-no-pdb",
];

async function main() {
  console.log("| Drug | Resolved | CCD | Entries | Top PDB | Pocket residues | Note |");
  console.log("|------|----------|-----|---------|---------|-----------------|------|");
  for (const drug of DRUGS) {
    let resolved = false;
    let compId = "—";
    let entryCount = 0;
    let topPdb = "—";
    let pocket = "—";
    let note = "";
    try {
      const r = await resolveDrug(drug);
      if (!r) {
        note = "No CCD match";
      } else {
        resolved = true;
        compId = r.compId;
        const { total, ids } = await searchEntries(compId);
        entryCount = total;
        if (!ids.length) note = "CCD known but 0 PDB entries";
        else {
          topPdb = ids[0];
          const pc = await pocketCount(topPdb, compId);
          pocket = pc ?? "—";
          note = pc == null ? "ligand atoms missing in PDB file" : `top entry by resolution (${r.source})`;
        }
      }
    } catch (e) {
      note = e.message;
    }
    console.log(
      `| ${drug} | ${resolved} | ${compId} | ${entryCount} | ${topPdb} | ${pocket} | ${note} |`
    );
  }
}

main();
