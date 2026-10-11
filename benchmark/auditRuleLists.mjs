/**
 * Verify a compound name/class is absent from TargetForge hard-coded pharmacology lists.
 * Used when curating held-out benchmark compounds.
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  TARGET_RULES,
  KINASE_INHIBITOR_RE,
  GPCR_LIGAND_RE,
  scoreOne,
} = require("../src/scoreCandidates.js");

const RULE_SOURCE = "src/scoreCandidates.js";

function collectRegexDrugTokens(re) {
  if (!re || !re.source) return [];
  const inner = re.source.replace(/^\^?\\b|\$?\\b$/g, "");
  return inner
    .split("|")
    .map((t) => t.replace(/\\b/g, "").replace(/\\/g, "").trim())
    .filter(Boolean);
}

function buildGlobalNameBlocklist() {
  const names = new Set();
  for (const rule of TARGET_RULES) {
    for (const d of rule.onTargetDrugs || []) names.add(d.toLowerCase());
    for (const token of collectRegexDrugTokens(rule.onTargetRe)) names.add(token.toLowerCase());
    for (const token of collectRegexDrugTokens(rule.demotedRe)) names.add(token.toLowerCase());
    for (const token of collectRegexDrugTokens(rule.ligandRe)) {
      const t = token.toLowerCase();
      if (t.length > 2 && !/^[a-z0-9]{2,4}$/i.test(t)) names.add(t);
    }
  }
  for (const token of collectRegexDrugTokens(KINASE_INHIBITOR_RE)) names.add(token.toLowerCase());
  for (const token of collectRegexDrugTokens(GPCR_LIGAND_RE)) names.add(token.toLowerCase());
  return names;
}

const GLOBAL_BLOCKLIST = buildGlobalNameBlocklist();

export function auditCompoundForHeldout({ name, drugClass = "", targetId, protein }) {
  const cName = String(name || "").toLowerCase();
  const cClass = String(drugClass || "").toLowerCase();
  const hits = [];

  if (GLOBAL_BLOCKLIST.has(cName)) {
    hits.push({ kind: "global_blocklist", detail: `Exact name in curated lists (${RULE_SOURCE})` });
  }
  for (const token of GLOBAL_BLOCKLIST) {
    if (token.length > 4 && (cName.includes(token) || token.includes(cName))) {
      hits.push({ kind: "global_blocklist_substring", detail: `Matches token "${token}"` });
      break;
    }
  }
  if (KINASE_INHIBITOR_RE.test(cName)) {
    hits.push({ kind: "KINASE_INHIBITOR_RE", detail: RULE_SOURCE });
  }
  if (GPCR_LIGAND_RE.test(cName)) {
    hits.push({ kind: "GPCR_LIGAND_RE", detail: RULE_SOURCE });
  }

  const rule = TARGET_RULES.find((r) => r.id === targetId);
  if (rule) {
    if (rule.onTargetRe?.test(cName) || (rule.onTargetClassRe && rule.onTargetClassRe.test(cClass))) {
      hits.push({ kind: "onTargetRe", detail: `rule ${rule.id}` });
    }
    if (rule.demotedRe?.test(cName)) {
      hits.push({ kind: "demotedRe", detail: `rule ${rule.id}` });
    }
    if (rule.onTargetDrugs?.some((d) => cName.includes(d.toLowerCase()))) {
      hits.push({ kind: "onTargetDrugs", detail: `rule ${rule.id}` });
    }
  }

  let heuristicScore = null;
  let targetBonus = null;
  if (protein) {
    const candidate = {
      cid: "0",
      displayName: name,
      name,
      drugClass,
      molecularWeight: 400,
      xlogp: 2,
      hbd: 1,
      hba: 4,
      rotatableBonds: 4,
      tpsa: 80,
    };
    const scored = scoreOne(candidate, protein);
    heuristicScore = scored.score;
    targetBonus = scored.targetBonus;
  }

  return {
    name,
    drugClass,
    target_id: targetId,
    absent_from_rule_lists: hits.length === 0,
    rule_hits: hits,
    heuristic_probe: protein
      ? { score: heuristicScore, target_bonus: targetBonus, source: RULE_SOURCE }
      : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = JSON.parse(process.argv[2] || "{}");
  console.log(JSON.stringify(auditCompoundForHeldout(payload), null, 2));
}
