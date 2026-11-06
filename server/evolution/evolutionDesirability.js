/** Derringer–Suich style desirability + geometric composite. */

import { bickertonQED } from "./bickertonQED.js";

/** Monotone increasing: soft floor below `lo`, reaches 1 at `hi` (continuous in x). */
export function dHi(x, lo, hi, p = 1) {
  const eps = 1e-6;
  if (hi <= lo) return eps;
  if (x >= hi) return 1;
  if (x <= 0) return eps;
  if (x < lo) {
    const t = x / lo;
    return eps + (0.12 - eps) * Math.pow(Math.min(t, 1), Math.max(p, 0.5));
  }
  const t = (x - lo) / (hi - lo);
  return eps + (1 - eps) * Math.pow(Math.min(Math.max(t, 0), 1), p);
}

/** Monotone decreasing: 1 at or below `lo`, soft tail above `hi`. */
export function dLo(x, lo, hi, p = 1) {
  const eps = 1e-6;
  if (hi <= lo) return eps;
  if (x <= lo) return 1;
  if (x >= hi) {
    const over = (x - hi) / (hi - lo + eps);
    return eps + (0.12 - eps) * Math.pow(1 / (1 + over), Math.max(p, 0.5));
  }
  const t = (hi - x) / (hi - lo);
  return eps + (1 - eps) * Math.pow(Math.min(Math.max(t, 0), 1), p);
}

export function dWin(x, t, lo, hi) {
  const s = (hi - lo) / 4;
  if (s <= 0) return 1e-6;
  const z = (x - t) / s;
  return Math.max(1e-6, Math.exp(-(z * z)));
}

export const DEFAULT_WEIGHTS = {
  aff: 4.0,
  qed: 1.5,
  sa: 2.0,
  nov: 1.0,
  props: 1.0,
  size: 1.2,
  lipo: 1.0,
  admet: 0,
};

export const TARGET_FREE_WEIGHTS = {
  qed: 1.5,
  sa: 3.0,
  nov: 2.0,
  props: 2.0,
  size: 3.5,
  lipo: 2.0,
  leadMw: 3.0,
  admet: 0,
};

/** Published Bickerton QED from physchem + alert count (use qedFromRdkit for full HBA/AROM). */
export function computeQED(props) {
  return bickertonQED(props);
}

/** Novelty: distance from seed and from current population (internal diversity). */
export function computeNovelty({ maxTanSeed = 0, maxTanPopulation = 0 }) {
  const dSeed = 1 - maxTanSeed;
  const dPop = 1 - maxTanPopulation;
  return 0.55 * dSeed + 0.45 * dPop;
}

export function desirabilityBundle(raw, { targetFree, failureMode = "standard", dRemediation = null } = {}) {
  const qed = raw.qed ?? computeQED(raw);
  const sa = raw.sa ?? 5;
  const novRaw = raw.novelty ?? computeNovelty({
    maxTanSeed: raw.maxTanSeed ?? 0,
    maxTanPopulation: raw.maxTanPopulation ?? 0,
  });
  const dNov = dHi(novRaw, 0.1, 0.45, 1);

  const dQed = dHi(qed, 0.3, 0.8, 1);
  const dSa = dLo(sa, 2.0, 6.0, 1.5);
  const pains = raw.painsCount ?? 0;
  const brenk = raw.brenkCount ?? 0;
  let dAlerts = 1;
  if (brenk === 1) dAlerts = 0.5;
  if (brenk >= 2) dAlerts = 0;

  const mw = raw.mw ?? 0;
  const logp = raw.logp ?? 0;
  const tpsa = raw.tpsa ?? 0;
  const fsp3 = raw.fsp3 ?? 0;

  const dMw =
    failureMode === "solubility_pk"
      ? dLo(mw, 370, 460, 1.3)
      : failureMode === "cardiotoxicity"
        ? dLo(mw, 410, 490, 1.2)
        : dWin(mw, 380, 180, 550);
  const dLogp =
    failureMode === "hepatotoxicity"
      ? dLo(logp, 2.2, 3.5, 1.4)
      : failureMode === "cardiotoxicity"
        ? dWin(logp, 1.8, 0.2, 3.0)
        : failureMode === "cns_sparing" || failureMode === "solubility_pk"
          ? dLo(logp, 2.4, 3.7, 1.3)
          : dWin(logp, 2.8, -0.5, 5.0);
  const dTpsa =
    failureMode === "cns_sparing"
      ? dWin(tpsa, 110, 82, 142)
      : failureMode === "cardiotoxicity"
        ? dHi(tpsa, 55, 85, 1.2)
        : dWin(tpsa, 80, 20, 140);
  const dFsp3 =
    failureMode === "hepatotoxicity"
      ? dHi(fsp3, 0.18, 0.38, 1.2)
      : dHi(fsp3, 0.15, 0.45, 1);
  const dProps = Math.pow(
    Math.max(dMw, 0.03) * Math.max(dLogp, 0.03) * Math.max(dTpsa, 0.03) * Math.max(dFsp3, 0.03),
    0.25
  );

  const dSize = dWin(mw, 380, 220, 520);
  const dLipo =
    failureMode === "hepatotoxicity" || failureMode === "cardiotoxicity"
      ? dWin(logp, 1.9, 0.3, 3.2)
      : dWin(logp, 2.5, 0.5, 4.5);
  const dLeadMw = dHi(mw, 280, 420, 1.2);

  let dAff = null;
  if (!targetFree && raw.le != null && Number.isFinite(raw.le)) {
    dAff = dHi(raw.le, 0.2, 0.45, 1.5);
  }

  const weights = targetFree ? { ...TARGET_FREE_WEIGHTS } : { ...DEFAULT_WEIGHTS };
  if (targetFree) weights.aff = 0;

  const terms = [];
  if (!targetFree && dAff != null) {
    terms.push({ key: "d_aff", w: weights.aff, d: dAff, raw: raw.le });
  }
  terms.push({ key: "d_qed", w: weights.qed, d: dQed, raw: qed });
  terms.push({ key: "d_sa", w: weights.sa, d: dSa, raw: sa });
  terms.push({ key: "d_nov", w: weights.nov, d: dNov, raw: novRaw });
  terms.push({ key: "d_props", w: weights.props, d: dProps, raw: null });
  terms.push({ key: "d_size", w: weights.size, d: dSize, raw: mw });
  terms.push({ key: "d_lipo", w: weights.lipo, d: dLipo, raw: logp });
  if (targetFree) terms.push({ key: "d_lead_mw", w: weights.leadMw ?? 3, d: dLeadMw, raw: mw });
  terms.push({ key: "d_alerts", w: 0.5, d: dAlerts, raw: brenk });
  if (failureMode && failureMode !== "standard" && dRemediation != null && Number.isFinite(dRemediation)) {
    terms.push({ key: "d_remediation", w: 2.6, d: dRemediation, raw: dRemediation });
  }

  const wSum = terms.reduce((s, t) => s + t.w, 0);
  let logSum = 0;
  for (const t of terms) {
    const d = Math.max(t.d, 1e-6);
    logSum += t.w * Math.log(d);
  }
  const D = Math.exp(logSum / wSum);
  let G = 1;
  if (pains > 0) G = 0;
  else if (brenk === 1) G = 0.85;
  const displayScore = 100 * D * G;

  const contributions = terms.map((t) => ({
    ...t,
    logContribution: (t.w * Math.log(Math.max(t.d, 1e-6))) / wSum,
  }));

  return {
    displayScore: Number(displayScore.toFixed(2)),
    D: Number(D.toFixed(4)),
    G,
    terms,
    contributions,
    desirabilities: {
      d_aff: dAff,
      d_qed: dQed,
      d_sa: dSa,
      d_nov: dNov,
      d_props: dProps,
      d_size: dSize,
      d_lipo: dLipo,
      d_lead_mw: targetFree ? dLeadMw : null,
      d_alerts: dAlerts,
      d_remediation: dRemediation,
    },
    targetFree,
    failureMode: failureMode || "standard",
    paretoRank: raw.paretoRank ?? null,
    formula:
      failureMode && failureMode !== "standard"
        ? `Clinical failure remediation (${failureMode}): Pareto rank + d_remediation (w=2.6) enforce failure-correction windows.`
        : targetFree
          ? "Chemistry-quality filter (not potency): Pareto rank on (−QED, SA, −novelty, props); display score is secondary."
          : "Target-aware score: affinity (LE) dominates; display score is secondary to Pareto rank.",
  };
}
