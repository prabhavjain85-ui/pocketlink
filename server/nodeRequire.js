/**
 * CommonJS `require` usable from both runtimes that load server/:
 * - Node ESM (Vercel functions, local dev proxy): set by server/runtime.js via createRequire.
 * - Jest (Babel transpiles to CommonJS): the module-scoped require.
 */
export function nodeRequire() {
  if (typeof globalThis.__tfRequire === "function") return globalThis.__tfRequire;
  // eslint-disable-next-line no-eval
  return eval("require");
}
