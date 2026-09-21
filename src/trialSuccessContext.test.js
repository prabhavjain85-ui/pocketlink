import {
  getTrialSuccessContext,
  resolveTrialSuccessCategory,
  formatPhaseRate,
  LIMITATION_NOTE,
} from "./trialSuccessContext";

const egfrProtein = {
  id: "1M17",
  gene: "EGFR",
  name: "EGFR kinase",
  queryName: "EGFR",
  title: "Epidermal growth factor receptor",
};

const ablProtein = {
  id: "1IEP",
  gene: "ABL1",
  name: "ABL kinase",
  queryName: "ABL",
};

const gpcrProtein = {
  id: "3SN6",
  gene: "ADRB2",
  name: "Beta-2 adrenergic receptor",
  queryName: "ADRB2",
};

const unknownProtein = {
  id: "XXXX",
  name: "Uncharacterized protein",
};

test("resolves EGFR to egfr category (specific over broad kinase)", () => {
  const resolved = resolveTrialSuccessCategory(egfrProtein);
  expect(resolved.categoryKey).toBe("egfr");
  expect(resolved.matchType).toBe("target_rule");
});

test("resolves ABL to abl category", () => {
  const resolved = resolveTrialSuccessCategory(ablProtein);
  expect(resolved.categoryKey).toBe("abl");
});

test("resolves GPCR target to gpcr family bucket", () => {
  const resolved = resolveTrialSuccessCategory(gpcrProtein);
  expect(resolved.categoryKey).toBe("beta2_adrenergic");
});

test("returns unavailable context for unrecognized targets", () => {
  const ctx = getTrialSuccessContext(unknownProtein);
  expect(ctx.available).toBe(false);
  expect(ctx.limitationNote).toBe(LIMITATION_NOTE);
});

test("returns phase rates with reliability flag for EGFR", () => {
  const ctx = getTrialSuccessContext(egfrProtein);
  expect(ctx.available).toBe(true);
  expect(ctx.categoryLabel).toMatch(/EGFR/i);
  expect(ctx.phases.PHASE2).toBeDefined();
  expect(typeof ctx.phases.PHASE2.n).toBe("number");
  if (ctx.phases.PHASE2.n >= 10) {
    expect(ctx.phases.PHASE2.reliable).toBe(true);
    expect(ctx.phases.PHASE2.rate).toBeGreaterThan(0);
    expect(formatPhaseRate(ctx.phases.PHASE2)).toBeGreaterThan(0);
  }
});

test("kinase inhibitor category has n>=10 for at least one phase", () => {
  const ctx = getTrialSuccessContext({ gene: "JAK2", name: "JAK2 kinase", queryName: "JAK2" });
  expect(ctx.available).toBe(true);
  const reliablePhases = Object.values(ctx.phases).filter((p) => p.reliable);
  expect(reliablePhases.length).toBeGreaterThan(0);
});

test("formatPhaseRate returns null for unreliable phases", () => {
  expect(formatPhaseRate({ n: 3, rate: 0.5, reliable: false })).toBeNull();
  expect(formatPhaseRate({ n: 50, rate: 0.678, reliable: true })).toBe(67.8);
});
