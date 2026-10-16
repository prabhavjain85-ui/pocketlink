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

/**
 * Mount Mol* and load the experimental structure from RCSB BinaryCIF.
 */
export async function mountCocrystalMolstarViewer(container, options) {
  const { pdbId, ligandCode, ligandChainId, ligandResSeq } = options;
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

  await viewer.loadStructureFromUrl(rcsbBcifUrl(pdbId), "mmcif", true, {
    label: `${String(pdbId).toUpperCase()} (experimental co-crystal)`,
  });

  if (ligandCode) {
    container.setAttribute(
      "data-cocrystal-ligand",
      `${ligandCode} chain ${ligandChainId || "?"} res ${ligandResSeq ?? "?"}`
    );
  }

  return viewer;
}

export async function destroyCocrystalMolstarViewer(viewer) {
  try {
    await viewer?.plugin?.dispose?.();
  } catch {
    /* ignore */
  }
}
