/**
 * CommonJS `require` usable from both runtimes that load server/:
 * - Node ESM (Vercel functions, local dev proxy, standalone scripts): via createRequire.
 * - Jest (Babel transpiles to CommonJS): the module-scoped require.
 */
import { createRequire } from "module";
import path from "path";

let cachedRequire = null;

export function nodeRequire() {
  if (typeof globalThis.__tfRequire === "function") return globalThis.__tfRequire;
  if (cachedRequire) return cachedRequire;
  try {
    // eslint-disable-next-line no-eval
    const cjsReq = eval("typeof require === 'function' ? require : null");
    if (cjsReq) {
      cachedRequire = cjsReq;
      return cachedRequire;
    }
  } catch {
    // ignore
  }
  cachedRequire = createRequire(path.join(process.cwd(), "server", "nodeRequire.js"));
  globalThis.__tfRequire = cachedRequire;
  return cachedRequire;
}
