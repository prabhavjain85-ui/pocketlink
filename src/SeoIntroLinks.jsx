import React from "react";
import { Link } from "react-router-dom";

const WORKFLOW_LINKS = [
  { to: "/target-discovery", label: "Target identification" },
  { to: "/repurposing", label: "Drug repurposing" },
  { to: "/docking", label: "Molecular docking" },
  { to: "/adme", label: "ADME analysis" },
  { to: "/hypothesis", label: "Hypothesis testing" },
  { to: "/agent", label: "Research agent" },
  { to: "/methodology", label: "Methodology" },
];

export default function SeoIntroLinks({ currentPath = "" }) {
  const links = WORKFLOW_LINKS.filter((item) => item.to !== currentPath);

  return (
    <nav className="seo-intro-links" aria-label="Related TargetForge workflows">
      <span className="seo-intro-links-label">Explore workflows:</span>
      {links.map((item) => (
        <Link key={item.to} to={item.to} className="seo-intro-link">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
