import React, { useState } from "react";

export default function EvidenceGraph({ graph, parsed, evaluation }) {
  const [selectedNode, setSelectedNode] = useState(null);

  if (!graph || !graph.nodes || !graph.nodes.length) {
    return null;
  }

  const nodes = graph.nodes;
  const edges = graph.edges || [];

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  // Node metadata for inspection
  const getNodeDetails = (node) => {
    if (!node) return null;
    switch (node.id) {
      case "disease":
        return {
          title: node.label,
          type: "Indication / Disease State",
          description: `Target pathological condition. Etiology and phenotypic burden evaluated against proposed modulation.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Human genetics" || e.evidence_type === "Observational") || [],
        };
      case "target":
        return {
          title: node.label,
          type: "Therapeutic Molecular Target",
          description: `Direct pharmacological point of intervention (${parsed?.targetGene || "Gene"}). Expression and functional essentiality analyzed across tissues.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Human genetics" || e.evidence_type === "Mechanistic") || [],
        };
      case "pathway":
        return {
          title: node.label,
          type: "Biochemical Signaling Cascade",
          description: `Transduction cascade propagating target perturbation into cellular response. Evaluated for feedback and compensatory bypass.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Cellular" || e.evidence_type === "Mechanistic") || [],
        };
      case "biomarker":
        return {
          title: node.label,
          type: "Proximal / Distal Biomarker",
          description: `Surrogate molecular markers measuring functional pathway engagement. Crucial for verifying in-vivo target modulation.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Cellular" || e.evidence_type === "Animal") || [],
        };
      case "phenotype":
        return {
          title: node.label,
          type: "Cellular & Tissue Phenotype",
          description: `Reversal of pathological tissue alteration (e.g. mucosal healing, apoptosis arrest, joint erosion inhibition).`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Animal" || e.evidence_type === "Clinical trial") || [],
        };
      case "drug":
        return {
          title: node.label,
          type: "Pharmacological Modality",
          description: `Intervention modality (${parsed?.drug || "Candidate"}). Assessed for potency, free-fraction tissue partitioning, and selectivity.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Pharmacology" || e.evidence_type === "PK/PD") || [],
        };
      case "clinical":
        return {
          title: node.label,
          type: "Clinical Efficacy & Safety",
          description: `Patient-level outcomes, endpoints (e.g. DAS28, disease-free survival, mucosal remission), and adverse event incidence.`,
          supportingClaims: evaluation?.evidenceMatrix?.filter(e => e.evidence_type === "Clinical trial") || [],
        };
      default:
        return {
          title: node.label,
          type: "Biological Component",
          description: "Biological node in the causal intervention graph.",
          supportingClaims: [],
        };
    }
  };

  const selectedDetails = selectedNode ? getNodeDetails(selectedNode) : null;

  return (
    <div className="evidence-graph-card">
      <div className="graph-header">
        <div>
          <h3 className="graph-title">
            <span className="graph-icon" aria-hidden="true">🕸️</span>
            Causal Evidence Flow Graph
          </h3>
          <p className="graph-subtitle">
            Interactive representation of proposed mechanism from disease and drug intervention to clinical outcome. Click any node to inspect evidence edges.
          </p>
        </div>
        <div className="graph-legend">
          <span className="legend-item"><span className="legend-dot dot-support" /> Supporting Evidence</span>
          <span className="legend-item"><span className="legend-dot dot-contradict" /> Contradictory Evidence</span>
        </div>
      </div>

      {/* Visual node flow chain */}
      <div className="graph-flow-container">
        <div className="graph-nodes-row">
          {nodes.map((node, index) => {
            const isSelected = selectedNode?.id === node.id;
            return (
              <React.Fragment key={node.id}>
                <button
                  type="button"
                  className={`graph-node-btn ${isSelected ? "selected" : ""} node-type-${node.type}`}
                  onClick={() => handleNodeClick(node)}
                  title={`Click to inspect ${node.label}`}
                >
                  <span className="node-category">{node.type.toUpperCase()}</span>
                  <span className="node-label">{node.label}</span>
                  <span className="node-action-hint">Inspect ▾</span>
                </button>
                {index < nodes.length - 1 && (
                  <div className="graph-edge-connector" aria-hidden="true">
                    <span className="edge-arrow">➔</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Edge Summary Bar */}
        <div className="graph-edges-summary">
          <div className="edge-summary-title">Causal Transition Validations:</div>
          <div className="edge-pills-row">
            {edges.map((edge, i) => (
              <div key={i} className="edge-pill">
                <span className="edge-pill-label">{edge.label || `${edge.from} → ${edge.to}`}:</span>
                <span className="badge-support">+{edge.supporting} support</span>
                <span className="badge-contradict">-{edge.contradictory} conflict</span>
                <span className="badge-confidence">{edge.confidence}% conf</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Node Inspector Drawer */}
      {selectedDetails && (
        <div className="node-inspector-drawer">
          <div className="inspector-header">
            <div>
              <span className="inspector-badge">{selectedDetails.type}</span>
              <h4 className="inspector-title">{selectedDetails.title}</h4>
            </div>
            <button
              type="button"
              className="btn-close-inspector"
              onClick={() => setSelectedNode(null)}
              aria-label="Close inspector"
            >
              ✕
            </button>
          </div>
          <p className="inspector-desc">{selectedDetails.description}</p>

          {selectedDetails.supportingClaims.length > 0 ? (
            <div className="inspector-claims">
              <span className="inspector-claims-title">Associated Evidence Claims ({selectedDetails.supportingClaims.length}):</span>
              <ul className="inspector-claims-list">
                {selectedDetails.supportingClaims.map((claim, idx) => (
                  <li key={idx} className={`claim-item direction-${claim.direction.toLowerCase()}`}>
                    <span className={`claim-direction-badge ${claim.direction.toLowerCase()}`}>
                      {claim.direction}
                    </span>
                    <span className="claim-text">{claim.claim}</span>
                    <span className="claim-source">[{claim.source}]</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="inspector-no-claims">No direct isolated evidence matrix entries mapped specifically to this single node.</p>
          )}
        </div>
      )}
    </div>
  );
}
