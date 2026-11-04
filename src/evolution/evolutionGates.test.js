import { getRDKit } from "../../server/rdkitLoader";
import { checkPainsFast } from "../../server/painsCheck";
import { structuralAlerts, elementSymbolsFromSmiles } from "../../server/evolution/evolutionGates";

const IMATINIB = "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1";

test("imatinib element whitelist uses only drug-like atoms", async () => {
  const RDKit = await getRDKit();
  const els = elementSymbolsFromSmiles(IMATINIB, RDKit);
  expect(els.every((e) => ["C", "N", "O", "S", "F", "Cl", "Br", "P", "H"].includes(e))).toBe(true);
});

test("Brenk catalog patterns are detected for structural alerts", () => {
  const peroxide = checkPainsFast({ IsomericSMILES: "CCOO" });
  const alerts = structuralAlerts("CCOO", { IsomericSMILES: "CCOO" });
  expect(peroxide.alerts.some((a) => /brenk/i.test(a.catalog || ""))).toBe(true);
  expect(alerts.brenk).toBeGreaterThan(0);
});
