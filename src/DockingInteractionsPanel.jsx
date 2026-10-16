import React from "react";
import {
  groupInteractionsByResidue,
  INTERACTION_COLORS,
  INTERACTION_METHODOLOGY,
} from "./dockingInteractions";

function typeLabel(type) {
  const map = {
    hydrogen_bond: "Hydrogen bond",
    salt_bridge: "Salt bridge",
    hydrophobic: "Hydrophobic",
    pi_pi: "π–π stacking",
    cation_pi: "Cation–π",
    halogen_bond: "Halogen bond",
    clash: "Steric clash",
  };
  return map[type] || type;
}

export default function DockingInteractionsPanel({
  interactionBundle,
  poseRmsdAngstrom = null,
  unreliablePose = false,
  showMethodology = true,
}) {
  const sanity = interactionBundle?.bindingSiteSanity;
  const offSite = sanity?.poseNotInKnownBindingSite;
  const interactions = interactionBundle?.interactions || [];

  if (!interactionBundle) {
    return null;
  }

  if (!interactions.length && !offSite) {
    return (
      <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "12px 0 0" }}>
        No binding-site contacts detected at the configured cutoffs for this pose.
      </p>
    );
  }

  const groups = groupInteractionsByResidue(interactions);
  const site45 = interactionBundle.bindingSiteResidues45Angstrom || [];
  const site50 = interactionBundle.bindingSiteResidues50Angstrom || [];
  const clashCount = interactionBundle.clashCount ?? interactions.filter((r) => r.type === "clash").length;

  return (
    <div style={{ marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700 }}>Predicted pose interactions</h3>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {interactionBundle.disclaimer ||
              "Contacts inferred from the docked pose; not experimentally confirmed."}
          </p>
        </div>
      </div>

      {offSite && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            fontSize: "12px",
            color: "var(--red, #B91C1C)",
            background: "var(--red-bg, #FEF2F2)",
            border: "1px solid var(--red-border, #FECACA)",
            borderRadius: "var(--radius)",
            lineHeight: 1.5,
          }}
        >
          <strong>{sanity.message || "Pose not in the known binding site; interactions unreliable."}</strong>
          {sanity.crystalSiteRecoveryFraction != null && (
            <>
              {" "}
              Crystal-site recovery:{" "}
              <span className="mono">{(sanity.crystalSiteRecoveryFraction * 100).toFixed(1)}%</span> (
              {sanity.overlapResidueCount}/{sanity.crystalSiteResidueCount} co-crystal pocket residues).
            </>
          )}
          {sanity.pdbLiteratureResidueNote && (
            <div style={{ marginTop: 6, fontSize: "11px", color: "var(--text-dim)" }}>
              {sanity.pdbLiteratureResidueNote}
            </div>
          )}
        </div>
      )}

      {clashCount > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            fontSize: "12px",
            color: "var(--red, #B91C1C)",
            background: "var(--red-bg, #FEF2F2)",
            border: "1px solid var(--red-border, #FECACA)",
            borderRadius: "var(--radius)",
          }}
        >
          {clashCount} steric clash{clashCount === 1 ? "" : "es"} (heavy-atom distance &lt;{" "}
          {INTERACTION_METHODOLOGY.stericClashMaxDistanceAngstrom} Å, excluding H-bond pairs).
        </div>
      )}

      {unreliablePose && (
        <div
          role="alert"
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            fontSize: "12px",
            color: "var(--amber)",
            background: "var(--amber-bg, #FFFBEB)",
            border: "1px solid var(--amber-border, #FDE68A)",
            borderRadius: "var(--radius)",
          }}
        >
          Pose reliability warning: redock RMSD{" "}
          {poseRmsdAngstrom != null ? (
            <span className="mono">{poseRmsdAngstrom} Å</span>
          ) : (
            "exceeds 2 Å"
          )}
          . Treat these contacts as uncertain.
        </div>
      )}

      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: 10, lineHeight: 1.5 }}>
        <strong>Binding site (≤ {INTERACTION_METHODOLOGY.bindingSiteHeavyAtomCutoffAngstrom} Å):</strong>{" "}
        {site45.map((r) => r.label).join(", ") || "—"}
        {site50.length > site45.length && (
          <>
            <br />
            <strong>Within {INTERACTION_METHODOLOGY.bindingSiteExtendedCutoffAngstrom} Å:</strong>{" "}
            {site50.map((r) => r.label).join(", ")}
          </>
        )}
      </div>

      {groups.map(({ label, rows }) => (
        <div key={label} className="score-table-wrap" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: 4 }}>{label}</div>
          <table className="score-table" style={{ width: "100%", fontSize: "11px" }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Protein atom</th>
                <th>Ligand atom</th>
                <th>Distance (Å)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={`${label}-${idx}`}>
                  <td style={row.type === "clash" ? { color: "var(--red, #B91C1C)", fontWeight: 600 } : undefined}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: INTERACTION_COLORS[row.type] || "#64748B",
                        marginRight: 6,
                        verticalAlign: "middle",
                      }}
                    />
                    {typeLabel(row.type)}
                    {row.subtype ? ` (${row.subtype.replace(/_/g, " ")})` : ""}
                    {row.type === "clash" ? " ⚠" : ""}
                  </td>
                  <td className="mono">
                    {row.proteinAtom} ({row.proteinElement})
                  </td>
                  <td className="mono">
                    {row.ligandAtom} ({row.ligandElement})
                  </td>
                  <td className="mono">{row.distanceAngstrom}</td>
                  <td style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                    {row.type === "hydrogen_bond" && row.geometricQuality === "distance-only" && "distance-only"}
                    {row.hbondAngleDeg != null && `θ=${row.hbondAngleDeg}°`}
                    {row.matchesCrystal && (
                      <span style={{ color: "var(--green)", fontWeight: 600 }}> matches crystal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showMethodology && (
        <details style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Interaction methodology (geometric)</summary>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.55 }}>
            <li>
              Binding site: protein residues with any heavy atom within{" "}
              {INTERACTION_METHODOLOGY.bindingSiteHeavyAtomCutoffAngstrom} Å of the ligand (also list ≤{" "}
              {INTERACTION_METHODOLOGY.bindingSiteExtendedCutoffAngstrom} Å).
            </li>
            <li>
              H-bonds: donor–acceptor ≤ {INTERACTION_METHODOLOGY.hydrogenBondMaxDistanceAngstrom} Å; D–H···A ≥
              {INTERACTION_METHODOLOGY.hydrogenBondMinAngleDeg}° when polar H coordinates are present, otherwise flagged
              distance-only.
            </li>
            <li>Salt bridges: charged atom pairs ≤ {INTERACTION_METHODOLOGY.saltBridgeMaxDistanceAngstrom} Å.</li>
            <li>Hydrophobic C–C contacts ≤ {INTERACTION_METHODOLOGY.hydrophobicMaxDistanceAngstrom} Å.</li>
            <li>π–π: aromatic centroid/normal criteria (face-to-face or T-shaped).</li>
            <li>Cation–π: cation to aromatic centroid ≤ {INTERACTION_METHODOLOGY.cationPiMaxDistanceAngstrom} Å.</li>
            <li>
              Halogen bonds: Cl/Br/I only (not F), X···acceptor ≤ {INTERACTION_METHODOLOGY.halogenBondMaxDistanceAngstrom} Å with C–X···A ≥
              {INTERACTION_METHODOLOGY.halogenBondMinCxaAngleDeg}°.
            </li>
            <li>
              Steric clashes: heavy-atom pairs &lt; {INTERACTION_METHODOLOGY.stericClashMaxDistanceAngstrom} Å unless classified as H-bonds.
            </li>
            <li>
              Binding-site sanity: pose residues within 4.5 Å compared to co-crystal pocket; recovery &lt;
              {(INTERACTION_METHODOLOGY.bindingSiteRecoveryMinFraction * 100).toFixed(0)}% flags off-site poses.
            </li>
          </ul>
        </details>
      )}
    </div>
  );
}
