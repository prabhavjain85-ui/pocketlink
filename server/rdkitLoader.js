/**
 * RDKit WebAssembly loader for the server (Node / Vercel / Jest).
 * All RDKit calculations and 2D structure depictions run exclusively on the server.
 */
import { nodeRequire } from "./nodeRequire.js";

let rdkitInstance = null;
let rdkitInitPromise = null;

export async function getRDKit() {
  if (rdkitInstance) return rdkitInstance;
  if (rdkitInitPromise) return rdkitInitPromise;

  rdkitInitPromise = (async () => {
    try {
      const req = nodeRequire();
      const initNode = req("@rdkit/rdkit/dist/RDKit_minimal.js");
      let wasmPath = null;
      try {
        wasmPath = req.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
      } catch {
        wasmPath = null;
      }
      rdkitInstance = await initNode(
        wasmPath
          ? { locateFile: (file, dir) => (file.endsWith(".wasm") ? wasmPath : (dir || "") + file) }
          : undefined
      );
      return rdkitInstance;
    } catch (err) {
      console.warn("[rdkit] Node init error:", err?.message || err);
      rdkitInitPromise = null;
      return null;
    }
  })();

  return rdkitInitPromise;
}
