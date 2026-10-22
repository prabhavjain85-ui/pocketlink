/**
 * Present heuristic-v2 integers as ordinal prioritization tiers (not binding probabilities).
 * Band boundaries follow scoreOne() in scoreCandidates.js:
 *   +55 on-target, +20 co-crystal ligand name, +12 same-family/demoted, +25 generic family, up to +24 drug-likeness, alert penalties.
 */

export function triagePriorityTier(score, hints = {}) {
  const tb = hints.targetBonus;
  const lb = hints.ligandBonus;

  if (typeof tb === "number") {
    if (tb >= 55 && lb > 0) {
      return {
        id: "on-target-ligand",
        label: "On-target + co-crystal ligand name",
        typical: "75–99",
      };
    }
    if (tb >= 55) {
      return {
        id: "on-target",
        label: "On-target pharmacology",
        typical: "55–79",
      };
    }
    if (tb >= 25) {
      return {
        id: "family-fallback",
        label: "Target family (no gene rule)",
        typical: "25–49",
      };
    }
    if (tb >= 12) {
      return {
        id: "same-family",
        label: "Same family / demoted",
        typical: "12–36",
      };
    }
    return {
      id: "druglike-only",
      label: "Drug-likeness only",
      typical: "1–24",
    };
  }

  const s = Number(score);
  if (!Number.isFinite(s)) {
    return { id: "unknown", label: "Unscored", typical: "—" };
  }
  if (s >= 75) {
    return {
      id: "on-target-ligand",
      label: "High tier (often on-target + co-crystal ligand name)",
      typical: "75–99",
    };
  }
  if (s >= 55) {
    return { id: "on-target", label: "On-target pharmacology tier", typical: "55–79" };
  }
  if (s >= 37) {
    return { id: "family-fallback", label: "Target family tier", typical: "25–49" };
  }
  if (s >= 12) {
    return { id: "same-family", label: "Same family / demoted tier", typical: "12–36" };
  }
  return { id: "druglike-only", label: "Drug-likeness-only tier", typical: "1–24" };
}

/** @returns {{ score: number, tier: object, line: string, note: string }} */
export function formatTriageScore(score, hints = {}) {
  const tier = triagePriorityTier(score, hints);
  const note = "Prioritization heuristic — not a binding affinity or activity probability.";
  const line = `${score} · ${tier.label} (typical ${tier.typical})`;
  return { score, tier, line, note };
}
