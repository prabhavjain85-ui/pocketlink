/**
 * Browser-side RDKit is disabled. Molecular calculations run through the server API.
 * This compatibility adapter keeps legacy UI readiness checks operational while
 * intentionally providing no parser, renderer, or WebAssembly runtime.
 */
const DISABLED_RDKIT = Object.freeze({
  get_mol() {
    return null;
  },
});

export async function getRDKit() {
  return DISABLED_RDKIT;
}
