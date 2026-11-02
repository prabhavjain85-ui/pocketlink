/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
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
    indication: "Analgesic / Antipyretic (Moderate Hepatotoxicity / NAPQI alert)",
    class: "Analgesic",
  },
  {
    name: "Terfenadine (Withdrawn Cardiotoxicant)",
    smiles: "CC(C)(C)c1ccc(C(O)CCCN2CCC(C(O)(c3ccccc3)c4ccccc4)CC2)cc1",
    cid: "5405",
    indication: "Antihistamine — Withdrawn (FDA 1997) due to lethal hERG blockade & TdP arrhythmia",
    class: "Cardiotoxic Positive Control",
  },
  {
    name: "Troglitazone (Withdrawn Hepatotoxicant)",
    smiles: "Cc1c(C)c2c(c(C)c1O)CCC(C)(COc1ccc(CC3C(=O)NC(=O)S3)cc1)O2",
    cid: "5591",
    indication: "Antidiabetic (TZD) — Withdrawn (FDA 2000) due to severe DILI & liver failure",
    class: "Hepatotoxic Positive Control",
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
