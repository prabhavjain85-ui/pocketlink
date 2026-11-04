const { applyCorsHeaders } = require("./_lib/security");

function clean(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(res, status, body, req = null) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  applyCorsHeaders(req, res, "GET, POST, OPTIONS");
  res.end(JSON.stringify(body));
}

const TOXICOPHORES = [
  {
    id: "michael_acceptor",
    name: "Michael acceptor",
    explanation:
      "α,β-unsaturated carbonyls can covalently modify nucleophilic residues and produce nonspecific assay activity.",
    pattern: "[C;H1,H2]=[C;H1][C,S,N]=O",
    match: (s) => /C=C.*C(=O)|C=CC=O|C=CC(=S)/i.test(s),
  },
  {
    id: "aldehyde",
    name: "Aldehyde",
    explanation:
      "Aldehydes form Schiff bases with protein amines and are a common source of assay interference and metabolic liability.",
    pattern: "[CX3H1](=O)[#6]",
    match: (s) => /O=C[c]1|O=C[H]|\[CH\]=O|C\(=O\)H|O=Cc|C=CC=O/i.test(s),
  },
  {
    id: "epoxide",
    name: "Epoxide",
    explanation:
      "Epoxides are electrophilic and can covalently bind proteins — a frequent toxicology and false-positive flag.",
    pattern: "C1OC1",
    match: (s) => /C1CO1|C1OC1|O1CC1/i.test(s),
  },
  {
    id: "alkyl_halide",
    name: "Alkyl halide",
    explanation:
      "Reactive alkyl chlorides, bromides, and iodides can alkylate nucleophilic residues and are treated as structural liabilities.",
    pattern: "[CX4;!$(C~[a])][Cl,Br,I]",
    match: (s) => /(?:^|[^a-z0-9])(?:C|CC|CCC)(?:Cl|Br|I)(?:$|[^a-z0-9])/i.test(s) && !/c(?:Cl|Br|I)/.test(s),
  },
];

const PAINS_PATTERNS = [
  {
    id: "quinone",
    name: "Quinone",
    catalog: "PAINS",
    explanation:
      "Quinones are frequent false positives in high-throughput screens due to redox cycling and nonspecific reactivity.",
    match: (s) => /O=C1C=CC\(=O\)C=C1|O=C1C=CC=CC1=O/i.test(s),
  },
  {
    id: "rhodanine",
    name: "Rhodanine",
    catalog: "PAINS",
    explanation:
      "Rhodanines are frequent false positives in high-throughput screens due to nonspecific reactivity.",
    match: (s) => /O=C1CSC\(=S\)N1|O=C1NC\(=S\)SC1/i.test(s),
  },
  {
    id: "catechol",
    name: "Catechol",
    catalog: "PAINS",
    explanation:
      "Catechols can oxidize to reactive quinones and interfere across many assay formats.",
    match: (s) => /c1cc\(O\)c\(O\)cc1|Oc1ccccc1O|c1c\(O\)c\(O\)ccc1/i.test(s),
  },
  {
    id: "azo",
    name: "Azo compound",
    catalog: "PAINS",
    explanation:
      "Azo dyes can interfere photometrically and via redox chemistry in biochemical screens.",
    match: (s) => /[^N]N=N[^N]/i.test(s),
  },
  {
    id: "thiourea",
    name: "Thiourea",
    catalog: "PAINS",
    explanation:
      "Thioureas can chelate metals and interfere in a wide range of biochemical assays.",
    match: (s) => /NC\(=S\)N/i.test(s),
  },
  {
    id: "diketone",
    name: "β-Diketone",
    catalog: "PAINS",
    explanation:
      "β-Diketones chelate metals and can generate false positives in metal-dependent assays.",
    match: (s) => /C\(=O\)CC\(=O\)/i.test(s),
  },
  {
    id: "hydrazone",
    name: "Hydrazone",
    catalog: "PAINS",
    explanation:
      "Hydrazones can hydrolyze or chelate metals and are a recurring PAINS class.",
    match: (s) => /C=NN/i.test(s),
  },
];

function checkSmiles(smiles, cid = "") {
  const raw = smiles == null ? "" : String(smiles).trim();
  const cidStr = cid == null ? "" : String(cid).trim();
  const result = {
    cid: cidStr,
    smiles: raw,
    status: "unable",
    hasAlerts: false,
    checked: false,
    alerts: [],
    reason: null,
  };

  if (!raw) {
    result.reason = "Missing SMILES";
    return result;
  }

  // Basic SMILES character validation
  if (!/^[A-Za-z0-9@+\-\[\]\(\)\\/=#$%.:]+$/.test(raw)) {
    result.reason = "Invalid SMILES";
    return result;
  }

  const alerts = [];

  for (const item of PAINS_PATTERNS) {
    if (item.match(raw)) {
      alerts.push({
        family: "pains",
        catalog: item.catalog || "PAINS",
        id: item.id,
        name: item.name,
        pattern: item.id,
        explanation: item.explanation,
      });
    }
  }

  for (const item of TOXICOPHORES) {
    if (item.match(raw)) {
      alerts.push({
        family: "toxicophore",
        catalog: "toxicophore",
        id: item.id,
        name: item.name,
        pattern: item.pattern,
        explanation: item.explanation,
      });
    }
  }

  result.checked = true;
  result.alerts = alerts;
  result.hasAlerts = alerts.length > 0;
  result.status = alerts.length > 0 ? "alert" : "clean";
  result.reason = null;
  return result;
}

function checkCompounds(compounds) {
  const rows = (Array.isArray(compounds) ? compounds : []).slice(0, 5);
  const results = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") {
      results.push(checkSmiles("", ""));
      continue;
    }
    const cid = item.cid || item.CID || "";
    const smiles = item.smiles || item.SMILES || item.IsomericSMILES || "";
    results.push(checkSmiles(smiles, cid));
  }
  return results;
}

function engineInfo() {
  return { engine: "pocketlink-pains-node", version: "1.0.0" };
}

async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});

  if (req.method === "GET") {
    return json(res, 200, {
      ...engineInfo(),
      ok: true,
      usage: 'POST {"smiles":"..."} or {"compounds":[{"cid":"...","smiles":"..."}]}',
    });
  }

  if (req.method !== "POST") return json(res, 405, { error: "POST required" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    let results = [];
    if (Array.isArray(body.compounds)) {
      results = checkCompounds(body.compounds);
    } else if (typeof body.smiles === "string") {
      results = [checkSmiles(body.smiles, body.cid || "")];
    } else {
      return json(res, 400, { error: "Provide smiles or compounds: [{ cid, smiles }]." });
    }

    return json(res, 200, { ...engineInfo(), results });
  } catch (error) {
    return json(res, 500, { error: error?.message || "Internal server error" });
  }
}

handler.checkSmiles = checkSmiles;
handler.checkCompounds = checkCompounds;
handler.engineInfo = engineInfo;
module.exports = handler;
