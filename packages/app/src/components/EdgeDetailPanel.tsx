import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { isSafeLinkUrl } from "@karasu-tools/core";
import type { DomainEdgeDetail } from "@karasu-tools/core";
import { useTranslation } from "../i18n/index.js";

/**
 * One authored edge, as read back from the SVG's `data-edge-*` attributes.
 * The aggregated `"N domain edges"` stub keeps its own shape (`DomainEdgeDetail[]`)
 * The two are different things the same panel presents (#2543).
 */
export interface SingleEdgeDetail {
  from: string;
  to: string;
  kind: "sync" | "async";
  label?: string;
  description?: string;
  links: { url: string; label?: string }[];
}

type EdgeDetailPanelProps = {
  anchorX: number;
  anchorY: number;
  onClose: () => void;
} & (
  | { domainEdges: DomainEdgeDetail[]; edge?: never }
  | { edge: SingleEdgeDetail; domainEdges?: never }
);

export function EdgeDetailPanel(props: EdgeDetailPanelProps) {
  const { anchorX, anchorY, onClose } = props;
  const { t } = useTranslation();
  const descriptionHtml = useMemo(() => {
    const description = props.edge?.description;
    if (!description) return "";
    const raw = marked.parse(description, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [props.edge?.description]);

  return (
    <div
      className="node-detail-panel"
      // See NodeDetailPanel: opt out of the diagram's native wheel-zoom listener
      // so the panel scrolls instead of zooming the diagram (#1537).
      data-wheel-zoom-ignore
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
    >
      {props.domainEdges ? (
        <>
          <div className="node-detail-header">
            <span className="node-detail-icon">↔</span>
            {/* The stub edge's own SVG label is authored in core
                (`view-extract.ts`), which must not import the translation table,
                so it stays English until a label is injected the way
                `emptyStateLabels` is (docs/spec/i18n.md § core). The panel is on
                the app side of that line and is translated. */}
            <span className="node-detail-label">
              {t("edgeDetail.domainEdges.count", { count: props.domainEdges.length })}
            </span>
            <button
              className="node-detail-close"
              onClick={onClose}
              aria-label={t("edgeDetail.close")}
            >
              ×
            </button>
          </div>
          <div className="node-detail-section">
            <ul className="edge-detail-list">
              {props.domainEdges.map((e) => {
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
        </>
      ) : (
        <>
          <div className="node-detail-header">
            <span className="node-detail-icon">{props.edge.kind === "async" ? "⇢" : "→"}</span>
            <span className="node-detail-label">
              {props.edge.from} {props.edge.kind === "async" ? "⇢" : "→"} {props.edge.to}
            </span>
            <button
              className="node-detail-close"
              onClick={onClose}
              aria-label={t("edgeDetail.close")}
            >
              ×
            </button>
          </div>

          {props.edge.label && (
            <div className="node-detail-section">
              <div className="node-detail-section-title">{t("edgeDetail.label.title")}</div>
              <div className="edge-detail-label-text">{props.edge.label}</div>
            </div>
          )}

          {descriptionHtml && (
            <div
              className="node-detail-description"
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
            />
          )}

          {props.edge.links.length > 0 && (
            <div className="node-detail-section">
              <div className="node-detail-section-title">{t("edgeDetail.links.title")}</div>
              <ul className="node-detail-links">
                {/* Same trust boundary as NodeDetailPanel: the parser keeps a
                    disallowed-scheme link in the AST and warns, so the href
                    surface is where it must be excluded (#1525). */}
                {props.edge.links
                  .filter((link) => isSafeLinkUrl(link.url))
                  .map((link) => (
                    <li key={link.url}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label || link.url} ↗
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
