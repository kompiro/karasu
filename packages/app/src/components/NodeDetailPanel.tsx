import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { NodeMetadata } from "@karasu/core";

interface NodeDetailPanelProps {
  nodeId: string;
  metadata: NodeMetadata;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  /** Called when user navigates to deploy view from this panel */
  onNavigateToDeploy?: (serviceId: string) => void;
  /** Called when user navigates to org view from this panel */
  onNavigateToOrg?: (teamId: string) => void;
}

const KIND_ICONS: Record<string, string> = {
  system: "🏗",
  service: "⚙",
  domain: "📦",
  usecase: "📋",
  resource: "💾",
  user: "👤",
  oci: "🐳",
  lambda: "λ",
  jar: "☕",
  war: "📦",
  function: "ƒ",
  assets: "📁",
  job: "⏱",
  artifact: "🗄",
};

export function NodeDetailPanel({
  nodeId,
  metadata,
  anchorX,
  anchorY,
  onClose,
  onNavigateToDeploy,
  onNavigateToOrg,
}: NodeDetailPanelProps) {
  const descriptionHtml = useMemo(() => {
    if (!metadata.description) return "";
    const raw = marked.parse(metadata.description, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [metadata.description]);

  const icon = KIND_ICONS[metadata.kind] ?? "■";

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
        <span className="node-detail-icon">{icon}</span>
        <span className="node-detail-label">{metadata.label}</span>
        <button className="node-detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {descriptionHtml && (
        <div
          className="node-detail-description"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      {metadata.links.length > 0 && (
        <div className="node-detail-section">
          <div className="node-detail-section-title">🔗 リンク</div>
          <ul className="node-detail-links">
            {metadata.links.map((link) => (
              <li key={link.url}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label || link.url} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(metadata.runtime || metadata.realizes) && (
        <div className="node-detail-section">
          {metadata.runtime && (
            <div className="node-detail-prop">🖥 runtime: {metadata.runtime}</div>
          )}
          {metadata.realizes && (
            <div className="node-detail-prop">🔗 realizes: {metadata.realizes}</div>
          )}
        </div>
      )}

      {(metadata.team || metadata.role || metadata.tags.length > 0) && (
        <div className="node-detail-section">
          {metadata.team && (
            onNavigateToOrg ? (
              <button
                className="node-detail-nav-btn"
                onClick={() => { onNavigateToOrg(metadata.team!); onClose(); }}
              >
                👥 {metadata.team} →
              </button>
            ) : (
              <div className="node-detail-prop">👥 {metadata.team}</div>
            )
          )}
          {metadata.role && <div className="node-detail-prop">📌 {metadata.role}</div>}
          {metadata.tags.length > 0 && (
            <div className="node-detail-prop">🏷 {metadata.tags.map((t) => `[${t}]`).join(" ")}</div>
          )}
        </div>
      )}

      {metadata.hasDeployContainer && onNavigateToDeploy && (
        <div className="node-detail-section">
          <button
            className="node-detail-nav-btn"
            onClick={() => { onNavigateToDeploy(nodeId); onClose(); }}
          >
            🚀 Deploy 図で確認 →
          </button>
        </div>
      )}
    </div>
  );
}
