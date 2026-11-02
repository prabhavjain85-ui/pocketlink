/**
 * RDKit WebAssembly loader for the server (Node / Jest).
 * The browser keeps its own copy in src/rdkitLoader.js for structure drawing.
 */
import { nodeRequire } from "./nodeRequire.js";

let rdkitInstance = null;
let rdkitInitPromise = null;

export async function getRDKit() {
  if (rdkitInstance) return rdkitInstance;
  if (rdkitInitPromise) return rdkitInitPromise;

  rdkitInitPromise = (async () => {
    try {
      const initNode = nodeRequire()("@rdkit/rdkit/dist/RDKit_minimal.js");
      rdkitInstance = await initNode();
      return rdkitInstance;
    } catch (err) {
      console.warn("[rdkit] Node init error:", err?.message || err);
      rdkitInitPromise = null;
      return null;
    }
  })();

  return rdkitInitPromise;
}
