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
        For research and educational use only — not medical advice. Computational scores and rankings help
        prioritize follow-up; they are not evidence of biological activity or clinical efficacy.{" "}
        <Link to="/methodology#clinical-disclaimer">Limitations &amp; disclaimer</Link>
      </p>
    </aside>
  );
}
