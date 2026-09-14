import React, { useState } from "react";

const ROLE_ICONS = {
  BIOLOGIST: "🧬",
  PHARMACOLOGIST: "💊",
  GENETICIST: "🧬",
  "CLINICAL SCIENTIST": "🏥",
  TOXICOLOGIST: "⚠️",
  SKEPTIC: "🧐",
  "SCIENTIFIC JUDGE": "⚖️",
};

const ROLE_THEMES = {
  BIOLOGIST: "role-biologist",
  PHARMACOLOGIST: "role-pharmacologist",
  GENETICIST: "role-geneticist",
  "CLINICAL SCIENTIST": "role-clinical",
  TOXICOLOGIST: "role-toxicologist",
  SKEPTIC: "role-skeptic",
  "SCIENTIFIC JUDGE": "role-judge",
};

export default function ScientificDebatePanel({ debate = [] }) {
  const [activeRoleIndex, setActiveRoleIndex] = useState(0);

  if (!debate || !debate.length) return null;

  const judge = debate.find((d) => d.role === "SCIENTIFIC JUDGE");
  const panelists = debate.filter((d) => d.role !== "SCIENTIFIC JUDGE");

  const currentPanelist = panelists[activeRoleIndex] || panelists[0];

  return (
    <div className="debate-panel-container">
      <div className="debate-header">
        <div>
          <h3 className="debate-title">
            <span className="debate-icon" aria-hidden="true">🏛️</span>
            AI Scientific Panel Debate
          </h3>
          <p className="debate-subtitle">
            Multi-disciplinary internal evaluation from independent domain specialists, synthesized by the Chief Scientific Judge.
          </p>
        </div>
      </div>

      {/* Scientific Judge synthesis pinned at top */}
      {judge && (
        <div className="judge-synthesis-card">
          <div className="judge-badge-row">
            <span className="judge-icon" aria-hidden="true">⚖️</span>
            <span className="judge-title">SCIENTIFIC JUDGE — SYNTHESIS & CONSENSUS</span>
          </div>
          <div className="judge-body-text">
            {judge.argument}
          </div>
        </div>
      )}

      {/* Specialist Debate Navigation Tabs */}
      <div className="panelist-tab-bar">
        {panelists.map((member, idx) => {
          const isActive = idx === activeRoleIndex;
          const roleKey = member.role || "SCIENTIST";
          return (
            <button
              key={idx}
              type="button"
              className={`panelist-tab-btn ${isActive ? "active" : ""} ${ROLE_THEMES[roleKey] || ""}`}
              onClick={() => setActiveRoleIndex(idx)}
            >
              <span className="tab-icon" aria-hidden="true">{ROLE_ICONS[roleKey] || "🔬"}</span>
              <span className="tab-label">{member.title || member.role}</span>
            </button>
          );
        })}
      </div>

      {/* Active Panelist Argument Box */}
      {currentPanelist && (
        <div className={`active-argument-card ${ROLE_THEMES[currentPanelist.role] || ""}`}>
          <div className="argument-card-header">
            <div className="argument-speaker-info">
              <span className="speaker-avatar" aria-hidden="true">
                {ROLE_ICONS[currentPanelist.role] || "🔬"}
              </span>
              <div>
                <h4 className="speaker-title">{currentPanelist.title || currentPanelist.role}</h4>
                <span className="speaker-domain">Independent Domain Assessment</span>
              </div>
            </div>
            <span className="role-chip">{currentPanelist.role}</span>
          </div>

          <div className="argument-text-content">
            {currentPanelist.argument}
          </div>
        </div>
      )}
    </div>
  );
}
