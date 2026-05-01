import type { ResolvedEdgeStyle } from "../types/style.js";
import type { LayoutEdge } from "./layout-types.js";
import { el, escapeXml } from "./svg-builder.js";

interface Point {
  x: number;
  y: number;
}

export function renderEdge(
  edge: LayoutEdge,
  style: ResolvedEdgeStyle,
  markerId: string,
  diffState?: string,
): string {
  const { fromPoint, toPoint } = edge;
  const points: Point[] = [fromPoint, ...(edge.waypoints ?? []), toPoint];
  const parts: string[] = [];

  const strokeAttrs = {
    stroke: style.color,
    "stroke-width": style.strokeWidth,
    "stroke-dasharray":
      style.strokeStyle === "dashed" ? "8 4" : style.strokeStyle === "dotted" ? "2 2" : undefined,
    "marker-end": `url(#${markerId})`,
    class: edge.cyclic ? "krs-edge--cyclic" : undefined,
  };

  if (points.length === 2) {
    parts.push(
      el("line", {
        x1: fromPoint.x,
        y1: fromPoint.y,
        x2: toPoint.x,
        y2: toPoint.y,
        ...strokeAttrs,
      }),
    );
  } else {
    parts.push(
      el("polyline", {
        points: points.map((p) => `${p.x},${p.y}`).join(" "),
        fill: "none",
        ...strokeAttrs,
      }),
    );
  }

  if (edge.label) {
    const { x: midX, y: midY } = labelAnchor(points);
    const labelText = el(
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
    );

    if (edge.domainEdges && edge.domainEdges.length > 0) {
      // Wrap in a clickable group so PreviewPane can open a detail panel on click.
      // A transparent hit rect widens the click target beyond the text bounding box.
      const hitRect = el("rect", {
        x: midX - 60,
        y: midY - 20,
        width: 120,
        height: 18,
        fill: "transparent",
        "pointer-events": "all",
      });
      parts.push(
        el(
          "g",
          {
            "data-domain-edges": JSON.stringify(edge.domainEdges),
            style: "cursor:pointer",
          },
          hitRect + "\n" + labelText,
        ),
      );
    } else {
      parts.push(labelText);
    }
  }

  return el(
    "g",
    {
      "data-edge-from": edge.from,
      "data-edge-to": edge.to,
      "data-diff-state": diffState,
    },
    parts.join("\n"),
  );
}

// For polylines, anchor the label on the longest segment so it lands in open
// space rather than on a bend. For straight lines, use the geometric midpoint.
function labelAnchor(points: Point[]): Point {
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }
  let bestIdx = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = dx * dx + dy * dy;
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return {
    x: (points[bestIdx].x + points[bestIdx + 1].x) / 2,
    y: (points[bestIdx].y + points[bestIdx + 1].y) / 2,
  };
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
