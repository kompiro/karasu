import type { ResolvedEdgeStyle } from "../types/style.js";
import type { LayoutEdge } from "./layout.js";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEdge(
  edge: LayoutEdge,
  style: ResolvedEdgeStyle,
  markerId: string
): string {
  const { fromPoint, toPoint } = edge;
  const color = escapeXml(style.color);
  const strokeWidth = style.strokeWidth;
  const dashArray =
    style.strokeStyle === "dashed" ? ' stroke-dasharray="8 4"' : "";

  const parts: string[] = [];

  parts.push(
    `<line x1="${fromPoint.x}" y1="${fromPoint.y}" x2="${toPoint.x}" y2="${toPoint.y}" stroke="${color}" stroke-width="${strokeWidth}"${dashArray} marker-end="url(#${markerId})"/>`
  );

  if (edge.label) {
    const midX = (fromPoint.x + toPoint.x) / 2;
    const midY = (fromPoint.y + toPoint.y) / 2;
    parts.push(
      `<text x="${midX}" y="${midY - 6}" text-anchor="middle" fill="${color}" font-size="${style.fontSize}px" font-family="sans-serif">${escapeXml(edge.label)}</text>`
    );
  }

  return parts.join("\n");
}

export function renderArrowMarker(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${escapeXml(color)}"/></marker>`;
}
