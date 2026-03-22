import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { NodeMetadata } from "@karasu/core";

interface NodeDetailPanelProps {
  metadata: NodeMetadata;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
}

const KIND_ICONS: Record<string, string> = {
  system: "🏗",
  service: "⚙",
  domain: "📦",
  usecase: "📋",
  resource: "💾",
  user: "👤",
};

export function NodeDetailPanel({ metadata, anchorX, anchorY, onClose }: NodeDetailPanelProps) {
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
            {metadata.links.map((link, i) => (
              <li key={i}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label || link.url} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(metadata.team || metadata.role || metadata.tags.length > 0) && (
        <div className="node-detail-section">
          {metadata.team && <div className="node-detail-prop">👥 {metadata.team}</div>}
          {metadata.role && <div className="node-detail-prop">📌 {metadata.role}</div>}
          {metadata.tags.length > 0 && (
            <div className="node-detail-prop">🏷 {metadata.tags.map((t) => `[${t}]`).join(" ")}</div>
          )}
        </div>
      )}
    </div>
  );
}
