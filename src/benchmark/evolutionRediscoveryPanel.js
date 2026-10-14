/**
 * Held-out ChEMBL actives for rediscovery benchmarking (same targets/split as docking enrichment).
 * Fixture generated from benchmark/docking/scripts/run_enrichment.py panel via scripts/build-evolution-rediscovery-fixture.mjs
 */

import panel from "../../benchmark/evolution/fixtures/chembl_rediscovery_panel.json";

export const REDISCOVERY_CLUSTER_TANIMOTO = 0.4;
export const REDISCOVERY_HIT_TANIMOTO = 0.55;

export function loadRediscoveryPanel() {
  return panel;
}

export function listRediscoveryTargets(minTestActives = 6) {
  return (panel.targets || []).filter((t) => (t.test_actives || []).length >= minTestActives);
}
