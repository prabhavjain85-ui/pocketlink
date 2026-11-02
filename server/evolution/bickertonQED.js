/**
 * Bickerton et al. (2012) QED via RDKit ADS parameters and WEIGHT_MEAN.
 * @see https://github.com/rdkit/rdkit/blob/master/rdkit/Chem/QED.py
 */

const ADS = {
  MW: { A: 2.817065973, B: 392.5754953, C: 290.7489764, D: 2.419764353, E: 49.22325677, F: 65.37051707, DMAX: 104.9805561 },
  ALOGP: { A: 3.172690585, B: 137.8624751, C: 2.534937431, D: 4.581497897, E: 0.822739154, F: 0.576295591, DMAX: 131.3186604 },
  HBA: { A: 2.948620388, B: 160.4605972, C: 3.615294657, D: 4.435986202, E: 0.290141953, F: 1.300669958, DMAX: 148.7763046 },
  HBD: { A: 1.618662227, B: 1010.051101, C: 0.985094388, D: 1e-9, E: 0.713820843, F: 0.920922555, DMAX: 258.1632616 },
  PSA: { A: 1.876861559, B: 125.2232657, C: 62.90773554, D: 87.83366614, E: 12.01999824, F: 28.51324732, DMAX: 104.5686167 },
  ROTB: { A: 0.01, B: 272.4121427, C: 2.55837997, D: 1.565547684, E: 1.271567166, F: 2.758063707, DMAX: 105.4420403 },
  AROM: { A: 3.21778897, B: 957.7374108, C: 2.274627939, D: 1e-9, E: 1.317690384, F: 0.375760881, DMAX: 312.337261 },
  ALERTS: { A: 0.01, B: 1199.094025, C: -0.09002883, D: 1e-9, E: 0.185904477, F: 0.875193782, DMAX: 417.725314 },
};

const WEIGHT_MEAN = {
  MW: 0.66,
  ALOGP: 0.46,
  HBA: 0.05,
  HBD: 0.61,
  PSA: 0.06,
  ROTB: 0.65,
  AROM: 0.48,
  ALERTS: 0.95,
};

export function ads(x, p) {
  const exp1 = 1 + Math.exp(-1 * (x - p.C + p.D / 2) / p.E);
  const exp2 = 1 + Math.exp(-1 * (x - p.C - p.D / 2) / p.F);
  const dx = p.A + (p.B / exp1) * (1 - 1 / exp2);
  return dx / p.DMAX;
}

/**
 * @param {object} props — MW, ALOGP/logp, HBA, HBD, PSA/tpsa, ROTB/rotb, AROM/aromaticRings, ALERTS/alerts
 */
export function bickertonQED(props) {
  const q = {
    MW: props.MW ?? props.mw ?? 0,
    ALOGP: props.ALOGP ?? props.logp ?? props.alogp ?? 0,
    HBA: props.HBA ?? props.hba ?? 0,
    HBD: props.HBD ?? props.hbd ?? 0,
    PSA: props.PSA ?? props.tpsa ?? 0,
    ROTB: props.ROTB ?? props.rotb ?? 0,
    AROM: props.AROM ?? props.aromaticRings ?? 0,
    ALERTS: props.ALERTS ?? props.alerts ?? props.structuralAlerts ?? 0,
  };
  const d = {};
  for (const [name, val] of Object.entries(q)) {
    d[name] = ads(val, ADS[name]);
  }
  let logSum = 0;
  let wSum = 0;
  for (const name of Object.keys(WEIGHT_MEAN)) {
    const w = WEIGHT_MEAN[name];
    const di = Math.max(d[name], 1e-12);
    logSum += w * Math.log(di);
    wSum += w;
  }
  return Math.exp(logSum / wSum);
}
