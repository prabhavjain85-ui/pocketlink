import { getRDKit } from "./rdkitLoader.js";

/**
 * Organ-Specific Toxicity Prediction Engine
 * 
 * Prediction Methodology:
 * Evaluated via literature-curated toxicophoric structural alerts using RDKit WebAssembly.
 * 
 * Confidence / Methodology Classification:
 * Structural Alert Matching (Literature Heuristic) — Lower-confidence hazard flags.
 * Rule-based heuristic matching, NOT a multi-task trained machine learning model.
 * Intended for early-stage triage to identify structural liabilities requiring experimental follow-up.
 * 
 * References:
 * - Kalgutkar, A. S., et al. (2005). A Comprehensive Listing of Bioactivation Pathways of Organic Compounds. Chem. Res. Toxicol., 18(9), 1335-1400.
 * - Stepan, A. F., et al. (2011). Structural Alert/Reactive Metabolite Concept as Applied in Medicinal Chemistry to Mitigate the Risk of Idiosyncratic Drug Toxicity: A Perspective Based on the Critical Examination of Trends in the Top 200 Marketed Drugs. J. Med. Chem., 54(3), 773-805.
 * - Aronov, A. M. (2005). Predictive in silico modeling for hERG channel blockers. Drug Discov. Today, 10(2), 149-155.
 * - Redfern, W. S., et al. (2003). Relationships between preclinical cardiac electrophysiology, clinical QT interval prolongation and torsade de pointes for a broad range of drugs. Cardiovasc. Res., 58(1), 32-45.
 * - ICH Harmonised Guideline M7(R1) (2017). Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk.
 * - Chen, M., et al. (2011). FDA-approved drug labeling for the study of drug-induced liver injury (DILI). Drug Discov. Today, 16(15-16), 697-703.
 */

export const TOXICITY_METHOD_INFO = {
  method: "structural_alerts",
  methodLabel: "Structural Alert Matching (Literature-Curated Heuristic)",
  confidenceLevel: "Lower-confidence screening heuristic (Rule-based, not a trained ML model)",
  sourceName: "Published Toxicophore Catalogs & Historical Market Withdrawals",
  apiAttempted: "ProTox-3.0 (https://tox.charite.de/protox3/)",
  apiStatus: "Unavailable (Sample API script 404 Not Found, no public CORS REST endpoint)",
  disclaimer:
    "These are computational in silico predictions meant to flag candidates for further investigation, not confirmed clinical toxicity data. Real toxicity requires actual in vitro/in vivo laboratory testing. Predictions may contain false positives or false negatives.",
};

export const ORGAN_TOXICITY_ALERTS = [
  // ==========================================
  // 1. LIVER (Hepatotoxicity / DILI)
  // ==========================================
  {
    id: "dili_thiazolidinedione",
    organ: "liver",
    name: "Thiazolidinedione (TZD) core",
    severity: "high",
    smarts: "O=C1CSC(=O)N1",
    regex: /O=C1CSC\(=O\)N1/i,
    explanation:
      "Thiazolidinedione ring associated with severe idiosyncratic liver failure and hepatotoxicity (e.g. Troglitazone, withdrawn from market in 2000).",
    evidence: "Troglitazone market withdrawal (FDA 2000); mitochondrial respiratory chain disruption and reactive imine formation.",
  },
  {
    id: "dili_chromane_quinone_methide",
    organ: "liver",
    name: "Chromane-6-ol / Quinone-methide precursor",
    severity: "high",
    smarts: "Oc1ccc2OCCCc2c1",
    regex: /Oc1c\(C\)c2c\(c\(C\)c1O\)CCC|Oc1ccc2OCCCc2c1/i,
    explanation:
      "6-Hydroxychromane core bioactivated by hepatic CYPs to reactive, electrophilic quinone-methides that covalently adduct cellular macromolecules.",
    evidence: "Troglitazone DILI mechanism; Kassahun et al. (2001) Chem. Res. Toxicol. 14:62-70; Neuschwander-Tetri et al. (1998) Ann. Intern. Med. 129:38-41.",
  },
  {
    id: "dili_p_aminophenol",
    organ: "liver",
    name: "p-Aminophenol / Acetamido-phenol",
    severity: "moderate",
    smarts: "c1cc(O)ccc1NC(=O)",
    regex: /c1cc\(O\)ccc1NC\(=O\)|CC\(=O\)Nc1ccc\(O\)cc1/i,
    explanation:
      "Metabolic precursor to reactive N-acetyl-p-benzoquinone imine (NAPQI) via CYP2E1; requires glutathione conjugation to prevent centrilobular hepatocyte necrosis.",
    evidence: "Paracetamol (Acetaminophen) acute hepatotoxicity mechanism; Dahlin et al. (1984) PNAS 81:1327-1331.",
  },
  {
    id: "dili_furan",
    organ: "liver",
    name: "Furan ring",
    severity: "moderate",
    smarts: "c1ccoc1",
    regex: /c1ccoc1|C1=COC=C1/i,
    explanation:
      "Bioactivated by hepatic CYP P450 enzymes to reactive cis-enedials that covalently crosslink hepatic proteins and deplete cellular thiols.",
    evidence: "Kalgutkar et al. (2005) Chem. Res. Toxicol. 18:1335-1400; Peterson (2006) Chem. Res. Toxicol. 19:1400-1411.",
  },
  {
    id: "dili_hydrazine",
    organ: "liver",
    name: "Hydrazine / Hydrazide",
    severity: "high",
    smarts: "[NX3][NX3]",
    regex: /NN|N-N|C\(=O\)NN/i,
    explanation:
      "Hydrazines/hydrazides undergo hepatic N-acetylation and cleavage to reactive free radical acetyl/alkylating species causing hepatotoxicity.",
    evidence: "Isoniazid and iproniazid severe hepatotoxicity; Nelson et al. (1976) Science 193:901-903.",
  },
  {
    id: "dili_nitroaromatic",
    organ: "liver",
    name: "Nitroaromatic group",
    severity: "high",
    smarts: "c[N+](=O)[O-]",
    regex: /c1ccc\(cc1\)\[N\+\]\(=O\)\[O-\]|c\[N\+\]\(=O\)\[O-\]|c1.*\[N\+\]\(=O\)\[O-\]/i,
    explanation:
      "Aromatic nitro groups undergo hepatic reduction to reactive nitroso and hydroxylamine intermediates, causing oxidative stress and mitochondrial toxicity.",
    evidence: "Nimesulide and tolcapone hepatotoxicity warnings and market withdrawals; Boelsterli (2002) Drug Saf. 25:633-648.",
  },
  {
    id: "dili_thiophene",
    organ: "liver",
    name: "Thiophene ring",
    severity: "moderate",
    smarts: "c1ccsc1",
    regex: /c1ccsc1|C1=CSC=C1/i,
    explanation:
      "Metabolically oxidized by hepatic CYP enzymes to reactive thiophene sulfoxides and epoxides that adduct microsomal enzymes.",
    evidence: "Tienilic acid severe hepatitis and withdrawal; Dansette et al. (1991) Chem. Res. Toxicol. 4:141-151.",
  },
  {
    id: "dili_halo_biaryl_acid",
    organ: "liver",
    name: "Halogenated diaryl carboxylic acid (NSAID DILI alert)",
    severity: "moderate",
    smarts: "c1c([Cl,Br,F])cccc1Nc2ccccc2CC(=O)O",
    regex: /c1c\(Cl\)cccc1Nc2c\(Cl\)cccc2CC\(=O\)O/i,
    explanation:
      "Forms reactive 1-O-acyl glucuronides and quinone-imine metabolites prone to covalent protein adduction and immune-mediated liver injury.",
    evidence: "Diclofenac and ibufenac idiosyncratic hepatotoxicity alerts; Kretz-Rommel & Boelsterli (1993) Hepatology 18:615-622.",
  },

  // ==========================================
  // 2. HEART (Cardiotoxicity / hERG Inhibition)
  // ==========================================
  {
    id: "cardio_herg_diaryl_piperidine",
    organ: "heart",
    name: "Diaryl-alkylpiperidine hERG pharmacophore",
    severity: "high",
    smarts: "c1ccccc1C([#6,#8,*])(c2ccccc2)C3CCN(*)CC3",
    regex: /c1ccccc1C\([Cc]2ccccc2\)|C\(c1ccccc1\)\(c2ccccc2\).*N1CCC|C\(O\)\(c1ccccc1\)\(c2ccccc2\)C3CCN|c1ccc\(C\(O\)CCCN2CCC/i,
    explanation:
      "Canonical high-affinity hERG K+ channel pore-blocker motif. Highly associated with QT prolongation and fatal Torsades de Pointes arrhythmia.",
    evidence: "Terfenadine (Seldane) worldwide withdrawal (FDA 1997); Astemizole withdrawal; Cavalli et al. (2002) J. Med. Chem. 45:3844-3853.",
  },
  {
    id: "cardio_butyrophenone_herg",
    organ: "heart",
    name: "Butyrophenone / 4-Arylpiperidin-4-ol",
    severity: "high",
    smarts: "O=C(c1ccc([F,Cl,Br,I,H])cc1)CCCN2CCC(O)(c3ccc([Cl,F,Br,H])cc3)CC2",
    regex: /O=C\(.*cc1\)CCCN.*CCC\(O\)\(c.*cc2\)CC/i,
    explanation:
      "Haloperidol/droperidol-like scaffold with high affinity for the hERG channel central cavity; known black-box warning for QT prolongation and ventricular arrhythmias.",
    evidence: "FDA Black Box warning for Droperidol / Haloperidol; Aronov (2005) Drug Discov. Today 10:149-155.",
  },
  {
    id: "cardio_methanesulfonamide",
    organ: "heart",
    name: "Methanesulfonamide cardiotoxicant motif",
    severity: "high",
    smarts: "c1ccc(NS(=O)(=O)C)cc1",
    regex: /c1ccc\(NS\(=O\)\(=O\)C\)cc1|c.*NS\(=O\)\(=O\)C/i,
    explanation:
      "Direct interaction motif within the inner vestibule of Kv11.1 (hERG); hallmark of Class III antiarrhythmics with proarrhythmic risk.",
    evidence: "Dofetilide, ibutilide, and sotalol hERG pore blocking mechanism; Redfern et al. (2003) Cardiovasc. Res. 58:32-45.",
  },
  {
    id: "cardio_phenothiazine",
    organ: "heart",
    name: "Phenothiazine / Dibenzazepine tricyclic amine",
    severity: "moderate",
    smarts: "c1ccc2c(c1)Sc3ccccc3N2CCCN",
    regex: /c1ccc2c\(c1\)Sc3ccccc3N2|c1ccc2c\(c1\)Nc3ccccc3/i,
    explanation:
      "Tricyclic core with basic dialkylaminoalkyl chain inhibits cardiac potassium and sodium channels, associated with conduction delay and QTc prolongation.",
    evidence: "Thioridazine market withdrawal and black box warning for Torsades de Pointes; FDA (2005).",
  },
  {
    id: "cardio_lipophilic_basic_amine",
    organ: "heart",
    name: "Lipophilic basic tertiary amine (cLogP > 3.5)",
    severity: "moderate",
    isPhysicochemical: true,
    check: (mol, desc) => {
      // Basic tertiary amine + high lipophilicity (Aronov / Redfern rule)
      const hasBasicAmine = /[#6]N\([#6]\)[#6]|N1CCNCC1|N1CCCC1/i.test(desc.smiles || "");
      const highLogP = Number(desc.logp || 0) >= 3.5;
      return hasBasicAmine && highLogP;
    },
    explanation:
      "Lipophilic basic amines (cLogP ≥ 3.5) fit the aromatic and hydrophobic binding pocket of the hERG pore (Phe656/Tyr652), elevating cardiotoxicity risk.",
    evidence: "Aronov (2005) Drug Discov. Today 10:149-155; Price et al. (2009) J. Med. Chem. 52:766-774.",
  },

  // ==========================================
  // 3. KIDNEY (Nephrotoxicity)
  // ==========================================
  {
    id: "nephro_haloalkene",
    organ: "kidney",
    name: "Haloalkene / Halogenated vinyl group",
    severity: "high",
    smarts: "C=C([Cl,Br,F])[Cl,Br,F]",
    regex: /C=C\([Cl|Br|F]\)[Cl|Br|F]|C=C\(Cl\)Cl/i,
    explanation:
      "Undergoes hepatic glutathione conjugation followed by renal processing by cysteine conjugate β-lyase to form cytotoxic thioketenes targeting proximal tubules.",
    evidence: "Lock & Reed (2006) Crit. Rev. Toxicol. 36:589-612; Dekant et al. (1994) Toxicol. Appl. Pharmacol. 126:1-12.",
  },
  {
    id: "nephro_arylsulfonamide",
    organ: "kidney",
    name: "Aromatic primary sulfonamide",
    severity: "moderate",
    smarts: "c1ccc(S(=O)(=O)N)cc1",
    regex: /c1ccc\(S\(=O\)\(=O\)N\)cc1|c.*S\(=O\)\(=O\)N[H2|H]/i,
    explanation:
      "Prone to urinary crystalluria and interstitial nephritis at physiological urine pH; potential risk for intratubular crystal precipitation.",
    evidence: "Perazella (1999) Am. J. Kidney Dis. 34:265-279; Yarlagadda & Perazella (2008) Semin. Nephrol. 28:381-391.",
  },
  {
    id: "nephro_polyamine",
    organ: "kidney",
    name: "Oligobasic aliphatic polyamine cluster",
    severity: "moderate",
    isPhysicochemical: true,
    check: (mol, desc) => {
      // 3+ basic nitrogens and low MW (aminoglycoside-like electrostatic binding to megalin)
      const nNitrogens = (desc.smiles || "").match(/[nN]/g)?.length || 0;
      return nNitrogens >= 4 && Number(desc.mw || 0) <= 600 && Number(desc.hbd || 0) >= 4;
    },
    explanation:
      "Polycationic clusters bind acidic phospholipids on proximal tubular brush-border membranes, impairing lysosomal function and inducing tubular necrosis.",
    evidence: "Mingeot-Leclercq & Tulkens (1999) Antimicrob. Agents Chemother. 43:1003-1012.",
  },

  // ==========================================
  // 4. GENETIC / MUTAGENICITY (DNA Reactivity)
  // ==========================================
  {
    id: "muta_primary_aromatic_amine",
    organ: "mutagenicity",
    name: "Primary aromatic amine",
    severity: "high",
    smarts: "c[NH2]",
    regex: /c\[NH2\]|c1.*\[NH2\]|c1ccccc1N(?![(=O)|C])/i,
    explanation:
      "ICH M7 alert: Metastasizes via CYP1A2 to N-hydroxyarylamines and arylnitrenium ions that form covalent guanine C8 adducts in DNA.",
    evidence: "ICH M7 Guideline (2017); Benigni & Bossa (2011) Mutat. Res. 727:31-54.",
  },
  {
    id: "muta_aromatic_nitro",
    organ: "mutagenicity",
    name: "Aromatic nitro group",
    severity: "high",
    smarts: "c[N+](=O)[O-]",
    regex: /c\[N\+\]\(=O\)\[O-\]|c1.*\[N\+\]\(=O\)\[O-\]/i,
    explanation:
      "ICH M7 alert: Bacterial nitroreductase and human enzymes reduce nitroarenes to mutagenic hydroxylamines, generating positive Ames test results.",
    evidence: "Ames et al. (1975) Mutat. Res. 31:347-364; Ashby & Tennant (1988) Mutat. Res. 204:17-115.",
  },
  {
    id: "muta_alkyl_mustard",
    organ: "mutagenicity",
    name: "Aliphatic nitrogen mustard / Alkyl halide",
    severity: "high",
    smarts: "N(CC[Cl,Br])CC[Cl,Br]",
    regex: /N\(CCCl\)CCCl|N\(CCBr\)CCBr/i,
    explanation:
      "Forms electrophilic aziridinium ion intermediates that directly crosslink DNA base pairs, causing genomic instability and mutagenicity.",
    evidence: "Povirk & Shuker (1994) Mutat. Res. 318:205-226.",
  },
  {
    id: "muta_epoxide_aziridine",
    organ: "mutagenicity",
    name: "Epoxide / Aziridine",
    severity: "high",
    smarts: "C1[O,N]C1",
    regex: /C1OC1|C1CO1|C1NC1|C1CN1/i,
    explanation:
      "Strained 3-membered electrophilic heterocycle that alkylates DNA nucleophilic centers without requiring metabolic activation.",
    evidence: "Swarbrick et al. (1996) J. Med. Chem. 39:4149-4158; ICH M7.",
  },

  // ==========================================
  // 5. CARCINOGENICITY
  // ==========================================
  {
    id: "carcino_nitrosamine",
    organ: "carcinogenicity",
    name: "N-Nitroso group (Nitrosamine alert)",
    severity: "high",
    smarts: "[NX3]N=O",
    regex: /N-N=O|NN=O|N\(.*\)N=O/i,
    explanation:
      "Cohort of Concern (ICH M7): Highly potent mutagenic carcinogen metabolized to reactive alkyldiazonium ions causing widespread DNA methylation.",
    evidence: "FDA Nitrosamine Guidance (2021); Peto et al. (1991) Cancer Res. 51:6415-6451 (NDMA / N-nitrosamines).",
  },
  {
    id: "carcino_azo",
    organ: "carcinogenicity",
    name: "Aromatic azo group",
    severity: "moderate",
    smarts: "cN=Nc",
    regex: /cN=Nc|c1.*N=Nc2/i,
    explanation:
      "Azo bonds are cleaved by intestinal microflora azoreductases to liberate carcinogenic aromatic amines (e.g., benzidine, o-toluidine).",
    evidence: "Golka et al. (2004) Crit. Rev. Toxicol. 34:69-87.",
  },
  {
    id: "carcino_hydrazine_azoxy",
    organ: "carcinogenicity",
    name: "Hydrazine / Azoxy intermediate",
    severity: "high",
    smarts: "[NX3][NX3]",
    regex: /NN|N-N|N=\[N\+\]\[O-\]/i,
    explanation:
      "Oxidized to active carbonium ion species capable of alkylating RNA/DNA and forming covalent nucleic acid adducts.",
    evidence: "Toth (1975) Cancer Res. 35:3693-3697; IARC Monograph Vol 71.",
  },
];

/**
 * Organ Systems Configuration
 */
export const ORGAN_SYSTEMS = [
  {
    id: "liver",
    name: "Liver",
    subtitle: "Hepatotoxicity / DILI Risk",
    icon: "M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.485 3.515l1.06-1.06M6.343 6.343l1.06 1.06m8.486 8.486l1.06-1.06m-1.06-8.486l1.06 1.06",
    color: "#D97706", // Amber / Brown
  },
  {
    id: "heart",
    name: "Heart",
    subtitle: "Cardiotoxicity / hERG Blockade",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
    color: "#DC2626", // Red
  },
  {
    id: "kidney",
    name: "Kidney",
    subtitle: "Nephrotoxicity / Renal Clearance",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    color: "#2563EB", // Blue
  },
  {
    id: "mutagenicity",
    name: "Genetic Material",
    subtitle: "Mutagenicity / Ames DNA Reactivity",
    icon: "M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z",
    color: "#7C3AED", // Purple
  },
  {
    id: "carcinogenicity",
    name: "Cellular Safety",
    subtitle: "Carcinogenicity / Oncogenic Alerts",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    color: "#EA580C", // Orange
  },
];

/**
 * Evaluates a molecule SMILES string against the curated organ toxicity alert set.
 * Uses RDKit SMARTS substructure matching where available, with defensive regex fallbacks.
 * 
 * @param {string} inputSmiles - Chemical SMILES string
 * @param {object} properties - Descriptors (mw, logp, hbd, etc.) from RDKit
 * @param {object} rdkitInstance - Initialized RDKit instance (optional)
 * @returns {object} Organ toxicity assessment results per organ system
 */
export async function evaluateOrganToxicity(inputSmiles, properties = {}, rdkitInstance = null) {
  const smiles = String(inputSmiles || "").trim();
  if (!smiles) {
    return {
      valid: false,
      error: "No SMILES provided for toxicity assessment.",
    };
  }

  const RDKit = rdkitInstance || (await getRDKit());
  let mol = null;

  if (RDKit) {
    try {
      mol = RDKit.get_mol(smiles);
    } catch {
      mol = null;
    }
  }

  const triggeredAlerts = [];

  try {
    for (const alert of ORGAN_TOXICITY_ALERTS) {
      let isMatched = false;

      // 1. Physicochemical rule-based checks
      if (alert.isPhysicochemical && typeof alert.check === "function") {
        isMatched = alert.check(mol, { ...properties, smiles });
      } else if (mol && alert.smarts && RDKit) {
        // 2. RDKit SMARTS Substructure Match
        let qmol = null;
        try {
          qmol = RDKit.get_qmol(alert.smarts);
          if (qmol) {
            const matchJson = mol.get_substruct_match(qmol);
            const matchObj = JSON.parse(matchJson || "{}");
            isMatched = Boolean(matchObj?.atoms && matchObj.atoms.length > 0);
          }
        } catch {
          // If SMARTS fails, fallback to regex
          if (alert.regex) {
            isMatched = alert.regex.test(smiles);
          }
        } finally {
          if (qmol) {
            qmol.delete();
          }
        }
      } else if (alert.regex) {
        // 3. Defensive Regex Fallback
        isMatched = alert.regex.test(smiles);
      }

      if (isMatched) {
        triggeredAlerts.push(alert);
      }
    }
  } finally {
    if (mol) {
      mol.delete();
    }
  }

  // Aggregate results per organ system
  const organBreakdown = {};
  let totalHighAlerts = 0;
  let totalModerateAlerts = 0;

  for (const sys of ORGAN_SYSTEMS) {
    const alertsForOrgan = triggeredAlerts.filter((a) => a.organ === sys.id);
    const highAlerts = alertsForOrgan.filter((a) => a.severity === "high");
    const moderateAlerts = alertsForOrgan.filter((a) => a.severity === "moderate");

    totalHighAlerts += highAlerts.length;
    totalModerateAlerts += moderateAlerts.length;

    let riskLevel = "Low";
    let badgeColor = "green";
    let summaryExplanation = "No documented structural alerts detected for this organ system.";

    if (highAlerts.length > 0 || alertsForOrgan.length >= 2) {
      riskLevel = "High";
      badgeColor = "red";
      const topAlert = highAlerts[0] || alertsForOrgan[0];
      summaryExplanation = `Elevated risk: Triggered ${topAlert.name}. ${topAlert.explanation}`;
    } else if (moderateAlerts.length > 0) {
      riskLevel = "Moderate";
      badgeColor = "amber";
      summaryExplanation = `Moderate risk: Triggered ${moderateAlerts[0].name}. ${moderateAlerts[0].explanation}`;
    }

    organBreakdown[sys.id] = {
      systemId: sys.id,
      name: sys.name,
      subtitle: sys.subtitle,
      riskLevel,
      badgeColor,
      summaryExplanation,
      alertsCount: alertsForOrgan.length,
      alerts: alertsForOrgan.map((a) => ({
        id: a.id,
        name: a.name,
        severity: a.severity,
        explanation: a.explanation,
        evidence: a.evidence,
      })),
    };
  }

  // Overall candidate profile summary (Structural alerts count & names, never a safety verdict)
  const alertNames = triggeredAlerts.map((a) => a.name);
  let overallRisk = "Structural alerts: 0";
  let overallBadgeColor = "green";

  if (triggeredAlerts.length > 0) {
    overallRisk = `Structural alerts: ${triggeredAlerts.length} (${alertNames.join(", ")})`;
    overallBadgeColor = totalHighAlerts > 0 ? "red" : "amber";
  }

  return {
    valid: true,
    methodInfo: TOXICITY_METHOD_INFO,
    overallRisk,
    overallBadgeColor,
    totalAlerts: triggeredAlerts.length,
    totalHighAlerts,
    totalModerateAlerts,
    flaggedCategories: Object.values(organBreakdown)
      .filter((organ) => organ.alertsCount > 0)
      .map((organ) => organ.name),
    organBreakdown,
  };
}
