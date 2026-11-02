/**
 * Browser-side RDKit is disabled. Molecular calculations use the server API.
 * This compatibility stub remains for UI components that optionally render a
 * local structure preview; it deliberately exposes no RDKit methods/runtime.
 */
export async function getRDKit() {
  return {};
}
