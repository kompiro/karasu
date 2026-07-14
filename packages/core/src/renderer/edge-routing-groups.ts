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

/**
 * Content bounds (leftmost / rightmost x over every card and frame). The gutter
 * and trunk/single lane x's are all derived from these, so the three routing
 * passes MUST agree on the basis for their lane numbering to align — hence one
 * shared helper rather than three inline copies.
 */
function contentBounds(
  nodes: LayoutNode[],
  frames: ContainerRect[],
): { minLeft: number; maxRight: number } {
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
  return { minLeft, maxRight };
}

export function routeGroupedEdges(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  // Content bounds → gutter x on each side, outside every frame and card.
  const { minLeft, maxRight } = contentBounds(nodes, frames);
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

  const { maxRight } = contentBounds(nodes, frames);

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
    // Trunk the subset that can be cleanly re-routed onto the right spine. An
    // edge whose stub is blocked keeps its `routeGroupedEdges` result instead of
    // suppressing the trunk for every sibling — the resolvable edges still get
    // merged, and the blocked one is never worse than before (AC-1 preserved).
    const clear = edges.filter((e) => {
      const from = layoutNodes.get(e.from);
      if (!from) return false;
      const path = trunkPath(from, target, nominalX);
      return polylineClearOf(path, obstaclesFor(e, nodes, frames, frameOfNode));
    });
    if (clear.length >= 2) eligible.push({ target, edges: clear });
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
      // A trunked edge runs down the shared spine, so an against-flow dash would
      // stripe only its half of a spine it co-renders with forward siblings —
      // a visibly inconsistent solid/dashed overlap. The trunk subsumes the
      // backward signal, so clear it (the merge geometry, not the dash, conveys
      // fan-in). P2c-C's junction dot marks the merge.
      edge.groupBackward = false;
    }
  });
}

/**
 * Lane-separate non-trunked gutter corridors (Issue #1927, follow-up to #1859
 * P2c-B). `routeGroupedEdges` sends every non-trunked cross-band edge to *one*
 * shared gutter x (`maxRight + GUTTER_GAP`), so two edges with overlapping
 * y-ranges lay collinear vertical corridors on the identical x — they render as
 * one indistinguishable line (and read as a false connection). `aggregateGroupTrunks`
 * disambiguates only fan-in (≥ 2 incoming) targets; single-incoming gutter edges
 * keep colliding on the default gutter x. Runs *after* `aggregateGroupTrunks`.
 *
 * Each colliding corridor gets its own lane x, allocated by greedy interval
 * partitioning on the corridor y-range: corridors whose y-ranges are disjoint may
 * share a lane (no visual overlap → minimal width and snapshot churn); overlapping
 * ones get distinct lanes. Lane order is coordinate-derived (sorted by y then id),
 * so snapshots stay stable.
 *
 * Right-side lanes are numbered clear of the trunk lanes (P2c-B): overflow
 * single-edge lanes start *beyond* the rightmost trunk x actually allocated
 * (`maxTrunkX`), so a single-edge lane can never collide with a trunk spine. Lane 0
 * keeps the base gutter x (`maxRight + GUTTER_GAP`), which no trunk uses — so an edge
 * that never collided does not move. Left-side lanes step further left (trunks are
 * right-only).
 *
 * Penetration-safe by construction: every lane x lies beyond `maxRight` (or before
 * `minLeft`), where no card or frame exists, so widening a corridor never crosses an
 * obstacle — the horizontal stub only extends into already-empty territory, and the
 * vertical stays outside all obstacles (AC-1 preserved, never worse). Left-side lanes
 * can push x negative; `normalizeCoordinates` (layout.ts) folds edge waypoints into
 * its min and shifts every point non-negative, so they never clip on the left.
 */
export function distributeGutterLanes(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  const { minLeft, maxRight } = contentBounds(nodes, frames);
  const rightBase = maxRight + GUTTER_GAP;
  const leftBase = minLeft - GUTTER_GAP;

  // Rightmost trunk lane x actually allocated (P2c-B, right-only), so overflow
  // single-edge lanes can start *beyond* every trunk — no lane-x collision. Derived
  // from the real trunk geometry (not a lane count), so it stays correct even if
  // trunk lanes were ever allocated non-contiguously. Lane 0 keeps the base gutter
  // x, which no trunk uses (trunks sit at rightBase + (lane+1)·TRUNK_LANE_GAP).
  let maxTrunkX = rightBase;
  for (const e of layoutEdges) {
    if (e.trunkId && e.waypoints && e.waypoints.length === 2) {
      maxTrunkX = Math.max(maxTrunkX, e.waypoints[0].x);
    }
  }

  // Collect non-trunked gutter corridors set by `routeGroupedEdges`, split by side.
  const right: LayoutEdge[] = [];
  const left: LayoutEdge[] = [];
  for (const e of layoutEdges) {
    if (e.ghost || e.cyclic) continue;
    if (e.trunkId) continue;
    if (!isVerticalGutterRoute(e)) continue;
    const x = e.waypoints![0].x;
    if (x > maxRight) right.push(e);
    else if (x < minLeft) left.push(e);
  }

  assignGutterLanes(right, (lane) => (lane === 0 ? rightBase : maxTrunkX + lane * TRUNK_LANE_GAP));
  assignGutterLanes(left, (lane) => leftBase - lane * TRUNK_LANE_GAP);
}

/**
 * Greedy interval partitioning of gutter corridors into lanes: corridors with
 * overlapping y-ranges land on distinct lanes, disjoint ones may share. `laneX`
 * maps a lane index to its gutter x. Rewrites each edge's two corridor waypoints
 * to the assigned lane x (ports and corridor y are untouched).
 */
function assignGutterLanes(edges: LayoutEdge[], laneX: (lane: number) => number): void {
  if (edges.length === 0) return;
  const ranges = edges.map((e) => {
    const y0 = e.waypoints![0].y;
    const y1 = e.waypoints![1].y;
    return { e, lo: Math.min(y0, y1), hi: Math.max(y0, y1) };
  });
  // Deterministic order: by corridor start, then end, then edge identity.
  ranges.sort(
    (a, b) =>
      a.lo - b.lo ||
      a.hi - b.hi ||
      (a.e.from < b.e.from
        ? -1
        : a.e.from > b.e.from
          ? 1
          : a.e.to < b.e.to
            ? -1
            : a.e.to > b.e.to
              ? 1
              : 0),
  );
  const laneEnds: number[] = []; // last-assigned corridor `hi` per lane
  for (const r of ranges) {
    // First lane whose corridor ends at or before this one starts (no overlap;
    // touching at a single point is not a visual overlap, so `<=`).
    let lane = laneEnds.findIndex((end) => end <= r.lo);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(r.hi);
    } else {
      laneEnds[lane] = r.hi;
    }
    const x = laneX(lane);
    r.e.waypoints = [
      { x, y: r.e.waypoints![0].y },
      { x, y: r.e.waypoints![1].y },
    ];
  }
}

/**
 * Fan out the source anchors of gutter corridors that leave the same node on the
 * same side (Issue #1927, source-exit follow-up). `routeGroupedEdges` /
 * `aggregateGroupTrunks` attach *every* gutter edge to the node's mid-edge port
 * (`from.y + height/2`), so two edges leaving one node share that point and their
 * horizontal stubs run **collinearly** until each peels off to its own lane — near
 * the source they render as one line, not N. This pass distributes those edges
 * across the node's edge height so each gets its own stub from the source onward.
 *
 * Runs *after* `distributeGutterLanes` so the lane x's are final. Only groups with
 * ≥ 2 edges on one side move; a lone edge keeps its mid-edge port (no churn). Ports
 * are ordered by lane x so the outermost corridor takes the lowest anchor — the fan
 * stays nested, minimising stub/vertical crossings (crossings are right-angle and
 * harmless; only penetration is a hard fail).
 *
 * Penetration-safe: each restubbed polyline is verified against the obstacle set and
 * the move is applied only if it stays clear, else the edge keeps its mid-edge port
 * (never worse — AC-1 preserved).
 */
export function fanOutGutterSources(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;
  const frameOfNode = buildFrameOfNode(layoutNodes, frames);

  // Group gutter corridors by (source node, gutter side).
  const groups = new Map<string, LayoutEdge[]>();
  for (const e of layoutEdges) {
    if (e.ghost || e.cyclic) continue;
    if (!isVerticalGutterRoute(e)) continue;
    const from = layoutNodes.get(e.from);
    if (!from) continue;
    const side = e.waypoints![0].x >= from.x + from.width ? "right" : "left";
    const key = `${e.from} ${side}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  for (const edges of groups.values()) {
    if (edges.length < 2) continue;
    const from = layoutNodes.get(edges[0].from)!;
    const side = edges[0].waypoints![0].x >= from.x + from.width ? "right" : "left";
    const portX = side === "right" ? from.x + from.width : from.x;
    // Outermost lane → lowest anchor: keeps the fan nested. Deterministic.
    edges.sort(
      (a, b) => a.waypoints![0].x - b.waypoints![0].x || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0),
    );
    const n = edges.length;
    edges.forEach((e, i) => {
      const y = from.y + (from.height * (i + 1)) / (n + 1);
      const staggered: Point = { x: portX, y };
      const elbow: Point = { x: e.waypoints![0].x, y };
      const obstacles = obstaclesFor(e, nodes, frames, frameOfNode);
      // Apply only if the restubbed route stays obstacle-free (never worse).
      if (polylineClearOf([staggered, elbow, e.waypoints![1], e.toPoint], obstacles)) {
        e.fromPoint = staggered;
        e.waypoints = [elbow, e.waypoints![1]];
      }
    });
  }
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
