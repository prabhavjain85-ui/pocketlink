/**
 * Unit tests for enrichment metric helpers (mirrors benchmark/docking/lib/metrics.py).
 */

function rocAuc(labels, scores) {
  const pairs = labels.map((y, i) => ({ y, s: scores[i] }));
  pairs.sort((a, b) => b.s - a.s);
  let nPos = 0;
  let nNeg = 0;
  for (const p of pairs) {
    if (p.y) nPos++;
    else nNeg++;
  }
  if (!nPos || !nNeg) return null;

  let tp = 0;
  let fp = 0;
  let prevTp = 0;
  let prevFp = 0;
  let auc = 0;
  let lastScore = null;

  for (const p of pairs) {
    if (p.s !== lastScore) {
      auc += (tp + prevTp) * (fp - prevFp) / 2;
      prevTp = tp;
      prevFp = fp;
      lastScore = p.s;
    }
    if (p.y) tp++;
    else fp++;
  }
  auc += (tp + prevTp) * (fp - prevFp) / 2;
  return auc / (nPos * nNeg);
}

describe("benchmark metrics", () => {
  it("computes perfect ROC-AUC", () => {
    expect(rocAuc([1, 1, 0, 0], [2, 1, 0, -1])).toBe(1);
  });

  it("returns null when only one class", () => {
    expect(rocAuc([1, 1], [1, 2])).toBeNull();
  });
});
