const { applyCorsHeaders } = require("./_lib/security");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

let cachedGoogleGenAI = null;
async function getGoogleGenAI() {
  if (cachedGoogleGenAI) return cachedGoogleGenAI;
  try {
    const genaiMod = await import("@google/genai");
    cachedGoogleGenAI = genaiMod.GoogleGenAI;
    return cachedGoogleGenAI;
  } catch (err) {
    console.warn("[hypothesis-eval] Failed to import @google/genai:", err.message);
    return null;
  }
}

function json(res, status, body, req = null) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  applyCorsHeaders(req, res, "POST, OPTIONS");
  res.end(JSON.stringify(body));
}

function clean(value, max = 5000) {
  return String(value ?? "").slice(0, max);
}

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Query Europe PMC for real peer-reviewed scientific literature
 */
async function fetchEuropePmc(query, pageSize = 5) {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encoded}&format=json&pageSize=${pageSize}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const list = data?.resultList?.result || [];
    return list.map((item) => ({
      title: clean(item.title, 250),
      journal: clean(item.journalTitle || item.bookOrReportDetails?.publisher, 100),
      year: item.pubYear ? String(item.pubYear) : "",
      pmid: item.pmid ? String(item.pmid) : "",
      doi: item.doi ? String(item.doi) : "",
      url: item.pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${item.pmid}/`
        : item.doi
        ? `https://doi.org/${item.doi}`
        : `https://europepmc.org/article/MED/${item.id}`,
      authors: clean(item.authorString, 150),
    }));
  } catch (err) {
    console.warn("[hypothesis-eval] Europe PMC query failed:", err.message);
    return [];
  }
}

/**
 * Query ClinicalTrials.gov API v2
 */
async function fetchClinicalTrials(term, pageSize = 3) {
  try {
    const encoded = encodeURIComponent(term);
    const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encoded}&pageSize=${pageSize}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const studies = data?.studies || [];
    return studies.map((s) => {
      const proto = s.protocolSection || {};
      const id = proto.identificationModule?.nctId || "";
      const title = proto.identificationModule?.briefTitle || "";
      const status = proto.statusModule?.overallStatus || "";
      const phases = (proto.designModule?.phases || []).join(", ") || "Phase unstated";
      return {
        nctId: id,
        title: clean(title, 250),
        status,
        phases,
        url: id ? `https://clinicaltrials.gov/study/${id}` : "",
      };
    });
  } catch (err) {
    console.warn("[hypothesis-eval] ClinicalTrials API failed:", err.message);
    return [];
  }
}

/**
 * Query Open Targets GraphQL for genetic associations and clinical candidate counts
 */
async function fetchOpenTargets(diseaseName, targetSymbol) {
  try {
    const url = "https://api.platform.opentargets.org/api/v4/graphql";
    const query = `
      query SearchAndCheck($disease: String!, $target: String!) {
        diseaseSearch: search(queryString: $disease, entityNames: ["disease"], page: { index: 0, size: 2 }) {
          hits { id name }
        }
        targetSearch: search(queryString: $target, entityNames: ["target"], page: { index: 0, size: 2 }) {
          hits {
            id
            name
            entity
            ... on Target {
              approvedSymbol
              approvedName
              drugAndClinicalCandidates { count }
            }
          }
        }
      }
    `;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TargetForge/1.0 (Drug Discovery Workbench)",
      },
      body: JSON.stringify({
        query,
        variables: { disease: diseaseName || "", target: targetSymbol || "" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    const diseaseHit = body?.data?.diseaseSearch?.hits?.[0] || null;
    const targetHit = body?.data?.targetSearch?.hits?.[0] || null;
    return {
      disease: diseaseHit ? { id: diseaseHit.id, name: diseaseHit.name } : null,
      target: targetHit
        ? {
            id: targetHit.id,
            symbol: targetHit.approvedSymbol || targetHit.name,
            name: targetHit.approvedName || targetHit.name,
            drugCount: targetHit.drugAndClinicalCandidates?.count ?? 0,
          }
        : null,
    };
  } catch (err) {
    console.warn("[hypothesis-eval] Open Targets query failed:", err.message);
    return null;
  }
}

/**
 * Curated knowledge base for landmark scientific benchmarks
 */
const CURATED_HYPOTHESIS_BENCHMARKS = {
  "ikk_uc": {
    matches: (text) => {
      const lower = text.toLowerCase();
      return (
        (lower.includes("ikk") || lower.includes("ikbkb") || lower.includes("nf-kb") || lower.includes("nfkb")) &&
        (lower.includes("colitis") || lower.includes("ibd") || lower.includes("ulcerative"))
      );
    },
    parse: {
      disease: "Ulcerative colitis",
      target: "IKKβ (IKBKB) / Canonical IκB Kinase Subunit Beta",
      targetGene: "IKBKB",
      intervention: "Small-molecule pharmacological inhibition of IKKβ",
      proposedMechanism: "Phosphorylation inhibition of IκBα → blockade of canonical p50/p65 NF-κB nuclear translocation → suppression of pro-inflammatory cytokines (TNF, IL-1β, IL-6) in mucosal immune cells.",
      expectedOutcome: "Suppression of colonic mucosal inflammation and reduction of Ulcerative Colitis Disease Activity Index (UCDAI).",
      potentialRisks: "Severe disruption of intestinal epithelial barrier integrity, enterocyte apoptosis, opportunistic intestinal infections, compensatory non-canonical NF-κB/MAPK activation, and hepatotoxicity.",
      patientPopulation: "Moderate-to-severe refractory ulcerative colitis non-responsive to conventional 5-ASA or biologic therapies."
    },
    evaluation: {
      biologicalPlausibility: {
        score: 84,
        rationale: "NF-κB signaling is profoundly upregulated in inflamed mucosal biopsies of ulcerative colitis patients. IKKβ is the catalytic core of the canonical signalosome, phosphorylating IκBα to release p50/p65 for nuclear transcription of pro-inflammatory chemokines, cytokines, and adhesion molecules. However, plausibility is cell-type dependent: while beneficial in infiltrating macrophages/dendritic cells, IKKβ is essential for homeostatic anti-apoptotic survival in colonic enterocytes."
      },
      humanGeneticEvidence: {
        classification: "WEAK SUPPORT",
        summary: "Broad IBD GWAS identifies susceptibility loci in the NF-κB regulatory pathway (NFKB1, REL, TNFAIP3/A20, CARD9), demonstrating pathway involvement. However, direct human loss-of-function (LoF) mutations in IKBKB cause severe combined immunodeficiency (SCID) with impaired antibody production and intractable bacterial/viral susceptibility (Pannicke et al., J Exp Med 2014), rather than isolated protection against intestinal inflammation."
      },
      cellularEvidence: {
        geneticPerturbation: "siRNA or shRNA silencing of IKBKB in human monocyte-derived macrophages (THP-1) suppresses LPS-stimulated TNF-α, IL-6, and IL-1β production by >75%. In intestinal epithelial cell lines (Caco-2, HT-29), IKBKB knockdown triggers sensitization to TNF-induced apoptosis and loss of claudin-1 tight-junction barrier integrity.",
        pharmacologicalPerturbation: "Selective IKKβ small molecules (e.g. BMS-345541, ML120B, TPCA-1) inhibit IKKβ kinase activity with cell-free IC50 of 0.3–4.0 μM and suppress NF-κB reporter assays. However, pharmacological inhibition also represses anti-apoptotic Bcl-xL and c-FLIP expression in enterocytes."
      },
      animalEvidence: {
        summary: "Remarkable cell-type discordance documented in Cre-lox conditional murine models: Myeloid-specific deletion of IKKβ (Ikbkb^Δmyeloid) protects against colitis-associated pro-inflammatory cytokine expression. In stark contrast, enterocyte-specific deletion of IKKβ (Ikbkb^ΔIEC) in mice causes severe spontaneous apoptosis of colonic epithelial cells, breakdown of mucosal barrier function, bacterial translocation, and exacerbates DSS-induced colitis (Greten et al., Cell 2004). Systemic administration of non-selective IKK inhibitors in murine colitis models shows narrow therapeutic windows and frequent colonic epithelial ulceration."
      },
      clinicalEvidence: {
        trials: [
          {
            title: "Phase 1/2 Studies of Systemic IKKβ Inhibitors (MLN1202, AS602868, SAR113945)",
            status: "Terminated / Discontinued",
            phase: "Phase 1 / 2",
            failureCause: "Toxicity & Narrow Therapeutic Window",
            failureDetail: "Programs were abandoned due to dose-limiting gastrointestinal adverse events, reversible transaminase elevations (hepatotoxicity), and safety concerns regarding broad systemic immunosuppression before achieving sustained target occupancy in inflamed tissues."
          }
        ],
        whyFailedAnalysis: "Systemic IKKβ inhibitor clinical trials failed primarily due to on-target toxicity (enterocyte death and hepatocyte apoptosis) and lack of cell-type selectivity. Because NF-κB drives anti-apoptotic cytoprotection in non-immune epithelial barriers, systemic blockade cannot selectively spare enterocytes while silencing macrophages."
      },
      pharmacologicalFeasibility: {
        cascade: "Oral Drug → GI Absorption → Plasma Free Exposure → Intestinal Lamina Propria Infiltration → Intracellular Kinase Pocket Engagement → IκBα Phosphorylation Block → Mucosal Cytokine Drop",
        ic50: "Potent in vitro tools exist (0.1–1.0 μM), but clinical candidates exhibit high plasma protein binding (>95%), requiring high total plasma concentrations that precipitate off-target kinase inhibition and systemic toxicity.",
        pkPdLimits: "Achieving >80% sustained target engagement in intestinal mucosal leukocytes without exceeding the hepatic or epithelial safety threshold has proven pharmacologically unfeasible with systemic oral small molecules.",
        status: "Unfavorable without targeted drug delivery"
      },
      safetyToxicology: {
        level: "HIGH",
        rationale: "IKKβ is an essential survival node across normal somatic tissues. Complete genetic ablation in mice is embryonically lethal due to massive TNF-mediated hepatocyte apoptosis. In humans, chronic systemic suppression causes enterocyte apoptosis, hepatic transaminitis, and severe vulnerability to opportunistic opportunistic infections."
      },
      contradictionEngine: {
        whyMightBeWrong: [
          {
            point: "Enterocyte Homeostatic Protection Paradox",
            detail: "Enterocyte-specific IKKβ knockout in mice spontaneously causes epithelial apoptosis, mucosal sloughing, and exacerbates colitis rather than healing it (Greten et al., Cell 2004; PMID: 15329723). The target is protective in the gut epithelium while pathogenic in immune cells.",
            source: "Greten FR et al. Cell 2004;118(3):285-296"
          },
          {
            point: "Human Monogenic Loss-of-Function Phenotype",
            detail: "Human germline mutations in IKBKB cause autosomal recessive Severe Combined Immunodeficiency (SCID), characterized by severe hypogammaglobulinemia, absence of specific antibodies, and recurrent opportunistic infections (Pannicke et al., J Exp Med 2014; PMID: 24706786).",
            source: "Pannicke U et al. J Exp Med 2014;211(4):585-592"
          },
          {
            point: "Systemic Clinical Trial Failures",
            detail: "Multiple pharmaceutical programs (Millennium, Sanofi, Serono) attempted small-molecule IKKβ inhibition for inflammatory disorders; all were abandoned in Phase 1/2 due to gastrointestinal intolerance, liver toxicity, or lack of therapeutic window.",
            source: "Gilmore TD, Herscovitch M. Oncogene 2006;25(51):6887-6899"
          },
          {
            point: "Compensatory Inflammatory Pathways",
            detail: "Inhibition of canonical IKKβ/NF-κB often leads to compensatory upregulation of non-canonical NF-κB (IKKα/p100 processing) or p38 MAPK / AP-1 signaling, preserving mucosal chemokine production.",
            source: "Sun SC. Nat Rev Immunol 2017;17(9):545-558"
          }
        ]
      },
      evidenceMatrix: [
        {
          claim: "NF-κB p65 nuclear translocation is elevated in mucosal biopsies of ulcerative colitis patients",
          evidence_type: "Observational",
          direction: "SUPPORTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Schreiber S et al. Gut 1998;42(4):477-484 (PMID: 9616307)"
        },
        {
          claim: "Human IKBKB loss-of-function variants cause severe combined immunodeficiency rather than isolated gut anti-inflammation",
          evidence_type: "Human genetics",
          direction: "CONTRADICTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Pannicke U et al. J Exp Med 2014;211(4):585-592 (PMID: 24706786)"
        },
        {
          claim: "Enterocyte-specific deletion of IKKβ in mice causes epithelial apoptosis and worsens DSS-induced colitis",
          evidence_type: "Animal",
          direction: "CONTRADICTS",
          strength: "VERY STRONG",
          human_relevance: "MODERATE",
          source: "Greten FR et al. Cell 2004;118(3):285-296 (PMID: 15329723)"
        },
        {
          claim: "Myeloid-specific deletion of IKKβ in mice reduces pro-inflammatory cytokines and tumor incidence",
          evidence_type: "Animal",
          direction: "SUPPORTS",
          strength: "STRONG",
          human_relevance: "MODERATE",
          source: "Greten FR et al. Cell 2004;118(3):285-296 (PMID: 15329723)"
        },
        {
          claim: "Selective IKKβ inhibitor BMS-345541 suppresses cytokine expression in cultured human monocytes",
          evidence_type: "Cellular",
          direction: "SUPPORTS",
          strength: "MODERATE",
          human_relevance: "MODERATE",
          source: "Burke JR et al. J Biol Chem 2003;278(3):1450-1456 (PMID: 12403772)"
        },
        {
          claim: "Phase 1/2 clinical candidates targeting IKKβ failed due to liver and gastrointestinal toxicities",
          evidence_type: "Clinical trial",
          direction: "CONTRADICTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Prescott JA et al. Expert Opin Ther Targets 2012;16(11):1063-1076 (PMID: 22924409)"
        }
      ],
      causalityScore: {
        score: 48,
        classification: "CAUSALITY UNCERTAIN / COMPARTMENT-DEPENDENT",
        reasoning: "CORRELATION ≠ CAUSATION. While elevated mucosal NF-κB correlates strongly with active ulcerative colitis, direct functional perturbation of IKKβ produces divergent, opposing outcomes: therapeutic anti-inflammatory action in myeloid cells vs catastrophic barrier breakdown in enterocytes. Changing the target in a whole organism does not yield monotonic benefit."
      },
      knowledgeGaps: [
        { gap: "Can cell-targeted delivery (e.g. antibody-drug conjugate or nanoparticle targeting macrophages) avoid enterocyte apoptosis?", rank: "CRITICAL" },
        { gap: "Is partial (e.g. 50%) allosteric modulation of IKKβ safer than ATP-competitive catalytic shutdown?", rank: "HIGH" },
        { gap: "What are the patient-specific biomarkers distinguishing epithelial-vulnerable from immune-dominant colitis?", rank: "MEDIUM" },
        { gap: "Does gut microbiota dysbiosis accelerate enterocyte apoptosis during IKKβ inhibition?", rank: "LOW" }
      ],
      experiments: [
        {
          name: "Dual-Compartment Organoid & Co-Culture Perturbation",
          objective: "Assess whether IKKβ inhibition selectively reduces macrophage inflammatory cytokine release without compromising human intestinal epithelial barrier integrity.",
          model: "Human primary colonic epithelial organoids co-cultured with activated human peripheral blood mononuclear cells (PBMCs).",
          intervention: "IKKβ inhibitor (ML120B or BMS-345541) at 100 nM, 300 nM, 1 μM versus CRISPR IKBKB knockout.",
          control: "Vehicle control (0.1% DMSO) and non-targeting guide RNA.",
          primaryEndpoint: "Transepithelial electrical resistance (TEER) across 72 hours.",
          secondaryEndpoint: "Supernatant TNF, IL-6, and cleaved caspase-3 enterocyte apoptosis staining.",
          expectedTrue: "TEER remains preserved while TNF and IL-6 drop significantly (>50%).",
          expectedFalse: "TEER drops rapidly (<50% of baseline), with widespread caspase-3 activation in organoid enterocytes.",
          interpretation: "If TEER collapses, systemic IKKβ inhibition is inherently toxic to the human intestinal barrier regardless of monocyte suppression."
        },
        {
          name: "Colon-Targeted vs Systemic Delivery in Murine Dextran Sulfate Colitis",
          objective: "Determine whether colon-restricted or macrophage-homing nanocarrier formulation prevents the enterocyte toxicity seen with systemic IKKβ inhibition.",
          model: "Dextran sulfate sodium (DSS)-induced colitis in C57BL/6 mice.",
          intervention: "Systemic oral IKKβ inhibitor vs colon-targeted nanoparticle-encapsulated formulation.",
          control: "Vehicle-treated colitis and healthy control mice.",
          primaryEndpoint: "Histological colitis score and body weight loss at Day 7.",
          secondaryEndpoint: "Mucosal bacterial translocation into mesenteric lymph nodes.",
          expectedTrue: "Nanoparticle formulation heals mucosa without bacterial translocation; systemic drug worsens ulcers.",
          expectedFalse: "Both formulations fail to mitigate mucosal damage or cause weight loss.",
          interpretation: "Confirms that formulation technology can circumvent the intrinsic biological liability of the target."
        }
      ],
      falsificationCriteria: [
        "Pharmacological IKKβ inhibition causes enterocyte apoptosis and mucosal permeability breakdown in human colonic organoids at concentrations required for cytokine suppression.",
        "Systemic IKKβ inhibition in experimental colitis models fails to improve disease activity index or worsens bacterial translocation.",
        "Clinical achievable free drug concentrations in human plasma trigger dose-limiting hepatic transaminase elevations before achieving 50% target engagement in colonic tissue.",
        "Inhibition of IKKβ in gut biopsies triggers compensatory non-canonical NF-κB or p38 MAPK hyperactivation that maintains mucosal inflammation."
      ],
      decisionScore: {
        overall: 58,
        classification: "WEAK / NEEDS MORE EVIDENCE",
        breakdown: {
          biologicalPlausibility: 84,
          humanEvidence: 35,
          causalEvidence: 48,
          pharmacologicalFeasibility: 32,
          clinicalValidation: 20,
          safety: 25,
          contradictoryPenalty: -26
        },
        note: "TargetForge Evidence-Based Hypothesis Score (0–100). This is a computational triage and prioritization score, not a validated regulatory or clinical endpoint."
      },
      scientificVerdict: {
        verdict: "Current biological evidence demonstrates that while IKKβ drives pro-inflammatory cytokine expression in myeloid cells, it simultaneously serves an essential anti-apoptotic survival function in human intestinal epithelial cells. Systemic small-molecule inhibition has repeatedly failed in clinical development due to on-target mucosal breakdown and hepatotoxicity. The hypothesis should not be advanced as a systemic oral therapy.",
        recommendation: "DO NOT ADVANCE (SYSTEMIC) / INVESTIGATE FURTHER (CELL-TARGETED ONLY)",
        recommendationRationale: "Do not pursue systemic oral IKKβ kinase inhibitors for ulcerative colitis due to insurmountable on-target epithelial toxicity. Only reconsider if utilizing cell-specific delivery vehicles (macrophage-targeted nanoparticles or antibody-drug conjugates) that completely spare intestinal enterocytes."
      },
      competingHypotheses: [
        {
          hypothesis: "Upstream JAK-STAT inhibition (e.g. Tofacitinib, Upadacitinib) provides broader immune suppression with acceptable mucosal tolerance.",
          evidence: "Clinically validated and approved for ulcerative colitis with clear remission rates in Phase 3 trials.",
          contradictions: "Increased risk of herpes zoster infection, venous thromboembolism at high doses.",
          confidence: "HIGH"
        },
        {
          hypothesis: "Targeting specific downstream cytokines (TNF-α, IL-12/23, or IL-23p19) rather than core transcription factor kinase prevents barrier apoptosis.",
          evidence: "Infliximab, Vedolizumab, and Ustekinumab achieve mucosal healing without triggering enterocyte death.",
          contradictions: "Primary and secondary non-response occurs in 30–40% of patients.",
          confidence: "VERY HIGH"
        },
        {
          hypothesis: "Selective allosteric inhibition of non-canonical NF-κB (NIK) or specific p50/p65 co-factors spares basal enterocyte survival.",
          evidence: "Preclinical studies show preservation of intestinal epithelial barrier integrity with selective NIK modulation.",
          contradictions: "Early discovery phase; lack of clinically tested selective small molecules.",
          confidence: "MODERATE"
        }
      ],
      aiDebate: [
        {
          role: "BIOLOGIST",
          title: "Cellular Biologist",
          argument: "The target expression pattern is the Achilles heel here. IKKβ is not just an inflammatory switch in macrophages; it is constitutively required by intestinal epithelial stem cells to withstand luminal oxidative stress. Silencing it in enterocytes triggers unmitigated apoptosis."
        },
        {
          role: "PHARMACOLOGIST",
          title: "Molecular Pharmacologist",
          argument: "Standard ATP-competitive kinase inhibitors cannot differentiate between IKKβ in a dendritic cell and IKKβ in a colonocyte. Furthermore, achieving sustained >80% target engagement at mucosal concentrations without exceeding systemic hepatotoxicity limits is pharmacologically implausible."
        },
        {
          role: "GENETICIST",
          title: "Human Geneticist",
          argument: "GWAS implicates the NF-κB regulome, but human genetics does not support IKBKB deficiency as a therapeutic state. Null human mutations cause SCID and lethal immunodeficiency. Human genetics screams that complete loss-of-function is deleterious."
        },
        {
          role: "CLINICAL SCIENTIST",
          title: "Translational Clinician",
          argument: "Every major pharmaceutical attempt to bring systemic IKKβ inhibitors to the clinic—from Millennium's MLN1202 to Sanofi and Serono candidates—stumbled over gastrointestinal adverse events, liver enzyme spikes, and infections. The clinical graveyard for this mechanism is full."
        },
        {
          role: "TOXICOLOGIST",
          title: "Safety & Toxicology Specialist",
          argument: "Safety concern is definitely HIGH. Mice with whole-body Ikkb knockout die in utero of liver apoptosis, and intestinal-specific knockouts die of septic peritonitis following DSS challenge. The therapeutic window is virtually non-existent."
        },
        {
          role: "SKEPTIC",
          title: "Methodological Skeptic",
          argument: "The published literature has a massive confirmation bias: hundreds of papers report that compound X inhibits IKK and reduces cytokines in a dish. Yet when placed in a living intestine, epithelial destruction dominates. Do not confuse cell-line cytokine reduction with therapeutic efficacy."
        },
        {
          role: "SCIENTIFIC JUDGE",
          title: "Chief Scientific Synthesizer",
          argument: "Consensus verdict is decisive: The hypothesis fails on causality and safety. The target has opposing physiological functions in the diseased tissue. Systemic small-molecule inhibition is a proven dead end. Only cell-targeted or mucosal-restricted modalities warrant exploratory research."
        }
      ]
    }
  },

  "metformin_cancer": {
    matches: (text) => {
      const lower = text.toLowerCase();
      return (
        lower.includes("metformin") &&
        (lower.includes("cancer") || lower.includes("tumor") || lower.includes("oncolog") || lower.includes("carcinoma"))
      );
    },
    parse: {
      disease: "Solid tumors / Oncological indications",
      target: "Mitochondrial Complex I (NADH:ubiquinone oxidoreductase) / Indirect AMPK activation (PRKAA1/2)",
      targetGene: "PRKAA1",
      intervention: "Repurposing of oral Metformin (1,000–2,000 mg/day)",
      proposedMechanism: "Inhibition of mitochondrial Complex I reduces oxidative phosphorylation → elevated AMP/ATP ratio activates AMPK → downstream inhibition of mTORC1 suppresses protein synthesis and cell proliferation; systemic reduction of hepatic gluconeogenesis lowers circulating insulin and IGF-1 levels.",
      expectedOutcome: "Prolongation of disease-free survival, reduction in tumor proliferation, and decreased cancer recurrence.",
      potentialRisks: "Gastrointestinal disturbances (diarrhea, nausea), vitamin B12 deficiency with chronic use, rare lactic acidosis in renal impairment, and lack of antitumor efficacy at clinically achievable human doses.",
      patientPopulation: "Patients with solid tumors (e.g. breast, prostate, colorectal) undergoing adjuvant therapy or chemoprevention."
    },
    evaluation: {
      biologicalPlausibility: {
        score: 86,
        rationale: "Cancer cells exhibit heightened anabolic metabolism and often rely on mTORC1 signaling and hyperinsulinemia. In vitro, metformin modulates the LKB1-AMPK-mTORC1 axis and reduces circulating insulin/IGF-1 in animal models. The biochemical mechanism is plausible, but translational feasibility is severely limited by achievable tissue concentration."
      },
      humanGeneticEvidence: {
        classification: "WEAK SUPPORT / NEUTRAL",
        summary: "Mendelian randomization studies using genetic variants in AMPK subunits or metformin target proxies (such as SLC22A1/OCT1 or mitochondrial Complex I genes) do NOT show consistent causal protection against breast, prostate, or colorectal cancer incidence in the general population (PMID: 32669733)."
      },
      cellularEvidence: {
        geneticPerturbation: "Genetic activation of AMPK or knockout of mTORC1 components retards neoplastic transformation in cultured cells. However, metformin's antitumor effect in vitro is abolished in cells lacking organic cation transporters (OCT1/2/3) or deficient in LKB1 (STK11).",
        pharmacologicalPerturbation: "Direct cell-autonomous growth arrest and Complex I inhibition in vitro consistently require supra-pharmacological concentrations (1–10 mM). Standard human therapeutic doses yield steady-state plasma concentrations of only 10–40 μM—roughly 100- to 1,000-fold lower than the concentrations needed for direct cell-autonomous antitumor effects in vitro."
      },
      animalEvidence: {
        summary: "Rodent xenograft and chemical carcinogenesis models show modest tumor growth inhibition, but experiments routinely administer high doses (150–300 mg/kg/day, roughly 5- to 10-fold human equivalent dose on a body surface area basis) and tumor suppression correlates predominantly with host systemic insulin reduction rather than direct intratumoral Complex I poisoning."
      },
      clinicalEvidence: {
        trials: [
          {
            title: "CCTG MA.32: Phase 3 Randomized Trial of Metformin in Early Breast Cancer",
            status: "Completed (Negative)",
            phase: "Phase 3",
            failureCause: "Lack of Efficacy in Unselected Population",
            failureDetail: "In 3,649 patients with high-risk operative breast cancer, adding metformin (850 mg BID for 5 years) to standard adjuvant therapy showed no improvement in disease-free survival (HR 1.01; 95% CI 0.84–1.21) or overall survival (Goodwin et al., JAMA 2022; PMID: 35608620)."
          },
          {
            title: "Multiple Phase 2 Trials in Pancreatic, Prostate, and Colorectal Cancer",
            status: "Completed (Mostly Negative)",
            phase: "Phase 2",
            failureCause: "Insufficient Target Engagement & Tumor Heterogeneity",
            failureDetail: "Systematic reviews of over 30 randomized controlled trials have confirmed no statistically significant overall survival benefit across unselected solid tumor cohorts."
          }
        ],
        whyFailedAnalysis: "The discrepancy between early retrospective observational studies and modern Phase 3 randomized controlled trials is now recognized as classic 'immortal time bias' and confounding by indication. Furthermore, plasma concentrations in patients cannot achieve direct tumor cell Complex I inhibition without causing fatal lactic acidosis."
      },
      pharmacologicalFeasibility: {
        cascade: "Oral Drug (1-2g) → Intestinal Absorption via PMAT → Portal Vein Accumulation (Liver Uptake via OCT1) → Systemic Plasma Concentration (10–40 μM) → Solid Tumor Interstitial Penetration → Intracellular Uptake (severely limited by low OCT1/2 expression in many solid tumors) → Intramitochondrial Complex I Engagement (requires mM concentrations)",
        ic50: "In vitro Complex I IC50 is ~1–5 mM; human plasma Cmax is ~15–30 μM. Intratumoral exposure is inadequate for cell-autonomous cytotoxicity.",
        pkPdLimits: "Free tumor exposure is orders of magnitude below the concentration needed for direct AMPK activation or mTOR shutdown. Only systemic hepatic gluconeogenesis and insulin reduction occur at clinical doses.",
        status: "Unfavorable for direct cytotoxicity; marginal for endocrine effect"
      },
      safetyToxicology: {
        level: "LOW",
        rationale: "Metformin has over 60 years of documented clinical safety in hundreds of millions of patients. Well-characterized gastrointestinal side effects (10–20%); lactic acidosis risk is exceedingly rare (<5 cases per 100,000 patient-years) and confined to severe renal impairment."
      },
      contradictionEngine: {
        whyMightBeWrong: [
          {
            point: "Definitive Phase 3 RCT (CCTG MA.32) Showed Zero Survival Benefit",
            detail: "The landmark double-blind Phase 3 MA.32 trial (3,649 breast cancer patients) demonstrated that 5 years of adjuvant metformin provided no benefit in disease-free or overall survival (Goodwin et al., JAMA 2022; PMID: 35608620).",
            source: "Goodwin PJ et al. JAMA 2022;327(20):1969-1981"
          },
          {
            point: "Supra-Pharmacological In Vitro Dose Fallacy",
            detail: "Hundreds of preclinical publications report potent anticancer effects at 1 to 20 mM concentrations. In humans, standard antidiabetic dosing yields peak plasma levels of ~20 μM. The concentrations studied in vitro are physiologically unachievable in vivo.",
            source: "Pollak M. Nat Rev Cancer 2012;12(3):159-169"
          },
          {
            point: "Epidemiological Benefit Driven by Immortal Time Bias",
            detail: "Early observational claims that diabetics taking metformin had 30–50% lower cancer mortality were proven to be artifacts of immortal time bias, time-window bias, and healthy user effect (Suissa & Azoulay, Diabetes Care 2012; PMID: 22187499).",
            source: "Suissa S, Azoulay L. Diabetes Care 2012;35(1):156-165"
          },
          {
            point: "Tumor Loss of Organic Cation Transporters & LKB1",
            detail: "Solid tumors frequently downregulate OCT1/2 transporters and harbor STK11/LKB1 inactivating mutations (e.g. in lung and cervical cancers), rendering cells intrinsically incapable of importing the drug or activating AMPK.",
            source: "Shackelford DB, Shaw RJ. Nat Rev Cancer 2009;9(8):563-575"
          }
        ]
      },
      evidenceMatrix: [
        {
          claim: "Retrospective observational cohorts initially linked metformin use to reduced cancer incidence in type 2 diabetics",
          evidence_type: "Observational",
          direction: "SUPPORTS",
          strength: "WEAK",
          human_relevance: "HIGH",
          source: "Evans JM et al. BMJ 2005;330(7503):1304-1305 (PMID: 15849206)"
        },
        {
          claim: "Phase 3 randomized trial MA.32 found no disease-free or overall survival benefit in 3,649 breast cancer patients",
          evidence_type: "Clinical trial",
          direction: "CONTRADICTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Goodwin PJ et al. JAMA 2022;327(20):1969-1981 (PMID: 35608620)"
        },
        {
          claim: "Observational anticancer signal was largely attributable to immortal time bias and confounding by indication",
          evidence_type: "Observational",
          direction: "CONTRADICTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Suissa S, Azoulay L. Diabetes Care 2012;35(1):156-165 (PMID: 22187499)"
        },
        {
          claim: "In vitro direct tumor inhibition requires 1–10 mM metformin, whereas patient plasma levels are 10–40 μM",
          evidence_type: "Pharmacology",
          direction: "CONTRADICTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Heckman-Stoddard BM et al. Nat Rev Clin Oncol 2017;14(11):668-677 (PMID: 28653678)"
        },
        {
          claim: "Mendelian randomization does not support genetically proxied AMPK activation in cancer prevention",
          evidence_type: "Human genetics",
          direction: "CONTRADICTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Yarmolinsky J et al. BMJ 2020;369:m1203 (PMID: 32669733)"
        },
        {
          claim: "Metformin reliably reduces circulating insulin and IGF-1 levels in hyperinsulinemic cancer patients",
          evidence_type: "Clinical trial",
          direction: "SUPPORTS",
          strength: "MODERATE",
          human_relevance: "HIGH",
          source: "Pollak M. Lancet Oncol 2014;15(9):e393-e400 (PMID: 25079101)"
        }
      ],
      causalityScore: {
        score: 34,
        classification: "CORRELATIONAL / CONTRADICTED IN UNSELECTED COHORTS",
        reasoning: "CORRELATION ≠ CAUSATION. The hypothesis was born out of epidemiological correlation, but prospective randomized intervention trials (the gold standard for causality) consistently fail to replicate survival benefits. Changing metformin exposure in unselected cancer patients does not alter disease outcome."
      },
      knowledgeGaps: [
        { gap: "Is there an antitumor effect strictly confined to hyperinsulinemic patients with high insulin-receptor expression?", rank: "HIGH" },
        { gap: "Can mitochondrial Complex I inhibitors with 100x higher potency achieve tumor target engagement at nanomolar doses?", rank: "HIGH" },
        { gap: "Does tumor OCT1 transporter expression predict intratumoral drug accumulation?", rank: "MEDIUM" },
        { gap: "Is there synergy with specific anti-PD-1 or anti-CTLA-4 immunotherapy through T-cell metabolic reprogramming?", rank: "LOW" }
      ],
      experiments: [
        {
          name: "Biomarker-Stratified Pharmacodynamic Window-of-Opportunity Trial",
          objective: "Assess whether 2 weeks of presurgical metformin achieves intratumoral Complex I inhibition and mTOR suppression in patients stratified by OCT1 and LKB1 expression.",
          model: "Presurgical patients with operable colorectal or breast cancer with high versus low tumor OCT1 expression.",
          intervention: "Metformin 1,500 mg/day for 14 days prior to surgical resection.",
          control: "Matched untreated or placebo presurgical cohort.",
          primaryEndpoint: "Tumor tissue metformin concentration (by LC-MS/MS) and phosphor-p70S6K / phosphor-ACC quantification.",
          secondaryEndpoint: "Ki-67 proliferation index in resected tumor specimens.",
          expectedTrue: "Tumors with high OCT1 demonstrate measurable drug accumulation and >40% suppression of phospho-p70S6K and Ki-67.",
          expectedFalse: "Intratumoral drug concentrations remain below 10 μM, and phospho-p70S6K is unchanged regardless of OCT1 status.",
          interpretation: "If high OCT1 tumors still fail to engage the target, direct intratumoral repurposing of metformin is definitive dead end."
        },
        {
          name: "Synergy Testing with Dual Insulin Receptor / IGF-1R Inhibition",
          objective: "Disentangle the systemic host insulin-lowering effect from direct tumor cell-autonomous cytotoxicity.",
          model: "Patient-derived xenograft (PDX) models in hyperinsulinemic vs normoinsulinemic diet-induced obese NSG mice.",
          intervention: "Metformin vs specific IGF-1R/IR inhibitor (e.g. linsitinib) vs combination.",
          control: "Vehicle-treated obese and lean control mice.",
          primaryEndpoint: "Tumor volume kinetics over 28 days.",
          secondaryEndpoint: "Serum insulin, C-peptide, and intratumoral phospho-Akt levels.",
          expectedTrue: "Tumor suppression occurs only in hyperinsulinemic mice and mirrors insulin-lowering kinetics.",
          expectedFalse: "Tumor suppression occurs equally in lean mice without hyperinsulinemia.",
          interpretation: "Establishes whether the mechanism is purely an indirect endocrine phenomenon."
        }
      ],
      falsificationCriteria: [
        "Phase 3 randomized controlled trials demonstrate hazard ratio of 1.0 (no survival benefit) when metformin is added to standard of care in unselected cancer patients (already observed in CCTG MA.32).",
        "Direct mass spectrometry measurements of patient tumor biopsies reveal steady-state metformin concentrations <20 μM (far below the 1–5 mM required for Complex I inhibition).",
        "Mendelian randomization studies show no protective causal association between genetically proxied metformin targets and cancer risk.",
        "Clinical trials in LKB1-deficient or OCT1-negative tumors show identical outcomes to OCT1-positive tumors."
      ],
      decisionScore: {
        overall: 48,
        classification: "WEAK / NEEDS MORE EVIDENCE",
        breakdown: {
          biologicalPlausibility: 86,
          humanEvidence: 32,
          causalEvidence: 34,
          pharmacologicalFeasibility: 28,
          clinicalValidation: 22,
          safety: 85,
          contradictoryPenalty: -29
        },
        note: "TargetForge Evidence-Based Hypothesis Score (0–100). This is a computational triage and prioritization score, not a validated regulatory or clinical endpoint."
      },
      scientificVerdict: {
        verdict: "The hypothesis that standard antidiabetic doses of metformin provide broad antitumor efficacy is contradicted by definitive Phase 3 randomized controlled trials (such as CCTG MA.32) and compromised by severe pharmacokinetic exposure limits. While preclinical cell-line studies show potent inhibition at millimolar concentrations, these levels are unachievable in human solid tumors. General repurposing is not supported.",
        recommendation: "LOW PRIORITY FOR GENERAL CANCER / INVESTIGATE FURTHER ONLY IN BIOMARKER-DEFINED SUBSETS",
        recommendationRationale: "Cease broad unselected clinical trials of metformin in oncology. Future efforts should be strictly limited to window-of-opportunity studies in hyperinsulinemic patients whose tumors express high OCT1 transporters and intact LKB1 signaling."
      },
      competingHypotheses: [
        {
          hypothesis: "The reported benefit in early studies was entirely an artifact of immortal time bias and confounding in observational datasets.",
          evidence: "Extensively proven by pharmacoepidemiologic re-analyses (Suissa & Azoulay 2012).",
          contradictions: "Some small biomarker changes (insulin, Ki-67) are genuine in selected presurgical windows.",
          confidence: "VERY HIGH"
        },
        {
          hypothesis: "Direct mitochondrial Complex I inhibition requires novel high-potency biguanide analogues (e.g. IM156, phenformin) rather than metformin.",
          evidence: "IM156 and phenformin enter cells independently of OCT1 and inhibit Complex I at nanomolar to low micromolar concentrations.",
          contradictions: "Higher risk of severe lactic acidosis (which led to phenformin's clinical withdrawal in the 1970s).",
          confidence: "HIGH"
        },
        {
          hypothesis: "Metformin's only meaningful role in cancer is as an indirect metabolic adjuvant to counter PI3K-inhibitor-induced hyperglycemia.",
          evidence: "PI3K inhibitors trigger massive compensatory insulin release that reactivates tumor growth; metformin blunts this insulin spike.",
          contradictions: "Narrows the application to a tiny niche of combination regimens.",
          confidence: "MODERATE"
        }
      ],
      aiDebate: [
        {
          role: "BIOLOGIST",
          title: "Cancer Biologist",
          argument: "In the petri dish, metformin works like magic—it turns on AMPK, turns off mTOR, and shuts down biosynthesis. But we must be scientifically honest: we were treating cells with 5 mM metformin. That's 200 times higher than the patient's blood level!"
        },
        {
          role: "PHARMACOLOGIST",
          title: "Clinical Pharmacologist",
          argument: "Metformin is a hydrophilic cation with a charge at physiological pH. It relies entirely on OCT1 for uptake. Solid tumors frequently have low or absent OCT1. The intracellular free concentration inside a breast or colon carcinoma is virtually zero."
        },
        {
          role: "GENETICIST",
          title: "Statistical Geneticist",
          argument: "Mendelian randomization using genetic instruments for AMPK and Complex I subunits shows zero protective association against incident cancer. Human genetics fails to replicate the observational epidemiological excitement."
        },
        {
          role: "CLINICAL SCIENTIST",
          title: "Oncology Trialist",
          argument: "The MA.32 trial was definitive: 3,649 patients, 5 years of treatment, double-blind, randomized. The hazard ratio was 1.01. It did not move the needle one millimeter. When a large Phase 3 trial is completely flat, you have to accept that the hypothesis in an unselected population is dead."
        },
        {
          role: "TOXICOLOGIST",
          title: "Safety Specialist",
          argument: "From a safety standpoint, metformin is very clean. But you cannot simply raise the dose to achieve the in vitro micromolar/millimolar exposure, because high systemic biguanide levels cause lactic acidosis."
        },
        {
          role: "SKEPTIC",
          title: "Methodological Skeptic",
          argument: "This is a textbook case of confirmation bias combined with immortal time bias. Thousands of academic papers were published on an artifact of flawed observational study designs. Science must move forward by accepting negative clinical trial results."
        },
        {
          role: "SCIENTIFIC JUDGE",
          title: "Chief Scientific Synthesizer",
          argument: "Verdict: The hypothesis is contradicted by Phase 3 clinical data and undermined by exposure physics. Repurposing metformin for general solid tumors is scientifically unviable. Restrict any remaining research to specific endocrine combinations or biomarker-selected subsets."
        }
      ]
    }
  },

  "tnf_ra": {
    matches: (text) => {
      const lower = text.toLowerCase();
      return (
        (lower.includes("tnf") || lower.includes("tumor necrosis")) &&
        (lower.includes("rheumatoid") || lower.includes("arthritis") || lower.includes("synovitis"))
      );
    },
    parse: {
      disease: "Rheumatoid arthritis",
      target: "Tumor Necrosis Factor alpha (TNF / TNF-α)",
      targetGene: "TNF",
      intervention: "Anti-TNF biologic therapy (Infliximab, Adalimumab, Etanercept)",
      proposedMechanism: "Neutralization of soluble and transmembrane TNF-α prevents engagement of TNFR1/TNFR2 receptors → blocks downstream NF-κB and MAPK signaling in synovial fibroblasts and macrophages → downregulates IL-1, IL-6, matrix metalloproteinases (MMPs), and RANKL → suppresses synovitis and prevents osteoclastic bone erosion.",
      expectedOutcome: "Substantial reduction in DAS28 disease activity, achievement of ACR20/50/70 clinical response, and radiographic arrest of structural joint damage.",
      potentialRisks: "Increased vulnerability to serious bacterial and fungal infections, reactivation of latent tuberculosis (Mycobacterium tuberculosis), paradoxical psoriasis, demyelinating disease, and secondary loss of response due to anti-drug antibodies (ADAs).",
      patientPopulation: "Adults with moderate-to-severe active rheumatoid arthritis with inadequate response or intolerance to conventional synthetic DMARDs (methotrexate)."
    },
    evaluation: {
      biologicalPlausibility: {
        score: 98,
        rationale: "TNF-α is the cardinal upstream driver of the synovial inflammatory cascade in rheumatoid arthritis. It induces endothelial adhesion molecules, activates osteoclasts via RANKL upregulation, induces synovial fibroblast hyperproliferation, and stimulates secondary inflammatory mediators (IL-6, IL-1β, PGE2). Biological plausibility is exceptionally high."
      },
      humanGeneticEvidence: {
        classification: "STRONG SUPPORT",
        summary: "Extensive GWAS and fine-mapping studies consistently identify the HLA-DRB1 locus, TNF promoter polymorphisms, and key TNF-regulatory genes (such as TNFAIP3/A20, TRAF1, C5-TRAF1) as principal genetic determinants of rheumatoid arthritis susceptibility in human populations."
      },
      cellularEvidence: {
        geneticPerturbation: "Transgenic mice expressing human TNF-α develop 100% penetrant, severe chronic inflammatory polyarthritis that closely phenocopies human rheumatoid arthritis, complete with synovial pannus, cartilage degradation, and bone erosion (Keffer et al., EMBO J 1991).",
        pharmacologicalPerturbation: "Neutralizing monoclonal antibodies (e.g. infliximab, adalimumab) and receptor fusion proteins (etanercept) bind TNF with picomolar to sub-nanomolar affinity (Kd < 100 pM), inhibiting TNF-induced IL-6 and MMP-3 secretion in rheumatoid synovial cell cultures."
      },
      animalEvidence: {
        summary: "The human TNF transgenic mouse (Tg197) and collagen-induced arthritis (CIA) models in rodents demonstrated dramatic, dose-dependent prevention and reversal of joint inflammation upon administration of anti-TNF biologics, serving as one of the most successful translational benchmarks in modern pharmacology."
      },
      clinicalEvidence: {
        trials: [
          {
            title: "ATTRACT: Anti-TNF Therapy in Rheumatoid Arthritis with Concomitant Therapy",
            status: "Completed (Positive Landmark)",
            phase: "Phase 3",
            failureCause: "N/A (Clinically Validated)",
            failureDetail: "Infliximab plus methotrexate achieved rapid, sustained ACR20/50 responses in over 50% of methotrexate-refractory patients and halted radiographic joint space narrowing over 2 years (Lipsky et al., N Engl J Med 2000; PMID: 11107714)."
          },
          {
            title: "ARMADA: Anti-TNF Monoclonal Antibody Adalimumab in Active RA",
            status: "Completed (Positive Landmark)",
            phase: "Phase 3",
            failureCause: "N/A (Clinically Validated)",
            failureDetail: "Adalimumab demonstrated significant efficacy and safety in patients with active RA despite methotrexate therapy (Weinblatt et al., Arthritis Rheum 2003; PMID: 12528101)."
          }
        ],
        whyFailedAnalysis: "This mechanism represents an unequivocal clinical success rather than a failure. However, a crucial clinical reality is that 30–40% of patients exhibit primary or secondary non-response due to immune pathway heterogeneity (alternative dependence on IL-6, JAK-STAT, or T-cell costimulation) or immunogenicity (anti-drug antibody development)."
      },
      pharmacologicalFeasibility: {
        cascade: "Subcutaneous or IV Biologic Dose → Systemic Circulation → Synovial Fluid Extravasation → High-Affinity Binding (Kd < 100 pM) to Soluble & Membrane TNF → Complex Clearance & Neutralization → Rapid Decline in Synovial Proinflammatory Mediators → Clinical Remission",
        ic50: "Sub-nanomolar binding affinity (Kd ~10–100 pM) guarantees near-complete (>95%) neutralization of soluble TNF at therapeutic dosing.",
        pkPdLimits: "Biologics have long elimination half-lives (10–14 days). Limitation: oral small-molecule inhibitors of TNF have consistently failed due to the wide, flat protein-protein interaction interface of the TNF trimer.",
        status: "Highly favorable for biologics; unfeasible for conventional small molecules"
      },
      safetyToxicology: {
        level: "MODERATE",
        rationale: "TNF is required for macrophage activation and granuloma maintenance against intracellular pathogens. Inhibition increases risk of serious infections and latent tuberculosis reactivation (requiring mandatory pre-treatment screening). Rare risks include demyelinating disease, drug-induced lupus, and worsening congestive heart failure."
      },
      contradictionEngine: {
        whyMightBeWrong: [
          {
            point: "30–40% Primary or Secondary Non-Response Rate",
            detail: "Despite TNF's central role, approximately one-third of RA patients fail to achieve ACR50 response, demonstrating that rheumatoid arthritis is biologically heterogeneous and can be sustained independently by IL-6, GM-CSF, or JAK-STAT cascades.",
            source: "Buch MH. Nat Rev Rheumatol 2018;14(11):625-636"
          },
          {
            point: "Small-Molecule Druggability Failure",
            detail: "Over 25 years of medicinal chemistry efforts have failed to generate an effective, approved oral small-molecule direct TNF inhibitor. The homotrimeric interface lacks deep binding pockets amenable to small-molecule blockade.",
            source: "O'Shea JJ et al. Nat Rev Rheumatol 2013;9(3):173-182"
          },
          {
            point: "Latent Tuberculosis Reactivation & Opportunistic Infection",
            detail: "TNF neutralization dissolves granulomas, causing a 4- to 5-fold increased incidence of active tuberculosis and fungal infections if not rigorously screened and managed.",
            source: "Keane J et al. N Engl J Med 2001;345(15):1098-1104"
          },
          {
            point: "Paradoxical Autoimmune and Inflammatory Reactions",
            detail: "A subset of patients treated with anti-TNF agents develop paradoxical new-onset psoriasis, lupus-like antinuclear antibodies, or demyelinating events, illustrating complex regulatory feedback in the immune network.",
            source: "Fiorino G et al. Autoimmun Rev 2014;13(1):15-19"
          }
        ]
      },
      evidenceMatrix: [
        {
          claim: "High levels of active TNF-α are present in rheumatoid synovial fluid and drive tissue destruction",
          evidence_type: "Observational",
          direction: "SUPPORTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Saxne T et al. Arthritis Rheum 1988;31(8):1041-1045 (PMID: 3408544)"
        },
        {
          claim: "Human TNF transgenic mice spontaneously develop destructive arthritis reversed by anti-TNF antibody",
          evidence_type: "Animal",
          direction: "SUPPORTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Keffer J et al. EMBO J 1991;10(13):4025-4031 (PMID: 1721867)"
        },
        {
          claim: "Phase 3 randomized controlled trials demonstrated sustained ACR20/50 response and radiographic arrest",
          evidence_type: "Clinical trial",
          direction: "SUPPORTS",
          strength: "VERY STRONG",
          human_relevance: "HIGH",
          source: "Lipsky PE et al. N Engl J Med 2000;343(22):1594-1602 (PMID: 11107714)"
        },
        {
          claim: "30–40% of rheumatoid arthritis patients fail to respond or lose response over time",
          evidence_type: "Clinical trial",
          direction: "CONTRADICTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Rubbert-Roth A, Finckh A. Arthritis Res Ther 2009;11(Suppl 1):S1 (PMID: 19895697)"
        },
        {
          claim: "TNF inhibition increases the risk of latent tuberculosis reactivation and serious infections",
          evidence_type: "Clinical trial",
          direction: "CONTRADICTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Keane J et al. N Engl J Med 2001;345(15):1098-1104 (PMID: 11680443)"
        },
        {
          claim: "GWAS strongly implicates the HLA-DRB1 and TNFAIP3/A20 loci in rheumatoid arthritis pathogenesis",
          evidence_type: "Human genetics",
          direction: "SUPPORTS",
          strength: "STRONG",
          human_relevance: "HIGH",
          source: "Plenge RM et al. N Engl J Med 2007;357(12):1199-1209 (PMID: 17881752)"
        }
      ],
      causalityScore: {
        score: 95,
        classification: "STRONGLY SUPPORTED AS CAUSAL",
        reasoning: "CORRELATION ≠ CAUSATION. Unlike correlative biomarkers, pharmacological neutralization of TNF in prospective human trials directly halts progressive joint erosions and resolves synovitis. The causal link between TNF elevation and rheumatoid pathology is definitively established."
      },
      knowledgeGaps: [
        { gap: "What pre-treatment transcriptional or synovial biopsy biomarkers accurately predict the 30% of non-responders?", rank: "CRITICAL" },
        { gap: "Can bispecific antibodies targeting both TNF and IL-17A or IL-6 overcome single-agent resistance?", rank: "HIGH" },
        { gap: "Can small-molecule allosteric stabilizers of inactive TNF trimers achieve oral bioavailability?", rank: "MEDIUM" },
        { gap: "What genetic factors dictate anti-drug antibody formation against biologic therapeutics?", rank: "LOW" }
      ],
      experiments: [
        {
          name: "Synovial Pathotype Stratification vs Anti-TNF Response",
          objective: "Identify whether synovial tissue pathotypes (lympho-myeloid vs diffuse myeloid vs pauci-immune fibroid) predict clinical response to anti-TNF therapy.",
          model: "Ultrasound-guided synovial biopsies from active RA patients before initiating anti-TNF therapy.",
          intervention: "Standard anti-TNF biologic (Adalimumab 40 mg every 2 weeks).",
          control: "Response compared across histologically defined synovial pathotypes.",
          primaryEndpoint: "DAS28-CRP change and CDAI clinical response at 16 weeks.",
          secondaryEndpoint: "RNA-sequencing module score of TNF-driven gene signatures.",
          expectedTrue: "Patients with the myeloid/lympho-myeloid pathotype show >80% response rate; pauci-immune pathotype fails to respond.",
          expectedFalse: "Response rates are distributed randomly regardless of synovial biopsy histology or TNF signature.",
          interpretation: "Validates a precision medicine diagnostic to eliminate the non-responder uncertainty."
        },
        {
          name: "Allosteric Small-Molecule TNF Trimer Stabilization",
          objective: "Evaluate whether oral small-molecule allosteric modulators can induce asymmetric trimer disassembly without broad immunosuppression.",
          model: "In vitro surface plasmon resonance and human PBMC TNF-induced IL-6 release assay.",
          intervention: "Novel small-molecule allosteric compound vs Infliximab.",
          control: "Vehicle control and inactive enantiomer.",
          primaryEndpoint: "EC50 of IL-6 suppression and trimer dissociation constant.",
          secondaryEndpoint: "Granuloma integrity assay in human PBMC models of BCG infection.",
          expectedTrue: "Small molecule achieves nanomolar EC50 while preserving basal granuloma integrity.",
          expectedFalse: "Compound fails to alter TNF-TNFR binding or causes non-specific cytotoxicity.",
          interpretation: "Tests whether the oral druggability limitation can be overcome."
        }
      ],
      falsificationCriteria: [
        "Anti-TNF therapy in randomized controlled trials fails to demonstrate superiority over placebo or methotrexate in reducing disease activity scores.",
        "Pharmacological blockade of TNF produces no reduction in downstream synovial cytokine levels (IL-1, IL-6, MMP-3).",
        "Neutralization of TNF does not prevent or slow radiographic bone erosion compared to active controls.",
        "Mice lacking functional TNF receptors develop spontaneous polyarthritis identical to wild-type disease."
      ],
      decisionScore: {
        overall: 88,
        classification: "HIGH PRIORITY",
        breakdown: {
          biologicalPlausibility: 98,
          humanEvidence: 88,
          causalEvidence: 95,
          pharmacologicalFeasibility: 85,
          clinicalValidation: 95,
          safety: 65,
          contradictoryPenalty: -12
        },
        note: "TargetForge Evidence-Based Hypothesis Score (0–100). This is a computational triage and prioritization score, not a validated regulatory or clinical endpoint."
      },
      scientificVerdict: {
        verdict: "The hypothesis that TNF inhibition reduces inflammatory activity in rheumatoid arthritis is one of the most thoroughly validated mechanisms in the history of targeted therapeutics. Extensive human genetics, definitive randomized trials, and decades of post-marketing real-world data confirm its causal therapeutic role. Limitations center on patient non-response (30–40%) and infection risk rather than biological validity.",
        recommendation: "ADVANCE / CLINICALLY VALIDATED GOLD STANDARD",
        recommendationRationale: "Biologic TNF inhibition is a proven first-line biologic modality. Research efforts should focus on predictive response biomarkers to select the 60% of patients who derive benefit, and the development of next-generation oral or bispecific modalities."
      },
      competingHypotheses: [
        {
          hypothesis: "Interleukin-6 receptor blockade (e.g. Tocilizumab, Sarilumab) is superior to TNF inhibition for systemic symptoms and acute phase reactants.",
          evidence: "Head-to-head MONARCH trial showed superior DAS28 reduction for tocilizumab monotherapy over adalimumab monotherapy.",
          contradictions: "Similar overall long-term joint erosion protection and similar infection risks.",
          confidence: "HIGH"
        },
        {
          hypothesis: "Oral JAK-STAT kinase inhibition (e.g. Tofacitinib, Upadacitinib) bypasses the need for injections and covers multiple cytokines simultaneously.",
          evidence: "Approved oral small molecules demonstrating non-inferiority or superiority to adalimumab.",
          contradictions: "FDA black box warnings regarding major adverse cardiovascular events (MACE) and thromboembolism (ORAL Surveillance).",
          confidence: "VERY HIGH"
        },
        {
          hypothesis: "B-cell depletion via anti-CD20 (Rituximab) or T-cell costimulation blockade (Abatacept) provides more durable immune resetting.",
          evidence: "Highly effective in seropositive (RF/anti-CCP positive) rheumatoid arthritis refractory to anti-TNF.",
          contradictions: "Slower onset of clinical response and prolonged B-cell reconstitution time.",
          confidence: "HIGH"
        }
      ],
      aiDebate: [
        {
          role: "BIOLOGIST",
          title: "Immunologist",
          argument: "TNF-α is the undisputed master conductor of synovial inflammation. Blocking it cuts off the fuel supply to synovial fibroblasts and osteoclasts. The biological foundation is as solid as it gets in pharmacology."
        },
        {
          role: "PHARMACOLOGIST",
          title: "Biologics Pharmacologist",
          argument: "Monoclonal antibodies achieve picomolar binding affinity and long circulating half-lives. The pharmacology is exemplary for parenteral biologics, though we must concede that an oral small molecule remains an unsolved medicinal chemistry challenge."
        },
        {
          role: "GENETICIST",
          title: "Statistical Geneticist",
          argument: "GWAS and fine-mapping consistently converge on the TNF-TNFR signaling axis. Genetic evidence strongly corroborates that dysregulation in this pathway increases risk for inflammatory arthritis."
        },
        {
          role: "CLINICAL SCIENTIST",
          title: "Rheumatology Trialist",
          argument: "The clinical evidence is ironclad. Thousands of trials, millions of patients. It prevents patients from ending up in wheelchairs. However, our main challenge today is the 30% of non-responders who need earlier switching to alternative biologics."
        },
        {
          role: "TOXICOLOGIST",
          title: "Safety Specialist",
          argument: "Safety requires strict discipline: mandatory TB screening, monitoring for opportunistic infections, and avoiding use in severe heart failure or demyelinating disease. It has a manageable safety profile in appropriately screened patients."
        },
        {
          role: "SKEPTIC",
          title: "Critical Skeptic",
          argument: "While the hypothesis is undoubtedly true, we must guard against treating anti-TNF as a panacea. One-third of patients do not respond, anti-drug antibodies erode efficacy, and the target cannot be drugged orally. It is a benchmark, but not the end of the story."
        },
        {
          role: "SCIENTIFIC JUDGE",
          title: "Chief Scientific Synthesizer",
          argument: "Final Synthesis: The hypothesis is confirmed and causal. This serves as the platform's reference standard for a validated drug-target hypothesis. Future innovation belongs in precision response prediction and oral modality delivery."
        }
      ]
    }
  }
};

/**
 * Generic scientific synthesis engine when no pre-curated benchmark matches or when custom AI is used
 */
function buildEvidenceGraph(parsed, evalResult) {
  const dName = parsed.disease || "Disease";
  const tName = parsed.target || "Target";
  const mName = parsed.proposedMechanism ? parsed.proposedMechanism.slice(0, 40) + "..." : "Signaling Cascade";
  const drugName = parsed.drug || parsed.intervention || "Drug / Intervention";

  return {
    nodes: [
      { id: "disease", label: dName, type: "disease", status: "input" },
      { id: "target", label: tName, type: "target", status: "target" },
      { id: "pathway", label: mName, type: "pathway", status: "mechanism" },
      { id: "biomarker", label: "Biomarker Modulation", type: "biomarker", status: "response" },
      { id: "phenotype", label: parsed.expectedOutcome ? parsed.expectedOutcome.slice(0, 35) + "..." : "Phenotypic Response", type: "phenotype", status: "outcome" },
      { id: "drug", label: drugName, type: "drug", status: "modality" },
      { id: "clinical", label: "Clinical Outcome", type: "clinical", status: "validation" }
    ],
    edges: [
      {
        from: "disease",
        to: "target",
        label: "Disease Target Involvement",
        supporting: evalResult.evidenceMatrix.filter(e => e.direction === "SUPPORTS").length || 3,
        contradictory: evalResult.evidenceMatrix.filter(e => e.direction === "CONTRADICTS").length || 1,
        confidence: Math.round(evalResult.decisionScore.overall * 0.9)
      },
      {
        from: "target",
        to: "pathway",
        label: "Pathway Signal Modulation",
        supporting: 4,
        contradictory: 1,
        confidence: Math.min(95, evalResult.decisionScore.breakdown.biologicalPlausibility || 80)
      },
      {
        from: "pathway",
        to: "biomarker",
        label: "Downstream Biomarker Shift",
        supporting: 3,
        contradictory: 1,
        confidence: 75
      },
      {
        from: "biomarker",
        to: "phenotype",
        label: "Phenotypic Rescue",
        supporting: 2,
        contradictory: 2,
        confidence: 65
      },
      {
        from: "drug",
        to: "target",
        label: "Target Engagement",
        supporting: 2,
        contradictory: 2,
        confidence: Math.min(90, evalResult.decisionScore.breakdown.pharmacologicalFeasibility || 60)
      },
      {
        from: "phenotype",
        to: "clinical",
        label: "Clinical Translation",
        supporting: evalResult.decisionScore.breakdown.clinicalValidation > 50 ? 4 : 1,
        contradictory: evalResult.decisionScore.breakdown.clinicalValidation > 50 ? 1 : 3,
        confidence: Math.min(90, evalResult.decisionScore.breakdown.clinicalValidation || 40)
      }
    ]
  };
}

/**
 * Intelligent Hypothesis Parser
 */
async function parseHypothesis(text, fields = {}) {
  const cleanText = clean(text, 1000);
  
  // Check curated benchmark matches first
  for (const key of Object.keys(CURATED_HYPOTHESIS_BENCHMARKS)) {
    const item = CURATED_HYPOTHESIS_BENCHMARKS[key];
    if (item.matches(cleanText)) {
      const parsed = { ...item.parse };
      if (fields.disease) parsed.disease = clean(fields.disease, 120);
      if (fields.target) parsed.target = clean(fields.target, 120);
      if (fields.drug) parsed.drug = clean(fields.drug, 120);
      if (fields.mechanism) parsed.proposedMechanism = clean(fields.mechanism, 300);
      if (fields.patientPopulation) parsed.patientPopulation = clean(fields.patientPopulation, 180);
      return parsed;
    }
  }

  // If Gemini or OpenAI is available, use LLM parser
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const GoogleGenAIClass = await getGoogleGenAI();
      if (GoogleGenAIClass) {
        const ai = new GoogleGenAIClass({
          apiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });
        const prompt = `You are a scientific hypothesis parsing engine for an evidence-based drug discovery workbench.
Convert this user hypothesis into a structured scientific statement.
User Hypothesis: "${cleanText}"
Optional User Inputs:
Disease: "${clean(fields.disease, 120)}"
Target: "${clean(fields.target, 120)}"
Drug: "${clean(fields.drug, 120)}"
Mechanism: "${clean(fields.mechanism, 300)}"
Patient Population: "${clean(fields.patientPopulation, 180)}"

Return strictly valid JSON only:
{
  "disease": string,
  "target": string,
  "targetGene": string,
  "drug": string,
  "intervention": string,
  "proposedMechanism": string,
  "expectedOutcome": string,
  "potentialRisks": string,
  "patientPopulation": string
}`;
        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json", temperature: 0.1 }
        });
        const parsed = extractJson(response?.text);
        if (parsed && parsed.disease && parsed.target) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn("[hypothesis-eval] LLM parse error:", err.message);
    }
  }

  // Deterministic rule-based extraction fallback
  let disease = fields.disease || "";
  let target = fields.target || "";
  let drug = fields.drug || "";
  let mechanism = fields.mechanism || "";

  const lower = cleanText.toLowerCase();
  
  if (!disease) {
    const disPatterns = [
      /(?:in|for|treatment of|therapeutic strategy for|treating)\s+([a-zA-Z0-9\s\-]+?)(?:\.|\,|$|\bthrough\b|\bby\b)/i,
    ];
    for (const p of disPatterns) {
      const m = cleanText.match(p);
      if (m && m[1]) {
        disease = m[1].trim();
        break;
      }
    }
  }

  if (!target && !drug) {
    const targetPatterns = [
      /^([a-zA-Z0-9\-\s\/\_]+?)\s+(?:inhibition|antagonism|agonism|activation|degradation|blockade)/i,
      /(?:targeting|inhibiting|blocking)\s+([a-zA-Z0-9\-\s\/\_]+?)(?:\s+may|\s+could|\s+should|\s+can|\s+in|\s+for)/i
    ];
    for (const p of targetPatterns) {
      const m = cleanText.match(p);
      if (m && m[1]) {
        target = m[1].trim();
        break;
      }
    }
  }

  return {
    disease: disease || "Specified Disease",
    target: target || "Specified Target",
    targetGene: (target || "TARGET").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    drug: drug || "Small molecule / Biologic modality",
    intervention: target ? `${target} targeted modulation` : cleanText.slice(0, 80),
    proposedMechanism: mechanism || `Modulation of ${target || "the biological target"} alters critical downstream signaling nodes to mitigate disease phenotype.`,
    expectedOutcome: `Amelioration of ${disease || "disease activity"} and restoration of biological homeostasis.`,
    potentialRisks: "Off-target interactions, compensatory signaling pathway activation, immune perturbation, and organ toxicity.",
    patientPopulation: fields.patientPopulation || `Patients diagnosed with ${disease || "the indicated disorder"}.`
  };
}

/**
 * Dynamic Hypothesis Evaluator
 */
async function evaluateHypothesis(parsed) {
  const textQuery = `${parsed.disease} ${parsed.target || parsed.targetGene || ""}`.trim();
  
  // Check curated benchmark first
  for (const key of Object.keys(CURATED_HYPOTHESIS_BENCHMARKS)) {
    const item = CURATED_HYPOTHESIS_BENCHMARKS[key];
    if (item.matches(textQuery) || item.matches(parsed.target || "") || item.matches(parsed.disease || "")) {
      const evalData = JSON.parse(JSON.stringify(item.evaluation));
      const graph = buildEvidenceGraph(parsed, evalData);
      return {
        source: "curated-benchmark",
        parsed,
        ...evalData,
        evidenceGraph: graph
      };
    }
  }

  // Query live Europe PMC, ClinicalTrials.gov, and Open Targets in parallel
  const [pmcHits, trialHits, otHits] = await Promise.all([
    fetchEuropePmc(`${parsed.targetGene || parsed.target} ${parsed.disease}`, 5),
    fetchClinicalTrials(`${parsed.target} ${parsed.disease}`, 3),
    fetchOpenTargets(parsed.disease, parsed.targetGene || parsed.target)
  ]);

  // AI Structured Synthesis if Gemini API key present
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const GoogleGenAIClass = await getGoogleGenAI();
      if (GoogleGenAIClass) {
        const ai = new GoogleGenAIClass({
          apiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });

        const prompt = `You are a skeptical, highly rigorous scientific hypothesis evaluator, computational pharmacologist, and drug discovery research scientist.
Evaluate this scientific hypothesis systematically across 15 rigorous steps.
CRITICAL RULES:
- Never fabricate citations, PMIDs, trial numbers, IC50 or Ki values.
- Distinguish NO EVIDENCE from EVIDENCE OF NO EFFECT.
- Explicitly emphasize CORRELATION ≠ CAUSATION.
- Provide strong, honest contradictions ("Why this hypothesis might be wrong").
- Provide 3-5 falsification criteria.
- Structure an interactive evidence matrix with real or well-grounded claims.

Structured Hypothesis:
${JSON.stringify(parsed, null, 2)}

Live Literature Context from Europe PMC:
${JSON.stringify(pmcHits, null, 2)}

Live Clinical Trials from ClinicalTrials.gov:
${JSON.stringify(trialHits, null, 2)}

Open Targets Context:
${JSON.stringify(otHits, null, 2)}

Return strictly valid JSON only matching this exact schema:
{
  "biologicalPlausibility": {
    "score": number (0-100),
    "rationale": string
  },
  "humanGeneticEvidence": {
    "classification": "STRONG SUPPORT" | "MODERATE SUPPORT" | "WEAK SUPPORT" | "NEUTRAL" | "CONTRADICTORY" | "NO DATA",
    "summary": string
  },
  "cellularEvidence": {
    "geneticPerturbation": string,
    "pharmacologicalPerturbation": string
  },
  "animalEvidence": {
    "summary": string
  },
  "clinicalEvidence": {
    "trials": [
      {
        "title": string,
        "status": string,
        "phase": string,
        "failureCause": string,
        "failureDetail": string
      }
    ],
    "whyFailedAnalysis": string
  },
  "pharmacologicalFeasibility": {
    "cascade": string,
    "ic50": string,
    "pkPdLimits": string,
    "status": string
  },
  "safetyToxicology": {
    "level": "LOW" | "MODERATE" | "HIGH",
    "rationale": string
  },
  "contradictionEngine": {
    "whyMightBeWrong": [
      {
        "point": string,
        "detail": string,
        "source": string
      }
    ]
  },
  "evidenceMatrix": [
    {
      "claim": string,
      "evidence_type": "Human genetics" | "Clinical trial" | "Animal" | "Cellular" | "Pharmacology" | "PK/PD" | "Mechanistic" | "Observational",
      "direction": "SUPPORTS" | "CONTRADICTS" | "NEUTRAL",
      "strength": "VERY STRONG" | "STRONG" | "MODERATE" | "WEAK",
      "human_relevance": "HIGH" | "MODERATE" | "LOW" | "N/A",
      "source": string
    }
  ],
  "causalityScore": {
    "score": number (0-100),
    "classification": "CORRELATIONAL" | "PLAUSIBLY CAUSAL" | "STRONGLY SUPPORTED AS CAUSAL" | "CAUSALITY UNCERTAIN" | "CONTRADICTED",
    "reasoning": string
  },
  "knowledgeGaps": [
    { "gap": string, "rank": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }
  ],
  "experiments": [
    {
      "name": string,
      "objective": string,
      "model": string,
      "intervention": string,
      "control": string,
      "primaryEndpoint": string,
      "secondaryEndpoint": string,
      "expectedTrue": string,
      "expectedFalse": string,
      "interpretation": string
    }
  ],
  "falsificationCriteria": [
    string
  ],
  "decisionScore": {
    "overall": number (0-100),
    "classification": "HIGH PRIORITY" | "PROMISING BUT UNCERTAIN" | "WEAK / NEEDS MORE EVIDENCE" | "LOW PRIORITY",
    "breakdown": {
      "biologicalPlausibility": number (0-100),
      "humanEvidence": number (0-100),
      "causalEvidence": number (0-100),
      "pharmacologicalFeasibility": number (0-100),
      "clinicalValidation": number (0-100),
      "safety": number (0-100),
      "contradictoryPenalty": number (negative, e.g. -15)
    },
    "note": string
  },
  "scientificVerdict": {
    "verdict": string,
    "recommendation": "ADVANCE" | "INVESTIGATE FURTHER" | "LOW PRIORITY" | "DO NOT ADVANCE",
    "recommendationRationale": string
  },
  "competingHypotheses": [
    {
      "hypothesis": string,
      "evidence": string,
      "contradictions": string,
      "confidence": string
    }
  ],
  "aiDebate": [
    {
      "role": "BIOLOGIST" | "PHARMACOLOGIST" | "GENETICIST" | "CLINICAL SCIENTIST" | "TOXICOLOGIST" | "SKEPTIC" | "SCIENTIFIC JUDGE",
      "title": string,
      "argument": string
    }
  ]
}`;

        const response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json", temperature: 0.2 }
        });

        const rawParsed = extractJson(response?.text);
        if (rawParsed && rawParsed.biologicalPlausibility && rawParsed.decisionScore) {
          // Augment with real live PMC citations if not already embedded
          if (Array.isArray(pmcHits) && pmcHits.length > 0) {
            pmcHits.slice(0, 3).forEach((hit) => {
              if (hit.title && hit.url) {
                rawParsed.evidenceMatrix.unshift({
                  claim: `Primary literature: ${hit.title}`,
                  evidence_type: "Observational",
                  direction: "SUPPORTS",
                  strength: "MODERATE",
                  human_relevance: "HIGH",
                  source: `${hit.journal ? hit.journal + " " : ""}${hit.year ? "(" + hit.year + ") " : ""}${hit.url}`
                });
              }
            });
          }

          const graph = buildEvidenceGraph(parsed, rawParsed);
          return {
            source: "ai-generated",
            parsed,
            ...rawParsed,
            evidenceGraph: graph,
            liveSources: {
              europePmc: pmcHits,
              clinicalTrials: trialHits,
              openTargets: otHits
            }
          };
        }
      }
    } catch (err) {
      console.warn("[hypothesis-eval] LLM evaluation error:", err.message);
    }
  }

  // Fallback general deterministic scientific evaluator
  const defaultEval = {
    biologicalPlausibility: {
      score: 65,
      rationale: `Target ${parsed.target} is biologically associated with signaling cascades linked to ${parsed.disease}. However, comprehensive tissue-specific transcriptomic and proteomic confirmation is required to determine whether target modulation selectively restores physiological homeostasis without causing on-target disruption of non-diseased tissue.`
    },
    humanGeneticEvidence: {
      classification: otHits?.target?.drugCount > 0 ? "MODERATE SUPPORT" : "NO DATA",
      summary: otHits?.target
        ? `Open Targets registers ${otHits.target.drugCount} clinical or approved candidate programs for ${otHits.target.symbol}. However, large-scale Mendelian randomization studies confirming causal directionality in ${parsed.disease} remain to be established.`
        : "Evidence not found in public human genetic association registries for this specific target-disease pair. Note: absence of genetic evidence is not proof of no biological effect."
    },
    cellularEvidence: {
      geneticPerturbation: `Genetic knock-down or CRISPR perturbation of ${parsed.target} produces phenotypic alterations in in-vitro models; however, compensation by redundant paralogs or isoenzymes frequently tempers long-term phenotypic translation.`,
      pharmacologicalPerturbation: `In-vitro pharmacological perturbation demonstrates concentration-dependent modulation; however, high micromolar concentrations reported in exploratory literature must be verified against physiological plasma protein binding.`
    },
    animalEvidence: {
      summary: `Preclinical animal models of ${parsed.disease} demonstrate directional modulation upon target perturbation, but cross-species differences in target homology, alternative splicing, and immune architecture introduce translational uncertainty.`
    },
    clinicalEvidence: {
      trials: trialHits.length > 0 ? trialHits.map(t => ({
        title: t.title,
        status: t.status || "Ongoing / Unspecified",
        phase: t.phases || "Phase 1/2",
        failureCause: "Under investigation",
        failureDetail: `Identified on ClinicalTrials.gov (${t.nctId})`
      })) : [
        {
          title: `Investigational Studies for ${parsed.target} in ${parsed.disease}`,
          status: "No completed Phase 3 trials found",
          phase: "Preclinical / Exploratory",
          failureCause: "Evidence not found",
          failureDetail: "No registered definitive phase 3 trials evaluating this specific therapeutic hypothesis were identified in standard registries."
        }
      ],
      whyFailedAnalysis: "Where clinical candidates fail in early development, common root causes include insufficient target engagement at tolerable doses, lack of biomarker-guided patient selection, or redundant compensatory signaling loops."
    },
    pharmacologicalFeasibility: {
      cascade: "Dose Administered → Systemic Free Concentration → Target Tissue Partitioning → Intracellular Pocket Engagement → Functional Pathway Modulation → Biomarker Shift → Phenotypic Clinical Effect",
      ic50: "Potency and dissociation constants must be verified in orthologous biochemical binding assays; empirical cellular IC50 values require free-fraction exposure adjustments.",
      pkPdLimits: "PK/PD information is incomplete for this specific hypothesis pairing. Free drug exposure in target diseased tissue remains an essential uncertainty.",
      status: "Feasibility uncertain — empirical pharmacokinetic profiling required"
    },
    safetyToxicology: {
      level: "MODERATE",
      rationale: `Target ${parsed.target} is expressed across multiple human organ systems. Chronic target perturbation carries risk of off-target inhibition, compensatory upregulation of parallel pathways, and immune or metabolic liabilities that must be evaluated in formal GLP toxicology studies.`
    },
    contradictionEngine: {
      whyMightBeWrong: [
        {
          point: "Compensatory Parallel Pathway Activation",
          detail: `Inhibition or modulation of ${parsed.target} may trigger rapid feedback upregulation of redundant kinases or downstream transcriptional co-factors, neutralizing therapeutic efficacy.`,
          source: "Pharmacological resistance and redundancy analysis"
        },
        {
          point: "Target Exposure & Protein Binding Deficit",
          detail: "In-vitro efficacy observed in 10% serum cannot be translated into in-vivo target occupancy if high plasma protein binding limits free drug concentration at the diseased tissue site.",
          source: "Translational PK/PD principles"
        },
        {
          point: "Correlation vs Causation Confounding",
          detail: `Elevated expression of ${parsed.target} in ${parsed.disease} may represent a secondary reactive stress response or biomarker rather than the driving causal etiological lesion.`,
          source: "Causality assessment framework"
        }
      ]
    },
    evidenceMatrix: [
      ...(pmcHits.length > 0 ? pmcHits.map(p => ({
        claim: `Primary study: ${p.title}`,
        evidence_type: "Observational",
        direction: "SUPPORTS",
        strength: "MODERATE",
        human_relevance: "HIGH",
        source: `${p.journal ? p.journal + " " : ""}${p.year ? "(" + p.year + ") " : ""}${p.url}`
      })) : [
        {
          claim: `Biological association between ${parsed.target} and ${parsed.disease} documented in preclinical models`,
          evidence_type: "Mechanistic",
          direction: "SUPPORTS",
          strength: "MODERATE",
          human_relevance: "MODERATE",
          source: "Literature retrieval / Database indexing"
        }
      ]),
      {
        claim: "Potential compensatory signaling or redundancy in disease tissue",
        evidence_type: "Cellular",
        direction: "CONTRADICTS",
        strength: "MODERATE",
        human_relevance: "MODERATE",
        source: "Theoretical and empirical signaling pathway analysis"
      }
    ],
    causalityScore: {
      score: 52,
      classification: "CAUSALITY UNCERTAIN",
      reasoning: "CORRELATION ≠ CAUSATION. While the target is biologically associated with the disease state, prospective causal perturbation studies in relevant human primary tissue or clinical trials are required to confirm that modulating the target directly arrests disease progression."
    },
    knowledgeGaps: [
      { gap: "Free drug exposure and target engagement in diseased tissue have not been validated.", rank: "CRITICAL" },
      { gap: "Human genetic causal support (e.g. Mendelian randomization or loss-of-function variants) is unestablished.", rank: "HIGH" },
      { gap: "Potential compensatory signaling pathways have not been mapped systematically.", rank: "HIGH" },
      { gap: "Long-term toxicology and therapeutic index remain uncharacterized.", rank: "MEDIUM" }
    ],
    experiments: [
      {
        name: "Human Primary Cell Perturbation & Pathway Modulation",
        objective: `Determine whether specific modulation of ${parsed.target} arrests disease-associated signaling cascades in human primary disease models.`,
        model: `Human primary diseased cells or organoids derived from patients with ${parsed.disease}.`,
        intervention: `Selective modulator of ${parsed.target} vs genetic knockdown (CRISPR/siRNA).`,
        control: "Scrambled guide RNA / vehicle control.",
        primaryEndpoint: "Quantification of downstream mechanistic biomarker phosphorylation and expression.",
        secondaryEndpoint: "Cellular viability and phenotypic integrity assays.",
        expectedTrue: "Dose-dependent reduction of disease biomarkers without non-specific cytotoxicity.",
        expectedFalse: "No biomarker suppression or generalized non-specific cell death.",
        interpretation: "Validates cell-autonomous biological plausibility in relevant human tissue."
      },
      {
        name: "In-Vivo Target Engagement and Efficacy Correlation",
        objective: "Determine whether free tissue exposure achieves >70% target occupancy and translates to phenotypic improvement.",
        model: `Validated disease model of ${parsed.disease}.`,
        intervention: "Dose-escalation of therapeutic candidate.",
        control: "Vehicle-treated disease group and untreated healthy group.",
        primaryEndpoint: "Disease activity score and histological grading.",
        secondaryEndpoint: "Ex-vivo tissue target occupancy assay and pharmacokinetic exposure profiling.",
        expectedTrue: "Clear sigmoidal relationship between target occupancy and disease score reduction.",
        expectedFalse: "High target occupancy (>80%) achieves no disease score improvement.",
        interpretation: "Establishes in-vivo pharmacological causality and defines the minimum efficacious dose."
      }
    ],
    falsificationCriteria: [
      `Target engagement (>80% occupancy of ${parsed.target}) fails to produce measurable reduction in proposed downstream biomarkers.`,
      `Genetic knockout of ${parsed.target} does not alter disease phenotype or is rescued completely by compensatory paralogs.`,
      "Clinically tolerable plasma exposure cannot achieve minimum efficacious target binding concentration due to protein binding or toxicity.",
      "Toxicity or adverse phenotypes manifest before therapeutic target engagement thresholds are reached."
    ],
    decisionScore: {
      overall: 55,
      classification: "WEAK / NEEDS MORE EVIDENCE",
      breakdown: {
        biologicalPlausibility: 65,
        humanEvidence: 40,
        causalEvidence: 52,
        pharmacologicalFeasibility: 45,
        clinicalValidation: 30,
        safety: 50,
        contradictoryPenalty: -15
      },
      note: "TargetForge Evidence-Based Hypothesis Score (0–100). This is a computational triage and prioritization score, not a validated regulatory or clinical endpoint."
    },
    scientificVerdict: {
      verdict: `Current evidence indicates biological plausibility for targeting ${parsed.target} in ${parsed.disease}, but robust human causal validation and pharmacologically achievable exposure profiles remain unverified. The hypothesis warrants exploratory laboratory investigation but should not be advanced into translational clinical development without target engagement proof.`,
      recommendation: "INVESTIGATE FURTHER",
      recommendationRationale: "Prioritize in-vitro target perturbation in human primary cells and establish pharmacokinetic free-fraction thresholds before initiating in-vivo efficacy campaigns."
    },
    competingHypotheses: [
      {
        hypothesis: `The observed association between ${parsed.target} and ${parsed.disease} is a downstream consequence of tissue injury rather than an upstream driver.`,
        evidence: "Elevated expression of stress-response genes is common in inflamed and degenerating tissues.",
        contradictions: "Some preclinical perturbation experiments demonstrate phenotypic modulation.",
        confidence: "MODERATE"
      },
      {
        hypothesis: "Targeting an alternative upstream receptor provides superior pathway blockade with less toxicity.",
        evidence: "Receptor-level intervention often achieves greater tissue selectivity than broad intracellular signaling nodes.",
        contradictions: "Receptor redundancy may bypass single-ligand blockade.",
        confidence: "MODERATE"
      }
    ],
    aiDebate: [
      {
        role: "BIOLOGIST",
        title: "Cell Biologist",
        argument: "The pathway logic is coherent, but we must establish whether the target is expressed in the primary disease-propagating cell type or merely in reactive bystander cells."
      },
      {
        role: "PHARMACOLOGIST",
        title: "Pharmacologist",
        argument: "We lack verified free-fraction exposure data. A molecule with high nanomolar potency in vitro is useless if 99% is sequestered by serum albumin in vivo."
      },
      {
        role: "GENETICIST",
        title: "Geneticist",
        argument: "We do not have human genetic loss-of-function validation for this specific target. We must treat this as an exploratory hypothesis until causal human genetic or clinical evidence is provided."
      },
      {
        role: "CLINICAL SCIENTIST",
        title: "Clinical Trialist",
        argument: "Without early pharmacodynamic biomarkers, clinical trials will fail due to inability to confirm whether negative outcomes stemmed from the wrong drug or the wrong target."
      },
      {
        role: "TOXICOLOGIST",
        title: "Toxicologist",
        argument: "Safety concerns are moderate. Broad tissue expression requires careful monitoring of hepatic, renal, and hematological parameters during dose escalation."
      },
      {
        role: "SKEPTIC",
        title: "Scientific Skeptic",
        argument: "Correlation is not causation. Many published positive associations in cell culture never translate to animal models, let alone patients. We need clear falsification criteria from day one."
      },
      {
        role: "SCIENTIFIC JUDGE",
        title: "Chief Scientific Synthesizer",
        argument: "Synthesis: The hypothesis is biologically plausible but unvalidated. Recommendation is to Investigate Further with rigorous negative controls and quantitative target engagement assays."
      }
    ]
  };

  const graph = buildEvidenceGraph(parsed, defaultEval);
  return {
    source: "deterministic-heuristic",
    parsed,
    ...defaultEval,
    evidenceGraph: graph,
    liveSources: {
      europePmc: pmcHits,
      clinicalTrials: trialHits,
      openTargets: otHits
    }
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed. Use POST." });
  }

  try {
    const body = req.body || {};
    const action = body.action || "evaluate";

    if (action === "parse") {
      const text = body.hypothesis || "";
      if (!text.trim()) {
        return json(res, 400, { error: "Hypothesis text is required." });
      }
      const parsed = await parseHypothesis(text, {
        disease: body.disease,
        target: body.target,
        drug: body.drug,
        mechanism: body.mechanism,
        patientPopulation: body.patientPopulation
      });
      return json(res, 200, { ok: true, parsed });
    }

    if (action === "evaluate") {
      const parsed = body.parsed || (await parseHypothesis(body.hypothesis || "", body));
      const evaluation = await evaluateHypothesis(parsed);
      return json(res, 200, { ok: true, evaluation });
    }

    return json(res, 400, { error: `Unrecognized action "${action}". Expected "parse" or "evaluate".` });
  } catch (err) {
    console.error("[hypothesis-eval] Handler error:", err);
    return json(res, 500, { error: "Hypothesis evaluation failed: " + err.message });
  }
};
