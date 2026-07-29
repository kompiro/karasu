import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  renderPictogram,
  isSafeLinkUrl,
  NODE_DETAIL_PROPERTY_FIELDS,
  NODE_DETAIL_ROLE_EMOJI,
  NODE_DETAIL_TAGS_EMOJI,
  NODE_DETAIL_TEAM_EMOJI,
  NODE_DETAIL_KIND_ICON_NAMES,
} from "@karasu-tools/core";
import type { NodeMetadata } from "@karasu-tools/core";
import { useTranslation } from "../i18n/index.js";

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
  /** Called when user clicks "Jump to editor" to navigate Monaco Editor to this node's source line */
  onJumpToEditor?: () => void;
  /**
   * When rendering inside the diff viewer, the added/removed annotation
   * sets for this node. Surfaced as `+ @deprecated` / `- @experimental`
   * lines so viewers can read annotation churn at a glance
   * (Issue #738 / design doc D-2).
   */
  annotationDiff?: { added: string[]; removed: string[] };
}

// Maps node kind to the registered icon name (mirrors ICON_THEME_STYLE_SOURCE
// from @karasu-tools/core's icon-theme builtins). Sourced from
// @karasu-tools/core's NODE_DETAIL_KIND_ICON_NAMES (Issue #2068) so the VS
// Code webview panel (webview-content.ts) consumes the identical kind→icon
// identity instead of maintaining its own, drift-prone copy — it then maps
// each icon name to an emoji glyph instead of an SVG pictogram. Re-exported
// under this name so cross-surface tests can assert this map and the
// icon-card style cascade resolve identical icons per kind — the contract
// enforced by TPL-20260510-05 / 06 item 4 and originally violated in #132 §3
// (panel pictogram diverged from icon card).
export const KIND_TO_ICON_NAME: Record<string, string> = NODE_DETAIL_KIND_ICON_NAMES;

// Fallback emoji icons for kinds without a registered SVG pictogram.
const KIND_FALLBACK_ICONS: Record<string, string> = {
  system: "🏗",
};

export function NodeDetailPanel({
  nodeId,
  metadata,
  anchorX,
  anchorY,
  onClose,
  onNavigateToDeploy,
  onNavigateToOrg,
  onJumpToEditor,
  annotationDiff,
}: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const descriptionHtml = useMemo(() => {
    if (!metadata.description) return "";
    const raw = marked.parse(metadata.description, { async: false }) as string;
    return DOMPurify.sanitize(raw);
  }, [metadata.description]);

  // Prefer SVG pictogram from the icon registry for consistency with icon cards.
  // Falls back to emoji for kinds without a registered icon (e.g. "system").
  const iconName = KIND_TO_ICON_NAME[metadata.kind];
  const pictogramSvg = iconName ? renderPictogram(iconName, "currentColor", 18) : undefined;
  const fallbackIcon = KIND_FALLBACK_ICONS[metadata.kind] ?? "■";

  return (
    <div
      className="node-detail-panel"
      // Opt this subtree out of the diagram's native wheel-zoom listener so the
      // panel's own overflow region scrolls instead of zooming the diagram. A
      // React synthetic stopPropagation can't stop a native listener on the
      // ancestor container, so the container reads this attribute instead (#1537).
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
      <div className="node-detail-header">
        {pictogramSvg ? (
          <span className="node-detail-icon" dangerouslySetInnerHTML={{ __html: pictogramSvg }} />
        ) : (
          <span className="node-detail-icon">{fallbackIcon}</span>
        )}
        <span className="node-detail-label">{metadata.label}</span>
        <button className="node-detail-close" onClick={onClose} aria-label={t("nodeDetail.close")}>
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
          <div className="node-detail-section-title">{t("nodeDetail.links.title")}</div>
          <ul className="node-detail-links">
            {/* The parser keeps disallowed-scheme links in the AST (so Format
                doesn't delete the user's source) but warns; the href-render
                surface is where they must be excluded. React does not block
                javascript: hrefs, so this scheme filter is the actual XSS
                gate, not just defense in depth (#1525). */}
            {metadata.links
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

      {metadata.resources && metadata.resources.length > 0 && (
        <div className="node-detail-section">
          <div className="node-detail-section-title">{t("nodeDetail.resources.title")}</div>
          <ul className="node-detail-resource-list">
            {metadata.resources.map((r) => (
              <li key={`${r.storageKind}-${r.name}`} className="node-detail-resource-item">
                <span className="node-detail-resource-kind">{r.storageKind}</span>
                <span className="node-detail-resource-name">{r.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {metadata.capabilities && metadata.capabilities.length > 0 && (
        <div className="node-detail-section">
          <div className="node-detail-section-title">{t("nodeDetail.capabilities.title")}</div>
          <ul className="node-detail-capability-list">
            {metadata.capabilities.map((c) => (
              <li key={c.name} className="node-detail-capability-item">
                <span className="node-detail-capability-title">{c.label ?? c.name}</span>
                {c.description && (
                  <p className="node-detail-capability-description">{c.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section is visible iff at least one property row would render.
          Derived from the shared NODE_DETAIL_PROPERTY_FIELDS spec so a new
          field extends both the guard and the rows in lockstep (Issue #2018
          point 7). The reduce reproduces the previous left-associative
          `metadata.runtime || … || metadata.realizes?.length` chain exactly
          — same value (not just truthiness) for every input, so JSX
          short-circuit rendering is byte-identical. */}
      {NODE_DETAIL_PROPERTY_FIELDS.reduce<string | number | undefined>(
        (shown, field) =>
          shown ||
          (field.metaKey === "realizes" ? metadata.realizes?.length : metadata[field.metaKey]),
        undefined,
      ) && (
        <div className="node-detail-section">
          {/* Row order/emoji/label come from the shared
              NODE_DETAIL_PROPERTY_FIELDS spec (@karasu-tools/core), also
              consumed by the VS Code webview panel — Issue #2018 point 7. */}
          {NODE_DETAIL_PROPERTY_FIELDS.map((field) => {
            if (field.metaKey === "realizes") {
              return metadata.realizes?.length ? (
                <div key={field.metaKey} className="node-detail-prop">
                  {field.emoji} {field.label}: {metadata.realizes.join(", ")}
                </div>
              ) : null;
            }
            const value = metadata[field.metaKey];
            return value ? (
              <div key={field.metaKey} className="node-detail-prop">
                {field.emoji} {field.label}: {value}
              </div>
            ) : null;
          })}
        </div>
      )}

      {annotationDiff && (annotationDiff.added.length > 0 || annotationDiff.removed.length > 0) && (
        <div className="node-detail-section node-detail-annotation-diff">
          <div className="node-detail-section-title">{t("nodeDetail.annotationDiff.title")}</div>
          <ul className="node-detail-annotation-diff-list">
            {annotationDiff.added.map((ann) => (
              <li key={`add-${ann}`} data-diff-state="added">
                <span className="node-detail-annotation-diff-marker">+</span>@{ann}
              </li>
            ))}
            {annotationDiff.removed.map((ann) => (
              <li key={`rem-${ann}`} data-diff-state="removed">
                <span className="node-detail-annotation-diff-marker">−</span>@{ann}
              </li>
            ))}
          </ul>
        </div>
      )}

      {metadata.migrationIntent &&
        (metadata.migrationIntent.until || metadata.migrationIntent.from) && (
          <div className="node-detail-section node-detail-migration">
            <div className="node-detail-section-title">{t("nodeDetail.migration.title")}</div>
            {metadata.migrationIntent.until && (
              <div
                className="node-detail-prop node-detail-migration-until"
                data-until-kind={metadata.migrationIntent.until.kind}
              >
                {t("nodeDetail.migration.until")}: <code>{metadata.migrationIntent.until.raw}</code>
              </div>
            )}
            {metadata.migrationIntent.from && (
              <div className="node-detail-prop node-detail-migration-from">
                {t("nodeDetail.migration.from")}: <code>{metadata.migrationIntent.from}</code>
              </div>
            )}
          </div>
        )}

      {(metadata.team || metadata.role || metadata.tags.length > 0) && (
        <div className="node-detail-section">
          {metadata.team &&
            (onNavigateToOrg ? (
              <button
                className="node-detail-nav-btn"
                onClick={() => {
                  onNavigateToOrg(metadata.team!);
                  onClose();
                }}
              >
                {NODE_DETAIL_TEAM_EMOJI} {metadata.teamLabel ?? metadata.team} →
              </button>
            ) : (
              <div className="node-detail-prop">
                {NODE_DETAIL_TEAM_EMOJI} {metadata.teamLabel ?? metadata.team}
              </div>
            ))}
          {metadata.role && (
            <div className="node-detail-prop">
              {NODE_DETAIL_ROLE_EMOJI} {metadata.role}
            </div>
          )}
          {metadata.tags.length > 0 && (
            <div className="node-detail-prop">
              {NODE_DETAIL_TAGS_EMOJI} {metadata.tags.map((tag) => `[${tag}]`).join(" ")}
            </div>
          )}
        </div>
      )}

      {metadata.hasDeployContainer && onNavigateToDeploy && (
        <div className="node-detail-section">
          <button
            className="node-detail-nav-btn"
            onClick={() => {
              onNavigateToDeploy(nodeId);
              onClose();
            }}
          >
            {t("nodeDetail.openDeployView")}
          </button>
        </div>
      )}

      {onJumpToEditor && (
        <div className="node-detail-section">
          <button className="node-detail-nav-btn" onClick={onJumpToEditor}>
            {t("nodeDetail.jumpToEditor")}
          </button>
        </div>
      )}
    </div>
  );
}
