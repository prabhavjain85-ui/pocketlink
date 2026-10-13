/** Derringer–Suich style desirability + geometric composite (Phase 1). */

/** Monotone increasing desirability with a soft floor below `lo` (avoids score cliffs). */
export function dHi(x, lo, hi, p = 1) {
  const floor = 0.04;
  if (x >= hi) return 1;
  if (x > lo) return Math.pow((x - lo) / (hi - lo), p);
  if (x <= 0) return floor * 0.25;
  return floor + (1 - floor) * Math.pow(Math.min(x / lo, 1), Math.max(p, 0.5)) * 0.45;
}

/** Monotone decreasing desirability with a soft tail above `hi`. */
export function dLo(x, lo, hi, p = 1) {
  const floor = 0.04;
  if (x <= lo) return 1;
  if (x < hi) return Math.pow((hi - x) / (hi - lo), p);
  if (x >= hi * 1.35) return floor * 0.25;
  const t = (x - hi) / (hi - lo);
  return floor + (1 - floor) * Math.pow(Math.max(1 - t, 0), Math.max(p, 0.5)) * 0.45;
}

export function dWin(x, t, lo, hi) {
  const s = (hi - lo) / 4;
  if (s <= 0) return 0;
  const z = (x - t) / s;
  return Math.exp(-(z * z));
}

export const DEFAULT_WEIGHTS = {
  aff: 4.0,
  qed: 1.5,
  sa: 2.0,
  nov: 1.0,
  props: 1.0,
  admet: 0,
};

export const TARGET_FREE_WEIGHTS = {
  qed: 2.5,
  sa: 3.0,
  nov: 2.0,
  props: 2.5,
  admet: 0,
};

export function computeQED(props) {
  const mw = props.mw ?? 0;
  const alogp = props.logp ?? 0;
  const hba = props.hba ?? 0;
  const hbd = props.hbd ?? 0;
  const psa = props.tpsa ?? 0;
  const rotb = props.rotb ?? 0;
  const arom = props.aromaticRings ?? 0;
  const alerts = props.structuralAlerts ?? 0;

  const dMw = dHi(mw, 200, 500, 1);
  const dAlogp = dWin(alogp, 2.2, -0.5, 5.5);
  const dHba = dLo(hba, 10, 0, 1);
  const dHbd = dLo(hbd, 5, 0, 1);
  const dPsa = dWin(psa, 70, 20, 130);
  const dRotb = dLo(rotb, 8, 0, 1);
  const dArom = dLo(arom, 2, 0, 1);
  const dAlert = alerts <= 0 ? 1 : alerts === 1 ? 0.8 : 0.2;
  const terms = [dMw, dAlogp, dHba, dHbd, dPsa, dRotb, dArom, dAlert];
  const prod = terms.reduce((p, t) => p * Math.max(t, 1e-6), 1);
  return Math.pow(prod, 1 / terms.length);
}

export function desirabilityBundle(raw, { targetFree, maxTanimoto = 0 }) {
  const qed = raw.qed ?? computeQED(raw);
  const sa = raw.sa ?? 5;
  const novRaw = raw.novelty ?? 0;
  let dNov = dHi(novRaw, 0.1, 0.45, 1);
  if (maxTanimoto < 0.25 && (raw.dAff ?? 0) <= 0.6) dNov = Math.min(dNov, 0.6);

  const dQed = dHi(qed, 0.3, 0.8, 1);
  const dSa = dLo(sa, 2.0, 6.0, 1.5);
  const pains = raw.painsCount ?? 0;
  const brenk = raw.brenkCount ?? 0;
  let dAlerts = 1;
  if (brenk === 1) dAlerts = 0.5;
  if (brenk >= 2) dAlerts = 0;

  const dMw = dWin(raw.mw ?? 0, 380, 180, 550);
  const dLogp = dWin(raw.logp ?? 0, 2.8, -0.5, 5.0);
  const dTpsa = dWin(raw.tpsa ?? 0, 80, 20, 140);
  const dFsp3 = dHi(raw.fsp3 ?? 0, 0.15, 0.45, 1);
  const dProps = Math.pow(
    Math.max(dMw, 0.03) * Math.max(dLogp, 0.03) * Math.max(dTpsa, 0.03) * Math.max(dFsp3, 0.03),
    0.25
  );

  let dAff = null;
  if (!targetFree && raw.le != null) {
    dAff = dHi(raw.le, 0.2, 0.45, 1.5);
  }

  const weights = targetFree ? { ...TARGET_FREE_WEIGHTS } : { ...DEFAULT_WEIGHTS };
  if (targetFree) weights.aff = 0;

  const terms = [];
  if (!targetFree && dAff != null) terms.push({ key: "d_aff", w: weights.aff, d: dAff, raw: raw.le });
  terms.push({ key: "d_qed", w: weights.qed, d: dQed, raw: qed });
  terms.push({ key: "d_sa", w: weights.sa, d: dSa, raw: sa });
  terms.push({ key: "d_nov", w: weights.nov, d: dNov, raw: novRaw });
  terms.push({ key: "d_props", w: weights.props, d: dProps, raw: null });
  terms.push({ key: "d_alerts", w: 0.5, d: dAlerts, raw: brenk });

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
      d_alerts: dAlerts,
    },
    targetFree,
    formula: targetFree
      ? "Score = 100 × G × (d_qed^w2 · d_sa^w3 · d_nov^w4 · d_props^w5)^(1/Σw) — no affinity term (no target staged)"
      : "Score = 100 × G × (d_aff^w1 · d_qed^w2 · d_sa^w3 · d_nov^w4 · d_props^w5)^(1/Σw)",
  };
}
