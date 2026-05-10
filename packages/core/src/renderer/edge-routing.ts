import type { ResolvedEdgeStyle } from "../types/style.js";
import type { LayoutEdge } from "./layout-types.js";
import { el, escapeXml } from "./svg-builder.js";

interface Point {
  x: number;
  y: number;
}

const STROKE_DASHARRAY: Record<ResolvedEdgeStyle["strokeStyle"], string | undefined> = {
  solid: undefined,
  dashed: "8 4",
  dotted: "2 2",
};

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
    "stroke-dasharray": STROKE_DASHARRAY[style.strokeStyle],
    "marker-end": `url(#${markerId})`,
    class: edge.cyclic ? "krs-edge--cyclic" : undefined,
  };

  // Wide invisible hit-line behind the visible stroke. Keeps the right-click
  // target practical even on default 1.5px edges, without changing the visual
  // weight of the diagram. Only emitted when the edge carries a canonical id —
  // edges that aren't addressable by `edge#<id>` selectors (e.g. ones whose id
  // was cleared by a base collision) don't need an interactive hit area.
  const interactive = edge.canonicalId !== undefined;
  if (interactive) {
    if (points.length === 2) {
      parts.push(
        el("line", {
          x1: fromPoint.x,
          y1: fromPoint.y,
          x2: toPoint.x,
          y2: toPoint.y,
          stroke: "transparent",
          "stroke-width": 14,
          "stroke-linecap": "butt",
          class: "krs-edge__hitline",
        }),
      );
    } else {
      parts.push(
        el("polyline", {
          points: points.map((p) => `${p.x},${p.y}`).join(" "),
          fill: "none",
          stroke: "transparent",
          "stroke-width": 14,
          "stroke-linecap": "butt",
          class: "krs-edge__hitline",
        }),
      );
    }
  }

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
    // When the edge is part of a parallel-edge bundle (N ≥ 2 sharing
    // `(from, to)`) and the author has not overridden label-position via
    // style, slide the label along the edge so parallel labels separate.
    // See docs/design/parallel-edge-bundling.md.
    let position = style.labelPosition;
    if (
      position === 0.5 &&
      edge.bundleSize !== undefined &&
      edge.bundleIndex !== undefined &&
      edge.bundleSize >= 2
    ) {
      position = (edge.bundleIndex + 1) / (edge.bundleSize + 1);
    }
    const { x: midX, y: midY } = labelAnchor(
      points,
      position,
      style.labelOffsetX,
      style.labelOffsetY,
    );
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
      "data-edge-kind": edge.kind,
      "data-edge-canonical-id": edge.canonicalId,
      "data-diff-state": diffState,
      class: interactive ? "krs-edge krs-edge--interactive" : "krs-edge",
    },
    parts.join("\n"),
  );
}

/**
 * Anchor point for the edge label.
 *
 * When `position === 0.5` and both offsets are `0`, the historical
 * "longest segment midpoint" heuristic fires — keeping unstyled
 * diagrams visually stable. Once the author sets `label-position` or
 * `label-offset` on the edge, the renderer switches to fractional
 * traversal (anchor at `position * totalLength` along the polyline) and
 * adds the screen-axis offsets `(offsetX, offsetY)` on top.
 *
 * Offsets are screen-axis (not edge-perpendicular) so a global rule
 * like `edge { label-offset: 0 8px; }` produces a uniform downward
 * shift across the diagram regardless of each edge's slope.
 */
function labelAnchor(points: Point[], position: number, offsetX: number, offsetY: number): Point {
  if (position === 0.5 && offsetX === 0 && offsetY === 0) {
    return defaultLabelAnchor(points);
  }
  return fractionalLabelAnchor(points, position, offsetX, offsetY);
}

function defaultLabelAnchor(points: Point[]): Point {
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

function fractionalLabelAnchor(
  points: Point[],
  position: number,
  offsetX: number,
  offsetY: number,
): Point {
  const segLengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    segLengths.push(len);
    total += len;
  }
  if (total === 0) {
    return { x: points[0].x + offsetX, y: points[0].y + offsetY };
  }

  const clamped = Math.min(1, Math.max(0, position));
  const target = clamped * total;
  let acc = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    const reachable = acc + segLen;
    const isLast = i === segLengths.length - 1;
    if (reachable >= target || isLast) {
      const localT = segLen === 0 ? 0 : (target - acc) / segLen;
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      return {
        x: points[i].x + dx * localT + offsetX,
        y: points[i].y + dy * localT + offsetY,
      };
    }
    acc += segLen;
  }
  // Unreachable in practice — the loop above covers `isLast`.
  return { x: points[points.length - 1].x + offsetX, y: points[points.length - 1].y + offsetY };
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
