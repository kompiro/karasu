import type { DomainEdgeDetail } from "@karasu-tools/core";

interface EdgeDetailPanelProps {
  domainEdges: DomainEdgeDetail[];
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

export function EdgeDetailPanel({ domainEdges, anchorX, anchorY, onClose }: EdgeDetailPanelProps) {
  return (
    <div
      className="node-detail-panel"
      style={{
        position: "absolute",
        left: anchorX,
        top: anchorY,
        maxWidth: 360,
        maxHeight: 400,
        zIndex: 100,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="node-detail-header">
        <span className="node-detail-icon">↔</span>
        <span className="node-detail-label">{domainEdges.length} domain edges</span>
        <button className="node-detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="node-detail-section">
        <ul className="edge-detail-list">
          {domainEdges.map((e) => {
            const marker =
              e.diffState === "added"
                ? "+"
                : e.diffState === "removed"
                  ? "-"
                  : e.diffState
                    ? " "
                    : null;
            const stateClass = e.diffState ? `edge-detail-item--${e.diffState}` : "";
            return (
              <li
                key={`${e.fromDomainId}->${e.toDomainId}#${e.label ?? ""}`}
                className={`edge-detail-item ${stateClass}`.trim()}
              >
                {marker !== null && (
                  <span className="edge-detail-marker" aria-hidden="true">
                    {marker}
                  </span>
                )}
                <span className="edge-detail-route">
                  {e.fromDomainLabel} → {e.toDomainLabel}
                </span>
                {e.label && <span className="edge-detail-label-text">"{e.label}"</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
