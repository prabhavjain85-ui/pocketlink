/**
 * PDB/mmCIF-adjacent parsing helpers for co-crystal ligand instance selection.
 * Uses author chain ID and residue sequence numbers from ATOM/HETATM records (PDB column layout).
 */

export const CRYSTALLOGRAPHY_ADDITIVES = new Set([
  "HOH",
  "WAT",
  "SO4",
  "PO4",
  "NA",
  "CL",
  "MG",
  "CA",
  "ZN",
  "EDO",
  "DMS",
  "GOL",
]);

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function centroid(atoms) {
  if (!atoms.length) return { x: 0, y: 0, z: 0 };
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const a of atoms) {
    sx += a.x;
    sy += a.y;
    sz += a.z;
  }
  const n = atoms.length;
  return { x: sx / n, y: sy / n, z: sz / n };
}

export function normalizePdbElement(symbol, atomName) {
  const raw = (symbol || atomName || "C").trim().toUpperCase();
  if (raw === "D" || raw === "T" || raw === "U") return raw;
  if (raw.length === 1) return raw;
  if (raw === "CL") return "CL";
  if (raw === "BR") return "BR";
  return raw.slice(0, 2);
}

export function parseProteinAtomsFromPdb(pdbText) {
  const atoms = [];
  for (const line of pdbText.split(/\r?\n/)) {
    if (!line.startsWith("ATOM  ")) continue;
    try {
      const atomName = line.slice(12, 16).trim();
      const resName = line.slice(17, 20).trim();
      const chainId = line.slice(21, 22).trim() || "A";
      const resSeq = parseInt(line.slice(22, 26), 10);
      const x = parseFloat(line.slice(30, 38));
      const y = parseFloat(line.slice(38, 46));
      const z = parseFloat(line.slice(46, 54));
      const element = normalizePdbElement(line.slice(76, 78).trim(), atomName);
      atoms.push({
        atomName,
        resName,
        resSeq,
        chainId,
        x,
        y,
        z,
        element,
        isBackbone: ["N", "CA", "C", "O"].includes(atomName),
      });
    } catch {
      /* skip malformed */
    }
  }
  return atoms;
}

/**
 * Group HETATM records into discrete instances (CCD + chain + author resSeq).
 */
export function groupHetatmLigandInstances(pdbText, ligandCode) {
  const code = String(ligandCode || "").trim().toUpperCase();
  if (!code) return [];
  const byKey = new Map();
  for (const line of pdbText.split(/\r?\n/)) {
    if (!line.startsWith("HETATM")) continue;
    const resName = line.slice(17, 20).trim();
    if (resName !== code || CRYSTALLOGRAPHY_ADDITIVES.has(resName)) continue;
    try {
      const atomName = line.slice(12, 16).trim();
      const chainId = line.slice(21, 22).trim() || "A";
      const resSeq = parseInt(line.slice(22, 26), 10);
      const element = normalizePdbElement(line.slice(76, 78).trim(), atomName);
      if (element === "H") continue;
      const key = `${code}|${chainId}|${resSeq}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          ligandCode: code,
          chainId,
          resSeq,
          instanceKey: key,
          atoms: [],
        });
      }
      const idx = byKey.get(key).atoms.length;
      byKey.get(key).atoms.push({
        index: idx,
        atomName,
        resName,
        resSeq,
        chainId,
        x: parseFloat(line.slice(30, 38)),
        y: parseFloat(line.slice(38, 46)),
        z: parseFloat(line.slice(46, 54)),
        element,
      });
    } catch {
      /* skip */
    }
  }
  return Array.from(byKey.values()).filter((g) => g.atoms.length > 0);
}

export function countBindingSiteResidues(proteinAtoms, ligandAtoms, cutoffAngstrom = 4.5) {
  const ligHeavy = ligandAtoms.filter((a) => a.element !== "H");
  const keys = new Set();
  for (const pa of proteinAtoms) {
    if (pa.element === "H") continue;
    for (const la of ligHeavy) {
      if (dist(pa, la) <= cutoffAngstrom) {
        keys.add(`${pa.resName}-${pa.resSeq}-${pa.chainId || "A"}`);
        break;
      }
    }
  }
  return keys.size;
}

/**
 * Pick the ligand copy that is actually bound in the pocket (most nearby protein residues).
 * Optional poseCentroid breaks ties when symmetry copies score equally.
 */
export function selectCoCrystalLigandInstance(pdbText, ligandCode, proteinAtoms, options = {}) {
  const instances = groupHetatmLigandInstances(pdbText, ligandCode);
  if (!instances.length) {
    return {
      instance: null,
      atoms: [],
      selectionReason: "no_instance",
      instanceCount: 0,
    };
  }
  const preferredChain = options.preferredChainId?.trim();
  const poseCentroid = options.poseCentroid || null;
  const cutoff = options.cutoffAngstrom ?? 4.5;

  let best = null;
  let bestScore = -1;
  let bestPoseDist = Infinity;

  for (const inst of instances) {
    if (preferredChain && inst.chainId !== preferredChain) continue;
    const score = countBindingSiteResidues(proteinAtoms, inst.atoms, cutoff);
    const c = centroid(inst.atoms);
    const poseDist = poseCentroid
      ? Math.hypot(c.x - poseCentroid.x, c.y - poseCentroid.y, c.z - poseCentroid.z)
      : 0;
    if (
      score > bestScore ||
      (score === bestScore && poseCentroid && poseDist < bestPoseDist)
    ) {
      best = inst;
      bestScore = score;
      bestPoseDist = poseDist;
    }
  }

  if (!best && preferredChain) {
    return selectCoCrystalLigandInstance(pdbText, ligandCode, proteinAtoms, {
      ...options,
      preferredChainId: null,
    });
  }

  if (!best) {
    best = instances[0];
    bestScore = countBindingSiteResidues(proteinAtoms, best.atoms, cutoff);
  }

  let reason = instances.length === 1 ? "single_copy" : "max_pocket_contacts";
  if (poseCentroid && instances.length > 1) reason = "max_pocket_contacts_pose_tiebreak";

  return {
    instance: {
      ligandCode: best.ligandCode,
      chainId: best.chainId,
      resSeq: best.resSeq,
      instanceKey: best.instanceKey,
      heavyAtomCount: best.atoms.length,
      pocketResidueCount: bestScore,
    },
    atoms: best.atoms,
    selectionReason: reason,
    instanceCount: instances.length,
  };
}

export async function fetchPdbText(pdbId) {
  const id = String(pdbId || "").trim().toUpperCase();
  const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`);
  if (!res.ok) throw new Error(`Could not download PDB ${id} (${res.status})`);
  const text = await res.text();
  if (text.length < 100) throw new Error(`Empty PDB response for ${id}`);
  return text;
}

export function poseCentroidFromAtoms(poseAtoms) {
  const heavy = (poseAtoms || []).filter((a) => {
    const el = String(a.element || a.symbol || "C").toUpperCase();
    return el !== "H" && el !== "HD";
  });
  return heavy.length ? centroid(heavy) : null;
}

export async function resolveCoCrystalLigandFromPdb(pdbId, ligandCode, options = {}) {
  const pdbText = options.pdbText || (await fetchPdbText(pdbId));
  const proteinAtoms = parseProteinAtomsFromPdb(pdbText);
  const selection = selectCoCrystalLigandInstance(pdbText, ligandCode, proteinAtoms, options);
  return { pdbText, proteinAtoms, ...selection };
}
