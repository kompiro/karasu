import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-extract.js";
import {
  layout,
  type ContainerRect,
  type DisplayMode,
  type LayoutNode,
  type LayoutResult,
} from "./layout.js";
import { renderShape } from "./shapes.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";
import { el, escapeXml, truncateToWidth, wrapToWidth } from "./svg-builder.js";
import { getIconDef } from "./shape-registry.js";

const GHOST_OPACITY = 0.3;

// Icon-mode text layout constants (from design doc)
const ICON_LABEL_MAX_WIDTH = 122; // px available for title text
const ICON_LABEL_CHAR_WIDTH = 7.5; // approximate for 13px font
const ICON_DESC_MAX_WIDTH = 144; // px available for description text
const ICON_DESC_CHAR_WIDTH = 6.5; // approximate for 11px font
const ICON_DESC_MAX_LINES = 3;
const ICON_DESC_LINE_HEIGHT = 14; // px

export function render(
  viewSlice: ViewSlice,
  styles: ResolvedStyles,
  serviceIdsWithDeploy?: Set<string>,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
): string {
  const layoutResult = layout(viewSlice, ownerIndex, displayMode);
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
  );
}

export function renderFromLayout(
  layoutResult: LayoutResult,
  styles: ResolvedStyles,
  title?: string,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
): string {
  if (layoutResult.nodes.size === 0 && layoutResult.containers.length === 0) {
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100" },
      el(
        "text",
        {
          x: 100,
          y: 50,
          "text-anchor": "middle",
          fill: "#9CA3AF",
          "font-family": "sans-serif",
        },
        "No nodes to render",
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
  parts.push(el("rect", { width, height, fill: "#0F172A", rx: 0 }));

  // Title label (when no containers — e.g., system-level view)
  if (title) {
    parts.push(
      el(
        "text",
        {
          x: padding / 2,
          y: padding / 2 + 4,
          fill: "#64748B",
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
      parts.push(renderContainer(container, containerStyle, false));
    }
  }

  // Ghost edges
  const ghostEdgeParts: string[] = [];
  const normalEdgeParts: string[] = [];
  for (const edgeLayout of layoutResult.edges) {
    const edgeKey = `${edgeLayout.from}->${edgeLayout.to}`;
    const edgeStyle = styles.edges.get(edgeKey) ?? styles.defaultEdgeStyle;
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    const rendered = renderEdge(edgeLayout, edgeStyle, markerId);
    if (edgeLayout.ghost) {
      ghostEdgeParts.push(rendered);
    } else {
      normalEdgeParts.push(rendered);
    }
  }
  if (ghostEdgeParts.length > 0) {
    parts.push(el("g", { class: "ghost-edges", opacity: GHOST_OPACITY }, ...ghostEdgeParts));
  }
  parts.push(el("g", { class: "edges" }, ...normalEdgeParts));

  // Nodes (ghost users first, then normal children)
  const ghostNodeParts: string[] = [];
  const normalNodeParts: string[] = [];
  for (const [nodeId, layoutNode] of layoutResult.nodes) {
    const nodeStyle = styles.nodes.get(nodeId) ?? styles.defaultNodeStyle;
    const rendered = renderNode(
      layoutNode,
      nodeStyle,
      nodeId,
      serviceIdsWithDeploy,
      displayMode,
      childLevelLinks,
    );
    if (layoutNode.ghost) {
      ghostNodeParts.push(rendered);
    } else {
      normalNodeParts.push(rendered);
    }
  }
  if (ghostNodeParts.length > 0) {
    parts.push(el("g", { class: "ghost-nodes", opacity: GHOST_OPACITY }, ...ghostNodeParts));
  }
  parts.push(el("g", { class: "nodes" }, ...normalNodeParts));

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
    },
    ...parts,
  );
}

function renderContainer(
  container: ContainerRect,
  style: ResolvedNodeStyle,
  ghost: boolean,
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
      opacity: ghost ? GHOST_OPACITY : undefined,
    },
    ...children,
  );
}

function renderNode(
  node: LayoutNode,
  style: ResolvedNodeStyle,
  nodeId: string,
  serviceIdsWithDeploy?: Set<string>,
  displayMode?: DisplayMode,
  childLevelLinks?: Map<string, string>,
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
      const descCharWidth = 9 * 0.8; // CHAR_WIDTH * DESCRIPTION_FONT_RATIO
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

    // Meta row: link count + team
    if (hasMetaRow) {
      const metaFontSize = `${Math.round(fontSize * 0.7)}px`;
      const metaAttrs = {
        "text-anchor": "middle" as const,
        "dominant-baseline": "central" as const,
        fill: "#94A3B8",
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

  // Badge
  if (style.badgeIcon || style.badgeLabel) {
    const badgeX = node.x + node.width - 10;
    const badgeY = node.y - 6;
    const badgeColor = style.badgeColor ?? "#EF4444";

    children.push(el("circle", { cx: badgeX, cy: badgeY, r: 10, fill: badgeColor }));
    if (style.badgeIcon) {
      children.push(
        el(
          "text",
          {
            x: badgeX,
            y: badgeY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: "white",
            "font-size": "10px",
          },
          escapeXml(style.badgeIcon),
        ),
      );
    }
    if (style.badgeLabel) {
      children.push(
        el(
          "text",
          {
            x: badgeX + 14,
            y: badgeY,
            "dominant-baseline": "central",
            fill: badgeColor,
            "font-size": "9px",
            "font-weight": "bold",
            "font-family": "sans-serif",
          },
          escapeXml(style.badgeLabel),
        ),
      );
    }
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
          stroke: "#64748B",
          "stroke-width": 1,
        }),
        el(
          "text",
          {
            x: btnX,
            y: btnY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: "#64748B",
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
          stroke: "#3B82F6",
          "stroke-width": 1,
        }),
        el(
          "text",
          {
            x: btnX,
            y: btnY,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: "#3B82F6",
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
