import { desirabilityBundle } from "./evolutionDesirability";

test("target-free mode drops affinity and spreads scores", () => {
  const a = desirabilityBundle(
    { qed: 0.55, sa: 3.2, novelty: 0.35, maxTanSeed: 0.55, mw: 380, logp: 2.5, tpsa: 75, fsp3: 0.3, painsCount: 0, brenkCount: 0 },
    { targetFree: true }
  );
  const b = desirabilityBundle(
    { qed: 0.72, sa: 2.5, novelty: 0.4, maxTanSeed: 0.55, mw: 360, logp: 2.2, tpsa: 70, fsp3: 0.35, painsCount: 0, brenkCount: 0 },
    { targetFree: true }
  );
  expect(a.targetFree).toBe(true);
  expect(a.desirabilities.d_aff).toBeNull();
  expect(Math.abs(a.displayScore - b.displayScore)).toBeGreaterThan(3);
  expect(a.formula).toMatch(/not potency|no affinity/i);
});
