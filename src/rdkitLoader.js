/**
 * RDKit loader for Node / Jest test environments.
 * RDKit never runs in the browser; all runtime cheminformatics and 2D structure
 * depictions execute on the server via /api/compute (see server/rdkitLoader.js).
 */

let rdkitInstance = null;
let rdkitInitPromise = null;

export async function getRDKit() {
  if (rdkitInstance) return rdkitInstance;
  if (rdkitInitPromise) return rdkitInitPromise;

  rdkitInitPromise = (async () => {
    const isNodeOrJest =
      typeof process !== "undefined" &&
      Boolean(
        process.versions?.node ||
          process.env.JEST_WORKER_ID !== undefined ||
          process.env.NODE_ENV === "test"
      );

    if (isNodeOrJest) {
      try {
        // Use dynamic require so Webpack does not bundle node modules for client
        // eslint-disable-next-line no-eval
        const dynamicRequire = eval("require");
        const initNode = dynamicRequire("@rdkit/rdkit/dist/RDKit_minimal.js");
        rdkitInstance = await initNode();
        return rdkitInstance;
      } catch (err) {
        console.warn("[rdkit] Node init error:", err?.message || err);
        rdkitInitPromise = null;
        return null;
      }
    }

    return null;
  })();

  return rdkitInitPromise;
}
