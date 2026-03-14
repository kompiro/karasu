import type { KrsNode, KrsEdge } from "../types/ast.js";
import type { ResolvedNodeStyle, ResolvedEdgeStyle, ResolvedStyles } from "../types/style.js";
import { layout, type LayoutResult, type LayoutNode } from "./layout.js";
import { renderShape } from "./shapes.js";
import { renderEdge, renderArrowMarker } from "./edge-routing.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function render(
  systems: KrsNode[],
  styles: ResolvedStyles
): string {
  const layoutResult = layout(systems);

  if (layoutResult.nodes.size === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><text x="100" y="50" text-anchor="middle" fill="#9CA3AF" font-family="sans-serif">No nodes to render</text></svg>';
  }

  const padding = 40;
  const width = layoutResult.width + padding;
  const height = layoutResult.height + padding;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
  );

  // Defs: arrow markers
  parts.push("<defs>");
  const defaultEdgeColor = styles.defaultEdgeStyle.color;
  parts.push(renderArrowMarker("arrow-default", defaultEdgeColor));

  // Collect unique edge colors for markers
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
      parts.push(renderArrowMarker(id, color));
      colorToMarkerId.set(color, id);
    }
  }
  parts.push("</defs>");

  // Background
  parts.push(
    `<rect width="${width}" height="${height}" fill="#0F172A" rx="0"/>`
  );

  // System label
  if (systems.length > 0 && systems[0].label) {
    parts.push(
      `<text x="${padding / 2}" y="${padding / 2 + 4}" fill="#64748B" font-size="14px" font-family="sans-serif" font-weight="bold">${escapeXml(systems[0].label)}</text>`
    );
  }

  // Render edges first (below nodes)
  parts.push('<g class="edges">');
  for (const edgeLayout of layoutResult.edges) {
    const edgeKey = `${edgeLayout.from}->${edgeLayout.to}`;
    const edgeStyle = styles.edges.get(edgeKey) ?? styles.defaultEdgeStyle;
    const markerId = colorToMarkerId.get(edgeStyle.color) ?? "arrow-default";
    parts.push(renderEdge(edgeLayout, edgeStyle, markerId));
  }
  parts.push("</g>");

  // Render nodes
  parts.push('<g class="nodes">');

  // Collect all original KRS nodes to find edges
  const krsNodeMap = new Map<string, KrsNode>();
  function collectKrsNodes(node: KrsNode): void {
    if (node.kind !== "system") {
      krsNodeMap.set(node.id ?? node.label, node);
    }
    for (const child of node.children) collectKrsNodes(child);
  }
  for (const system of systems) collectKrsNodes(system);

  for (const [nodeId, layoutNode] of layoutResult.nodes) {
    const nodeStyle =
      styles.nodes.get(nodeId) ?? styles.defaultNodeStyle;
    parts.push(renderNode(layoutNode, nodeStyle));
  }
  parts.push("</g>");

  parts.push("</svg>");

  return parts.join("\n");
}

function renderNode(
  node: LayoutNode,
  style: ResolvedNodeStyle
): string {
  const parts: string[] = [];

  // Group with opacity
  const opacity = style.opacity < 1 ? ` opacity="${style.opacity}"` : "";
  parts.push(`<g${opacity}>`);

  // Shape
  parts.push(renderShape(node.x, node.y, node.width, node.height, style));

  // Label text
  const textColor = escapeXml(style.color);
  const fontSize = style.fontSize;
  const fontWeight = style.fontWeight;
  const fontFamily = escapeXml(style.fontFamily);

  const textX = node.x + node.width / 2;
  let textY = node.y + node.height / 2;
  if (node.description) textY -= 8;

  parts.push(
    `<text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${fontSize}px" font-weight="${fontWeight}" font-family="${fontFamily}">${escapeXml(node.label)}</text>`
  );

  // Description text
  if (node.description) {
    parts.push(
      `<text x="${textX}" y="${textY + fontSize + 4}" text-anchor="middle" dominant-baseline="central" fill="${textColor}" font-size="${Math.round(fontSize * 0.8)}px" font-family="${fontFamily}" opacity="0.7">${escapeXml(node.description)}</text>`
    );
  }

  // Badge
  if (style.badgeIcon || style.badgeLabel) {
    const badgeX = node.x + node.width - 10;
    const badgeY = node.y - 6;
    const badgeColor = style.badgeColor ?? "#EF4444";

    parts.push(
      `<circle cx="${badgeX}" cy="${badgeY}" r="10" fill="${escapeXml(badgeColor)}"/>`
    );
    if (style.badgeIcon) {
      parts.push(
        `<text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="central" fill="white" font-size="10px">${escapeXml(style.badgeIcon)}</text>`
      );
    }
    if (style.badgeLabel) {
      parts.push(
        `<text x="${badgeX + 14}" y="${badgeY}" dominant-baseline="central" fill="${escapeXml(badgeColor)}" font-size="9px" font-weight="bold" font-family="sans-serif">${escapeXml(style.badgeLabel)}</text>`
      );
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}
