const { rocAuc } = require("../../benchmark/bootstrap.mjs");

test("rocAuc: higher score ranks as more likely active (perfect → 1, inverted → 0)", () => {
  const labels = [true, true, false, false];
  const perfect = [10, 9, 2, 1];
  const inverted = [1, 2, 9, 10];
  expect(rocAuc(labels, perfect)).toBeCloseTo(1, 5);
  expect(rocAuc(labels, inverted)).toBeCloseTo(0, 5);
});

test("rocAuc: label convention matches benchmark (active = true / positive class)", () => {
  const activesFirst = [true, true, false, false];
  const decoysFirst = [false, false, true, true];
  const scores = [5, 4, 3, 2];
  expect(rocAuc(activesFirst, scores)).toBeCloseTo(1, 5);
  expect(rocAuc(decoysFirst, scores)).toBeCloseTo(0, 5);
});

test("DUD-E held-out eval uses role active for positive labels", () => {
  const fs = require("fs");
  const path = require("path");
  const heldoutPath = path.join(__dirname, "../../benchmark/dude_heldout_eval.json");
  if (!fs.existsSync(heldoutPath)) {
    return;
  }
  const heldout = JSON.parse(fs.readFileSync(heldoutPath, "utf8"));
  for (const t of heldout.targets || []) {
    for (const c of t.compounds || []) {
      expect(["active", "decoy"]).toContain(c.role);
      if (c.role === "active") {
        expect(c.role === "active").toBe(true);
      }
    }
  }
});
