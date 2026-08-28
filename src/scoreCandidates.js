const MAX_CANDIDATES = 5;

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

function scoreOne(candidate) {
  const p = propsOf(candidate);
  const checks = drugLikenessChecks(candidate);
  const passCount = checks.filter((c) => c.pass).length;
  const violations = checks.filter((c) => !c.pass).length;

  const weighted =
    0.22 * trap(p.mw, 0, 180, 420, 650) +
    0.2 * trap(p.xlogp, -3, 0, 3.5, 7) +
    0.14 * trap(p.hbd, -0.5, 0, 3, 7) +
    0.14 * trap(p.hba, 0, 2, 8, 14) +
    0.15 * trap(p.rot, -0.5, 0, 6, 14) +
    0.15 * trap(p.tpsa, 0, 20, 100, 180);

  const score = Math.round(Math.max(0, Math.min(100, 100 * weighted - violations * 6)));

  const strengths = [];
  const concerns = [];

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

  if (!strengths.length) strengths.push("No strong drug-likeness advantages versus the rest of this shortlist.");
  if (!concerns.length) concerns.push("No major Lipinski/Veber flags in the supplied properties.");

  return { score, passCount, violations, strengths, concerns, checks };
}

function reasonFor(candidate, scored, protein) {
  const name = nameOf(candidate);
  const targetBit = protein?.title || protein?.id ? ` for follow-up against ${protein.id || "the staged target"}` : "";
  if (scored.violations === 0) {
    return `${name} has the strongest overall physicochemical profile in this shortlist${targetBit}: ${scored.passCount}/6 drug-likeness checks pass, with a balanced size, polarity, and flexibility profile. Binding affinity is not assessed here — docking still needs to be run.`;
  }
  return `${name} is the best available option in this shortlist${targetBit}, but it still has ${scored.violations} drug-likeness flag(s). Treat this as a computational triage, not evidence of activity.`;
}

function summaryFor(ranked, protein) {
  const top = ranked[0];
  const target = protein?.id ? ` the staged target ${protein.id}` : " computational follow-up";
  return `Among ${ranked.length} staged molecules, ${nameOf(top)} is the strongest candidate to take into${target} based on PubChem physicochemical properties (Lipinski Rule-of-Five and Veber heuristics). This ranking does not include docking poses, ADME models, toxicity, or experimental data.`;
}

/**
 * Rank 2–5 candidates for early computational follow-up using only supplied
 * PubChem properties. Returns the same schema as the AI API.
 */
function rankCandidatesLocal(candidates, protein = null) {
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, MAX_CANDIDATES);
  if (list.length < 2) {
    throw new Error("Select at least 2 candidates.");
  }

  const scored = list.map((candidate) => {
    const local = scoreOne(candidate);
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
    strengths: item.strengths.slice(0, 3),
    concerns: item.concerns.slice(0, 3),
  }));

  const top = scored[0];
  const originalTop = list.find((c) => cidOf(c) === top.cid) || list[0];

  return {
    recommended: {
      cid: top.cid,
      score: top.score,
      reason: reasonFor(originalTop, top, protein),
    },
    ranking,
    summary: summaryFor(scored, protein),
    limitations: [
      "This ranking uses only the supplied PubChem properties (size, lipophilicity, H-bonding, flexibility, polar surface area).",
      "It cannot estimate binding affinity, selectivity, metabolism, toxicity, or clinical efficacy.",
      "Use SwissDock and SwissADME next, then experimental assays, before treating any molecule as a real lead.",
    ],
    source: "heuristic",
  };
}

module.exports = {
  MAX_CANDIDATES,
  drugLikenessChecks,
  nameOf,
  cidOf,
  rankCandidatesLocal,
};
