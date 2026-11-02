/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export function formatPhaseRate(phaseData) {
  if (!phaseData || !phaseData.reliable) return null;
  return Math.round((phaseData.rate ?? 0) * 1000) / 10;
}

export function describeTrialSuccessMatch(context) {
  if (!context?.available) return null;
  switch (context.matchType) {
    case "target_rule":
      if (context.ruleId) {
        const label = String(context.ruleId).replace(/_/g, " ").toUpperCase();
        return `Specific target rule (${label})`;
      }
      return "Specific target rule";
    case "family":
      if (context.family) {
        return `Target family bucket (${context.family})`;
      }
      return "Target family bucket";
    case "compound_hint":
      return "Compound class hint";
    case "kinase_broad_fallback":
      return "Broad kinase bucket (fallback when no specific rule matches)";
    default:
      return null;
  }
}

export function formatPhaseDisplay(phaseData) {
  if (!phaseData || phaseData.n === 0) {
    return { kind: "empty", rateText: "—", detailText: "no trials in sample" };
  }
  if (!phaseData.reliable) {
    return {
      kind: "insufficient",
      rateText: `Insufficient sample (n=${phaseData.n})`,
      detailText: null,
    };
  }
  const pct = formatPhaseRate(phaseData);
  return {
    kind: "rate",
    rateText: `${pct}%`,
    detailText: `n=${phaseData.n}`,
  };
}
