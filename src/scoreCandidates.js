const { buildTargetContext, targetDisplayName } = require("./targetContext");

const MAX_CANDIDATES = 5;

const KINASE_INHIBITOR_RE =
  /\b(imatinib|gleevec|dasatinib|nilotinib|bosutinib|ponatinib|asciminib|gefitinib|erlotinib|lapatinib|afatinib|osimertinib|dacomitinib|neratinib|sunitinib|sorafenib|vandetanib|pazopanib|axitinib|cabozantinib|crizotinib|alectinib|ceritinib|brigatinib|lorlatinib|ibrutinib|acalabrutinib|ruxolitinib|tofacitinib|baricitinib|upadacitinib|trametinib|cobimetinib|binimetinib|vemurafenib|dabrafenib|encorafenib|palbociclib|ribociclib|abemaciclib|midostaurin|gilteritinib|quizartinib)\b/i;

const GPCR_LIGAND_RE =
  /\b(morphine|fentanyl|oxycodone|codeine|naloxone|propranolol|atenolol|metoprolol|carvedilol|salbutamol|albuterol|salmeterol|formoterol|nadolol|timolol|pindolol|labetalol|bisoprolol|losartan|valsartan|olmesartan|candesartan|telmisartan|risperidone|olanzapine|quetiapine|aripiprazole|haloperidol|prazosin|clonidine|ondansetron|sumatriptan|loratadine|cetirizine|ranitidine|famotidine|diphenhydramine|atropine|scopolamine|nicotine)\b/i;

const KINASE_TARGET_RE =
  /\b(kinase|abl1?\b|egfr|vegfr|jak\d?|ikk|src\b|kit\b|pdgf|btk\b|tyrosine kinase|serine.?threonine|mapk|cdk\d|braf|alk\b|\bmet\b|flt3|syk|lck|her2|erbb)\b/i;

const GPCR_TARGET_RE =
  /\b(gpcr|g protein-coupled|rhodopsin|adrenergic|opioid receptor|dopamine receptor|serotonin|5-hydroxytryptamine|5-ht|chemokine receptor|muscarinic|histamine receptor|cannabinoid|adenosine receptor|beta-2|β2|adrb2)\b/i;

const ION_CHANNEL_TARGET_RE =
  /\b(ion channel|sodium channel|potassium channel|calcium channel|voltage-gated|nav\d|cav\d|kv\d|herg|nicotinic acetylcholine|nmda receptor|gaba.?a)\b/i;

const KINASE_CLASS_RE = /\bkinase inhibitor\b/i;
const GPCR_CLASS_RE =
  /\b(beta-blocker|beta-2 agonist|antihistamine|opioid|antipsychotic|\barb\b|alpha-1|alpha-2 agonist|5-ht3|h2 antagonist|antimuscarinic|triptan|dopamine agonist|nachr)\b/i;

/**
 * 12 Curated Target Rules with specific on-target drugs, demotions,
 * co-crystal ligands, and PDB IDs.
 */
const TARGET_RULES = [
  {
    id: "egfr",
    name: "EGFR (Epidermal Growth Factor Receptor)",
    family: "kinase",
    pdbs: ["1M17", "1XKK"],
    targetRe: /\b(egfr|erbb1|epidermal growth factor receptor)\b/i,
    geneRe: /\begfr\b/i,
    ligandRe: /\b(erlotinib|gefitinib|lapatinib|osi-?774|aq4|fmm)\b/i,
    onTargetDrugs: [
      "gefitinib", "erlotinib", "lapatinib", "afatinib", "osimertinib", "dacomitinib", "neratinib"
    ],
    onTargetRe: /\b(gefitinib|erlotinib|lapatinib|afatinib|osimertinib|dacomitinib|neratinib)\b/i,
    demotedRe: /\b(imatinib|dasatinib|nilotinib|bosutinib|ponatinib|vemurafenib|dabrafenib|encorafenib|palbociclib|ribociclib|abemaciclib|sunitinib|sorafenib)\b/i,
    demotedConcern: "Same class, different primary target (ABL/BRAF/CDK inhibitor, off-target for EGFR).",
  },
  {
    id: "her2",
    name: "HER2 / ERBB2",
    family: "kinase",
    pdbs: ["3PP0"],
    targetRe: /\b(her2|erbb2|human epidermal growth factor receptor 2)\b/i,
    geneRe: /\berbb2\b/i,
    ligandRe: /\b(lapatinib|neratinib|tucatinib|afatinib|fmm)\b/i,
    onTargetDrugs: [
      "lapatinib", "neratinib", "tucatinib", "afatinib"
    ],
    onTargetRe: /\b(lapatinib|neratinib|tucatinib|afatinib)\b/i,
    demotedRe: /\b(gefitinib|erlotinib|imatinib|dasatinib|vemurafenib|palbociclib|sunitinib|sorafenib)\b/i,
    demotedConcern: "Same class, different primary target (gefitinib/erlotinib are EGFR-primary, lower HER2 potency; other TKIs are off-target).",
  },
  {
    id: "abl",
    name: "ABL / BCR-ABL tyrosine kinase",
    family: "kinase",
    pdbs: ["1IEP", "2HYY"],
    targetRe: /\b(abl1?|bcr-abl|c-abl|sti-?571)\b/i,
    geneRe: /\babl1?\b/i,
    ligandRe: /\b(sti-?571|sti\b|imatinib|gleevec|dasatinib|nilotinib)\b/i,
    onTargetDrugs: [
      "imatinib", "dasatinib", "nilotinib", "bosutinib", "ponatinib", "asciminib"
    ],
    onTargetRe: /\b(imatinib|dasatinib|nilotinib|bosutinib|ponatinib|asciminib)\b/i,
    demotedRe: /\b(gefitinib|erlotinib|vemurafenib|dabrafenib|palbociclib|afatinib|osimertinib|lapatinib)\b/i,
    demotedConcern: "Same class, different primary target (EGFR/BRAF inhibitor, off-target for ABL).",
  },
  {
    id: "braf",
    name: "BRAF kinase",
    family: "kinase",
    pdbs: ["4XV2"],
    targetRe: /\b(braf|b-raf|v600e)\b/i,
    geneRe: /\bbraf\b/i,
    ligandRe: /\b(dabrafenib|vemurafenib|encorafenib|11t)\b/i,
    onTargetDrugs: [
      "vemurafenib", "dabrafenib", "encorafenib"
    ],
    onTargetRe: /\b(vemurafenib|dabrafenib|encorafenib)\b/i,
    demotedRe: /\b(imatinib|gefitinib|erlotinib|dasatinib|nilotinib|bosutinib|palbociclib|lapatinib|afatinib|osimertinib)\b/i,
    demotedConcern: "Same class, different primary target (generic TKI, lacks BRAF V600 selectivity).",
  },
  {
    id: "beta2",
    name: "β2-Adrenergic Receptor (ADRB2)",
    family: "gpcr",
    pdbs: ["3SN6"],
    targetRe: /\b(beta-?2|adrb2|beta-2 adrenergic|adrenergic receptor)\b/i,
    geneRe: /\badrb2\b/i,
    ligandRe: /\b(carazolol|p0g|salbutamol|albuterol|timolol)\b/i,
    onTargetDrugs: [
      "salbutamol", "albuterol", "salmeterol", "formoterol", "propranolol", "atenolol", "metoprolol", "carvedilol"
    ],
    onTargetRe: /\b(salbutamol|albuterol|salmeterol|formoterol|propranolol|atenolol|metoprolol|carvedilol|nadolol|timolol|pindolol|labetalol|bisoprolol)\b/i,
    onTargetClassRe: /\b(beta-blocker|beta-2 agonist)\b/i,
    demotedRe: /\b(morphine|fentanyl|oxycodone|codeine|naloxone|losartan|valsartan|olmesartan|candesartan|telmisartan|risperidone|olanzapine|quetiapine|haloperidol)\b/i,
    demotedConcern: "Same class, different primary target (opioid receptor / angiotensin receptor ligand, not beta-2 adrenergic).",
  },
  {
    id: "cox",
    name: "Cyclooxygenase (COX-1 / COX-2)",
    family: "cox",
    pdbs: ["4COX", "1PXX", "1CX2"],
    targetRe: /\b(cyclooxygenase|cox-?2|cox-?1|ptgs1|ptgs2|prostaglandin.*synthase)\b/i,
    geneRe: /\b(ptgs1|ptgs2|cox1|cox2)\b/i,
    ligandRe: /\b(indomethacin|celecoxib|sc-?558|diclofenac|aspirin|ibuprofen|s58|inm)\b/i,
    onTargetDrugs: [
      "celecoxib", "ibuprofen", "naproxen", "aspirin", "diclofenac", "indomethacin"
    ],
    onTargetRe: /\b(celecoxib|ibuprofen|naproxen|aspirin|diclofenac|indomethacin|etodolac|meloxicam|piroxicam|ketorolac|sulindac|nabumetone|rofecoxib|valdecoxib)\b/i,
    onTargetClassRe: /\bnsaid\b/i,
    demotedRe: null,
    demotedConcern: "No cyclooxygenase activity (different drug class).",
  },
  {
    id: "hmgcr",
    name: "HMG-CoA Reductase (HMGCR)",
    family: "hmg",
    pdbs: ["1HWK"],
    targetRe: /\b(hmg-?coa|hmgcr|hydroxymethylglutaryl.*reductase)\b/i,
    geneRe: /\bhmgcr\b/i,
    ligandRe: /\b(atorvastatin|simvastatin|rosuvastatin|pravastatin|fluvastatin|lovastatin|1hw)\b/i,
    onTargetDrugs: [
      "atorvastatin", "simvastatin", "rosuvastatin", "pravastatin", "fluvastatin", "lovastatin", "pitavastatin"
    ],
    onTargetRe: /\b(atorvastatin|simvastatin|rosuvastatin|pravastatin|fluvastatin|lovastatin|pitavastatin)\b/i,
    onTargetClassRe: /\bstatin\b/i,
    demotedRe: null,
    demotedConcern: "No HMG-CoA reductase activity.",
  },
  {
    id: "dpp4",
    name: "Dipeptidyl Peptidase 4 (DPP-4)",
    family: "dpp4",
    pdbs: ["1X70"],
    targetRe: /\b(dpp-?4|dpp4|dipeptidyl peptidase (iv|4))\b/i,
    geneRe: /\bdpp4\b/i,
    ligandRe: /\b(sitagliptin|saxagliptin|linagliptin|alogliptin|vildagliptin)\b/i,
    onTargetDrugs: [
      "sitagliptin", "saxagliptin", "linagliptin", "alogliptin", "vildagliptin"
    ],
    onTargetRe: /\b(sitagliptin|saxagliptin|linagliptin|alogliptin|vildagliptin)\b/i,
    onTargetClassRe: /\bdpp-?4 inhibitor\b/i,
    demotedRe: /\b(metformin|glipizide|glyburide|glimepiride|pioglitazone|rosiglitazone)\b/i,
    demotedConcern: "No DPP-4 inhibitor activity (metformin is an antidiabetic biguanide, not a DPP-4 inhibitor).",
  },
  {
    id: "hiv_protease",
    name: "HIV-1 Protease",
    family: "protease",
    pdbs: ["1HVR", "1HSG"],
    targetRe: /\b(hiv.*protease|hiv-?1 protease|human immunodeficiency virus.*protease)\b/i,
    geneRe: null,
    ligandRe: /\b(indinavir|ritonavir|saquinavir|lopinavir|nelfinavir|darunavir|atazanavir|l-?735|xk2|mk1)\b/i,
    onTargetDrugs: [
      "ritonavir", "saquinavir", "lopinavir", "nelfinavir", "indinavir", "darunavir", "atazanavir"
    ],
    onTargetRe: /\b(ritonavir|saquinavir|lopinavir|nelfinavir|indinavir|darunavir|atazanavir|tipranavir|amprenavir|fosamprenavir)\b/i,
    demotedRe: /\b(nirmatrelvir|ensitrelvir)\b/i,
    demotedConcern: "Same class, different primary target (SARS-CoV-2 Mpro inhibitor, not active against HIV protease).",
  },
  {
    id: "sars_mpro",
    name: "SARS-CoV-2 Main Protease (Mpro / 3CLpro)",
    family: "protease",
    pdbs: ["7BQY", "6LU7"],
    targetRe: /\b(sars-?cov-?2.*(?:mpro|3clpro|main protease|protease)|mpro\b|3clpro\b|covid-?19 main protease)\b/i,
    geneRe: null,
    ligandRe: /\b(n3|nirmatrelvir|ensitrelvir|paxlovid)\b/i,
    onTargetDrugs: [
      "nirmatrelvir", "ensitrelvir"
    ],
    onTargetRe: /\b(nirmatrelvir|ensitrelvir)\b/i,
    demotedRe: /\b(ritonavir|lopinavir|saquinavir|nelfinavir|indinavir|darunavir|atazanavir)\b/i,
    demotedConcern: "Same class, different primary target (ritonavir/lopinavir are HIV protease inhibitors; ritonavir is a CYP3A booster in Paxlovid, not an active Mpro inhibitor).",
  },
  {
    id: "pde5",
    name: "Phosphodiesterase 5 (PDE5)",
    family: "pde5",
    pdbs: ["1UDT"],
    targetRe: /\b(pde-?5a?|phosphodiesterase (5|v))\b/i,
    geneRe: /\bpde5a?\b/i,
    ligandRe: /\b(sildenafil|viagra|tadalafil|vardenafil|avanafil|via)\b/i,
    onTargetDrugs: [
      "sildenafil", "tadalafil", "vardenafil", "avanafil"
    ],
    onTargetRe: /\b(sildenafil|tadalafil|vardenafil|avanafil)\b/i,
    onTargetClassRe: /\bpde5 inhibitor\b/i,
    demotedRe: /\b(metformin)\b/i,
    demotedConcern: "No PDE5 inhibitor activity.",
  },
  {
    id: "hdac",
    name: "Histone Deacetylase (HDAC)",
    family: "hdac",
    pdbs: ["4LXZ"],
    targetRe: /\b(hdac\d*|histone deacetylase|saha)\b/i,
    geneRe: /\bhdac\d*\b/i,
    ligandRe: /\b(vorinostat|saha|panobinostat|belinostat|romidepsin|shh)\b/i,
    onTargetDrugs: [
      "vorinostat", "panobinostat", "belinostat", "romidepsin"
    ],
    onTargetRe: /\b(vorinostat|panobinostat|belinostat|romidepsin)\b/i,
    onTargetClassRe: /\bhdac inhibitor\b/i,
    demotedRe: /\b(metformin)\b/i,
    demotedConcern: "No HDAC inhibitor activity.",
  },
  {
    id: "sglt2",
    name: "SGLT2 / SLC5A2 (sodium-glucose cotransporter 2)",
    family: "transporter",
    pdbs: ["7VSI", "7FEN", "8HDH", "8HEZ"],
    targetRe: /\b(sglt-?2|slc5a2|sodium[- ]glucose cotransporter[- ]?2|sodium\/glucose cotransporter[- ]?2)\b/i,
    geneRe: /\b(slc5a2|sglt-?2)\b/i,
    ligandRe: /\b(canagliflozin|dapagliflozin|empagliflozin|ertugliflozin|sotagliflozin)\b/i,
    onTargetDrugs: [
      "canagliflozin", "dapagliflozin", "empagliflozin", "ertugliflozin", "sotagliflozin", "bexagliflozin"
    ],
    onTargetRe: /\b(canagliflozin|dapagliflozin|empagliflozin|ertugliflozin|sotagliflozin|bexagliflozin|gliflozin)\b/i,
    onTargetClassRe: /\b(sglt-?2 inhibitor|gliflozin)\b/i,
    demotedRe: /\b(metformin|sitagliptin|saxagliptin|linagliptin|glipizide|glyburide|pioglitazone)\b/i,
    demotedConcern: "Other antidiabetic class (not an SGLT2 inhibitor).",
  },
  {
    id: "er",
    name: "Estrogen Receptor (ER)",
    family: "nuclear",
    pdbs: ["3ERT"],
    targetRe: /\b(estrogen receptor|oestrogen|esr1|nr3a1)\b/i,
    geneRe: /\b(esr1|esr2)\b/i,
    ligandRe: /\b(tamoxifen|4-hydroxytamoxifen|oht|raloxifene|toremifene)\b/i,
    onTargetDrugs: [
      "tamoxifen", "raloxifene", "toremifene", "fulvestrant", "4-hydroxytamoxifen"
    ],
    onTargetRe: /\b(tamoxifen|raloxifene|toremifene|fulvestrant|hydroxytamoxifen)\b/i,
    onTargetClassRe: /\b(serm|aromatase inhibitor)\b/i,
    demotedRe: null,
    demotedConcern: "No estrogen receptor activity.",
  },
];

const LIGAND_SYNONYMS = {
  STI: ["imatinib", "gleevec", "sti-571", "sti571"],
  "STI-571": ["imatinib", "gleevec", "sti-571", "sti571"],
  AQ4: ["erlotinib", "osi-774", "tarceva"],
  "OSI-774": ["erlotinib", "osi-774", "tarceva"],
  FMM: ["lapatinib", "gw572016", "tykerb"],
  GW572016: ["lapatinib", "gw572016", "tykerb"],
  "11T": ["dabrafenib", "tafinlar"],
  S58: ["celecoxib", "celebrex", "sc-558"],
  "SC-558": ["celecoxib", "celebrex", "sc-558"],
  INM: ["indomethacin", "indocin"],
  "1HW": ["atorvastatin", "lipitor"],
  VIA: ["sildenafil", "viagra", "revatio"],
  SHH: ["vorinostat", "saha", "zolinza"],
  SAHA: ["vorinostat", "saha", "zolinza"],
  OHT: ["tamoxifen", "4-hydroxytamoxifen", "nolvadex"],
  "4-OHT": ["tamoxifen", "4-hydroxytamoxifen", "nolvadex"],
  N3: ["nirmatrelvir", "paxlovid"],
};

function num(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cidOf(candidate) {
  return String(candidate?.cid ?? candidate?.CID ?? "");
}

function nameOf(candidate) {
  return (
    candidate?.displayName ||
    candidate?.name ||
    candidate?.IUPACName ||
    candidate?.title ||
    (cidOf(candidate) ? `CID ${cidOf(candidate)}` : "Unnamed compound")
  );
}

function classOf(candidate) {
  return String(candidate?.drugClass || candidate?.class || "");
}

function propsOf(candidate) {
  return {
    mw: num(candidate?.molecularWeight ?? candidate?.MolecularWeight),
    xlogp: num(candidate?.xlogp ?? candidate?.XLogP),
    hbd: num(candidate?.hbd ?? candidate?.HBondDonorCount),
    hba: num(candidate?.hba ?? candidate?.HBondAcceptorCount),
    rot: num(candidate?.rotatableBonds ?? candidate?.RotatableBondCount),
    tpsa: num(candidate?.tpsa ?? candidate?.TPSA),
  };
}

function parseAlerts(candidate) {
  const raw = candidate?.pains || candidate?.painsAlerts;
  if (!raw || typeof raw !== "object") {
    return { painsNames: [], toxNames: [], allNames: [] };
  }
  const alerts = Array.isArray(raw.alerts) ? raw.alerts : [];
  const painsNames = alerts
    .filter((a) => (a.catalog || a.family || "").toLowerCase().includes("pains"))
    .map((a) => a.name || a.family || "alert");
  const toxNames = alerts
    .filter((a) => !(a.catalog || a.family || "").toLowerCase().includes("pains"))
    .map((a) => a.name || a.family || "alert");
  return {
    painsNames,
    toxNames,
    allNames: [...painsNames, ...toxNames],
  };
}

function drugLikenessChecks(candidate) {
  const p = propsOf(candidate);
  return [
    {
      rule: "Lipinski MW <= 500 Da",
      value: p.mw,
      pass: p.mw !== null ? p.mw <= 500 : true,
      boundary: 500,
    },
    {
      rule: "Lipinski XLogP <= 5",
      value: p.xlogp,
      pass: p.xlogp !== null ? p.xlogp <= 5 : true,
      boundary: 5,
    },
    {
      rule: "Lipinski HBD <= 5",
      value: p.hbd,
      pass: p.hbd !== null ? p.hbd <= 5 : true,
      boundary: 5,
    },
    {
      rule: "Lipinski HBA <= 10",
      value: p.hba,
      pass: p.hba !== null ? p.hba <= 10 : true,
      boundary: 10,
    },
    {
      rule: "Veber Rotatable Bonds <= 10",
      value: p.rot,
      pass: p.rot !== null ? p.rot <= 10 : true,
      boundary: 10,
    },
    {
      rule: "Veber TPSA <= 140 A^2",
      value: p.tpsa,
      pass: p.tpsa !== null ? p.tpsa <= 140 : true,
      boundary: 140,
    },
  ];
}

function targetTextOf(protein) {
  if (!protein) return "";
  const name = protein.name || protein.queryName || "";
  const title = protein.title || "";
  const gene = protein.gene || protein.symbol || "";
  const pdb = protein.id || protein.pdb_id || "";
  const ligand = protein.ligand?.name || "";
  return `${name} ${queryName(protein)} ${title} ${gene} ${pdb} ${ligand}`.toLowerCase();
}

function queryName(protein) {
  return protein?.queryName ? String(protein.queryName) : "";
}

/**
 * Resolve specific target rule based on PDB ID, name, queryName, title, gene,
 * or co-crystal ligand.
 */
function resolveTargetRule(protein) {
  if (!protein) return null;
  const pdbId = String(protein.pdb_id || protein.id || "").trim().toUpperCase();
  const name = String(protein.name || "").trim();
  const qName = String(protein.queryName || "").trim();
  const title = String(protein.title || "").trim();
  const gene = String(protein.gene || protein.symbol || "").trim();
  const ligand = protein.ligand || (Array.isArray(protein.ligands) ? protein.ligands[0] : {});
  const ligandName = String(ligand?.name || "").trim();
  const compId = String(ligand?.compId || ligand?.comp_id || "").trim().toUpperCase();

  // 1. Direct PDB ID match
  if (pdbId) {
    const byPdb = TARGET_RULES.find((r) => r.pdbs && r.pdbs.includes(pdbId));
    if (byPdb) return byPdb;
  }

  // 2. Direct gene match
  if (gene) {
    const byGene = TARGET_RULES.find((r) => r.geneRe && r.geneRe.test(gene));
    if (byGene) return byGene;
  }

  // 3. Specific target name / queryName / title regex match
  for (const rule of TARGET_RULES) {
    if (rule.targetRe) {
      if (rule.targetRe.test(name) || rule.targetRe.test(qName) || rule.targetRe.test(title)) {
        return rule;
      }
    }
    if (rule.ligandRe) {
      if (rule.ligandRe.test(ligandName) || rule.ligandRe.test(compId)) {
        return rule;
      }
    }
  }

  // 4. Combined text match
  const allText = `${pdbId} ${name} ${qName} ${title} ${gene} ${ligandName} ${compId}`;
  for (const rule of TARGET_RULES) {
    if (rule.targetRe && rule.targetRe.test(allText)) {
      return rule;
    }
  }

  return null;
}

/**
 * Detect general target family when no granular rule matches.
 */
function targetFamily(protein) {
  if (!protein) return null;
  const rule = resolveTargetRule(protein);
  if (rule) return rule.family;

  const text = targetTextOf(protein);
  if (KINASE_TARGET_RE.test(text)) return "kinase";
  if (GPCR_TARGET_RE.test(text)) return "gpcr";
  if (ION_CHANNEL_TARGET_RE.test(text)) return "ion_channel";
  if (/\bprotease\b/i.test(text)) return "protease";
  if (/\b(cyclooxygenase|cox-?2|cox-?1)\b/i.test(text)) return "cox";
  if (/\b(hmg-?coa|hmgcr)\b/i.test(text)) return "hmg";
  if (/\b(dpp-?4|dpp4)\b/i.test(text)) return "dpp4";
  if (/\b(pde-?5|phosphodiesterase)\b/i.test(text)) return "pde5";
  if (/\b(hdac|histone deacetylase)\b/i.test(text)) return "hdac";
  if (/\b(estrogen|nuclear receptor)\b/i.test(text)) return "nuclear";
  return "other";
}

function scoringCapabilities(protein) {
  const ctx = protein ? buildTargetContext(protein) : null;
  const rule = resolveTargetRule(ctx || protein);
  const family = rule ? rule.family : targetFamily(ctx || protein);
  const hasLigand = Boolean(ctx?.ligand?.present);
  const hasPocket = Boolean(ctx?.pocket?.available);
  const recognized = Boolean(rule || (family && family !== "other"));
  return {
    rule: rule ? rule.id : null,
    targetRule: rule ? rule.name : null,
    family: family || null,
    hasLigand,
    hasPocket,
    recognizedFamily: recognized,
    missingStructure: !hasLigand || !hasPocket,
    degraded: !recognized && (!hasLigand || !hasPocket),
    dataGaps: ctx?.dataGaps || [],
  };
}

/**
 * Checks whether candidate matches the co-crystallized ligand in this PDB structure.
 */
function matchesCoCrystalLigand(candidate, protein) {
  if (!protein) return false;
  const ligand = protein.ligand || (Array.isArray(protein.ligands) ? protein.ligands[0] : {});
  const ligandName = String(ligand?.name || "").trim().toLowerCase();
  const compId = String(ligand?.compId || ligand?.comp_id || "").trim().toUpperCase();
  const title = String(protein.title || "").trim().toLowerCase();

  const cName = nameOf(candidate).toLowerCase();
  if (!cName) return false;

  // Direct ligand name match
  if (ligandName && (ligandName.includes(cName) || cName.includes(ligandName))) {
    return true;
  }

  // Synonym match via compId
  const synsByCompId = LIGAND_SYNONYMS[compId] || [];
  if (synsByCompId.some((syn) => cName.includes(syn) || syn.includes(cName))) {
    return true;
  }

  // Synonym match via ligandName
  for (const [key, syns] of Object.entries(LIGAND_SYNONYMS)) {
    if (ligandName.includes(key.toLowerCase())) {
      if (syns.some((syn) => cName.includes(syn) || syn.includes(cName))) {
        return true;
      }
    }
  }

  // Mention in PDB title (e.g. "complex with imatinib", "in complex with dabrafenib", "with STI-571")
  const words = cName.split(/[\s-]+/).filter((w) => w.length > 3);
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`, "i").test(title)) {
      return true;
    }
  }

  return false;
}

function evaluateCandidateForTargetRule(candidate, rule, protein) {
  const cName = nameOf(candidate).toLowerCase();
  const cClass = classOf(candidate).toLowerCase();

  // 1. Check On-Target
  let isOnTarget = false;
  if (
    rule.onTargetRe &&
    (rule.onTargetRe.test(cName) || (rule.onTargetClassRe && rule.onTargetClassRe.test(cClass)))
  ) {
    isOnTarget = true;
  }
  if (!isOnTarget && rule.onTargetDrugs) {
    isOnTarget = rule.onTargetDrugs.some(
      (d) => cName.includes(d.toLowerCase()) || d.toLowerCase().includes(cName)
    );
  }

  // 2. Check Co-crystal ligand match
  const isLigandMatch = matchesCoCrystalLigand(candidate, protein);

  // 3. Check Demoted / Off-target
  let isDemoted = false;
  if (rule.demotedRe && rule.demotedRe.test(cName)) {
    isDemoted = true;
  }

  // 4. Check Same Family
  let isSameFamily = false;
  if (!isOnTarget) {
    if (rule.family === "kinase") {
      isSameFamily = KINASE_INHIBITOR_RE.test(cName) || KINASE_CLASS_RE.test(cClass);
    } else if (rule.family === "gpcr") {
      isSameFamily = GPCR_LIGAND_RE.test(cName) || GPCR_CLASS_RE.test(cClass);
    } else if (rule.family === "protease") {
      isSameFamily =
        /\bprotease inhibitor\b/i.test(cClass) ||
        /\b(ritonavir|lopinavir|saquinavir|darunavir|nelfinavir|indinavir|atazanavir|nirmatrelvir|ensitrelvir)\b/i.test(
          cName
        );
    } else if (rule.family === "cox") {
      isSameFamily = /\bnsaid\b/i.test(cClass);
    } else if (rule.family === "hmg") {
      isSameFamily = /\bstatin\b/i.test(cClass);
    } else if (rule.family === "dpp4") {
      isSameFamily = /\bdpp-?4 inhibitor\b/i.test(cClass);
    } else if (rule.family === "pde5") {
      isSameFamily = /\bpde5 inhibitor\b/i.test(cClass);
    } else if (rule.family === "hdac") {
      isSameFamily = /\bhdac inhibitor\b/i.test(cClass);
    } else if (rule.family === "nuclear") {
      isSameFamily = /\b(serm|aromatase inhibitor)\b/i.test(cClass);
    }
  }

  return {
    isOnTarget,
    isLigandMatch,
    isDemoted,
    isSameFamily,
  };
}

function trap(val, minOk, idealLow, idealHigh, maxOk) {
  if (val === null || val === undefined) return 0.5;
  if (val < minOk) return 0;
  if (val < idealLow) return (val - minOk) / (idealLow - minOk);
  if (val <= idealHigh) return 1;
  if (val <= maxOk) return 1 - (val - idealHigh) / (maxOk - idealHigh);
  return 0;
}

/**
 * Score a single compound against a protein using target-specific rules,
 * co-crystal ligand matching, and Lipinski/Veber properties.
 */
function scoreOne(candidate, protein = null) {
  const checks = drugLikenessChecks(candidate);
  const passCount = checks.filter((c) => c.pass).length;
  const violations = checks.filter((c) => !c.pass).length;
  const alerts = parseAlerts(candidate);
  const p = propsOf(candidate);

  const strengths = [];
  const concerns = [];
  const reasoning = [];

  const ctx = protein ? buildTargetContext(protein) : null;
  const rule = resolveTargetRule(ctx || protein);
  const family = rule ? rule.family : targetFamily(ctx || protein);

  let targetBonus = 0;
  let ligandBonus = 0;

  if (rule) {
    const evalResult = evaluateCandidateForTargetRule(candidate, rule, ctx || protein);

    if (evalResult.isOnTarget) {
      targetBonus = 55;
      const classDescriptor = rule.family === "kinase" ? "kinase-inhibitor" : "targeted";
      reasoning.push(`Primary target match: established on-target ${classDescriptor} drug for ${rule.name}`);
      strengths.push(`Established on-target clinical pharmacology for ${rule.name}.`);

      if (evalResult.isLigandMatch) {
        ligandBonus = 20;
        reasoning.push(`Direct match to co-crystallized reference ligand in this PDB structure`);
        strengths.push(`Direct chemical match to the co-crystallized reference ligand in this PDB structure.`);
      }
    } else if (evalResult.isDemoted || evalResult.isSameFamily) {
      targetBonus = 12;
      reasoning.push(`Same family (${rule.family || "class"}), but different primary target`);
      concerns.push(rule.demotedConcern || "Same class, different primary target.");
    } else {
      targetBonus = 0;
      reasoning.push(`No established target or class relevance for ${rule.name} (${(rule.family || "").toUpperCase()})`);
      concerns.push(`No established target or class relevance for ${rule.name}.`);
    }
  } else if (protein) {
    // Unmodeled target or generic family without specific sub-rule
    if (family === "kinase" && (KINASE_INHIBITOR_RE.test(nameOf(candidate)) || KINASE_CLASS_RE.test(classOf(candidate)))) {
      targetBonus = 25;
      reasoning.push(`Kinase family match, but no specific sub-target rule resolved for this structure`);
      strengths.push(`General kinase inhibitor chemotype.`);
    } else if (family === "gpcr" && (GPCR_LIGAND_RE.test(nameOf(candidate)) || GPCR_CLASS_RE.test(classOf(candidate)))) {
      targetBonus = 25;
      reasoning.push(`GPCR family match, but no specific sub-target rule resolved for this structure`);
      strengths.push(`General GPCR ligand chemotype.`);
    } else {
      targetBonus = 0;
      reasoning.push(`Insufficient target rule: target is unmodeled or structure has no recognized pharmacology rule`);
      concerns.push(`Insufficient target rule: no recognized target rule matched for this structure.`);
    }
  } else {
    // No target staged
    targetBonus = 0;
    reasoning.push(`No target structure was staged; scored purely on generic physicochemical properties`);
  }

  // Lipinski/Veber drug-likeness component (max ~24 pts)
  const weighted =
    0.22 * trap(p.mw, 0, 180, 420, 650) +
    0.2 * trap(p.xlogp, -3, 0, 3.5, 7) +
    0.14 * trap(p.hbd, -0.5, 0, 3, 7) +
    0.14 * trap(p.hba, 0, 2, 8, 14) +
    0.15 * trap(p.rot, -0.5, 0, 6, 14) +
    0.15 * trap(p.tpsa, 0, 20, 100, 180);

  const druglikePts = Math.min(24, Math.max(0, Math.round(weighted * 24 - violations * 2)));

  if (passCount === 6) {
    strengths.push("All 6 Lipinski Rule-of-Five and Veber drug-likeness checks pass.");
  } else {
    concerns.push(`${violations} drug-likeness violation(s): ${checks.filter((c) => !c.pass).map((c) => c.rule).join("; ")}.`);
  }

  // PAINS and toxicophore penalties
  let alertPenalty = 0;
  if (alerts.painsNames.length) {
    alertPenalty += 12;
    concerns.push(`PAINS alert(s): ${alerts.painsNames.join(", ")}.`);
    reasoning.push(`Deducted 12 pts for PAINS substructure match (${alerts.painsNames.join(", ")})`);
  }
  if (alerts.toxNames.length) {
    alertPenalty += 8;
    concerns.push(`Toxicophore alert(s): ${alerts.toxNames.join(", ")}.`);
    reasoning.push(`Deducted 8 pts for toxicophore alert (${alerts.toxNames.join(", ")})`);
  }

  let finalScore = targetBonus + ligandBonus + druglikePts - alertPenalty;
  finalScore = Math.min(100, Math.max(1, Math.round(finalScore)));

  return {
    score: finalScore,
    passCount,
    violations,
    checks,
    alerts,
    strengths,
    concerns,
    reasoning,
    targetBonus,
    ligandBonus,
    druglikePts,
    alertPenalty,
  };
}

function reasonFor(candidate, scored, protein) {
  const name = nameOf(candidate);
  const targetName = protein ? targetDisplayName(protein) : null;
  const ctx = protein ? buildTargetContext(protein) : null;
  const rule = resolveTargetRule(ctx || protein);
  const alertBit = scored.alerts?.allNames?.length
    ? ` Note: carries substructure alert(s) (${scored.alerts.allNames.join(", ")}), so treat this lead with caution.`
    : "";

  if (rule) {
    if (scored.ligandBonus > 0) {
      return `${name} is an established on-target clinical inhibitor for ${rule.name} and directly matches the co-crystallized reference ligand in this PDB structure (${protein.pdb_id || protein.id || "target"}). ${scored.passCount}/6 drug-likeness checks pass.${alertBit} Binding affinity is not assessed here — docking still needs to be run.`;
    }
    if (scored.targetBonus >= 50) {
      return `${name} is an established on-target clinical drug for ${rule.name}. ${scored.passCount}/6 drug-likeness checks pass.${alertBit} Binding affinity is not assessed here — docking still needs to be run.`;
    }
    if (scored.targetBonus >= 10) {
      return `${name} shares the ${rule.family} chemotype, but its primary target differs from ${rule.name}. ${scored.passCount}/6 drug-likeness checks pass.${alertBit} Treat this as a secondary candidate.`;
    }
  }

  if (protein && !rule) {
    return `${name} has the best available drug-likeness profile in this set, but there is an insufficient target rule for ${targetName || "this target"} — no recognized pharmacology rule exists for this structure. Binding affinity is not assessed here — docking still needs to be run.`;
  }

  if (scored.violations === 0) {
    return `${name} has the strongest overall physicochemical profile in this shortlist: ${scored.passCount}/6 drug-likeness checks pass, with a balanced size, polarity, and flexibility profile.${alertBit} Binding affinity is not assessed here — docking still needs to be run.`;
  }
  return `${name} is the best available option in this shortlist, but it still has ${scored.violations} drug-likeness flag(s).${alertBit} Treat this as a computational triage, not evidence of activity.`;
}

function summaryFor(ranked, protein) {
  const top = ranked[0];
  const pdb = protein?.id || protein?.pdb_id;
  const target = pdb ? ` ${targetDisplayName(protein)} (${pdb})` : " computational follow-up";
  const rule = resolveTargetRule(protein);
  const flagged = ranked.filter((row) => row.alerts?.allNames?.length);
  const flagBit = flagged.length
    ? ` ${flagged.length} shortlisted molecule(s) carry PAINS or toxicophore alerts and were deprioritized accordingly.`
    : "";

  if (pdb) {
    if (!rule) {
      return `Insufficient target rule for${target}: no recognized pharmacology rule exists for this structure. Candidates are ranked on basic physicochemical drug-likeness only without target validation.${flagBit} Scores do not reflect validated binding affinity or experimental data.`;
    }
    return `Among ${ranked.length} staged molecules, ${nameOf(top)} is the strongest candidate for${target} based on target-specific pharmacology, co-crystal reference match, and Lipinski/Veber drug-likeness.${flagBit} Scores are specific to this structure — the same compound would score differently against a different target. This ranking does not include docking poses or experimental data.`;
  }
  return `Among ${ranked.length} staged molecules, ${nameOf(top)} is the strongest candidate to take into${target} based on PubChem physicochemical properties (Lipinski Rule-of-Five and Veber heuristics).${flagBit} No PDB structure was staged, so this ranking is not pocket-specific. This ranking does not include docking poses, ADME models, toxicity, or experimental data.`;
}

/**
 * Rank candidates for a specific target using target-specific rules,
 * co-crystal ligand matching, and Lipinski/Veber properties.
 * Returns the standard response schema with source: "heuristic-v2".
 */
function rankCandidatesLocal(candidates, protein = null, options = {}) {
  const max = options.maxCandidates ?? MAX_CANDIDATES;
  const min = options.minCandidates ?? 2;
  const list = (Array.isArray(candidates) ? candidates : []).slice(0, max);
  if (list.length < min) {
    throw new Error(`Select at least ${min} candidates.`);
  }

  const ctx = protein ? buildTargetContext(protein) : null;
  const scored = list.map((candidate) => {
    const local = scoreOne(candidate, ctx || protein);
    return {
      cid: cidOf(candidate),
      name: nameOf(candidate),
      ...local,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.passCount !== a.passCount) return b.passCount - a.passCount;
    return String(a.cid).localeCompare(String(b.cid));
  });

  const ranking = scored.map((item, index) => ({
    cid: item.cid,
    rank: index + 1,
    score: item.score,
    reasoning: (item.reasoning || []).slice(0, 6),
    strengths: item.strengths.slice(0, 3),
    concerns: item.concerns.slice(0, 3),
  }));

  const top = scored[0];
  const originalTop = list.find((c) => cidOf(c) === top.cid) || list[0];
  const target = ctx
    ? { name: ctx.name, pdb_id: ctx.pdb_id }
    : { name: "", pdb_id: null };

  return {
    target,
    candidates: ranking.map((row) => ({
      compound_id: row.cid,
      score: row.score,
      reasoning: row.reasoning,
    })),
    recommended: {
      cid: top.cid,
      score: top.score,
      reason: reasonFor(originalTop, top, protein),
    },
    ranking,
    summary: summaryFor(scored, protein),
    limitations: [
      ctx
        ? "This ranking is specific to the selected PDB structure. The same compound is expected to score differently against a different target."
        : "This ranking uses only the supplied PubChem properties (size, lipophilicity, H-bonding, flexibility, polar surface area) plus any PAINS/toxicophore substructure flags.",
      "It cannot estimate binding affinity, selectivity, metabolism, toxicity, or clinical efficacy.",
      "PAINS and toxicophore matches are warnings, not automatic exclusions — some flagged chemotypes become real drugs.",
      ctx?.dataGaps?.length
        ? "Target-fit assessment is limited without pocket/ligand data — geometric fit was not treated as a confident judgment."
        : "Use TargetForge Native Docking and ADME Profiling next, then experimental assays, before treating any molecule as a real lead.",
    ].filter((item, index, arr) => arr.indexOf(item) === index),
    source: "heuristic-v2",
  };
}

/**
 * Score an entire approved-drug library for one target.
 */
function scoreLibraryLocal(candidates, protein = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) {
    return {
      target: protein
        ? { name: targetDisplayName(protein), pdb_id: protein.id || protein.pdb_id || null }
        : { name: "", pdb_id: null },
      candidates: [],
      recommended: { cid: null, score: null, reason: "" },
      ranking: [],
      summary: "No compounds to score.",
      limitations: [],
      source: "heuristic-v2",
    };
  }
  return rankCandidatesLocal(list, protein, { maxCandidates: list.length, minCandidates: 1 });
}

/**
 * Helper to rank repurposing candidates and log top 5 for a PDB target.
 */
function rankRepurposing(candidates, protein = null) {
  let list = Array.isArray(candidates) && candidates.length ? candidates : null;
  if (!list) {
    try {
      const raw = require("./data/approvedDrugs.json");
      const drugs = Array.isArray(raw?.drugs) ? raw.drugs : [];
      list = drugs.map((drug) => ({
        CID: drug.cid,
        cid: String(drug.cid),
        displayName: drug.name,
        name: drug.name,
        IsomericSMILES: drug.smiles,
        CanonicalSMILES: drug.smiles,
        SMILES: drug.smiles,
        MolecularWeight: drug.mw,
        XLogP: drug.xlogp,
        HBondDonorCount: drug.hbd,
        HBondAcceptorCount: drug.hba,
        RotatableBondCount: drug.rot,
        TPSA: drug.tpsa,
        indication: drug.indication,
        drugClass: drug.class,
      }));
    } catch {
      list = [];
    }
  }

  const result = scoreLibraryLocal(list, protein);
  const top5 = (result.ranking || []).slice(0, 5).map((r) => {
    const match = list.find((c) => cidOf(c) === r.cid);
    return {
      cid: r.cid,
      name: nameOf(match) || r.cid,
      score: r.score,
      rank: r.rank,
    };
  });
  const pdb = protein?.pdb_id || protein?.id || "NO_PDB";
  const targetName = protein?.name || protein?.queryName || pdb;
  console.log(`[rankRepurposing] Top 5 for ${targetName} (${pdb}):`, top5);
  return { ...result, top5 };
}

module.exports = {
  MAX_CANDIDATES,
  drugLikenessChecks,
  nameOf,
  cidOf,
  targetFamily,
  scoringCapabilities,
  scoreOne,
  rankCandidatesLocal,
  scoreLibraryLocal,
  TARGET_RULES,
  resolveTargetRule,
  matchesCoCrystalLigand,
  rankRepurposing,
  KINASE_INHIBITOR_RE,
  GPCR_LIGAND_RE,
};
