import React from "react";

const badgeStyle = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "4px",
  background: "var(--amber-bg, #FFFBEB)",
  color: "var(--amber-text, #92400E)",
  border: "1px solid var(--amber-border, #FDE68A)",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  lineHeight: 1.4,
  verticalAlign: "middle",
};

const noteStyle = {
  margin: 0,
  fontSize: "12px",
  color: "var(--text-dim)",
  lineHeight: 1.5,
};

export const DOCKING_EXPERIMENTAL_NOTE =
  "Redocking validation against crystal structures is in progress. Docking poses and ΔG values are experimental and should not be used to judge biological activity.";

/** Unobtrusive badge for docking surfaces */
export function DockingExperimentalBadge({ style = {} }) {
  return (
    <span style={{ ...badgeStyle, ...style }} title={DOCKING_EXPERIMENTAL_NOTE}>
      Experimental — not validated
    </span>
  );
}

/** Short disclaimer block for panels and result areas */
export function DockingExperimentalNote({ compact = false, style = {} }) {
  return (
    <div
      className="docking-experimental-note"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: compact ? "center" : "flex-start",
        gap: compact ? "8px" : "10px",
        padding: compact ? "8px 12px" : "10px 14px",
        borderRadius: "var(--radius, 6px)",
        background: "var(--surface-muted, #F9FAFB)",
        border: "1px solid var(--border)",
        ...style,
      }}
      role="note"
    >
      <DockingExperimentalBadge />
      <p style={{ ...noteStyle, flex: "1 1 200px" }}>{DOCKING_EXPERIMENTAL_NOTE}</p>
    </div>
  );
}
