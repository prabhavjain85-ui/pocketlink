/**
 * Online ridge surrogate for ligand efficiency (no persisted model files).
 */

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

export function featurizeRow({ mw = 0, logp = 0, tpsa = 0, hbd = 0, hba = 0, rotb = 0, fsp3 = 0, heavyAtoms = 0, morganBits = [] }) {
  const base = [1, mw / 500, logp / 5, tpsa / 140, hbd / 5, hba / 10, rotb / 12, fsp3, heavyAtoms / 45];
  const bits = new Array(64).fill(0);
  for (const b of morganBits.slice(0, 64)) bits[b % 64] += 1;
  return base.concat(bits);
}

export class OnlineSurrogate {
  constructor({ lambda = 2.0 } = {}) {
    this.lambda = lambda;
    this.samples = [];
    this.weights = null;
    this.bias = 0;
    this.residualMse = 0.25;
  }

  addSample(features, le) {
    if (!Number.isFinite(le)) return;
    this.samples.push({ x: features, y: le });
    if (this.samples.length > 800) this.samples.shift();
    this.fit();
  }

  fit() {
    const n = this.samples.length;
    if (n < 3) return;
    const dim = this.samples[0].x.length;
    const w = new Array(dim).fill(0);
    let bias = 0;
    const lr = 0.08;
    for (let epoch = 0; epoch < 40; epoch += 1) {
      for (const { x, y } of this.samples) {
        const pred = dot(w, x) + bias;
        const err = pred - y;
        for (let i = 0; i < dim; i += 1) {
          w[i] -= lr * (err * x[i] + this.lambda * w[i] / n);
        }
        bias -= lr * err;
      }
    }
    this.weights = w;
    this.bias = bias;
    let sse = 0;
    for (const { x, y } of this.samples) {
      const e = dot(w, x) + bias - y;
      sse += e * e;
    }
    this.residualMse = sse / n;
  }

  predict(features) {
    if (!this.weights) {
      return { yhat: 0.25, sigma: 0.35, trained: false };
    }
    const yhat = dot(this.weights, features) + this.bias;
    const sigma = Math.sqrt(Math.max(this.residualMse, 0.02));
    return { yhat, sigma, trained: true };
  }
}
