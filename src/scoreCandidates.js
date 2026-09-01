const { buildTargetContext, targetDisplayName } = require("./targetContext");

const MAX_CANDIDATES = 5;

const KINASE_INHIBITOR_RE =
  /\b(imatinib|gleevec|dasatinib|nilotinib|bosutinib|ponatinib|gefitinib|erlotinib|lapatinib|afatinib|osimertinib|sunitinib|sorafenib|vandetanib|pazopanib|axitinib|cabozantinib|crizotinib|alectinib|ceritinib|brigatinib|lorlatinib|ibrutinib|acalabrutinib|ruxolitinib|tofacitinib|baricitinib|upadacitinib|trametinib|cobimetinib|binimetinib|vemurafenib|dabrafenib|encorafenib|palbociclib|ribociclib|abemaciclib|midostaurin|gilteritinib|quizartinib)\b/i;

const GPCR_LIGAND_RE =
  /\b(morphine|fentanyl|oxycodone|codeine|naloxone|propranolol|atenolol|metoprolol|carvedilol|salbutamol|albuterol|losartan|valsartan|olmesartan|risperidone|olanzapine|quetiapine|aripiprazole|prazosin|clonidine|ondansetron|sumatriptan|loratadine|cetirizine|ranitidine|famotidine|diphenhydramine|atropine|scopolamine|nicotine)\b/i;

const KINASE_TARGET_RE =
  /\b(kinase|abl1?\b|egfr|vegfr|jak\d?|ikk|src\b|kit\b|pdgf|btk\b|tyrosine kinase|serine.?threonine|mapk|cdk\d|braf|alk\b|\bmet\b|flt3|syk|lck|her2|erbb)\b/i;

const GPCR_TARGET_RE =
  /\b(gpcr|g protein-coupled|rhodopsin|adrenergic|opioid receptor|dopamine receptor|serotonin|5-hydroxytryptamine|5-ht|chemokine receptor|muscarinic|histamine receptor|cannabinoid|adenosine receptor|beta-2|β2|adrb2)\b/i;

function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cidOf(candidate) {
  return String(candidate?.cid ?? candidate?.CID ?? "");
}

function nameOf(candidate) {
  return (
    candidate?.displayName ||
    candidate?.name ||
    candidate?.IUPACName ||
    (cidOf(candidate) ? `CID ${cidOf(candidate)}` : "Unknown compound")
  );
}

/**
 * Trapezoidal desirability: 0 outside [min, max], 1 between [low, high].
 */
function trap(value, min, low, high, max) {
  if (value == null) return 0.55;
  if (value <= min || value >= max) return 0;
  if (value >= low && value <= high) return 1;
  if (value < low) return (value - min) / (low - min);
  return (max - value) / (max - high);
}

function drugLikenessChecks(candidate) {
  const mw = num(candidate.molecularWeight ?? candidate.MolecularWeight);
  const xlogp = num(candidate.xlogp ?? candidate.XLogP);
  const hbd = num(candidate.hbd ?? candidate.HBondDonorCount);
  const hba = num(candidate.hba ?? candidate.HBondAcceptorCount);
  const rot = num(candidate.rotatableBonds ?? candidate.RotatableBondCount);
  const tpsa = num(candidate.tpsa ?? candidate.TPSA);

  return [
    { key: "mw", label: "Molecular weight ≤ 500", pass: mw == null || mw <= 500, value: mw == null ? "n/a" : `${mw.toFixed(1)} g/mol` },
    { key: "xlogp", label: "cLogP ≤ 5", pass: xlogp == null || xlogp <= 5, value: xlogp == null ? "n/a" : String(xlogp) },
    { key: "hbd", label: "H-bond donors ≤ 5", pass: hbd == null || hbd <= 5, value: hbd == null ? "n/a" : String(hbd) },
    { key: "hba", label: "H-bond acceptors ≤ 10", pass: hba == null || hba <= 10, value: hba == null ? "n/a" : String(hba) },
    { key: "rot", label: "Rotatable bonds ≤ 10", pass: rot == null || rot <= 10, value: rot == null ? "n/a" : String(rot) },
    { key: "tpsa", label: "TPSA ≤ 140 Å²", pass: tpsa == null || tpsa <= 140, value: tpsa == null ? "n/a" : `${tpsa} Å²` },
  ];
}

function propsOf(candidate) {
  return {
    mw: num(candidate.molecularWeight ?? candidate.MolecularWeight),
    xlogp: num(candidate.xlogp ?? candidate.XLogP),
    hbd: num(candidate.hbd ?? candidate.HBondDonorCount),
    hba: num(candidate.hba ?? candidate.HBondAcceptorCount),
    rot: num(candidate.rotatableBonds ?? candidate.RotatableBondCount),
    tpsa: num(candidate.tpsa ?? candidate.TPSA),
  };
}

function uniqueNames(values) {
  const out = [];
  for (const value of values) {
    const name = String(value || "").trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function painsOf(candidate) {
  return candidate?.pains || candidate?.painsAlerts || null;
}

function alertSummary(candidate) {
  const pains = painsOf(candidate);
  const alerts = Array.isArray(pains?.alerts) ? pains.alerts : [];
  const painsNames = uniqueNames(alerts.filter((a) => a.family === "pains").map((a) => a.name));
  const toxNames = uniqueNames(alerts.filter((a) => a.family === "toxicophore").map((a) => a.name));
  const allNames = uniqueNames([...painsNames, ...toxNames]);
  return {
    status: pains?.status || null,
    hasAlerts: Boolean(pains?.hasAlerts) || allNames.length > 0,
    painsNames,
    toxNames,
    allNames,
    unable: pains?.status === "unable",
  };
}

function targetFamily(protein) {
  const ctx = protein?.pdb_id || protein?.id ? protein : null;
  const text = `${protein?.queryName || protein?.name || ""} ${protein?.title || ""} ${protein?.id || protein?.pdb_id || ""}`;
  if (KINASE_TARGET_RE.test(text)) return "kinase";
  if (GPCR_TARGET_RE.test(text)) return "gpcr";
  return ctx ? "other" : null;
}

function pharmacologyFit(candidate, family) {
  const name = nameOf(candidate);
  const kinaseDrug = KINASE_INHIBITOR_RE.test(name);
  const gpcrDrug = GPCR_LIGAND_RE.test(name);

  if (family === "kinase") {
    if (kinaseDrug) {
      return { pts: 40, text: "Known kinase-inhibitor-like scaffold for this target family" };
    }
    if (gpcrDrug) {
      return { pts: 4, text: "Known GPCR ligand with no particular kinase-pocket relevance" };
    }
    return { pts: 10, text: "No established kinase-inhibitor class match" };
  }
  if (family === "gpcr") {
    if (gpcrDrug) {
      return { pts: 40, text: "Known GPCR ligand class for this target family" };
    }
    if (kinaseDrug) {
      return { pts: 4, text: "Known kinase inhibitor with no particular GPCR pocket relevance" };
    }
    return { pts: 10, text: "No established GPCR-ligand class match" };
  }
  if (family === "other") {
    if (kinaseDrug || gpcrDrug) {
      return { pts: 8, text: "Known pharmacology does not specifically match this target family" };
    }
    return { pts: 12, text: null };
  }
  return { pts: 0, text: null };
}

function sizeMatchPts(mw, ligandMw) {
  if (mw == null || ligandMw == null || !(ligandMw > 0)) return { pts: 0, text: null };
  const ratio = mw / ligandMw;
  if (ratio >= 0.7 && ratio <= 1.35) {
    return { pts: 10, text: `Good size match to the co-crystallized ligand (MW ${mw.toFixed(0)} vs ${ligandMw.toFixed(0)})` };
  }
  if (ratio >= 0.5 && ratio <= 1.7) {
    return { pts: 5, text: `Partial size match to the co-crystallized ligand (MW ${mw.toFixed(0)} vs ${ligandMw.toFixed(0)})` };
  }
  return { pts: 1, text: `Poor size match to the co-crystallized ligand (MW ${mw.toFixed(0)} vs ${ligandMw.toFixed(0)})` };
}

function polarityMatchPts(xlogp, pocket) {
  if (xlogp == null || pocket?.hydrophobicity == null) return { pts: 0, text: null };
  const h = pocket.hydrophobicity;
  if (h >= 0.6 && xlogp >= 2) {
    return { pts: 8, text: `Lipophilicity (XLogP ${xlogp}) matches a hydrophobic pocket` };
  }
  if (h <= 0.35 && xlogp <= 2.5) {
    return { pts: 8, text: `Polarity (XLogP ${xlogp}) matches a more polar pocket` };
  }
  if (h > 0.35 && h < 0.6 && xlogp >= 0 && xlogp <= 4) {
    return { pts: 6, text: `Balanced polarity for a mixed pocket` };
  }
  return { pts: 2, text: `Polarity is a weak match to the estimated pocket hydrophobicity` };
}

function scoreOne(candidate, protein = null) {
  const p = propsOf(candidate);
  const checks = drugLikenessChecks(candidate);
  const passCount = checks.filter((c) => c.pass).length;
  const violations = checks.filter((c) => !c.pass).length;
  const alerts = alertSummary(candidate);
  const ctx = protein ? buildTargetContext(protein) : null;

  const weighted =
    0.22 * trap(p.mw, 0, 180, 420, 650) +
    0.2 * trap(p.xlogp, -3, 0, 3.5, 7) +
    0.14 * trap(p.hbd, -0.5, 0, 3, 7) +
    0.14 * trap(p.hba, 0, 2, 8, 14) +
    0.15 * trap(p.rot, -0.5, 0, 6, 14) +
    0.15 * trap(p.tpsa, 0, 20, 100, 180);

  const druglike = Math.max(0, Math.min(100, 100 * weighted - violations * 6));

  let alertPenalty = 0;
  if (alerts.painsNames.length) alertPenalty += 12;
  if (alerts.toxNames.length) alertPenalty += 8;

  const strengths = [];
  const concerns = [];
  const reasoning = [];

  const family = targetFamily(ctx || protein);
  let fit = null;
  if (ctx) {
    const pharm = pharmacologyFit(candidate, family);
    const size = sizeMatchPts(p.mw, ctx.ligand?.present ? ctx.ligand.mw : null);
    const polar = polarityMatchPts(p.xlogp, ctx.pocket);
    const rawFit = pharm.pts + size.pts + polar.pts;
    fit = Math.max(0, Math.min(100, Math.round((rawFit / 58) * 100)));
    if (pharm.text) reasoning.push(pharm.text);
    if (size.text) reasoning.push(size.text);
    if (polar.text) reasoning.push(polar.text);
    if (!ctx.ligand?.present || !ctx.pocket?.available) {
      reasoning.push("Target-fit assessment is limited without pocket/ligand data for this structure");
    }
  }

  const combined = ctx
    ? 0.6 * (fit == null ? 40 : fit) + 0.4 * druglike
    : druglike;
  const score = Math.round(Math.max(1, Math.min(100, combined - alertPenalty)));

  if (passCount >= 5) strengths.push(`Passes ${passCount}/6 Lipinski–Veber drug-likeness checks.`);
  if (p.mw != null && p.mw >= 180 && p.mw <= 450) strengths.push(`Molecular weight (${p.mw.toFixed(1)}) sits in a typical oral small-molecule range.`);
  if (p.xlogp != null && p.xlogp >= 0 && p.xlogp <= 3.5) strengths.push(`XLogP (${p.xlogp}) is consistent with balanced permeability and solubility.`);
  if (p.tpsa != null && p.tpsa >= 20 && p.tpsa <= 90) strengths.push(`TPSA (${p.tpsa} Å²) is compatible with oral absorption.`);
  if (p.rot != null && p.rot <= 6) strengths.push(`Limited rotatable bonds (${p.rot}) suggest a more conformationally constrained ligand.`);
  if (p.hbd != null && p.hbd <= 3) strengths.push(`Low H-bond donor count (${p.hbd}) is generally favorable for permeability.`);

  if (p.mw != null && p.mw > 500) concerns.push(`Molecular weight (${p.mw.toFixed(1)}) exceeds Lipinski's 500 g/mol cutoff.`);
  else if (p.mw != null && p.mw < 150) concerns.push(`Very low molecular weight (${p.mw.toFixed(1)}) is more fragment-like than a typical lead.`);
  if (p.xlogp != null && p.xlogp > 5) concerns.push(`High lipophilicity (XLogP ${p.xlogp}) may hurt solubility and metabolic stability.`);
  else if (p.xlogp != null && p.xlogp < 0) concerns.push(`Negative XLogP (${p.xlogp}) can limit passive membrane permeability.`);
  if (p.hbd != null && p.hbd > 5) concerns.push(`Too many H-bond donors (${p.hbd}) often reduce oral bioavailability.`);
  if (p.hba != null && p.hba > 10) concerns.push(`H-bond acceptor count (${p.hba}) exceeds the Lipinski guideline.`);
  if (p.rot != null && p.rot > 10) concerns.push(`High flexibility (${p.rot} rotatable bonds) can penalize binding and oral absorption.`);
  if (p.tpsa != null && p.tpsa > 140) concerns.push(`Polar surface area (${p.tpsa} Å²) is above Veber's typical oral cutoff.`);

  if (alerts.painsNames.length) {
    concerns.unshift(`Deprioritized due to PAINS alert: ${alerts.painsNames.join(", ")}.`);
  }
  if (alerts.toxNames.length) {
    concerns.unshift(`Toxicophore flag: ${alerts.toxNames.join(", ")}. Reactive-group liability, not a hard exclusion.`);
  }

  if (!strengths.length) strengths.push("No strong drug-likeness advantages versus the rest of this shortlist.");
  if (!concerns.length) concerns.push("No major Lipinski/Veber flags in the supplied properties.");

  for (const item of strengths) {
    if (!reasoning.includes(item)) reasoning.push(item);
  }
  if (alerts.painsNames.length) reasoning.push(`PAINS alert penalty applied: ${alerts.painsNames.join(", ")} (not a hard zero)`);
  if (alerts.toxNames.length) reasoning.push(`Toxicophore penalty applied: ${alerts.toxNames.join(", ")}`);

  return { score, passCount, violations, strengths, concerns, reasoning: reasoning.slice(0, 8), checks, alerts, fit };
}

function reasonFor(candidate, scored, protein) {
  const name = nameOf(candidate);
  const targetName = protein ? targetDisplayName(protein) : "";
  const pdb = protein?.id || protein?.pdb_id || "";
  const targetBit = pdb ? ` for ${targetName || "the staged target"}${pdb ? ` (${pdb})` : ""}` : "";
  const alertBit = scored.alerts?.allNames?.length
    ? ` It still carries ${scored.alerts.painsNames.length ? "PAINS" : "toxicophore"} alert(s): ${scored.alerts.allNames.join(", ")} — a warning, not a hard exclusion.`
    : "";
  const fitBit = scored.reasoning?.[0] ? ` ${scored.reasoning[0]}.` : "";
  if (protein) {
    return `${name} is the best target-specific fit${targetBit}.${fitBit}${alertBit} Binding affinity is not assessed here — docking still needs to be run.`;
  }
  if (scored.violations === 0) {
    return `${name} has the strongest overall physicochemical profile in this shortlist: ${scored.passCount}/6 drug-likeness checks pass, with a balanced size, polarity, and flexibility profile.${alertBit} Binding affinity is not assessed here — docking still needs to be run.`;
  }
  return `${name} is the best available option in this shortlist, but it still has ${scored.violations} drug-likeness flag(s).${alertBit} Treat this as a computational triage, not evidence of activity.`;
}

function summaryFor(ranked, protein) {
  const top = ranked[0];
  const pdb = protein?.id || protein?.pdb_id;
  const target = pdb ? ` ${targetDisplayName(protein)} (${pdb})` : " computational follow-up";
  const flagged = ranked.filter((row) => row.alerts?.allNames?.length);
  const flagBit = flagged.length
    ? ` ${flagged.length} shortlisted molecule(s) carry PAINS or toxicophore alerts and were deprioritized accordingly.`
    : "";
  if (pdb) {
    return `Among ${ranked.length} staged molecules, ${nameOf(top)} is the strongest candidate for${target} based on target/pocket fit, known pharmacology, and Lipinski/Veber drug-likeness.${flagBit} Scores are specific to this structure — the same compound would score differently against a different target. This ranking does not include docking poses or experimental data.`;
  }
  return `Among ${ranked.length} staged molecules, ${nameOf(top)} is the strongest candidate to take into${target} based on PubChem physicochemical properties (Lipinski Rule-of-Five and Veber heuristics).${flagBit} No PDB structure was staged, so this ranking is not pocket-specific. This ranking does not include docking poses, ADME models, toxicity, or experimental data.`;
}

/**
 * Rank 2–5 candidates for a specific target using pocket/ligand context
 * when available, known pharmacology, and Lipinski/Veber properties.
 * Returns the same schema as the AI API.
 */
function rankCandidatesLocal(candidates, protein = null, options = {}) {
  const max = options.maxCandidates ?? MAX_CANDIDATES;
  const min = options.minCandidates ?? 2;
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, max);
  if (list.length < min) {
    throw new Error(`Select at least ${min} candidates.`);
  }

  const ctx = protein ? buildTargetContext(protein) : null;
  const scored = list.map((candidate) => {
    const local = scoreOne(candidate, protein);
    return {
      cid: cidOf(candidate),
      name: nameOf(candidate),
      ...local,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.passCount !== a.passCount) return b.passCount - a.passCount;
    return String(a.cid).localeCompare(String(b.cid));
  });

  const ranking = scored.map((item, index) => ({
    cid: item.cid,
    rank: index + 1,
    score: item.score,
    reasoning: (item.reasoning || []).slice(0, 6),
    strengths: item.strengths.slice(0, 3),
    concerns: item.concerns.slice(0, 3),
  }));

  const top = scored[0];
  const originalTop = list.find((c) => cidOf(c) === top.cid) || list[0];
  const target = ctx
    ? { name: ctx.name, pdb_id: ctx.pdb_id }
    : { name: "", pdb_id: null };

  return {
    target,
    candidates: ranking.map((row) => ({
      compound_id: row.cid,
      score: row.score,
      reasoning: row.reasoning,
    })),
    recommended: {
      cid: top.cid,
      score: top.score,
      reason: reasonFor(originalTop, top, protein),
    },
    ranking,
    summary: summaryFor(scored, protein),
    limitations: [
      ctx
        ? "This ranking is specific to the selected PDB structure. The same compound is expected to score differently against a different target."
        : "This ranking uses only the supplied PubChem properties (size, lipophilicity, H-bonding, flexibility, polar surface area) plus any PAINS/toxicophore substructure flags.",
      "It cannot estimate binding affinity, selectivity, metabolism, toxicity, or clinical efficacy.",
      "PAINS and toxicophore matches are warnings, not automatic exclusions — some flagged chemotypes become real drugs.",
      ctx?.dataGaps?.length
        ? "Target-fit assessment is limited without pocket/ligand data — geometric fit was not treated as a confident judgment."
        : "Use SwissDock and SwissADME next, then experimental assays, before treating any molecule as a real lead.",
      "Use SwissDock and SwissADME next, then experimental assays, before treating any molecule as a real lead.",
    ]    .filter((item, index, arr) => arr.indexOf(item) === index),
    source: "heuristic",
  };
}

/**
 * Score an entire approved-drug library for one target.
 * Same target-aware model as the 5-compound shortlist, without the 2–5 cap.
 */
function scoreLibraryLocal(candidates, protein = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return {
      target: protein ? { name: targetDisplayName(protein), pdb_id: protein.id || protein.pdb_id || null } : { name: "", pdb_id: null },
      candidates: [],
      recommended: { cid: null, score: null, reason: "" },
      ranking: [],
      summary: "No compounds to score.",
      limitations: [],
      source: "heuristic",
    };
  }
  return rankCandidatesLocal(list, protein, { maxCandidates: list.length, minCandidates: 1 });
}

module.exports = {
  MAX_CANDIDATES,
  drugLikenessChecks,
  nameOf,
  cidOf,
  targetFamily,
  scoreOne,
  rankCandidatesLocal,
  scoreLibraryLocal,
};
