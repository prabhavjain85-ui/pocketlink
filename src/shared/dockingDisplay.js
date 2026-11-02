/**
 * Display-only constants and helpers for the browser.
 * The calculations that use these live in server/; this file holds no scoring logic.
 */

export const INTERACTION_METHODOLOGY = {
  bindingSiteHeavyAtomCutoffAngstrom: 4.5,
  bindingSiteExtendedCutoffAngstrom: 5.0,
  hydrogenBondMaxDistanceAngstrom: 3.5,
  hydrogenBondMinAngleDeg: 120,
  saltBridgeMaxDistanceAngstrom: 4.0,
  hydrophobicMaxDistanceAngstrom: 4.0,
  piPiFaceToFaceCentroidMaxAngstrom: 5.5,
  piPiFaceToFaceNormalMaxDeg: 30,
  piPiTShapeCentroidMaxAngstrom: 6.0,
  piPiTShapeNormalMinDeg: 60,
  piPiTShapeNormalMaxDeg: 120,
  cationPiMaxDistanceAngstrom: 6.0,
  halogenBondMaxDistanceAngstrom: 4.0,
  halogenBondMinCxaAngleDeg: 165,
  stericClashMaxDistanceAngstrom: 3.0,
  bindingSiteRecoveryMinFraction: 0.25,
};

export const INTERACTION_COLORS = {
  hydrogen_bond: "#10B981",
  salt_bridge: "#3B82F6",
  hydrophobic: "#D97706",
  pi_pi: "#A855F7",
  cation_pi: "#EC4899",
  halogen_bond: "#14B8A6",
  clash: "#EF4444",
};

export function normalizeElement(symbol) {
  if (!symbol) return "C";
  const s = String(symbol).trim().toUpperCase();
  if (s === "A" || s === "AP" || s === "CA") return "C";
  if (s === "NA" || s === "N") return "N";
  if (s === "OA" || s === "O") return "O";
  if (s === "SA" || s === "S") return "S";
  if (s === "HD" || s === "H") return "H";
  if (s === "CL") return "CL";
  if (s === "BR") return "BR";
  if (s.length > 2) return s.slice(0, 2);
  return s;
}

export function groupInteractionsByResidue(interactions) {
  const groups = new Map();
  for (const row of interactions || []) {
    const key = row.residueLabel || `${row.resName}${row.resSeq} ${row.chainId || "A"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return Array.from(groups.entries()).map(([label, rows]) => ({ label, rows }));
}

export function interactionsToViewerLines(interactions, pocketAtoms, ligandAtoms) {
  const lines = [];
  for (const row of interactions || []) {
    if (row.type !== "hydrogen_bond" && row.type !== "salt_bridge" && row.type !== "halogen_bond") {
      continue;
    }
    const pa = pocketAtoms.find(
      (a) =>
        a.resName === row.resName &&
        a.resSeq === row.resSeq &&
        a.atomName === row.proteinAtom
    );
    const la = ligandAtoms[row.ligandAtomIndex];
    if (!pa || !la) continue;
    lines.push({
      type: row.type,
      color: INTERACTION_COLORS[row.type] || "#94A3B8",
      protein: pa,
      ligand: la,
      distance: row.distanceAngstrom,
      dashed: row.type === "hydrogen_bond",
    });
  }
  return lines;
}

// Universal Gas Constant (kcal / (mol * K)) at 298.15 K
export const R_GAS = 0.00198720425864083;
export const TEMP_K = 298.15;
export const RT = R_GAS * TEMP_K; // ~0.5925 kcal/mol

export const DOCKING_REFERENCE_TARGETS = [
  {
    id: "1IEP",
    name: "Abl Tyrosine Kinase",
    organism: "Homo sapiens",
    disease: "Chronic Myeloid Leukemia (CML)",
    resolution: "2.40 Å",
    referenceLigand: "STI (Imatinib)",
    referenceSmiles: "Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1",
    center: { x: 14.1, y: 75.1, z: 37.4 },
    boxSize: 20,
    keyResidues: ["THR-315", "GLU-286", "MET-318", "ASP-381", "PHE-382", "ILE-293"],
  },
  {
    id: "1M17",
    name: "EGFR Kinase Domain",
    organism: "Homo sapiens",
    disease: "Non-Small Cell Lung Cancer (NSCLC)",
    resolution: "2.60 Å",
    referenceLigand: "AQ4 (Erlotinib)",
    referenceSmiles: "COCCOC1=C(C=C2C(=C1)C(=NC=N2)NC3=CC=CC(=C3)C#C)OCCOC",
    center: { x: 22.1, y: 33.5, z: 52.4 },
    boxSize: 20,
    keyResidues: ["MET-793", "THR-790", "LEU-718", "LYS-745", "ASP-855", "CYS-797"],
  },
  {
    id: "3SN6",
    name: "Beta-2 Adrenergic Receptor (GPCR)",
    organism: "Homo sapiens",
    disease: "Asthma / COPD",
    resolution: "3.20 Å",
    referenceLigand: "P0G (Carazolol)",
    referenceSmiles: "CC(C)NCC(O)COc1cccc2[nH]c3ccccc3c12",
    center: { x: -3.2, y: 9.8, z: -21.5 },
    boxSize: 22,
    keyResidues: ["ASP-113", "SER-203", "SER-207", "ASN-312", "PHE-290", "TRP-286"],
  },
  {
    id: "7BQY",
    name: "SARS-CoV-2 Main Protease (Mpro)",
    organism: "SARS-CoV-2",
    disease: "COVID-19",
    resolution: "1.70 Å",
    referenceLigand: "N3 Inhibitor",
    referenceSmiles: "CC(C)CC(NC(=O)OCc1ccccc1)C(=O)NC(C)C(=O)N",
    center: { x: -11.2, y: 13.5, z: 68.9 },
    boxSize: 20,
    keyResidues: ["HIS-41", "CYS-145", "GLU-166", "GLN-189", "MET-165", "ASN-142"],
  },
  {
    id: "4COX",
    name: "Cyclooxygenase-2 (COX-2)",
    organism: "Ovis aries / H. sapiens",
    disease: "Inflammation & Pain",
    resolution: "2.90 Å",
    referenceLigand: "SC-558 (Celecoxib analogue)",
    referenceSmiles: "Cc1ccc(-c2cc(C(F)(F)F)nn2-c2ccc(S(N)(=O)=O)cc2)cc1",
    center: { x: 25.4, y: 22.1, z: 48.6 },
    boxSize: 22,
    keyResidues: ["ARG-120", "TYR-355", "TYR-385", "VAL-523", "SER-530", "PHE-518"],
  },
];

export function formatKi(kiMolar) {
  if (isNaN(kiMolar) || kiMolar <= 0) return "N/A";
  if (kiMolar < 1e-9) {
    return `${(kiMolar * 1e12).toFixed(1)} pM`;
  }
  if (kiMolar < 1e-6) {
    return `${(kiMolar * 1e9).toFixed(1)} nM`;
  }
  if (kiMolar < 1e-3) {
    return `${(kiMolar * 1e6).toFixed(1)} µM`;
  }
  return `${(kiMolar * 1e3).toFixed(1)} mM`;
}
