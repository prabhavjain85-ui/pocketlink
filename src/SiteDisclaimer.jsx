import React from "react";
import { Link } from "react-router-dom";

/**
 * Single site-wide research-use notice. Feature-specific caveats (e.g. BOILED-Egg scope)
 * stay next to the relevant numeric output.
 */
export default function SiteDisclaimer() {
  return (
    <aside className="site-disclaimer" role="note" aria-label="Research use notice">
      <p>
        For research and educational use only — not medical advice. The 0–100 knowledge-based triage score is a
        heuristic for prioritization (curated target rules and literature knowledge), not a validated predictor of
        binding, activity, or clinical success.{" "}
        <Link to="/methodology#clinical-disclaimer">Limitations &amp; disclaimer</Link>
      </p>
    </aside>
  );
}
