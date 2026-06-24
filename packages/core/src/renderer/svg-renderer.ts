import type { EdgeDirection, ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-extract.js";
import { layout } from "./layout.js";
import type { ContainerRect, DisplayMode, LayoutNode, LayoutResult } from "./layout-types.js";
import { renderShape } from "./shapes.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";
import { badgeChildren } from "./badge.js";
import { buildLegendFooter, el, escapeXml, truncateToWidth, wrapToWidth } from "./svg-builder.js";
import { getIconDef } from "../shapes/shape-registry.js";
import {
  CHAR_WIDTH,
  ICON_LABEL_CHAR_WIDTH,
  ICON_DESC_CHAR_WIDTH,
  ICON_DESC_MAX_WIDTH,
} from "./rendering-constants.js";
import { edgeStyleKey, nodeStyleKey } from "../resolver/style-resolver.js";
import type { NodeDiffMeta } from "../diff/view-diff.js";
import { DEFAULT_EMPTY_STATE_LABELS, type EmptyStateLabels } from "./empty-state-labels.js";
import type { LegendBlock, LegendViewScope } from "../types/ast.js";
import type { LegendUsage } from "../legend/usage.js";
import type { StyleSheet } from "../types/style.js";
import { type DiagramPalette, type DiagramTheme, resolvePalette } from "./palette.js";

const GHOST_OPACITY = 0.3;

// Icon-mode text layout constants (from design doc)
const ICON_LABEL_MAX_WIDTH = 122; // px available for title text
const ICON_DESC_MAX_LINES = 3;
const ICON_DESC_LINE_HEIGHT = 14; // px

/**
 * Sanitizes a node ID for use in a CSS fragment identifier (e.g. href="#krs-view-X").
 * Replaces characters that are not alphanumeric, hyphen, or underscore with underscores.
 */
export function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export interface RenderOptions {
  /** Diff state per node id (and per edge key `from->to`) for diff-mode rendering. */
  nodeDiffState?: Map<string, string>;
  edgeDiffState?: Map<string, string>;
  /**
   * Full node diff metadata. When provided, the renderer derives the node's
   * `data-diff-state` from `meta.state` (preferred over `nodeDiffState`) and
   * decorates annotation badges with their own per-badge diff state
   * (Issue #738 / design doc D-2).
   */
  nodeDiffMeta?: Map<string, NodeDiffMeta>;
  /**
   * Diff state per container keyed by container id (deploy: `serviceId`). When
   * present, the matching `<g data-container-id>` emits `data-diff-state` so
   * CSS can highlight whole-container additions/removals (Issue #750).
   */
  containerDiffState?: Map<string, string>;
  /**
   * Localized labels for the empty-state placeholder rendered when the
   * layout has no nodes or containers. When omitted, English fallbacks
   * from `DEFAULT_EMPTY_STATE_LABELS` are used.
   */
  emptyLabels?: EmptyStateLabels;
  /**
   * Legend blocks declared in the source `.krs`. The renderer paints a
   * footer band below the diagram for every block that targets the
   * current view scope (or omits scope). Pair with `styleSheets` so
   * `ref` entries can resolve to swatch colors via the style cascade.
   */
  legends?: LegendBlock[];
  /** Resolved style sheets, used by the legend footer to color `ref` entries. */
  styleSheets?: StyleSheet[];
  /**
   * Tag/annotation/id/kind usage from the file. Lets the legend footer
   * fall back to a neutral swatch for refs that are in use on real nodes
   * but not painted by any style rule (e.g. `[human]`).
   */
  legendUsage?: LegendUsage;
  /**
   * Which view this render produces. Drives the legend's scope filter so
   * a `legend deploy "..."` block does not leak into the system view.
   */
  viewScope?: LegendViewScope;
  /**
   * Diagram theme. Drives the chrome palette (canvas background, legend
   * band, empty-state text, diff indicators, …). Defaults to `"dark"` so
   * existing output is unchanged. The matching built-in `.krs.style`
   * variant is selected by the caller (see `index.ts`).
   */
  theme?: DiagramTheme;
}

/**
 * Derives the legend render scope for a logical-view slice (Issue #1513).
 *
 * - The root view (`slice.systems` populated — the system list) is scope
 *   `system`.
 * - Drill-down levels take the scope named after their root node's kind:
 *   `service` / `domain`.
 * - Other drill roots (a system frame, a usecase, …) have no scope keyword
 *   in the legend vocabulary — `undefined` suppresses the footer there.
 */
export function legendScopeForLogicalSlice(slice: ViewSlice): LegendViewScope | undefined {
  if (slice.systems.length > 0) return "system";
  const kind = slice.containerNode?.kind;
  if (kind === "service") return "service";
  if (kind === "domain") return "domain";
  return undefined;
}

export function render(
  viewSlice: ViewSlice,
  styles: ResolvedStyles,
  serviceIdsWithDeploy?: Set<string>,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  options?: RenderOptions,
): string {
  const edgeDirections = new Map<string, EdgeDirection>();
  for (const [key, edgeStyle] of styles.edges) {
    if (edgeStyle.direction !== "auto") edgeDirections.set(key, edgeStyle.direction);
  }
  const layoutResult = layout(
    viewSlice,
    ownerIndex,
    displayMode,
    styles.layoutHints,
    edgeDirections,
  );
  const title =
    layoutResult.containers.length === 0 && viewSlice.containerNode
      ? (viewSlice.containerNode.label ?? viewSlice.containerNode.id)
      : undefined;
  return renderFromLayout(
    layoutResult,
    styles,
    title,
    serviceIdsWithDeploy,
    displayMode,
    childLevelLinks,
    options,
  );
}

export function renderFromLayout(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  title?: string,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  options?: RenderOptions,
): string {
  const palette = resolvePalette(options?.theme);
  if (layoutResult.nodes.size === 0 && layoutResult.containers.length === 0) {
    return el(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: "100%",
        height: "100%",
        viewBox: "0 0 200 100",
      },
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: palette.emptyStateText,
          "font-family": "sans-serif",
        },
        escapeXml(options?.emptyLabels?.systemNoNodes ?? DEFAULT_EMPTY_STATE_LABELS.systemNoNodes),
      ),
    );
  }

  const padding = 40;
  const width = layoutResult.width + padding;
  const height = layoutResult.height + padding;

  const parts: string[] = [];

  // Defs: arrow markers
  const defParts: string[] = [];
  const defaultEdgeColor = styles.defaultEdgeStyle.color;
  defParts.push(renderArrowMarker("arrow-default", defaultEdgeColor));

  const edgeColors = new Set<string>();
  for (const [, style] of styles.edges) {
    edgeColors.add(style.color);
  }
  let markerIdx = 0;
  const colorToMarkerId = new Map<string, string>();
  colorToMarkerId.set(defaultEdgeColor, "arrow-default");
  for (const color of edgeColors) {
    if (!colorToMarkerId.has(color)) {
      const id = `arrow-${markerIdx++}`;
      defParts.push(renderArrowMarker(id, color));
      colorToMarkerId.set(color, id);
    }
  }
  parts.push(el("defs", {}, ...defParts));

  // Background
  parts.push(el("rect", { width, height, fill: palette.canvasBg, rx: 0 }));

  // Title label (when no containers — e.g., system-level view)
  if (title) {
    parts.push(
      el(
        "text",
        {
          x: padding / 2,
          y: padding / 2 + 4,
          fill: palette.textMuted,
          "font-size": "14px",
          "font-family": "sans-serif",
          "font-weight": "bold",
        },
        escapeXml(title),
      ),
    );
  }

  // Ghost ancestor containers (outermost first)
  for (const container of layoutResult.containers) {
    if (container.ghost) {
      const containerStyle = styles.nodes.get(container.id) ?? styles.defaultNodeStyle;
      parts.push(renderContainer(container, containerStyle, true));
    }
  }

  // Focused container
  for (const container of layoutResult.containers) {
    if (!container.ghost) {
      const containerStyle = styles.nodes.get(container.id) ?? styles.defaultNodeStyle;
      const diffState = options?.containerDiffState?.get(container.id);
      parts.push(renderContainer(container, containerStyle, false, diffState));
    }
  }

  // Ghost edges — ghost wrapper dims children to GHOST_OPACITY so they read
  // as peripheral. When diff mode is active and a ghost edge has a non-
  // "unchanged" state, move it to the normal-edges group so the diff colors
  // are not washed out by the wrapper opacity.
  const ghostEdgeParts: string[] = [];
  const normalEdgeParts: string[] = [];
  for (const edgeLayout of layoutResult.edges) {
    const edgeKey = `${edgeLayout.from}->${edgeLayout.to}`;
    // Prefer the kind-qualified style entry so parallel sync/async edges between
    // the same pair keep their own stroke style; fall back to the bare key for
    // synthetic layout edges (delivers, owns, ghosts, aggregated domain edges).
    const edgeStyle =
      styles.edges.get(edgeStyleKey(edgeLayout.from, edgeLayout.to, edgeLayout.kind)) ??
      styles.edges.get(edgeKey) ??
      styles.defaultEdgeStyle;
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    const diffState = options?.edgeDiffState?.get(edgeKey);
    const rendered = renderEdge(edgeLayout, edgeStyle, markerId, diffState);
    const isDimmedGhost =
      edgeLayout.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostEdgeParts.push(rendered);
    } else {
      normalEdgeParts.push(rendered);
    }
  }
  if (ghostEdgeParts.length > 0) {
    parts.push(el("g", { class: "ghost-edges", opacity: GHOST_OPACITY }, ...ghostEdgeParts));
  }
  parts.push(el("g", { class: "edges" }, ...normalEdgeParts));

  // Nodes (ghost users first, then normal children). As with edges, a ghost
  // node that is diff-tagged (added / removed / changed) gets promoted to the
  // normal group so the diff colors are not flattened by the wrapper opacity.
  const ghostNodeParts: string[] = [];
  const normalNodeParts: string[] = [];
  // The deploy layout encodes per-container instances as `containerId::unitId`
  // (the map `nodeId`), but both resolved styles and diff metadata are keyed by
  // the bare unit id — `layoutNode.id`, the original AST id (Issue #735 / #1666).
  // So the lookups below fall back to `layoutNode.id`, which lets deploy units
  // pick up their resolved style — notably the Icon Mode `shape: url(...)`,
  // without which they hit `defaultNodeStyle` and never render an icon. For
  // system-view nodes `layoutNode.id === nodeId`, so the fallback is a no-op.
  for (const [nodeId, layoutNode] of layoutResult.nodes) {
    const styleKey = nodeStyleKey(nodeId, layoutNode.annotations);
    const nodeStyle =
      styles.nodes.get(styleKey) ??
      styles.nodes.get(nodeId) ??
      styles.nodes.get(layoutNode.id) ??
      styles.defaultNodeStyle;
    const diffMeta =
      options?.nodeDiffMeta?.get(layoutNode.id) ?? options?.nodeDiffMeta?.get(nodeId);
    const diffState =
      diffMeta?.state ??
      options?.nodeDiffState?.get(layoutNode.id) ??
      options?.nodeDiffState?.get(nodeId);
    const rendered = renderNode(
      layoutNode,
      nodeStyle,
      nodeId,
      palette,
      serviceIdsWithDeploy,
      displayMode,
      childLevelLinks,
      diffState,
      diffMeta,
    );
    const isDimmedGhost =
      layoutNode.ghost && (diffState === undefined || diffState === "unchanged");
    if (isDimmedGhost) {
      ghostNodeParts.push(rendered);
    } else {
      normalNodeParts.push(rendered);
    }
  }
  if (ghostNodeParts.length > 0) {
    parts.push(el("g", { class: "ghost-nodes", opacity: GHOST_OPACITY }, ...ghostNodeParts));
  }
  parts.push(el("g", { class: "nodes" }, ...normalNodeParts));

  // Legend footer (Issue #887) — rendered as a band below the diagram so
  // it survives panning and is preserved by single-file SVG exports.
  // The footer's height extends the outer viewBox; positioning is handled
  // via a translate at y=height of the diagram body.
  let totalHeight = height;
  if (options?.legends && options?.legends.length > 0 && options?.viewScope) {
    const footer = buildLegendFooter(
      options.legends,
      options.viewScope,
      options.styleSheets ?? [],
      width,
      palette,
      options.legendUsage,
    );
    if (footer) {
      parts.push(el("g", { transform: `translate(0,${height})` }, footer.svg));
      totalHeight = height + footer.height;
    }
  }

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} ${totalHeight}`,
      width,
      height: totalHeight,
    },
    ...parts,
  );
}

function renderContainer(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  ghost: boolean,
  diffState?: string,
): string {
  const children: string[] = [];
  children.push(
    el("rect", {
      x: container.x,
      y: container.y,
      width: container.width,
      height: container.height,
      fill: "transparent",
      stroke: style.borderColor,
      "stroke-width": style.borderWidth,
      "stroke-dasharray": ghost ? "8 4" : undefined,
      rx: style.borderRadius,
    }),
  );
  children.push(
    el(
      "text",
      {
        x: container.x + 12,
        y: container.y + 18,
        fill: style.color,
        "font-size": "12px",
        "font-family": style.fontFamily,
        "font-weight": "bold",
        opacity: 0.7,
      },
      escapeXml(container.label),
    ),
  );

  return el(
    "g",
    {
      "data-container-id": container.id,
      "data-kind-band": container.kindBand,
      "data-diff-state": diffState,
      opacity: ghost ? GHOST_OPACITY : undefined,
    },
    ...children,
  );
}

function renderNode(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  palette: DiagramPalette,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
  diffState?: string,
  diffMeta?: NodeDiffMeta,
): string {
  const children: string[] = [];

  // For icon-mode nodes, render card frame (background + border) before the icon body.
  // Built-in shapes already include fill/stroke in their own rendering.
  const isIconShape = typeof style.shape !== "string";
  if (displayMode === "icon" && isIconShape) {
    children.push(
      el("rect", {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rx: style.borderRadius,
        ry: style.borderRadius,
        fill: style.backgroundColor,
        stroke: style.borderColor,
        "stroke-width": style.borderWidth,
        "stroke-dasharray":
          style.borderStyle === "dashed"
            ? "8 4"
            : style.borderStyle === "dotted"
              ? "2 2"
              : undefined,
      }),
    );
  }

  // Shape
  children.push(renderShape(node.x, node.y, node.width, node.height, style));

  // Resolve text positions
  const shapeName = typeof style.shape === "string" ? style.shape : style.shape.url;
  const iconDef = getIconDef(shapeName);

  const textColor = style.color;
  const fontSize = style.fontSize;
  const displayDesc = node.descriptionSummary ?? node.properties.description;
  const hasMetaRow = node.linkCount > 0 || !!node.properties.team;

  if (iconDef?.labelSlot) {
    const vw = iconDef.viewBoxWidth ?? 24;
    const vh = iconDef.viewBoxHeight ?? 24;
    const scaleX = node.width / vw;
    const scaleY = node.height / vh;

    const labelX = node.x + iconDef.labelSlot.x * scaleX;
    const labelY = node.y + iconDef.labelSlot.y * scaleY;
    const labelAnchor = iconDef.labelSlot.textAnchor ?? "middle";

    // Icon-mode label truncation
    const iconMode = displayMode === "icon";
    const truncatedLabel = iconMode
      ? truncateToWidth(node.label, ICON_LABEL_MAX_WIDTH, ICON_LABEL_CHAR_WIDTH)
      : node.label;
    const labelFontSize = iconMode ? 13 : fontSize;

    children.push(
      el(
        "text",
        {
          x: labelX,
          y: labelY,
          "text-anchor": labelAnchor,
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${labelFontSize}px`,
          "font-weight": style.fontWeight,
          "font-family": style.fontFamily,
        },
        escapeXml(truncatedLabel),
      ),
    );

    if (displayDesc && iconDef.descriptionSlot) {
      const descX = node.x + iconDef.descriptionSlot.x * scaleX;
      const descY = node.y + iconDef.descriptionSlot.y * scaleY;
      const descAnchor = iconDef.descriptionSlot.textAnchor ?? "middle";
      const descFontSize = iconMode ? 11 : Math.round(fontSize * 0.8);

      if (iconMode) {
        // Multi-line description: wrap text into up to 3 lines with tspan elements
        const lines = wrapToWidth(
          displayDesc,
          ICON_DESC_MAX_WIDTH,
          ICON_DESC_CHAR_WIDTH,
          ICON_DESC_MAX_LINES,
        );
        const tspans = lines.map((line, i) =>
          el(
            "tspan",
            {
              x: descX,
              dy: i === 0 ? "0" : `${ICON_DESC_LINE_HEIGHT}`,
            },
            escapeXml(line),
          ),
        );
        children.push(
          el(
            "text",
            {
              x: descX,
              y: descY,
              "text-anchor": descAnchor,
              "dominant-baseline": "hanging",
              fill: textColor,
              "font-size": `${descFontSize}px`,
              "font-family": style.fontFamily,
              opacity: 0.7,
            },
            ...tspans,
          ),
        );
      } else {
        children.push(
          el(
            "text",
            {
              x: descX,
              y: descY,
              "text-anchor": descAnchor,
              "dominant-baseline": "central",
              fill: textColor,
              "font-size": `${descFontSize}px`,
              "font-family": style.fontFamily,
              opacity: 0.7,
            },
            escapeXml(displayDesc),
          ),
        );
      }
    }
  } else {
    const textX = node.x + node.width / 2;
    const textLines =
      1 + (displayDesc ? 1 : 0) + (node.properties.role ? 1 : 0) + (hasMetaRow ? 1 : 0);
    let textY = node.y + node.height / 2;
    if (textLines > 1) textY -= ((textLines - 1) * (fontSize + 4)) / 2;

    children.push(
      el(
        "text",
        {
          x: textX,
          y: textY,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${fontSize}px`,
          "font-weight": style.fontWeight,
          "font-family": style.fontFamily,
        },
        escapeXml(node.label),
      ),
    );

    let nextY = textY + fontSize + 4;

    if (displayDesc) {
      // Truncate description to fit within the node width
      const descFontSize = Math.round(fontSize * 0.8);
      const availableWidth = node.width - 40 * 2; // NODE_PADDING_X = 40
      const descCharWidth = CHAR_WIDTH * 0.8; // DESCRIPTION_FONT_RATIO
      const maxChars = Math.max(1, Math.floor(availableWidth / descCharWidth));
      const descChars = [...displayDesc];
      const truncatedDesc =
        descChars.length > maxChars ? descChars.slice(0, maxChars).join("") + "…" : displayDesc;
      children.push(
        el(
          "text",
          {
            x: textX,
            y: nextY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${descFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          escapeXml(truncatedDesc),
        ),
      );
      nextY += fontSize + 4;
    }

    if (node.properties.role) {
      children.push(
        el(
          "text",
          {
            x: textX,
            y: nextY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${Math.round(fontSize * 0.75)}px`,
            "font-family": style.fontFamily,
            "font-style": "italic",
            opacity: 0.6,
          },
          escapeXml(node.properties.role),
        ),
      );
      nextY += fontSize + 4;
    }

    // Resource badge (client only). Replaces the per-resource text loop with
    // a single "📦 ×N" badge so the card height does not grow with resource
    // count. The full list is surfaced in NodeDetailPanel (Issue #914).
    if (node.properties.resources && node.properties.resources.length > 0) {
      const resCount = node.properties.resources.length;
      const resFontSize = Math.round(fontSize * 0.7);
      const tooltip = node.properties.resources
        .map((r) => `${r.storageKind} "${r.name}"`)
        .join(", ");
      children.push(
        el(
          "text",
          {
            x: textX,
            y: nextY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${resFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.8,
            "data-client-resource-count": String(resCount),
          },
          el("title", {}, escapeXml(tooltip)) + escapeXml(`📦 ×${resCount}`),
        ),
      );
      nextY += fontSize + 4;
    }

    // Capability badge (client only). Mirrors the resource badge: a single
    // "🔐 ×N" so the card height stays bounded regardless of how many
    // capabilities the client declares. Full list (including label /
    // description) is surfaced in NodeDetailPanel.
    if (node.properties.capabilities && node.properties.capabilities.length > 0) {
      const capCount = node.properties.capabilities.length;
      const capFontSize = Math.round(fontSize * 0.7);
      const tooltip = node.properties.capabilities.map((c) => c.name).join(", ");
      children.push(
        el(
          "text",
          {
            x: textX,
            y: nextY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${capFontSize}px`,
            "font-family": style.fontFamily,
            opacity: 0.8,
            "data-client-capability-count": String(capCount),
          },
          el("title", {}, escapeXml(tooltip)) + escapeXml(`🔐 ×${capCount}`),
        ),
      );
      nextY += fontSize + 4;
    }

    // Meta row: link count + team
    if (hasMetaRow) {
      const metaFontSize = `${Math.round(fontSize * 0.7)}px`;
      const metaAttrs = {
        "text-anchor": "middle" as const,
        "dominant-baseline": "central" as const,
        fill: palette.textSubtle,
        "font-size": metaFontSize,
        "font-family": style.fontFamily,
      };

      if (node.linkCount > 0 && node.properties.team) {
        // Both link count and team: render link on the left, team on the right
        const linkText = `🔗${node.linkCount}`;
        const teamChars = [...node.properties.team];
        const teamDisplay =
          teamChars.length > 15 ? teamChars.slice(0, 15).join("") + "…" : node.properties.team;
        const teamText = `👥${teamDisplay}`;
        const contentLeft = node.x + 40;
        const contentRight = node.x + node.width - 40;
        children.push(
          el(
            "g",
            { "data-link-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
            el(
              "text",
              { ...metaAttrs, "text-anchor": "start", x: contentLeft, y: nextY },
              escapeXml(linkText),
            ),
          ),
        );
        children.push(
          el(
            "g",
            {
              "data-team-button": node.properties.team,
              style: "cursor: pointer",
              "pointer-events": "all",
            },
            el(
              "text",
              { ...metaAttrs, "text-anchor": "end", x: contentRight, y: nextY },
              escapeXml(teamText),
            ),
          ),
        );
      } else if (node.linkCount > 0) {
        children.push(
          el(
            "g",
            { "data-link-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
            el("text", { ...metaAttrs, x: textX, y: nextY }, escapeXml(`🔗${node.linkCount}`)),
          ),
        );
      } else if (node.properties.team) {
        const teamChars = [...node.properties.team];
        const teamDisplay =
          teamChars.length > 15 ? teamChars.slice(0, 15).join("") + "…" : node.properties.team;
        children.push(
          el(
            "g",
            {
              "data-team-button": node.properties.team,
              style: "cursor: pointer",
              "pointer-events": "all",
            },
            el("text", { ...metaAttrs, x: textX, y: nextY }, escapeXml(`👥${teamDisplay}`)),
          ),
        );
      }
    }
  }

  // Badge (single merged badge driven by the node's current annotations).
  // When diff metadata reports an annotation-only change, the badge is
  // wrapped in `<g data-node-badge data-diff-state="added|removed|unchanged">`
  // so UI can highlight badge churn without painting the whole node amber
  // (Issue #738 / design doc D-2). If the node's badge disappeared because
  // the last annotation was removed, we still emit a ghost badge so the
  // viewer can see *what* was removed.
  const annotationsAdded = diffMeta?.changes?.annotations?.added ?? [];
  const annotationsRemoved = diffMeta?.changes?.annotations?.removed ?? [];
  const hasAnnotationDiff = annotationsAdded.length > 0 || annotationsRemoved.length > 0;

  const badgeX = node.x + node.width - 10;
  const badgeY = node.y - 6;
  const hasCurrentBadge = !!(style.badgeIcon || style.badgeLabel);

  if (hasCurrentBadge) {
    const badgeParts = badgeChildren(style, badgeX, badgeY, palette.badgeFallback);
    // Classify badge diff state. With a single merged badge, direction is:
    //   added.length > 0 → "added" (new annotation produced the current badge)
    //   removed.length > 0 (and none added) → "changed" (swap/rewrite)
    //   no diff or diff doesn't touch annotations → undefined (no attr)
    let badgeDiffState: string | undefined;
    if (annotationsAdded.length > 0) badgeDiffState = "added";
    else if (annotationsRemoved.length > 0) badgeDiffState = "changed";
    children.push(
      el("g", { "data-node-badge": nodeId, "data-diff-state": badgeDiffState }, ...badgeParts),
    );
  } else if (annotationsRemoved.length > 0) {
    // Ghost "removed" badge — all annotations were removed, so there is no
    // current style badge. Render a neutral placeholder with a strike so the
    // user still sees *something was removed*.
    const ghostColor = palette.textSubtle;
    children.push(
      el(
        "g",
        { "data-node-badge": nodeId, "data-diff-state": "removed" },
        el("circle", {
          cx: badgeX,
          cy: badgeY,
          r: 10,
          fill: "transparent",
          stroke: ghostColor,
          "stroke-width": 1.5,
          "stroke-dasharray": "3 2",
        }),
        el(
          "text",
          {
            x: badgeX,
            y: badgeY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: ghostColor,
            "font-size": "10px",
          },
          "−",
        ),
      ),
    );
  }
  // Record annotation delta as data-attrs on the node group below so CSS / UI
  // can query the full before/after sets (badge diff is only a hint).
  const annotationAddedAttr =
    hasAnnotationDiff && annotationsAdded.length > 0 ? annotationsAdded.join(",") : undefined;
  const annotationRemovedAttr =
    hasAnnotationDiff && annotationsRemoved.length > 0 ? annotationsRemoved.join(",") : undefined;

  // Sub-label: shown below the node for ghost domains to indicate the parent service
  if (node.subLabel) {
    const subLabelFontSize = Math.round(fontSize * 0.75);
    children.push(
      el(
        "text",
        {
          x: node.x + node.width / 2,
          y: node.y + node.height + subLabelFontSize + 4,
          "text-anchor": "middle",
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${subLabelFontSize}px`,
          "font-family": style.fontFamily,
        },
        escapeXml(`(${node.subLabel})`),
      ),
    );
  }

  // Top-right icon buttons: deploy button and info button
  // Buttons are 16px diameter (r=8), spaced 20px apart from right edge
  const isServiceOrDomain = node.kind === "service" || node.kind === "domain";
  const showDeployButton = isServiceOrDomain && (serviceIdsWithDeploy?.has(nodeId) ?? false);
  // Show info button when the node has any metadata worth displaying in the detail panel.
  // Container nodes (hasChildren) need the button because clicking the body drills down.
  // Leaf nodes also get the button for discoverability, even though clicking the body also opens the panel.
  const showInfoButton =
    node.hasDescription || node.linkCount > 0 || !!node.properties.team || !!node.properties.role;
  const btnY = node.y + 14;
  let btnSlot = 0; // 0 = rightmost, increments leftward

  if (showInfoButton) {
    const btnX = node.x + node.width - 16 - btnSlot * 20;
    btnSlot++;
    children.push(
      el(
        "g",
        { "data-info-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
        el("circle", {
          cx: btnX,
          cy: btnY,
          r: 8,
          fill: "transparent",
          stroke: palette.textMuted,
          "stroke-width": 1,
        }),
        el(
          "text",
          {
            x: btnX,
            y: btnY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: palette.textMuted,
            "font-size": "10px",
            "font-family": "sans-serif",
            "font-style": "italic",
          },
          "i",
        ),
      ),
    );
  }

  if (showDeployButton) {
    const btnX = node.x + node.width - 16 - btnSlot * 20;
    children.push(
      el(
        "g",
        { "data-deploy-button": nodeId, style: "cursor: pointer", "pointer-events": "all" },
        el("circle", {
          cx: btnX,
          cy: btnY,
          r: 8,
          fill: "transparent",
          stroke: palette.accent,
          "stroke-width": 1,
        }),
        el(
          "text",
          {
            x: btnX,
            y: btnY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: palette.accent,
            "font-size": "9px",
            "font-family": "sans-serif",
            "font-weight": "bold",
          },
          "D",
        ),
      ),
    );
  }

  const nodeEl = el(
    "g",
    {
      "data-node-id": nodeId,
      "data-node-kind": node.kind,
      "data-has-children": node.hasChildren ? "true" : "false",
      "data-has-description": node.hasDescription ? "true" : "false",
      "data-link-count": node.linkCount > 0 ? String(node.linkCount) : undefined,
      "data-diff-state": diffState,
      "data-annotation-added": annotationAddedAttr,
      "data-annotation-removed": annotationRemovedAttr,
      style: node.hasChildren ? "cursor: pointer" : undefined,
      opacity: style.opacity < 1 ? style.opacity : undefined,
    },
    ...children,
  );

  const childLevelId = childLevelLinks?.get(nodeId);
  if (childLevelId) {
    return el("a", { href: `#${childLevelId}` }, nodeEl);
  }
  return nodeEl;
}

// ---------------------------------------------------------------------------
// Icon-mode text helpers
// ---------------------------------------------------------------------------
