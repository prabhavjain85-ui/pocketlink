import { getRDKit } from "./rdkitLoader";

/**
 * Standard ADME Example Compounds for quick 1-click testing
 */
export const ADME_EXAMPLE_COMPOUNDS = [
  {
    name: "Imatinib",
    smiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
    cid: "5291",
    indication: "Tyrosine kinase inhibitor (CML / GIST)",
    class: "Oncology",
  },
  {
    name: "Erlotinib",
    smiles: "COCCOc1cc2c(Nc3cccc(C#C)c3)ncnc2cc1OCCOC",
    cid: "176870",
    indication: "EGFR tyrosine kinase inhibitor (NSCLC)",
    class: "Oncology",
  },
  {
    name: "Aspirin (Acetylsalicylic acid)",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    cid: "2244",
    indication: "COX-1/2 inhibitor (Analgesic / Antiplatelet)",
    class: "NSAID",
  },
  {
    name: "Caffeine",
    smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    cid: "2519",
    indication: "Adenosine receptor antagonist (CNS stimulant)",
    class: "Xanthine",
  },
  {
    name: "Paracetamol (Acetaminophen)",
    smiles: "CC(=O)Nc1ccc(O)cc1",
    cid: "1983",
    indication: "Analgesic and antipyretic (Central COX inhibitor)",
    class: "Analgesic",
  },
  {
    name: "Atorvastatin",
    smiles: "CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O",
    cid: "60823",
    indication: "HMG-CoA reductase inhibitor (Hypercholesterolemia)",
    class: "Statin",
  },
  {
    name: "Metformin",
    smiles: "CN(C)C(=N)NC(=N)N",
    cid: "4091",
    indication: "AMPK activator (Type 2 diabetes)",
    class: "Biguanide",
  },
  {
    name: "Diazepam",
    smiles: "CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21",
    cid: "3016",
    indication: "GABA_A positive allosteric modulator (Anxiolytic)",
    class: "Benzodiazepine",
  },
];

/**
 * Ellipse geometry definitions for BOILED-Egg space (TPSA vs LogP)
 * Based on Daina & Zoete, ChemMedChem 2016, 11(11): 1117-1121.
 */
export const BOILED_EGG_GEOMETRY = {
  // Human Intestinal Absorption (HIA) - The "White"
  hia: {
    name: "Human Intestinal Absorption (HIA)",
    cx: 71.05,
    cy: 2.29,
    a: 71.0,
    b: 4.5,
    theta: -0.05, // radians rotation
  },
  // Blood-Brain Barrier (BBB) - The "Yolk"
  bbb: {
    name: "Blood-Brain Barrier (BBB)",
    cx: 38.0,
    cy: 2.5,
    a: 39.0,
    b: 2.4,
    theta: -0.04, // radians rotation
  },
};

/**
 * Check whether (tpsa, logp) falls inside a rotated ellipse
 */
export function pointInsideEllipse(x, y, ellipse) {
  const { cx, cy, a, b, theta } = ellipse;
  const dx = x - cx;
  const dy = y - cy;
  const xr = dx * Math.cos(theta) + dy * Math.sin(theta);
  const yr = -dx * Math.sin(theta) + dy * Math.cos(theta);
  return (xr / a) ** 2 + (yr / b) ** 2 <= 1.0;
}

/**
 * Evaluate BOILED-Egg style absorption classification
 */
export function evaluateBoiledEgg(tpsa, logp) {
  const inHia = pointInsideEllipse(tpsa, logp, BOILED_EGG_GEOMETRY.hia);
  const inBbb = inHia && pointInsideEllipse(tpsa, logp, BOILED_EGG_GEOMETRY.bbb);

  let region = "low_absorption";
  let label = "Low GI Absorption (Grey)";
  let giAbsorption = "Low";
  let bbbPermeation = "Low";

  if (inBbb) {
    region = "bbb";
    label = "BBB Permeant + High GI (Yolk)";
    giAbsorption = "High";
    bbbPermeation = "High (Permeant)";
  } else if (inHia) {
    region = "hia";
    label = "High GI Absorption (White)";
    giAbsorption = "High";
    bbbPermeation = "Low (Non-permeant)";
  }

  return {
    inHia,
    inBbb,
    region,
    label,
    giAbsorption,
    bbbPermeation,
  };
}

/**
 * Calculate ESOL Aqueous Solubility (Delaney 2004)
 * LogS = 0.16 - 0.63*cLogP - 0.0062*MW + 0.066*RotB - 0.74*AromaticProportion
 */
export function calculateEsolSolubility({ mw, logp, rotb, heavyAtoms, aromaticRings }) {
  const safeHeavy = Math.max(1, heavyAtoms || 1);
  const aromaticAtoms = Math.min(safeHeavy, (aromaticRings || 0) * 6);
  const aromaticProportion = aromaticAtoms / safeHeavy;

  const logS =
    0.16 -
    0.63 * logp -
    0.0062 * mw +
    0.066 * (rotb || 0) -
    0.74 * aromaticProportion;

  let qualitativeClass = "Insoluble";
  let classColor = "red";
  if (logS >= 0) {
    qualitativeClass = "Highly soluble";
    classColor = "green";
  } else if (logS >= -2.0) {
    qualitativeClass = "Soluble";
    classColor = "green";
  } else if (logS >= -4.0) {
    qualitativeClass = "Moderately soluble";
    classColor = "amber";
  } else if (logS >= -6.0) {
    qualitativeClass = "Poorly soluble";
    classColor = "amber";
  } else {
    qualitativeClass = "Very poorly soluble / Insoluble";
    classColor = "red";
  }

  // Convert logS (log mol/L) to mg/mL: 10^logS * MW * 1000 mg/L / 1000 = 10^logS * MW mg/mL
  const molPerL = 10 ** logS;
  const mgPerMl = molPerL * mw;

  return {
    logS: Number(logS.toFixed(2)),
    molPerL,
    mgPerMl: Number(mgPerMl.toFixed(4)),
    qualitativeClass,
    classColor,
    aromaticProportion: Number(aromaticProportion.toFixed(2)),
  };
}

/**
 * Evaluate Lipinski's Rule of Five (Lipinski et al. 2001)
 */
export function evaluateLipinski({ mw, logp, hbd, hba }) {
  const rules = [
    {
      id: "mw",
      label: "Molecular Weight",
      criterion: "≤ 500 Da",
      value: `${mw.toFixed(1)} Da`,
      pass: mw <= 500,
    },
    {
      id: "logp",
      label: "cLogP (Lipophilicity)",
      criterion: "≤ 5.0",
      value: logp.toFixed(2),
      pass: logp <= 5.0,
    },
    {
      id: "hbd",
      label: "H-Bond Donors",
      criterion: "≤ 5",
      value: String(hbd),
      pass: hbd <= 5,
    },
    {
      id: "hba",
      label: "H-Bond Acceptors",
      criterion: "≤ 10",
      value: String(hba),
      pass: hba <= 10,
    },
  ];

  const violations = rules.filter((r) => !r.pass).length;
  let status = "Pass (0 violations)";
  let badgeColor = "green";

  if (violations === 1) {
    status = "Acceptable (1 violation)";
    badgeColor = "amber";
  } else if (violations > 1) {
    status = `Alert (${violations} violations)`;
    badgeColor = "red";
  }

  return {
    name: "Lipinski's Rule of Five",
    violations,
    pass: violations <= 1,
    status,
    badgeColor,
    rules,
    reference: "Lipinski, C. A., et al. (2001). Adv. Drug Deliv. Rev., 46(1-3), 3-26.",
  };
}

/**
 * Evaluate Veber's Rules for Oral Bioavailability (Veber et al. 2002)
 */
export function evaluateVeber({ rotb, tpsa }) {
  const rules = [
    {
      id: "rotb",
      label: "Rotatable Bonds",
      criterion: "≤ 10",
      value: String(rotb),
      pass: rotb <= 10,
    },
    {
      id: "tpsa",
      label: "Polar Surface Area (TPSA)",
      criterion: "≤ 140 Å²",
      value: `${tpsa.toFixed(1)} Å²`,
      pass: tpsa <= 140,
    },
  ];

  const violations = rules.filter((r) => !r.pass).length;
  const pass = violations === 0;

  return {
    name: "Veber's Bioavailability Rules",
    violations,
    pass,
    status: pass ? "Good oral bioavailability" : `${violations} violation(s)`,
    badgeColor: pass ? "green" : "amber",
    rules,
    reference: "Veber, D. F., et al. (2002). J. Med. Chem., 45(12), 2615-2623.",
  };
}

/**
 * Evaluate Ghose Druglikeness Filter (Ghose et al. 1999)
 */
export function evaluateGhose({ mw, logp, mr, totalAtoms }) {
  const rules = [
    {
      id: "mw",
      label: "Molecular Weight",
      criterion: "160 to 480 Da",
      value: `${mw.toFixed(1)} Da`,
      pass: mw >= 160 && mw <= 480,
    },
    {
      id: "logp",
      label: "cLogP",
      criterion: "-0.4 to 5.6",
      value: logp.toFixed(2),
      pass: logp >= -0.4 && logp <= 5.6,
    },
    {
      id: "mr",
      label: "Molar Refractivity",
      criterion: "40 to 130",
      value: mr.toFixed(1),
      pass: mr >= 40 && mr <= 130,
    },
    {
      id: "atoms",
      label: "Total Atom Count",
      criterion: "20 to 70 atoms",
      value: String(totalAtoms),
      pass: totalAtoms >= 20 && totalAtoms <= 70,
    },
  ];

  const violations = rules.filter((r) => !r.pass).length;
  const pass = violations === 0;

  return {
    name: "Ghose Druglikeness Filter",
    violations,
    pass,
    status: pass ? "Pass (0 violations)" : `${violations} violation(s)`,
    badgeColor: pass ? "green" : violations <= 1 ? "amber" : "red",
    rules,
    reference: "Ghose, A. K., et al. (1999). J. Comb. Chem., 1(1), 55-68.",
  };
}

/**
 * Main ADME prediction function.
 * Evaluates a molecule SMILES using native RDKit WASM descriptors.
 */
export async function calculateAdmeProperties(inputSmiles, metadata = {}) {
  const rawSmiles = String(inputSmiles || "").trim();
  if (!rawSmiles) {
    return {
      valid: false,
      error: "Please enter or select a valid chemical SMILES string.",
    };
  }

  const RDKit = await getRDKit();
  if (!RDKit) {
    return {
      valid: false,
      error: "RDKit WebAssembly module is loading. Please retry in a moment.",
    };
  }

  let mol = null;
  try {
    mol = RDKit.get_mol(rawSmiles);
  } catch (err) {
    return {
      valid: false,
      error: `RDKit was unable to parse SMILES: ${err?.message || "Syntax error"}`,
    };
  }

  if (!mol) {
    return {
      valid: false,
      error: `Invalid SMILES syntax: "${rawSmiles}". Ensure valence and ring closures are chemically valid.`,
    };
  }

  try {
    const canonicalSmiles = mol.get_smiles();
    let structureSvg = null;
    try {
      structureSvg = mol.get_svg(280, 180);
    } catch {
      structureSvg = null;
    }

    const desc = JSON.parse(mol.get_descriptors());

    const mw = Number(desc.amw || 0);
    const exactMw = Number(desc.exactmw || mw);
    const logp = Number(desc.CrippenClogP || 0);
    const tpsa = Number(desc.tpsa || 0);
    const hbd = Number(desc.NumHBD ?? desc.lipinskiHBD ?? 0);
    const hba = Number(desc.NumHBA ?? desc.lipinskiHBA ?? 0);
    const rotb = Number(desc.NumRotatableBonds || 0);
    const mr = Number(desc.CrippenMR || 0);
    const heavyAtoms = Number(desc.NumHeavyAtoms || 0);
    const totalAtoms = Number(desc.NumAtoms || 0);
    const rings = Number(desc.NumRings || 0);
    const aromaticRings = Number(desc.NumAromaticRings || 0);
    const fractionCsp3 = Number(desc.FractionCSP3 || 0);

    const properties = {
      mw,
      exactMw,
      logp,
      tpsa,
      hbd,
      hba,
      rotb,
      mr,
      heavyAtoms,
      totalAtoms,
      rings,
      aromaticRings,
      fractionCsp3,
    };

    // 1. Druglikeness rule assessments
    const lipinski = evaluateLipinski({ mw, logp, hbd, hba });
    const veber = evaluateVeber({ rotb, tpsa });
    const ghose = evaluateGhose({ mw, logp, mr, totalAtoms });

    // 2. BOILED-Egg style GI Absorption & BBB Permeation
    const boiledEgg = evaluateBoiledEgg(tpsa, logp);

    // 3. Delaney ESOL Aqueous Solubility
    const solubility = calculateEsolSolubility({
      mw,
      logp,
      rotb,
      heavyAtoms,
      aromaticRings,
    });

    return {
      valid: true,
      inputSmiles: rawSmiles,
      canonicalSmiles,
      structureSvg,
      compoundName: metadata.name || metadata.compoundName || "Target Compound",
      cid: metadata.cid || null,
      indication: metadata.indication || null,
      properties,
      druglikeness: {
        lipinski,
        veber,
        ghose,
        allPassed: lipinski.pass && veber.pass && ghose.pass,
      },
      pharmacokinetics: {
        boiledEgg,
        solubility,
      },
      citations: [
        {
          model: "Physicochemical Descriptors & Crippen cLogP / MR",
          reference: "Wildman, S. A., & Crippen, G. M. (1999). Prediction of Physicochemical Parameters by Atomic Contributions. J. Chem. Inf. Comput. Sci., 39(5), 868-873.",
        },
        {
          model: "Lipinski Rule of 5",
          reference: "Lipinski, C. A., Lombardo, F., Dominy, B. W., & Feeney, P. J. (2001). Experimental and computational approaches to estimate solubility and permeability in drug discovery and development settings. Adv. Drug Deliv. Rev., 46(1-3), 3-26.",
        },
        {
          model: "Veber Oral Bioavailability",
          reference: "Veber, D. F., et al. (2002). Molecular properties that influence the oral bioavailability of drug candidates. J. Med. Chem., 45(12), 2615-2623.",
        },
        {
          model: "Ghose Druglikeness Filter",
          reference: "Ghose, A. K., Viswanadhan, V. N., & Wendoloski, J. J. (1999). A knowledge-based approach in designing combinatorial or medicinal chemistry libraries. J. Comb. Chem., 1(1), 55-68.",
        },
        {
          model: "BOILED-Egg Passive Gastrointestinal & BBB Permeation",
          reference: "Daina, A., & Zoete, V. (2016). A BOILED-Egg to Predict Gastrointestinal Absorption and Brain Penetration of Small Molecules. ChemMedChem, 11(11), 1117-1121.",
        },
        {
          model: "ESOL Aqueous Solubility",
          reference: "Delaney, J. S. (2004). ESOL: Estimating Aqueous Solubility Directly from Molecular Structure. J. Chem. Inf. Comput. Sci., 44(3), 1000-1005.",
        },
      ],
    };
  } finally {
    if (mol) {
      mol.delete();
    }
  }
}
