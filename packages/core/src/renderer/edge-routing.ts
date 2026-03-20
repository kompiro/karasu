import type { ResolvedEdgeStyle } from "../types/style.js";
import type { LayoutEdge } from "./layout.js";
import { el, escapeXml } from "./svg-builder.js";

export function renderEdge(
  edge: LayoutEdge,
  style: ResolvedEdgeStyle,
  markerId: string,
): string {
  const { fromPoint, toPoint } = edge;
  const parts: string[] = [];

  parts.push(
    el("line", {
      x1: fromPoint.x,
      y1: fromPoint.y,
      x2: toPoint.x,
      y2: toPoint.y,
      stroke: style.color,
      "stroke-width": style.strokeWidth,
      "stroke-dasharray": style.strokeStyle === "dashed" ? "8 4" : undefined,
      "marker-end": `url(#${markerId})`,
    }),
  );

  if (edge.label) {
    const midX = (fromPoint.x + toPoint.x) / 2;
    const midY = (fromPoint.y + toPoint.y) / 2;
    parts.push(
      el(
        "text",
        {
          x: midX,
          y: midY - 6,
          "text-anchor": "middle",
          fill: style.color,
          "font-size": `${style.fontSize}px`,
          "font-family": "sans-serif",
        },
        escapeXml(edge.label),
      ),
    );
  }

  return parts.join("\n");
}

export function renderArrowMarker(id: string, color: string): string {
  return el(
    "marker",
    {
      id,
      viewBox: "0 0 10 10",
      refX: 10,
      refY: 5,
      markerWidth: 8,
      markerHeight: 8,
      orient: "auto-start-reverse",
    },
    el("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }),
  );
}
