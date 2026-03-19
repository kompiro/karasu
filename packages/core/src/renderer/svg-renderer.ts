import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { ViewSlice } from "../view/view-extract.js";
import { layout, type ContainerRect, type LayoutNode } from "./layout.js";
import { renderShape } from "./shapes.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";
import { el, escapeXml } from "./svg-builder.js";
import { getIconDef } from "./shape-registry.js";

const GHOST_OPACITY = 0.3;

export function render(viewSlice: ViewSlice, styles: ResolvedStyles): string {
  const layoutResult = layout(viewSlice);

  if (layoutResult.nodes.size === 0 && layoutResult.containers.length === 0) {
    return el(
      "svg",
      { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 200 100" },
      el(
        "text",
        { x: 100, y: 50, "text-anchor": "middle", fill: "#9CA3AF", "font-family": "sans-serif" },
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

  // System label (when at system view, no containers)
  if (layoutResult.containers.length === 0 && viewSlice.containerNode) {
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
        escapeXml(viewSlice.containerNode.label),
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
    const hasChildren = hasChildrenInAst(viewSlice, nodeId);
    const rendered = renderNode(layoutNode, nodeStyle, nodeId, hasChildren);
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
      fill: "none",
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
  hasChildren: boolean,
): string {
  const children: string[] = [];

  // Shape
  children.push(renderShape(node.x, node.y, node.width, node.height, style));

  // Resolve text positions
  const shapeName = typeof style.shape === "string" ? style.shape : style.shape.url;
  const iconDef = getIconDef(shapeName);

  const textColor = style.color;
  const fontSize = style.fontSize;

  if (iconDef?.labelSlot) {
    const vw = iconDef.viewBoxWidth ?? 24;
    const vh = iconDef.viewBoxHeight ?? 24;
    const scaleX = node.width / vw;
    const scaleY = node.height / vh;

    const labelX = node.x + iconDef.labelSlot.x * scaleX;
    const labelY = node.y + iconDef.labelSlot.y * scaleY;
    const labelAnchor = iconDef.labelSlot.textAnchor ?? "middle";

    children.push(
      el(
        "text",
        {
          x: labelX,
          y: labelY,
          "text-anchor": labelAnchor,
          "dominant-baseline": "central",
          fill: textColor,
          "font-size": `${fontSize}px`,
          "font-weight": style.fontWeight,
          "font-family": style.fontFamily,
        },
        escapeXml(node.label),
      ),
    );

    if (node.description && iconDef.descriptionSlot) {
      const descX = node.x + iconDef.descriptionSlot.x * scaleX;
      const descY = node.y + iconDef.descriptionSlot.y * scaleY;
      const descAnchor = iconDef.descriptionSlot.textAnchor ?? "middle";

      children.push(
        el(
          "text",
          {
            x: descX,
            y: descY,
            "text-anchor": descAnchor,
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${Math.round(fontSize * 0.8)}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          escapeXml(node.description),
        ),
      );
    }
  } else {
    const textX = node.x + node.width / 2;
    let textY = node.y + node.height / 2;
    if (node.description) textY -= 8;

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

    if (node.description) {
      children.push(
        el(
          "text",
          {
            x: textX,
            y: textY + fontSize + 4,
            "text-anchor": "middle",
            "dominant-baseline": "central",
            fill: textColor,
            "font-size": `${Math.round(fontSize * 0.8)}px`,
            "font-family": style.fontFamily,
            opacity: 0.7,
          },
          escapeXml(node.description),
        ),
      );
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

  return el(
    "g",
    {
      "data-node-id": nodeId,
      style: hasChildren ? "cursor: pointer" : undefined,
      opacity: style.opacity < 1 ? style.opacity : undefined,
    },
    ...children,
  );
}

function hasChildrenInAst(viewSlice: ViewSlice, nodeId: string): boolean {
  for (const child of viewSlice.childNodes) {
    const id = child.id ?? child.label;
    if (id === nodeId) {
      return child.children.length > 0;
    }
  }
  return false;
}
