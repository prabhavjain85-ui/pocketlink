import { formatKi, RT } from "./dockingEngine";

const DEMO_BASE = "/docking-demo";

export async function loadDockingDemoManifest() {
  const res = await fetch(`${DEMO_BASE}/manifest.json`);
  if (!res.ok) throw new Error("Could not load docking demo manifest.");
  return res.json();
}

export async function loadDockingDemoCase(caseId) {
  const res = await fetch(`${DEMO_BASE}/cases/${caseId}.json`);
  if (!res.ok) throw new Error(`Could not load demo case ${caseId}.`);
  return res.json();
}

/** Map static demo case JSON into DockingViewer-friendly results. */
export function demoCaseToDockingResults(caseJson) {
  const score = Number(caseJson.scoreKcalMol);
  const kiMolar = Math.exp(Math.max(-18, Math.min(12, score)) / RT);
  const atoms = (caseJson.poseAtoms || []).map((a, i) => ({
    index: i,
    symbol: a.element || a.symbol || "C",
    element: a.element || a.symbol || "C",
    x: a.x,
    y: a.y,
    z: a.z,
  }));
  const center = atoms.length
    ? {
        x: atoms.reduce((s, a) => s + a.x, 0) / atoms.length,
        y: atoms.reduce((s, a) => s + a.y, 0) / atoms.length,
        z: atoms.reduce((s, a) => s + a.z, 0) / atoms.length,
      }
    : { x: 0, y: 0, z: 0 };

  const pose = {
    rank: 1,
    deltaG: score,
    kiMolar,
    kiFormatted: formatKi(kiMolar),
    rmsd: Number(caseJson.redockRmsdAngstrom) || 0,
    hbondCount: 0,
    hydrophobicCount: 0,
    components: { vdw: score, hbond: 0, electrostatic: 0, desolvation: 0, torsional: 0 },
    hbondInteractions: [],
    residueBreakdown: [],
    atoms,
    center,
  };

  const pocketAtoms = (caseJson.pocketAtoms || []).map((a) => ({
    atomName: a.atomName,
    resName: a.resName,
    resSeq: a.resSeq,
    x: a.x,
    y: a.y,
    z: a.z,
    element: a.element,
    isBackbone: Boolean(a.isBackbone),
  }));

  return {
    target: {
      title: caseJson.target,
      pocketCenter: center,
      boxSize: 20,
      pocketResiduesCount: new Set(pocketAtoms.map((a) => `${a.resName}-${a.resSeq}`)).size,
      pocketAtomsCount: pocketAtoms.length,
    },
    ligand: { smiles: caseJson.smiles, numRotatableBonds: 0 },
    pocketAtoms,
    rankedPoses: [pose],
    bestPose: pose,
    engine: {
      type: "autodock_vina_demo",
      demo: true,
      pdbId: caseJson.pdbId,
      ligandCode: caseJson.ligandCode,
      redockRmsdAngstrom: caseJson.redockRmsdAngstrom,
      redockPass2A: caseJson.redockPass2A,
      poseFile: caseJson.poseFile,
    },
  };
}
