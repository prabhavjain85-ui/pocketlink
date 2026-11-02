/**
 * SMARTS mutation library — deduplicated by reaction SMARTS (true distinct count reported).
 */

const BASE = [
  { id: "acid_to_tetrazole", label: "Carboxylic acid → tetrazole", smarts: "[C:1](=[O:2])[OH]>>[C:1]1=NNN=N1", kind: "bioisostere" },
  { id: "tetrazole_to_acid", label: "Tetrazole → carboxylic acid", smarts: "[C:1]1=NNN=N1>>[C:1](=[O])O", kind: "bioisostere" },
  { id: "amide_to_sulfonamide", label: "Amide → sulfonamide (N-side)", smarts: "[C:1](=[O:2])[N:3]>>[S:1](=[O:2])(=[O])[N:3]", kind: "bioisostere" },
  { id: "ester_to_oxadiazole", label: "Ester → oxadiazole", smarts: "[C:1](=[O:2])[O:3][C:4]>>[C:1]1=NN=C(O1)[C:4]", kind: "bioisostere" },
  { id: "phenyl_to_pyridine", label: "Phenyl → pyridine", smarts: "[c:1]1[cH:2][cH:3][cH:4][cH:5][cH:6]1>>[n:1]1[cH:2][cH:3][cH:4][cH:5][c:6]1", kind: "bioisostere" },
  { id: "phenyl_to_thiophene", label: "Phenyl → thiophene", smarts: "[c:1]1[cH:2][cH:3][cH:4][cH:5][cH:6]1>>[c:1]1[s:2][cH:3][cH:4][cH:5][cH:6]1", kind: "bioisostere" },
  { id: "ch3_to_cf3", label: "Methyl → trifluoromethyl", smarts: "[CH3:1]>>[C:1](F)(F)F", kind: "bioisostere" },
  { id: "ch3_to_cyclopropyl", label: "Methyl → cyclopropyl", smarts: "[CH3:1]>>[C:1]1CC1", kind: "bioisostere" },
  { id: "ether_to_oxetane", label: "Ether → oxetane", smarts: "[C:1][O:2][C:3]>>[C:1]1[O:2][C:3]1", kind: "bioisostere" },
  { id: "amide_reverse", label: "Amide reversal", smarts: "[C:1](=[O:2])[N:3]>>[N:3][C:1]=[O:2]", kind: "linker" },
  { id: "add_methylene_linker", label: "Insert methylene linker", smarts: "[C:1][N:2]>>[C:1]C[N:2]", kind: "linker" },
  { id: "remove_methylene", label: "Delete methylene linker", smarts: "[C:1]C[N:2]>>[C:1][N:2]", kind: "linker" },
  { id: "amide_to_triazole", label: "Amide → 1,2,4-triazole", smarts: "[C:1](=[O])[N:2]>>[C:1]1=NN=N1", kind: "bioisostere" },
];

const SCAN_HAL = ["F", "Cl", "Br"].map((x) => ({
  id: `aryl_h_to_${x.toLowerCase()}`,
  label: `Aryl H → ${x}`,
  smarts: `[cH:1]>>[c:1]${x}`,
  kind: "scan",
}));

const METHYL_WALK = [
  { id: "add_methyl_anilino", label: "Add methyl to aromatic carbon", smarts: "[cH:1]>>[c:1]C", kind: "scan" },
  { id: "remove_aryl_methyl", label: "Remove aryl methyl", smarts: "[c:1][CH3]>>[cH:1]", kind: "scan" },
  { id: "amine_nh_to_nme", label: "Secondary amine → N-methyl", smarts: "[NH:1]>>[N:1]C", kind: "scan" },
  { id: "amine_nme_to_nh", label: "N-methyl amine → NH", smarts: "[N:1]C>>[NH:1]", kind: "scan" },
  { id: "oh_to_ome", label: "Phenol → methoxy", smarts: "[c:1][OH]>>[c:1]OC", kind: "scan" },
  { id: "ome_to_oh", label: "Methoxy → phenol", smarts: "[c:1]OC>>[c:1]O", kind: "scan" },
  { id: "add_aryl_oh", label: "Add aryl hydroxyl", smarts: "[cH:1]>>[c:1]O", kind: "scan" },
  { id: "remove_phenol", label: "Remove phenol OH", smarts: "[c:1][OH]>>[cH:1]", kind: "scan" },
  { id: "add_aryl_nh2", label: "Add aryl amine", smarts: "[cH:1]>>[c:1]N", kind: "scan" },
  { id: "f_to_cl_aryl", label: "Aryl F → Cl", smarts: "[c:1]F>>[c:1]Cl", kind: "scan" },
  { id: "cl_to_f_aryl", label: "Aryl Cl → F", smarts: "[c:1]Cl>>[c:1]F", kind: "scan" },
];

const RING_EDITS = [];
for (let n = 5; n <= 7; n += 1) {
  RING_EDITS.push({
    id: `ring${n}_aza_scan`,
    label: `Aza scan (${n}-membered)`,
    smarts: `[#6;r${n}:1]>>[#7;r${n}:1]`,
    kind: "ring",
  });
  RING_EDITS.push({
    id: `ring${n}_oxa_scan`,
    label: `Oxa scan (${n}-membered)`,
    smarts: `[#6;r${n}:1]>>[#8;r${n}:1]`,
    kind: "ring",
  });
}

const BRICS_SWAPS = [
  { id: "brics_amine_primary", label: "BRICS: attach primary amine", smarts: "[*:1][C:2](=[O])[N:3]>>[*:1][N:3]", kind: "brics" },
  { id: "brics_amine_methyl", label: "BRICS: N-methyl amine", smarts: "[*:1][N:2]>>[*:1][N:2]C", kind: "brics" },
  { id: "brics_aryl_cl", label: "BRICS: aryl chloride", smarts: "[*:1][c:2]>>[*:1][c:2]Cl", kind: "brics" },
  { id: "brics_aryl_f", label: "BRICS: aryl fluoride", smarts: "[*:1][cH:2]>>[*:1][c:2]F", kind: "brics" },
  { id: "brics_methyl", label: "BRICS: methyl cap", smarts: "[*:1][#6:2]>>[*:1][#6:2]C", kind: "brics" },
];

const MMP_STYLE = [
  { id: "mmp_alkyl_cyclopropyl", label: "MMP alkyl→cyclopropyl", smarts: "[C:1][CH3:2]>>[C:1][C:2]1CC1", kind: "mmp" },
  { id: "mmp_oh_to_nh2", label: "MMP phenol→aniline", smarts: "[c:1][OH]>>[c:1]N", kind: "mmp" },
  { id: "mmp_cooh_to_tetrazole", label: "MMP acid→tetrazole", smarts: "[C:1](=[O])[OH]>>[C:1]1=NNN=N1", kind: "mmp" },
  { id: "mmp_methyl_to_cf3", label: "MMP Me→CF3", smarts: "[CH3:1]>>[C:1](F)(F)F", kind: "mmp" },
  { id: "mmp_pyridine_scan", label: "MMP phenyl→pyridine", smarts: "[c:1]1[cH][cH][cH][cH][cH]1>>[n:1]1[cH][cH][cH][cH][cH]1", kind: "mmp" },
];

const BIOISO_EXTRA = [
  { id: "bioiso_phenol_aniline", label: "Bioisostere phenol→aniline", smarts: "[c:1][OH]>>[c:1]N", kind: "bioisostere" },
  { id: "bioiso_ether_thioether", label: "Bioisostere ether→thioether", smarts: "[C:1][O:2][C:3]>>[C:1][S:2][C:3]", kind: "bioisostere" },
  { id: "bioiso_amide_urea", label: "Bioisostere amide→urea", smarts: "[C:1](=[O])[N:2]>>[N:2][C:1](=[O])N", kind: "bioisostere" },
  { id: "bioiso_n_me_to_cyclopropyl", label: "Bioisostere N-Me→cyclopropyl", smarts: "[N:1]C>>[N:1]C1CC1", kind: "bioisostere" },
];

const RAW = [...BASE, ...SCAN_HAL, ...METHYL_WALK, ...RING_EDITS, ...BRICS_SWAPS, ...MMP_STYLE, ...BIOISO_EXTRA];

function dedupeBySmarts(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = row.smarts;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, prior: row.prior ?? 0.05 });
  }
  return out;
}

export const TRANSFORM_MANIFEST = dedupeBySmarts(RAW);

export function manifestStats() {
  const kinds = {};
  const smartsSet = new Set();
  for (const t of TRANSFORM_MANIFEST) {
    kinds[t.kind] = (kinds[t.kind] || 0) + 1;
    smartsSet.add(t.smarts);
  }
  return {
    total: TRANSFORM_MANIFEST.length,
    distinctSmarts: smartsSet.size,
    kinds,
  };
}
