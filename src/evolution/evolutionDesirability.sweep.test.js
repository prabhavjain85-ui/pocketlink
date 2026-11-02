import { dHi, dLo } from "../../server/evolution/evolutionDesirability";

function expectMonotone(samples, fn, increasing = true) {
  for (let i = 1; i < samples.length; i += 1) {
    const a = fn(samples[i - 1]);
    const b = fn(samples[i]);
    if (increasing) expect(b + 1e-9).toBeGreaterThanOrEqual(a);
    else expect(a + 1e-9).toBeGreaterThanOrEqual(b);
  }
}

test("dHi and dLo are continuous and monotone on a sweep", () => {
  const xs = Array.from({ length: 50 }, (_, i) => 0.05 + i * 0.2);
  const hiXs = Array.from({ length: 30 }, (_, i) => 2 + (i * 6) / 29);
  expectMonotone(hiXs, (x) => dHi(x, 2, 8, 1.5), true);
  const loXs = Array.from({ length: 30 }, (_, i) => 2.5 + (i * 7) / 29);
  expectMonotone(loXs, (x) => dLo(x, 2, 10, 1), false);

  const mid = dHi(5, 2, 8, 1);
  const left = dHi(1.99, 2, 8, 1);
  const right = dHi(2.01, 2, 8, 1);
  expect(Math.abs(left - right)).toBeLessThan(0.2);
  expect(mid).toBeGreaterThan(left);
});

test("dLo penalizes high HBA/rotb/aromatic counts (correct lo/hi order)", () => {
  expect(dLo(0, 0, 10, 1)).toBeGreaterThan(dLo(12, 0, 10, 1));
  expect(dLo(0, 0, 8, 1)).toBeGreaterThan(dLo(15, 0, 8, 1));
  expect(dLo(1, 0, 3, 1)).toBeGreaterThan(dLo(4, 0, 3, 1));
});
