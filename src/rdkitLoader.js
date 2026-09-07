/**
 * RDKit WebAssembly Loader
 * Loads the official @rdkit/rdkit WASM module in both browser and Node/Jest environments.
 */

let rdkitInstance = null;
let rdkitInitPromise = null;

export async function getRDKit() {
  if (rdkitInstance) return rdkitInstance;
  if (typeof window !== "undefined" && window.RDKit) {
    rdkitInstance = window.RDKit;
    return rdkitInstance;
  }
  if (rdkitInitPromise) return rdkitInitPromise;

  rdkitInitPromise = (async () => {
    // 1. Node.js / Jest / JSDOM test environment
    const isNodeOrJest =
      (typeof process !== "undefined" &&
        (process.env.JEST_WORKER_ID !== undefined ||
          process.env.NODE_ENV === "test")) ||
      (typeof navigator !== "undefined" &&
        navigator.userAgent &&
        navigator.userAgent.includes("jsdom"));

    if (isNodeOrJest) {
      try {
        // Use dynamic require so Webpack does not attempt to bundle node fs module for client
        // eslint-disable-next-line no-eval
        const dynamicRequire = eval("require");
        const initNode = dynamicRequire("@rdkit/rdkit/dist/RDKit_minimal.js");
        rdkitInstance = await initNode();
        return rdkitInstance;
      } catch (err) {
        console.warn("[rdkit] Node init error:", err?.message || err);
        return null;
      }
    }

    // 2. Browser environment
    try {
      if (!window.initRDKitModule) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-rdkit="true"]');
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", (e) => reject(e), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = `${process.env.PUBLIC_URL || ""}/RDKit_minimal.js`;
          script.setAttribute("data-rdkit", "true");
          script.async = true;
          script.onload = () => resolve();
          script.onerror = (e) => reject(new Error("Failed to load RDKit JS runtime"));
          document.head.appendChild(script);
        });
      }

      if (typeof window.initRDKitModule === "function") {
        const rdkit = await window.initRDKitModule({
          locateFile: () => `${process.env.PUBLIC_URL || ""}/RDKit_minimal.wasm`,
        });
        window.RDKit = rdkit;
        rdkitInstance = rdkit;
        return rdkitInstance;
      }
    } catch (err) {
      console.warn("[rdkit] Browser WASM init error:", err?.message || err);
    }
    return null;
  })();

  return rdkitInitPromise;
}
