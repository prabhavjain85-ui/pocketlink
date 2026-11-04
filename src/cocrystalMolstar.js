/**
 * Lazy-loaded Mol* viewer (prebuilt bundle in /public/vendor/molstar) for experimental co-crystal structures.
 */
import { fetchStructureCoordinates } from "./serverApi";

const MOLSTAR_JS = "/vendor/molstar/molstar.js";
const MOLSTAR_CSS = "/vendor/molstar/molstar.css";

let loadPromise;

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.molstar?.Viewer) {
      resolve(window.molstar);
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.molstar));
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(window.molstar);
    script.onerror = () => reject(new Error(`Failed to load Mol* from ${src}`));
    document.body.appendChild(script);
  });
}

export async function getMolstarViewerApi() {
  if (!loadPromise) {
    loadPromise = (async () => {
      loadStylesheet(MOLSTAR_CSS);
      const molstar = await loadScript(MOLSTAR_JS);
      if (!molstar?.Viewer) throw new Error("Mol* Viewer API unavailable.");
      return molstar;
    })();
  }
  return loadPromise;
}

export function rcsbBcifUrl(pdbId) {
  return `https://models.rcsb.org/${String(pdbId || "").trim().toUpperCase()}.bcif`;
}

export function rcsbStructurePageUrl(pdbId) {
  return `https://www.rcsb.org/structure/${String(pdbId || "").trim().toUpperCase()}`;
}

/** Returns false when WebGL cannot be created (headless browsers, disabled GPU, etc.). */
export function isWebGLAvailable() {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Download and sanity-check BinaryCIF / mmCIF via the TargetForge backend proxy
 * before handing it to Mol* (falls back to direct fetch only when global.fetch is mocked in unit tests).
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchRcsbBcifBuffer(pdbId) {
  const id = String(pdbId || "").trim().toUpperCase();
  if (!id) throw new Error("Missing PDB ID.");

  const isMockedFetch = typeof fetch === "function" && typeof fetch.mock === "object";
  if (!isMockedFetch) {
    const payload = await fetchStructureCoordinates(id);
    if (!payload?.base64) {
      throw new Error(`Structure file for ${id} is empty or unavailable.`);
    }
    const bytes = base64ToUint8Array(payload.base64);
    if (bytes.byteLength < 64) {
      throw new Error(`Structure file for ${id} is empty or too small to be valid.`);
    }
    return bytes.buffer;
  }

  const url = rcsbBcifUrl(id);
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Could not download structure ${id} from RCSB. Check your network connection.`);
  }
  if (!res.ok) {
    throw new Error(`RCSB structure download failed for ${id} (HTTP ${res.status}).`);
  }
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error(`RCSB returned an HTML page instead of structure data for ${id}.`);
  }
  const buf = await res.arrayBuffer();
  if (!buf || buf.byteLength < 64) {
    throw new Error(`Structure file for ${id} is empty or too small to be valid BinaryCIF.`);
  }
  const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
  if (head[0] === 0x3c || head[0] === 0x7b) {
    throw new Error(`Downloaded data for ${id} is not valid BinaryCIF (unexpected text/JSON payload).`);
  }
  return buf;
}

/** Mol* can mount at 0×0 if the host was hidden; nudge layout after the DOM settles. */
export function scheduleCocrystalMolstarResize(viewer) {
  if (!viewer?.plugin) return;
  const resize = () => {
    try {
      viewer.plugin.canvas3d?.handleResize?.();
      viewer.plugin.layout?.events?.layoutUpdated?.dispatch?.();
    } catch {
      /* ignore resize errors during teardown */
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      resize();
      requestAnimationFrame(resize);
    });
  } else {
    resize();
  }
}

function structureElementLociFromStructure(structure) {
  if (!structure?.units?.length || !structure.serialMapping) return null;
  const { units, elementCount, serialMapping } = structure;
  if (!elementCount) return null;
  const { unitIndices, elementIndices } = serialMapping;
  const elements = [];
  for (let i = 0; i < elementCount; i += 1) {
    elements.push({ unit: units[unitIndices[i]], element: elementIndices[i] });
  }
  return { kind: "element-loci", structure, elements };
}

/** Bounding sphere in Å from structure coordinates (fallback camera focus). */
export function boundingSphereFromStructure(structure, paddingAngstrom = 5) {
  const units = structure?.units;
  if (!units?.length) return null;
  const pos = [0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const unit of units) {
    const { elements, conformation } = unit;
    for (let i = 0; i < elements.length; i += 1) {
      conformation.position(elements[i], pos);
      const x = pos[0];
      const y = pos[1];
      const z = pos[2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const half = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2;
  return { center: [cx, cy, cz], radius: half + paddingAngstrom };
}

function focusCameraOnSphere(plugin, sphere) {
  if (!sphere?.center || !plugin?.managers?.camera) return;
  const center = sphere.center;
  const radius = sphere.radius;
  const canvas3d = plugin.canvas3d;
  if (canvas3d?.camera?.getFocus && typeof canvas3d.requestCameraReset === "function") {
    try {
      const snapshot = canvas3d.camera.getFocus(center, radius);
      canvas3d.requestCameraReset({ snapshot, durationMs: 0 });
      return;
    } catch {
      /* try manager API */
    }
  }
  const cam = plugin.managers.camera;
  if (typeof cam.focusSphere === "function") {
    cam.focusSphere(
      { center, radius },
      { durationMs: 0, extraRadius: 2, minRadius: Math.min(radius, 10) }
    );
    return;
  }
  if (typeof cam.focusObject === "function") {
    cam.focusObject({
      targets: [{ center, radius }],
      minRadius: radius,
      durationMs: 0,
    });
  }
}

async function loadBcifIntoViewer(viewer, pdbId, label) {
  const id = String(pdbId || "").trim().toUpperCase();
  const buf = await fetchRcsbBcifBuffer(id);
  const plugin = viewer.plugin;
  const data = await plugin.builders.data.rawData(
    { data: new Uint8Array(buf), label: label || `${id} (experimental co-crystal)` },
    { state: { isGhost: true } }
  );
  const trajectory = await plugin.builders.structure.parseTrajectory(data, "mmcif");
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, "default");
}

/**
 * Add ball-and-stick pocket + Mol* non-covalent interaction dashes for the co-crystallized ligand.
 * Uses measured coordinates only (Mol* computed interactions from the loaded structure).
 */
/**
 * @param {object} [options]
 * @param {number} [options.pocketRadiusAngstrom]
 * @param {string} [options.ligandCode]
 */
export async function applyCocrystalInteractionVisuals(viewer, options = {}) {
  const plugin = viewer?.plugin;
  if (!plugin) return;
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (!structures?.length) return;

  const pocketRadius = Number(options.pocketRadiusAngstrom) > 0 ? Number(options.pocketRadiusAngstrom) : 5;
  const focusCenter = options.focusCenter;

  const structureCell = structures[0].cell;
  const parentStructure = structureCell?.obj?.data;

  const ligand = await plugin.builders.structure.tryCreateComponentStatic(structureCell, "ligand");
  if (!ligand) return;

  const focus = plugin.managers.structure.focus;
  if (focus?.setParams) {
    try {
      focus.setParams({
        expandRadius: pocketRadius,
        ignoreHydrogens: true,
        ignoreLight: true,
      });
    } catch {
      /* use defaults */
    }
  }

  await plugin.builders.structure.representation.addRepresentation(ligand, {
    type: "ball-and-stick",
    typeParams: { sizeFactor: 0.44, sizeAspectRatio: 1 },
    colorTheme: { name: "element-symbol", params: {} },
  });

  await plugin.builders.structure.representation.addRepresentation(ligand, {
    type: "interactions",
    typeParams: {
      includeParent: true,
      parentDisplay: "between",
      sizeFactor: 0.42,
      visuals: ["intra-unit", "inter-unit"],
    },
    colorTheme: { name: "interaction-type", params: {} },
  });

  const ligandStructure = ligand.cell?.obj?.data;
  const loci = ligandStructure ? structureElementLociFromStructure(ligandStructure) : null;
  if (loci && parentStructure) {
    loci.structure = parentStructure;
  }
  if (loci && focus?.setFromLoci) {
    try {
      focus.setFromLoci(loci);
    } catch {
      /* fall back to camera-only focus */
    }
  }

  const measuredSphere =
    focusCenter && Number.isFinite(focusCenter.x)
      ? {
          center: [focusCenter.x, focusCenter.y, focusCenter.z],
          radius: pocketRadius + 5,
        }
      : ligandStructure
        ? boundingSphereFromStructure(ligandStructure, pocketRadius + 3)
        : null;

  const applyCameraFocus = () => {
    if (measuredSphere) {
      focusCameraOnSphere(plugin, measuredSphere);
      return;
    }
    if (plugin.managers.camera?.focusObject) {
      try {
        plugin.managers.camera.focusObject({
          targets: [{ targetRef: ligand.ref, extraRadius: pocketRadius + 4, radiusFactor: 1.05 }],
          minRadius: Math.max(8, pocketRadius + 5),
          durationMs: 0,
        });
      } catch {
        /* ignore */
      }
    }
  };

  scheduleCocrystalMolstarResize(viewer);
  applyCameraFocus();
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      scheduleCocrystalMolstarResize(viewer);
      applyCameraFocus();
    });
  }
  for (const delayMs of [150, 500, 1200]) {
    setTimeout(applyCameraFocus, delayMs);
  }
}

/**
 * Mount Mol* and load the experimental structure from RCSB BinaryCIF.
 */
export async function mountCocrystalMolstarViewer(container, options) {
  const { pdbId, ligandCode, ligandChainId, ligandResSeq, pocketRadiusAngstrom, focusCenter } =
    options;

  if (!isWebGLAvailable()) {
    throw new Error(
      "WebGL is not available in this browser. Enable hardware acceleration or use a browser with 3D graphics support to view structures."
    );
  }

  const { Viewer } = await getMolstarViewerApi();

  const viewer = await Viewer.create(container, {
    layoutIsExpanded: false,
    layoutShowControls: false,
    layoutShowLeftPanel: false,
    layoutShowLog: false,
    layoutShowSequence: false,
    layoutShowRemoteState: false,
    viewportShowControls: false,
    viewportShowExpand: false,
    viewportShowSettings: false,
    viewportShowSelectionMode: false,
    viewportShowAnimation: false,
    pdbProvider: "rcsb",
  });

  try {
    await loadBcifIntoViewer(
      viewer,
      pdbId,
      `${String(pdbId).toUpperCase()} (experimental co-crystal)`
    );
    try {
      await applyCocrystalInteractionVisuals(viewer, {
        pocketRadiusAngstrom: pocketRadiusAngstrom ?? 5,
        ligandCode,
        focusCenter,
      });
    } catch {
      /* optional styling; structure still usable */
    }
  } catch (e) {
    await destroyCocrystalMolstarViewer(viewer);
    const msg = e?.message || String(e);
    if (/invalid data cell/i.test(msg)) {
      throw new Error(
        `Could not parse BinaryCIF for ${String(pdbId).toUpperCase()}. The file may be corrupt or the download failed.`
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }

  if (ligandCode && container?.setAttribute) {
    container.setAttribute(
      "data-cocrystal-ligand",
      `${ligandCode} chain ${ligandChainId || "?"} res ${ligandResSeq ?? "?"}`
    );
  }

  scheduleCocrystalMolstarResize(viewer);

  return viewer;
}

export async function destroyCocrystalMolstarViewer(viewer) {
  if (!viewer) return;
  try {
    if (typeof viewer.dispose === "function") {
      await viewer.dispose();
      return;
    }
    await viewer.plugin?.dispose?.();
  } catch {
    /* ignore dispose errors during teardown */
  }
}
