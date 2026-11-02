/**
 * Browser-side RDKit is intentionally unavailable.
 *
 * ADME/cheminformatics runs through the server API. This tiny compatibility
 * adapter remains only because legacy UI components call getRDKit() before
 * attempting optional local structure previews. It exposes no parser or WASM.
 */
const DISABLED_RDKIT = Object.freeze({
  get_mol() {
    return null;
  },
});

export async function getRDKit() {
  return DISABLED_RDKIT;
}
