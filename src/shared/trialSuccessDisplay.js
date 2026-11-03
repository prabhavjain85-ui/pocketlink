/**
 * Display-only constants and formatters for the browser.
 * The calculations that produce these values live in server/; this file holds no scoring logic.
 */

export const MIN_RELIABLE_SAMPLE = 30;

export function formatPhaseRate(phaseData) {
  if (!phaseData || phaseData.available === false) return null;
  const n = phaseData.n ?? phaseData.denominator ?? 0;
  const minN = phaseData.minSampleSize ?? MIN_RELIABLE_SAMPLE;
  if (!phaseData.reliable || n < minN) return null;
  return Math.round((phaseData.rate ?? 0) * 1000) / 10;
}

export function formatConfidenceInterval(ci) {
  if (!ci || typeof ci.low !== "number" || typeof ci.high !== "number") return null;
  const lowPct = (Math.round(ci.low * 1000) / 10).toFixed(1).replace(/\.0$/, "");
  const highPct = (Math.round(ci.high * 1000) / 10).toFixed(1).replace(/\.0$/, "");
  return `95% CI ${lowPct}–${highPct}%`;
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
  if (phaseData?.available === false) {
    return {
      kind: "unavailable",
      rateText: "Unavailable",
      ciText: null,
      detailText: phaseData.note || "not measurable from CT.gov",
    };
  }
  const n = phaseData?.n ?? phaseData?.denominator ?? 0;
  if (!phaseData || n === 0) {
    return {
      kind: "empty",
      rateText: "—",
      ciText: null,
      detailText: phaseData?.unit === "drugs" ? "no drugs in sample" : "no trials in sample",
    };
  }
  const minN = phaseData.minSampleSize ?? MIN_RELIABLE_SAMPLE;
  if (!phaseData.reliable || n < minN) {
    return {
      kind: "insufficient",
      rateText: `Insufficient sample (n=${n})`,
      ciText: null,
      detailText: null,
    };
  }
  const pct = formatPhaseRate(phaseData);
  const ciText = formatConfidenceInterval(phaseData.ci);
  return {
    kind: "rate",
    rateText: `${pct}%`,
    ciText,
    detailText: ciText ? `${ciText} · n=${n}` : `n=${n}`,
  };
}

export function formatWhyStoppedSummary(whyStopped) {
  if (!whyStopped || typeof whyStopped !== "object") return null;
  const eff = whyStopped.efficacy ?? 0;
  const saf = whyStopped.safety ?? 0;
  const op = whyStopped.operational ?? 0;
  const unk = whyStopped.unknown ?? 0;
  if (eff + saf + op + unk === 0) return null;
  return `Why stopped: efficacy ${eff} · safety ${saf} · operational ${op} · unknown ${unk}`;
}
