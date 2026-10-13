import { RT, formatKi } from "./dockingEngine";

const API_BASE = "/api/docking";

async function readJson(response) {
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = data.error || data.detail || `Docking API error (${response.status})`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data;
}

export async function submitDockingJob({ pdbId, smiles }) {
  const response = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdbId, smiles }),
  });
  return readJson(response);
}

export async function getDockingJobStatus(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}`);
  return readJson(response);
}

export async function getDockingJobResults(jobId) {
  const response = await fetch(`${API_BASE}/jobs/${encodeURIComponent(jobId)}/results`);
  return readJson(response);
}

export async function pollDockingJob(jobId, { intervalMs = 1500, timeoutMs = 600000, onProgress } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await getDockingJobStatus(jobId);
    if (onProgress) {
      onProgress({
        percent: status.progress ?? 0,
        message: status.message || status.status,
        status: status.status,
      });
    }
    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(status.error || "Docking job failed.");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Docking job timed out while waiting for results.");
}

/**
 * Map Vina service payloads into the shape expected by DockingViewer / DockingPage.
 */
export function normalizeServiceDockingResult(servicePayload, { targetTitle, pdbId, compoundName }) {
  const result = servicePayload?.result || servicePayload;
  const poses = Array.isArray(result.poses) ? result.poses : [];
  const pocketAtoms = (result.pocketAtoms || []).map((a) => ({
    atomName: a.atomName,
    resName: a.resName,
    resSeq: a.resSeq,
    x: a.x,
    y: a.y,
    z: a.z,
    element: a.element,
    isBackbone: Boolean(a.isBackbone),
  }));

  const rankedPoses = poses.map((p, idx) => {
    const deltaG = Number(p.scoreKcalMol);
    const kiMolar = Math.exp(Math.max(-18, Math.min(12, deltaG)) / RT);
    const atoms = (p.atoms || []).map((atom, i) => ({
      index: i,
      symbol: atom.element || "C",
      x: atom.x,
      y: atom.y,
      z: atom.z,
      element: atom.element || "C",
    }));
    const center = atoms.length
      ? {
          x: atoms.reduce((s, a) => s + a.x, 0) / atoms.length,
          y: atoms.reduce((s, a) => s + a.y, 0) / atoms.length,
          z: atoms.reduce((s, a) => s + a.z, 0) / atoms.length,
        }
      : { x: 0, y: 0, z: 0 };

    return {
      rank: p.rank || idx + 1,
      deltaG: Number(deltaG.toFixed(2)),
      kiMolar,
      kiFormatted: formatKi(kiMolar),
      rmsd: Number((p.rmsdLb ?? 0).toFixed(2)),
      hbondCount: 0,
      hydrophobicCount: 0,
      components: {
        vdw: deltaG,
        hbond: 0,
        electrostatic: 0,
        desolvation: 0,
        torsional: 0,
      },
      hbondInteractions: [],
      residueBreakdown: [],
      atoms,
      center,
    };
  });

  const box = result.box || {};
  return {
    target: {
      title: targetTitle,
      pocketCenter: {
        x: box.center_x ?? 0,
        y: box.center_y ?? 0,
        z: box.center_z ?? 0,
      },
      boxSize: box.size_x ?? 20,
      pocketResiduesCount: new Set(pocketAtoms.map((a) => `${a.resName}-${a.resSeq}`)).size,
      pocketAtomsCount: pocketAtoms.length,
    },
    ligand: {
      smiles: result.smiles,
      numRotatableBonds: 0,
    },
    pocketAtoms,
    rankedPoses,
    bestPose: rankedPoses[0] || null,
    engine: {
      type: "autodock_vina",
      configVersion: result.engineConfigVersion,
      disclaimer: result.disclaimer,
      pdbId,
      compoundName,
    },
  };
}

export async function runRemoteDocking({ pdbId, smiles, targetTitle, compoundName, onProgress }) {
  const submit = await submitDockingJob({ pdbId, smiles });
  await pollDockingJob(submit.jobId, { onProgress });
  const results = await getDockingJobResults(submit.jobId);
  return normalizeServiceDockingResult(results, { targetTitle, pdbId, compoundName });
}
