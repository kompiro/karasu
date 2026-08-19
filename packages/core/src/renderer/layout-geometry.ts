/**
 * Canvas geometry for the layout pipelines (#2512): quadrant normalization,
 * row centering, total-dimension computation, and the empty-canvas container
 * fallback.
 */
import type { ViewSlice } from "../view/view-extract.js";
import type { LayoutNode, LayoutEdge, ContainerRect, DisplayMode } from "./layout-types.js";
import { CONTAINER_PADDING, GHOST_MARGIN, getLayoutConstants } from "./layout-constants.js";

export function normalizeCoordinates(
  containers: ContainerRect[],
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const c of containers) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
  }
  for (const [, node] of layoutNodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
  }
  // Edge geometry can reach beyond the nodes/frames — e.g. a Group-by left
  // gutter or trunk lane (#1859) puts waypoints outside the content box. Fold
  // them into the min so the shift keeps every point non-negative (an
  // un-normalized waypoint would clip on the left). Skip-layer channel
  // waypoints stay inside the node columns, so ungrouped views are unaffected.
  for (const edge of layoutEdges) {
    for (const p of [edge.fromPoint, edge.toPoint, ...(edge.waypoints ?? [])]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  }

  const shiftX = minX < CONTAINER_PADDING ? CONTAINER_PADDING - minX : 0;
  const shiftY = minY < CONTAINER_PADDING ? CONTAINER_PADDING - minY : 0;

  if (shiftX > 0 || shiftY > 0) {
    for (const c of containers) {
      c.x += shiftX;
      c.y += shiftY;
      // A widened frame's `coverage` is geometry of its own (#2179), not derived
      // from the recorded rect, so it has to be shifted with it. Miss this and
      // the strip stays behind: the outline is drawn in the wrong place, routing
      // treats the wrong rows as covered, and the false-containment guard reads
      // a frame that no longer matches the cards it is measured against.
      if (c.coverage) {
        for (const piece of c.coverage) {
          piece.x += shiftX;
          piece.y += shiftY;
        }
      }
    }
    for (const [, node] of layoutNodes) {
      node.x += shiftX;
      node.y += shiftY;
    }
    for (const edge of layoutEdges) {
      edge.fromPoint.x += shiftX;
      edge.fromPoint.y += shiftY;
      edge.toPoint.x += shiftX;
      edge.toPoint.y += shiftY;
      if (edge.waypoints) {
        for (const wp of edge.waypoints) {
          wp.x += shiftX;
          wp.y += shiftY;
        }
      }
    }
  }

  // Assert non-negative coordinates after normalization (dev/test only).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeEnv = (globalThis as any).process?.env?.NODE_ENV;
  if (typeof nodeEnv === "string" && nodeEnv !== "production") {
    for (const c of containers) {
      if (c.x < 0) {
        throw new Error(`[layout] container "${c.id}" has negative x=${c.x} after normalization`);
      }
    }
    for (const [id, node] of layoutNodes) {
      if (node.x < 0) {
        throw new Error(`[layout] node "${id}" has negative x=${node.x} after normalization`);
      }
    }
  }
}

/**
 * Center each sub-row of placed nodes against the widest row. Rows are grouped
 * by their y (each wrapped grid row has a distinct baseline); within a row the
 * nodes keep their left-to-right order. Shared by the single- and multi-system
 * placement phases — the two originally sorted and summed in opposite orders,
 * which is equivalent: the row width is a sum (order-independent), and the
 * re-placement walks the ids sorted by x either way.
 */
export function centerRowsHorizontally(
  nodes: Map<string, LayoutNode>,
  childMaxWidth: number,
  nodeGap: number,
): void {
  const rowGroups = new Map<number, string[]>();
  for (const [id, node] of nodes) {
    if (!rowGroups.has(node.y)) rowGroups.set(node.y, []);
    rowGroups.get(node.y)!.push(id);
  }
  for (const ids of rowGroups.values()) {
    ids.sort((a, b) => nodes.get(a)!.x - nodes.get(b)!.x);
    const rowWidth = ids.reduce((sum, id) => {
      const n = nodes.get(id)!;
      return sum + n.width + nodeGap;
    }, -nodeGap);
    const offset = Math.max(0, (childMaxWidth - rowWidth) / 2);

    let xOffset = offset;
    for (const id of ids) {
      const n = nodes.get(id)!;
      n.x = xOffset;
      xOffset += n.width + nodeGap;
    }
  }
}

export function computeTotalDimensions(
  containers: ContainerRect[],
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  displayMode?: DisplayMode,
): { width: number; height: number } {
  const { NODE_GAP } = getLayoutConstants(displayMode);
  let totalWidth = 0;
  let totalHeight = 0;
  for (const c of containers) {
    totalWidth = Math.max(totalWidth, c.x + c.width + CONTAINER_PADDING);
    totalHeight = Math.max(totalHeight, c.y + c.height + CONTAINER_PADDING);
  }
  for (const [, node] of layoutNodes) {
    totalWidth = Math.max(totalWidth, node.x + node.width + NODE_GAP);
    totalHeight = Math.max(totalHeight, node.y + node.height + NODE_GAP);
  }
  // Include edge geometry so a Group-by trunk lane or side gutter (#1859) that
  // extends past the content box is not clipped by the SVG viewport. `NODE_GAP`
  // is the margin (never larger than a node's own margin), so ungrouped views —
  // whose waypoints stay within the node columns — keep the same dimensions.
  for (const edge of layoutEdges) {
    for (const p of [edge.fromPoint, edge.toPoint, ...(edge.waypoints ?? [])]) {
      totalWidth = Math.max(totalWidth, p.x + NODE_GAP);
      totalHeight = Math.max(totalHeight, p.y + NODE_GAP);
    }
  }
  return { width: totalWidth, height: totalHeight };
}

export function buildContainersForEmpty(viewSlice: ViewSlice): ContainerRect[] {
  const containers: ContainerRect[] = [];
  const minW = 200;
  const minH = 80;

  if (viewSlice.containerNode && viewSlice.containerNode.kind !== "system") {
    containers.push({
      id: viewSlice.containerNode.id,
      label: viewSlice.containerNode.label ?? viewSlice.containerNode.id,
      x: viewSlice.ancestorChain.length * GHOST_MARGIN + GHOST_MARGIN,
      y: viewSlice.ancestorChain.length * GHOST_MARGIN + GHOST_MARGIN,
      width: minW,
      height: minH,
      ghost: false,
    });
  }

  for (let i = viewSlice.ancestorChain.length - 1; i >= 0; i--) {
    const ancestor = viewSlice.ancestorChain[i];
    const inner = containers.length > 0 ? containers[containers.length - 1] : null;
    containers.push({
      id: ancestor.id,
      label: ancestor.label ?? ancestor.id,
      x: inner ? inner.x - GHOST_MARGIN : GHOST_MARGIN,
      y: inner ? inner.y - GHOST_MARGIN : GHOST_MARGIN,
      width: inner ? inner.width + GHOST_MARGIN * 2 : minW + GHOST_MARGIN * 2,
      height: inner ? inner.height + GHOST_MARGIN * 2 : minH + GHOST_MARGIN * 2,
      ghost: true,
    });
  }

  containers.reverse();
  return containers;
}
