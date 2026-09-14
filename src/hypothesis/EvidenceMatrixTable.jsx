import React, { useMemo, useState } from "react";

export default function EvidenceMatrixTable({ matrix = [] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [strengthFilter, setStrengthFilter] = useState("ALL");

  const evidenceTypes = useMemo(() => {
    const types = new Set();
    matrix.forEach((item) => {
      if (item.evidence_type) types.add(item.evidence_type);
    });
    return Array.from(types);
  }, [matrix]);

  const filteredMatrix = useMemo(() => {
    return matrix.filter((item) => {
      if (directionFilter !== "ALL" && item.direction !== directionFilter) return false;
      if (typeFilter !== "ALL" && item.evidence_type !== typeFilter) return false;
      if (strengthFilter !== "ALL" && item.strength !== strengthFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const inClaim = (item.claim || "").toLowerCase().includes(q);
        const inSource = (item.source || "").toLowerCase().includes(q);
        const inType = (item.evidence_type || "").toLowerCase().includes(q);
        return inClaim || inSource || inType;
      }
      return true;
    });
  }, [matrix, directionFilter, typeFilter, strengthFilter, searchTerm]);

  // Render clickable source with safe URL detection
  const renderSource = (sourceStr) => {
    if (!sourceStr) return <span className="text-muted">N/A</span>;

    // Check for explicit URL inside string
    const urlMatch = sourceStr.match(/(https?:\/\/[^\s)]+)/i);
    if (urlMatch) {
      const url = urlMatch[1];
      const displayText = sourceStr.replace(url, "").trim() || url;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="evidence-source-link"
          title={`Open source: ${url}`}
        >
          {displayText}
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4, display: "inline" }}>
            <path d="M11 3h6v6M10 10l7-7M17 11v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6" />
          </svg>
        </a>
      );
    }

    // Check for PMID
    const pmidMatch = sourceStr.match(/PMID:\s*(\d+)/i);
    if (pmidMatch) {
      const pmid = pmidMatch[1];
      return (
        <a
          href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="evidence-source-link"
          title={`View on PubMed (PMID: ${pmid})`}
        >
          {sourceStr}
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4, display: "inline" }}>
            <path d="M11 3h6v6M10 10l7-7M17 11v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6" />
          </svg>
        </a>
      );
    }

    // Check for NCT ID
    const nctMatch = sourceStr.match(/(NCT\d+)/i);
    if (nctMatch) {
      const nct = nctMatch[1];
      return (
        <a
          href={`https://clinicaltrials.gov/study/${nct}`}
          target="_blank"
          rel="noopener noreferrer"
          className="evidence-source-link"
          title={`View study on ClinicalTrials.gov (${nct})`}
        >
          {sourceStr}
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 4, display: "inline" }}>
            <path d="M11 3h6v6M10 10l7-7M17 11v6a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h6" />
          </svg>
        </a>
      );
    }

    return <span>{sourceStr}</span>;
  };

  const getDirectionBadgeClass = (dir) => {
    switch (dir) {
      case "SUPPORTS":
        return "badge-direction-supports";
      case "CONTRADICTS":
        return "badge-direction-contradicts";
      default:
        return "badge-direction-neutral";
    }
  };

  const getStrengthBadgeClass = (str) => {
    switch (str) {
      case "VERY STRONG":
        return "badge-strength-very-strong";
      case "STRONG":
        return "badge-strength-strong";
      case "MODERATE":
        return "badge-strength-moderate";
      default:
        return "badge-strength-weak";
    }
  };

  return (
    <div className="evidence-matrix-container">
      <div className="matrix-toolbar">
        <div className="matrix-search-box">
          <input
            type="text"
            className="matrix-search-input"
            placeholder="Filter claims, sources, or keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearchTerm("")}
              aria-label="Clear filter text"
            >
              ✕
            </button>
          )}
        </div>

        <div className="matrix-filter-group">
          {/* Direction filters */}
          <div className="filter-pill-row">
            <span className="filter-label">Direction:</span>
            {["ALL", "SUPPORTS", "CONTRADICTS", "NEUTRAL"].map((dir) => (
              <button
                key={dir}
                type="button"
                className={`btn-filter-pill ${directionFilter === dir ? "active" : ""}`}
                onClick={() => setDirectionFilter(dir)}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Type filter */}
          {evidenceTypes.length > 0 && (
            <div className="filter-select-wrap">
              <label className="filter-label" htmlFor="select-evidence-type">Type:</label>
              <select
                id="select-evidence-type"
                className="matrix-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Types ({matrix.length})</option>
                {evidenceTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Strength filter */}
          <div className="filter-select-wrap">
            <label className="filter-label" htmlFor="select-evidence-strength">Strength:</label>
            <select
              id="select-evidence-strength"
              className="matrix-select"
              value={strengthFilter}
              onChange={(e) => setStrengthFilter(e.target.value)}
            >
              <option value="ALL">All Strengths</option>
              <option value="VERY STRONG">Very Strong</option>
              <option value="STRONG">Strong</option>
              <option value="MODERATE">Moderate</option>
              <option value="WEAK">Weak</option>
            </select>
          </div>
        </div>
      </div>

      <div className="matrix-results-meta">
        Showing <strong>{filteredMatrix.length}</strong> of {matrix.length} evidence statements
      </div>

      <div className="matrix-table-wrap">
        <table className="evidence-matrix-table">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Evidence Claim</th>
              <th style={{ width: "15%" }}>Type</th>
              <th style={{ width: "12%" }}>Direction</th>
              <th style={{ width: "11%" }}>Strength</th>
              <th style={{ width: "10%" }}>Human Rel.</th>
              <th style={{ width: "12%" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {filteredMatrix.length > 0 ? (
              filteredMatrix.map((item, idx) => (
                <tr key={idx} className={`matrix-row row-dir-${(item.direction || "neutral").toLowerCase()}`}>
                  <td className="cell-claim">
                    <span className="claim-body">{item.claim}</span>
                  </td>
                  <td className="cell-type">
                    <span className="badge-evidence-type">{item.evidence_type}</span>
                  </td>
                  <td className="cell-direction">
                    <span className={`badge-direction ${getDirectionBadgeClass(item.direction)}`}>
                      {item.direction}
                    </span>
                  </td>
                  <td className="cell-strength">
                    <span className={`badge-strength ${getStrengthBadgeClass(item.strength)}`}>
                      {item.strength}
                    </span>
                  </td>
                  <td className="cell-relevance">
                    <span className={`badge-relevance rel-${(item.human_relevance || "N/A").toLowerCase()}`}>
                      {item.human_relevance || "N/A"}
                    </span>
                  </td>
                  <td className="cell-source">
                    {renderSource(item.source)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-matrix-msg">
                  No evidence claims match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
