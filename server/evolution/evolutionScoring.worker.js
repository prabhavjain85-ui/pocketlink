/* eslint-disable no-restricted-globals */
import { getRDKit } from "../rdkitLoader.js";
import { scoreEvolvedMolecule } from "../evolutionScore.js";

self.onmessage = async (event) => {
  const { variants = [], ctx = {} } = event.data || {};
  try {
    const RDKit = await getRDKit();
    const results = [];
    for (const variant of variants) {
      const scored = await scoreEvolvedMolecule({ ...variant, ...ctx, RDKit });
      results.push(scored);
    }
    self.postMessage({ ok: true, results });
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message || "Worker scoring failed" });
  }
};
