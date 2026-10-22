/**
 * Lazy-loaded Mol* viewer (prebuilt bundle in /public/vendor/molstar) for experimental co-crystal structures.
 */

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

/**
 * Download and sanity-check RCSB BinaryCIF before handing it to Mol*.
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchRcsbBcifBuffer(pdbId) {
  const id = String(pdbId || "").trim().toUpperCase();
  if (!id) throw new Error("Missing PDB ID.");
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
 * Mount Mol* and load the experimental structure from RCSB BinaryCIF.
 */
export async function mountCocrystalMolstarViewer(container, options) {
  const { pdbId, ligandCode, ligandChainId, ligandResSeq } = options;

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
