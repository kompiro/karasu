/**
 * Group-aware orthogonal routing for the system-view "Group by" mode
 * (Issue #1859, P2c slice A; design `docs/design/system-view-grouping.md`
 * § "P2c 実装設計"). Runs *instead of* `routeOrthogonalEdges` when the viewer
 * has Group by: team active, so the ungrouped pipeline stays byte-identical
 * (AC-5).
 *
 * The two-level grouped layout (P2a) stacks each team as a boundary-framed row
 * band. A straight service→infra edge then pierces every intermediate team
 * frame and card between its endpoints (measured: 11 penetrations on the
 * canonical 2-team fixture). The default skip-layer router
 * (`edge-routing-channels.ts`) only treats *node cards* as obstacles, not the
 * frames, so it cannot fix this.
 *
 * This pass adds the group frames to the obstacle set and, for any edge whose
 * straight path crosses a non-endpoint node or frame, reroutes it orthogonally
 * through a **side gutter** — a vertical corridor outside every frame, which is
 * clear of all obstacles by construction:
 *
 *   sourcePort(side) → (gutterX, sourceY) → (gutterX, targetY) → targetPort(side)
 *
 * The candidate route is verified segment-by-segment against the obstacle set;
 * the right gutter is tried first, then the left, then (last resort) the edge
 * is left straight — strictly monotonic, never worse than today (AC-1).
 *
 * An edge that runs *against* the top-to-bottom group flow (target band above
 * source band) is flagged `groupBackward` so the renderer can dash it (AC-4).
 *
 * Ghost / cyclic edges are skipped, mirroring the skip-layer router — their
 * back-arc styling and ghost-anchor logic are handled elsewhere.
 *
 * Determinism: every coordinate is derived from node/frame geometry; no random
 * or DOM input, so snapshots stay stable.
 */
import type { LayoutEdge, LayoutNode, ContainerRect } from "./layout-types.js";
import { type Point, type Rect, segmentCrossesAnyRect, polylineClearOf } from "./edge-geometry.js";

/** Horizontal gap between the outermost frame/node edge and a routing gutter. */
const GUTTER_GAP = 28;
/** Horizontal spacing between distinct aggregation-trunk lanes (P2c-B). */
const TRUNK_LANE_GAP = 24;

interface Gutter {
  x: number;
  /** Which node side the stubs attach to when using this gutter. */
  side: "left" | "right";
}

/**
 * Obstacles an edge must not cross: every other node card, plus every group
 * frame that encloses neither endpoint (an edge legitimately starts and ends
 * inside its own team frame).
 */
function obstaclesFor(
  edge: LayoutEdge,
  nodes: LayoutNode[],
  frames: ContainerRect[],
  frameOfNode: Map<string, string>,
): Rect[] {
  const fFrom = frameOfNode.get(edge.from) ?? null;
  const fTo = frameOfNode.get(edge.to) ?? null;
  return [
    ...nodes.filter((n) => n.id !== edge.from && n.id !== edge.to),
    ...frames.filter((f) => f.id !== fFrom && f.id !== fTo),
  ];
}

/** Right-side anchor point (mid-height) of a node. */
function rightPort(n: LayoutNode): Point {
  return { x: n.x + n.width, y: n.y + n.height / 2 };
}

export function routeGroupedEdges(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  // Content bounds → gutter x on each side, outside every frame and card.
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const n of nodes) {
    minLeft = Math.min(minLeft, n.x);
    maxRight = Math.max(maxRight, n.x + n.width);
  }
  for (const f of frames) {
    minLeft = Math.min(minLeft, f.x);
    maxRight = Math.max(maxRight, f.x + f.width);
  }
  const rightGutter: Gutter = { x: maxRight + GUTTER_GAP, side: "right" };
  const leftGutter: Gutter = { x: minLeft - GUTTER_GAP, side: "left" };

  const frameOfNode = buildFrameOfNode(layoutNodes, frames);

  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    if (edge.waypoints && edge.waypoints.length > 0) continue;

    const from = layoutNodes.get(edge.from);
    const to = layoutNodes.get(edge.to);
    if (!from || !to) continue;

    // Against-flow (target band above source) → dash it. Independent of whether
    // the edge needs rerouting; a clear backward edge is still dashed.
    if (to.y + to.height <= from.y) edge.groupBackward = true;

    const obstacles = obstaclesFor(edge, nodes, frames, frameOfNode);

    // Leave clear edges (adjacent, intra-band) exactly as the shared pipeline
    // placed them — keeps simple edges simple and snapshots minimal.
    if (!segmentCrossesAnyRect(edge.fromPoint, edge.toPoint, obstacles)) continue;

    // Try the right gutter, then the left. Whichever yields a fully
    // obstacle-free orthogonal route wins.
    const routed =
      tryGutterRoute(edge, from, to, rightGutter, obstacles) ||
      tryGutterRoute(edge, from, to, leftGutter, obstacles);
    // If neither gutter is clear the edge stays straight (never worse).
    void routed;
  }
}

/**
 * Attempt a side-gutter route. Attaches source/target ports to the gutter side
 * of each node, runs horizontally out to the gutter, vertically along it, then
 * horizontally into the target. Applies (and returns true) only if all three
 * segments are obstacle-free.
 */
function tryGutterRoute(
  edge: LayoutEdge,
  from: LayoutNode,
  to: LayoutNode,
  gutter: Gutter,
  obstacles: Rect[],
): boolean {
  const sourcePort: Point = {
    x: gutter.side === "right" ? from.x + from.width : from.x,
    y: from.y + from.height / 2,
  };
  const targetPort: Point = {
    x: gutter.side === "right" ? to.x + to.width : to.x,
    y: to.y + to.height / 2,
  };
  const w0: Point = { x: gutter.x, y: sourcePort.y };
  const w1: Point = { x: gutter.x, y: targetPort.y };

  if (!polylineClearOf([sourcePort, w0, w1, targetPort], obstacles)) return false;

  edge.fromPoint = sourcePort;
  edge.toPoint = targetPort;
  edge.waypoints = [w0, w1];
  return true;
}

/**
 * Aggregation trunks (Issue #1859, P2c slice B). After `routeGroupedEdges` sends
 * every cross-band edge out to a side gutter, edges that share an infra/external
 * **target** still land on the one default gutter x, so two targets' spines
 * overlap. This pass gives each shared target its own **trunk lane** and merges
 * its incoming edges onto a single vertical spine that enters the target once —
 * the grouping analogue of karasu's aggregation concept.
 *
 * Only fan-in targets (≥ 2 gutter-routed incoming edges) form a trunk. Each
 * trunked edge is tagged `trunkId = <target id>`; the elbow where its horizontal
 * stub meets the spine (`waypoints[0]`) is the merge point a junction dot marks
 * in P2c-C. Edge identity is preserved — each `LayoutEdge` stays its own line
 * sharing the spine geometry, not a single merged edge (ADR-20260511-01 stance).
 *
 * Penetration-safe: trunk lanes sit in the right gutter (x > every card/frame),
 * so their verticals are clear by construction; each edge's candidate route is
 * still verified, and a target whose edges cannot all be cleanly re-routed keeps
 * the `routeGroupedEdges` result (never worse — AC-1 preserved).
 */
export function aggregateGroupTrunks(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  let maxRight = -Infinity;
  for (const n of nodes) maxRight = Math.max(maxRight, n.x + n.width);
  for (const f of frames) maxRight = Math.max(maxRight, f.x + f.width);

  const frameOfNode = buildFrameOfNode(layoutNodes, frames);

  // Group the gutter-routed edges (set by routeGroupedEdges) by their target.
  const byTarget = new Map<string, LayoutEdge[]>();
  for (const edge of layoutEdges) {
    if (edge.ghost || edge.cyclic) continue;
    if (!isVerticalGutterRoute(edge)) continue;
    const list = byTarget.get(edge.to);
    if (list) list.push(edge);
    else byTarget.set(edge.to, [edge]);
  }

  // Eligible trunks: a shared target with ≥ 2 incoming edges, all of which can
  // be cleanly re-routed onto a right-side spine. Clearance is lane-independent
  // (any x beyond maxRight has a clear vertical), so probe with a nominal x.
  const nominalX = maxRight + GUTTER_GAP;
  const eligible: { target: LayoutNode; edges: LayoutEdge[] }[] = [];
  for (const [targetId, edges] of byTarget) {
    if (edges.length < 2) continue;
    const target = layoutNodes.get(targetId);
    if (!target) continue;
    const allClear = edges.every((e) => {
      const from = layoutNodes.get(e.from);
      if (!from) return false;
      const path = trunkPath(from, target, nominalX);
      return polylineClearOf(path, obstaclesFor(e, nodes, frames, frameOfNode));
    });
    if (allClear) eligible.push({ target, edges });
  }

  // Deterministic lane order: topmost target first, then id. Each trunk gets its
  // own vertical lane so distinct targets' spines no longer overlap.
  eligible.sort((a, b) => a.target.y - b.target.y || (a.target.id < b.target.id ? -1 : 1));
  eligible.forEach(({ target, edges }, lane) => {
    // Lanes start one gap *beyond* the default gutter (`maxRight + GUTTER_GAP`),
    // which `routeGroupedEdges` uses for non-trunked single edges — so a trunk
    // spine never co-renders on top of a single-incoming edge's spine.
    const trunkX = maxRight + GUTTER_GAP + (lane + 1) * TRUNK_LANE_GAP;
    const targetPort = rightPort(target);
    for (const edge of edges) {
      const from = layoutNodes.get(edge.from)!;
      const sourcePort = rightPort(from);
      edge.fromPoint = sourcePort;
      edge.toPoint = targetPort;
      edge.waypoints = [
        { x: trunkX, y: sourcePort.y },
        { x: trunkX, y: targetPort.y },
      ];
      edge.trunkId = target.id;
    }
  });
}

/** The right-side trunk polyline for one source→target edge at column `x`. */
function trunkPath(from: LayoutNode, target: LayoutNode, x: number): Point[] {
  const sourcePort = rightPort(from);
  const targetPort = rightPort(target);
  return [sourcePort, { x, y: sourcePort.y }, { x, y: targetPort.y }, targetPort];
}

/** A `routeGroupedEdges` gutter route: two waypoints forming a vertical corridor. */
function isVerticalGutterRoute(edge: LayoutEdge): boolean {
  return (
    edge.waypoints !== undefined &&
    edge.waypoints.length === 2 &&
    edge.waypoints[0].x === edge.waypoints[1].x
  );
}

/**
 * Map each node id to the id of the group frame that encloses it (if any).
 * A node sits in a frame when its box is inside the frame's box — the frames
 * are disjoint by construction (P2a), so at most one matches.
 */
function buildFrameOfNode(
  layoutNodes: Map<string, LayoutNode>,
  frames: ContainerRect[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of layoutNodes.values()) {
    for (const f of frames) {
      if (
        n.x >= f.x &&
        n.x + n.width <= f.x + f.width &&
        n.y >= f.y &&
        n.y + n.height <= f.y + f.height
      ) {
        out.set(n.id, f.id);
        break;
      }
    }
  }
  return out;
}
