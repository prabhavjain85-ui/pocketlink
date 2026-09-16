const SITE_URL = "https://www.targetforge.in";
const SITE_NAME = "TargetForge";

const DEFAULT_TITLE = "TargetForge — AI-Powered Drug Discovery & Target Identification";
const DEFAULT_DESCRIPTION =
  "AI-powered drug discovery platform for drug repurposing, target identification, molecular docking, ADME analysis, and scientific hypothesis testing.";

export const ROUTE_SEO = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}/`,
  },
  "/hypothesis": {
    title: "Scientific Hypothesis Testing — TargetForge",
    description:
      "Evaluate drug discovery and biology hypotheses with evidence mapping, falsification checks, and structured scientific critique. Supports computational prioritization, not clinical proof.",
    canonical: `${SITE_URL}/hypothesis`,
  },
  "/target-discovery": {
    title: "Target Identification & Discovery — TargetForge",
    description:
      "Find genetically validated, underexplored protein targets for a disease using Open Targets evidence. Helps researchers prioritize candidates for follow-up screening.",
    canonical: `${SITE_URL}/target-discovery`,
  },
  "/repurposing": {
    title: "Drug Repurposing Screen — TargetForge",
    description:
      "Screen approved drugs against a protein target to surface repurposing candidates. Supports computational drug discovery with target-aware scoring across a curated library.",
    canonical: `${SITE_URL}/repurposing`,
  },
  "/adme": {
    title: "ADME & Pharmacokinetic Analysis — TargetForge",
    description:
      "Compute in-browser ADME properties, Lipinski/Veber filters, and BOILED-Egg absorption models with RDKit. Supports lead optimization and compound triage.",
    canonical: `${SITE_URL}/adme`,
  },
  "/docking": {
    title: "Molecular Docking Simulation — TargetForge",
    description:
      "Run in-browser receptor-ligand docking with binding energy estimates and 3D pose inspection. Supports computational structure-based prioritization.",
    canonical: `${SITE_URL}/docking`,
  },
  "/agent": {
    title: "Autonomous Research Agent — TargetForge",
    description:
      "Automated workflow combining target discovery, PDB selection, approved-drug ranking, and adversarial critique. Computational research support only.",
    canonical: `${SITE_URL}/agent`,
  },
  "/methodology": {
    title: "Scientific Methodology & Validation — TargetForge",
    description:
      "Transparent documentation of TargetForge scoring heuristics, cheminformatics rules, data sources, and operational boundaries for computational drug discovery.",
    canonical: `${SITE_URL}/methodology`,
  },
  "/contact": {
    title: "Contact TargetForge",
    description:
      "Get in touch about TargetForge workflows, collaborations, or feedback on computational drug discovery tools.",
    canonical: `${SITE_URL}/contact`,
  },
  "/history": {
    title: "Session History — TargetForge",
    description: "Review past TargetForge staging, screening, and agent sessions saved in your browser.",
    canonical: `${SITE_URL}/history`,
    noindex: true,
  },
};

export function getSeoForPath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ROUTE_SEO[path] || {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}${path === "/" ? "/" : path}`,
  };
}

export { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION };
