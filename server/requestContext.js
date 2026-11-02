/**
 * Per-request context for server-side computation.
 * Lets deeply nested modules hand work back to the browser (e.g. localStorage
 * writes) without threading a callback through every function signature.
 */
import { AsyncLocalStorage } from "async_hooks";

export const requestContext = new AsyncLocalStorage();

/** Queue a side effect the browser should apply (history writes, active-state cache). */
export function emitClientEffect(name, args) {
  const ctx = requestContext.getStore();
  if (ctx && typeof ctx.emit === "function") ctx.emit({ t: "effect", name, args });
}
