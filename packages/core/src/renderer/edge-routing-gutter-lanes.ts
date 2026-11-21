/**
 * Gutter lane separation (#1927, #2958): every non-trunked gutter corridor gets
 * a lane of its own, or shares one with the corridors of its lane bundle. Split
 * out of `edge-routing-groups.ts` with the ghost band's phase (#3881).
 */
import type { ContainerRect, LayoutEdge, LayoutNode } from "./layout-types.js";
import type { Point } from "./edge-geometry.js";
import { NO_CHANNEL_LIMITS, type ChannelLimits } from "./edge-routing-lanes.js";
import {
  cmpEdgeId,
  contentBounds,
  GUTTER_GAP,
  maxTrunkXOf,
  TRUNK_LANE_GAP,
} from "./edge-routing-groups.js";
import { CANVAS_PHASE, isPeripheralEdge, type RoutingPhase } from "./band-routing.js";

/**
 * Lane-separate non-trunked gutter corridors (Issue #1927, follow-up to #1859
 * P2c-B). `routeGroupedEdges` sends every non-trunked cross-band edge to *one*
 * shared gutter x (`maxRight + GUTTER_GAP`), so two edges with overlapping
 * y-ranges lay collinear vertical corridors on the identical x — they render as
 * one indistinguishable line (and read as a false connection). `aggregateGroupTrunks`
 * disambiguates only fan-in (≥ 2 incoming) targets; single-incoming gutter edges
 * keep colliding on the default gutter x. Runs *after* `aggregateGroupTrunks`.
 *
 * Corridors whose routes share an end first form lane bundles
 * (`bundleGutterCorridors`, #2958), which take one lane between them. Each
 * remaining corridor, and each bundle, gets its own lane x, allocated by greedy
 * interval partitioning on the y-range: ranges that are disjoint may share a
 * lane (no visual overlap → minimal width and snapshot churn); overlapping ones
 * get distinct lanes. Lane order is coordinate-derived (sorted by y then id),
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
 * can push x negative; `normalizeCoordinates` (layout-geometry.ts) folds edge waypoints into
 * its min and shifts every point non-negative, so they never clip on the left.
 */
export function distributeGutterLanes(
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  frames: ContainerRect[],
  /** The enclosing frame, which the gutters are measured inside (#3154). */
  limits: ChannelLimits = NO_CHANNEL_LIMITS,
  /**
   * Which corridors this run may move (#3881). In the band phase the canvas's
   * corridors keep their lanes, and the band's take lanes beyond them.
   */
  phase: RoutingPhase = CANVAS_PHASE,
): void {
  const nodes = [...layoutNodes.values()];
  if (nodes.length === 0) return;

  const { minLeft, maxRight } = contentBounds(nodes, frames, limits);
  const rightBase = maxRight + GUTTER_GAP;
  const leftBase = minLeft - GUTTER_GAP;

  // Rightmost trunk lane x actually allocated (P2c-B, right-only), so overflow
  // single-edge lanes can start *beyond* every trunk — no lane-x collision. Derived
  // from the real trunk geometry (not a lane count), so it stays correct even if
  // trunk lanes were ever allocated non-contiguously. Lane 0 keeps the base gutter
  // x, which no trunk uses (trunks sit at rightBase + (lane+1)·TRUNK_LANE_GAP).
  // Fan-out spines (#2885) sit beyond the fan-in ones, so this is beyond both.
  const maxTrunkX = Math.max(rightBase, maxTrunkXOf(layoutEdges));

  // Collect non-trunked gutter corridors set by `routeGroupedEdges` /
  // `tryMixedRoute`, split by side. A mixed route has extra channel elbows, so
  // locate its corridor with `gutterCorridor` rather than assuming waypoints[0].
  const right: { e: LayoutEdge; corridor: GutterCorridor }[] = [];
  const left: { e: LayoutEdge; corridor: GutterCorridor }[] = [];
  // The outermost lane a corridor this run does not move already holds.
  let heldRight = -Infinity;
  let heldLeft = Infinity;
  for (const e of layoutEdges) {
    if (isPeripheralEdge(e)) continue;
    if (!phase.routes(e)) {
      const held = gutterCorridor(e);
      if (held && held.x > maxRight) heldRight = Math.max(heldRight, held.x);
      else if (held && held.x < minLeft) heldLeft = Math.min(heldLeft, held.x);
      continue;
    }
    if (e.trunkId !== undefined || e.outTrunkId !== undefined) continue;
    const corridor = gutterCorridor(e);
    if (!corridor) continue;
    if (corridor.x > maxRight) right.push({ e, corridor });
    else if (corridor.x < minLeft) left.push({ e, corridor });
  }

  // One counter across both sides, so every lane bundle's id is unique.
  const bundleIds = { next: 0 };
  // Beyond every held lane: no corridor this run moves lands on one it does not.
  const rightFrom = Math.max(maxTrunkX, heldRight);
  const leftFrom = Math.min(leftBase, heldLeft);
  assignGutterLanes(bundleGutterCorridors(right, bundleIds), (lane) =>
    Number.isFinite(heldRight)
      ? rightFrom + (lane + 1) * TRUNK_LANE_GAP
      : lane === 0
        ? rightBase
        : maxTrunkX + lane * TRUNK_LANE_GAP,
  );
  assignGutterLanes(bundleGutterCorridors(left, bundleIds), (lane) =>
    Number.isFinite(heldLeft)
      ? leftFrom - (lane + 1) * TRUNK_LANE_GAP
      : leftBase - lane * TRUNK_LANE_GAP,
  );
}

/** A gutter corridor and the edge whose route it belongs to. */
interface CorridorItem {
  e: LayoutEdge;
  corridor: GutterCorridor;
}

/**
 * What takes one lane: a single corridor, or a lane bundle of corridors that
 * draw one shared spine. `lo`/`hi` is the y-range the unit occupies — the
 * union of its members' ranges.
 */
interface LaneUnit {
  members: CorridorItem[];
  lo: number;
  hi: number;
}

/**
 * Lane bundles (#2958): gutter corridors on one side whose routes share an end
 * take one lane between them, so they draw one spine instead of one lane each.
 *
 * - **Fan-in**: corridors whose routes agree on everything from the corridor's
 *   far end onwards — the same target, entered the same way. Each sibling
 *   joins the spine at its corridor's start (`waypoints[corridor.i]`).
 * - **Fan-out**: of the rest, corridors whose routes agree on everything up to
 *   the corridor's near end — the same source, left the same way. Each
 *   sibling leaves the spine at its corridor's end (`waypoints[corridor.i + 1]`).
 *
 * Fan-in claims first: a shared target is the stronger statement, as in the
 * trunk passes (ADR-2631). The route's shape is never compared, only the part
 * the siblings will draw together, so a plain gutter route and a mixed route
 * (#1954) bundle by the same rule; for a 2-waypoint route the result is the
 * trunk passes' shape (one entry, one spine).
 *
 * Only a corridor's lane x changes, never its side or shape, so a short route
 * is never pulled out to the canvas edge (the #2364 cost ADR-2330 rejected),
 * and a lane beyond all content stays clear by construction.
 *
 * Siblings are tagged `trunkId` / `outTrunkId` — ids unique per bundle, since
 * one node can have several bundles and `fanOutGutterPorts` moves every edge
 * sharing an id as one slot — and `trunkJoin` marks where each meets the
 * spine. Edges of different kinds (sync / async) never share a bundle: one
 * spine would draw a solid and a dashed stroke on the same pixels, which is
 * #2490's overlap (ADR-2598 decision 8). For the same reason the bundle drops
 * `groupBackward`, as the trunk passes do.
 *
 * A group of one is not a bundle: the corridor keeps a lane of its own, so a
 * model whose gutter edges share no end lays out exactly as before.
 */
function bundleGutterCorridors(items: CorridorItem[], ids: { next: number }): LaneUnit[] {
  const units: LaneUnit[] = [];
  const pointsKey = (pts: readonly Point[]) => pts.map((p) => `${p.x},${p.y}`).join(";");
  const groupBy = (list: CorridorItem[], key: (it: CorridorItem) => string) => {
    const groups = new Map<string, CorridorItem[]>();
    for (const it of list) {
      const k = key(it);
      const g = groups.get(k);
      if (g) g.push(it);
      else groups.set(k, [it]);
    }
    return [...groups.values()];
  };
  const unitOf = (members: CorridorItem[]): LaneUnit => ({
    members,
    lo: Math.min(...members.map((m) => m.corridor.lo)),
    hi: Math.max(...members.map((m) => m.corridor.hi)),
  });

  // Fan-in: the far end of the corridor and everything after it. The
  // corridor's own x is left out, since the lane is what decides it.
  const tailKey = ({ e, corridor }: CorridorItem) => {
    const wps = e.waypoints!;
    const tail = [...wps.slice(corridor.i + 2), e.toPoint];
    return `${e.kind ?? ""}|${e.to}|${wps[corridor.i + 1].y}|${pointsKey(tail)}`;
  };
  const rest: CorridorItem[] = [];
  for (const group of groupBy(items, tailKey)) {
    if (group.length < 2) {
      rest.push(...group);
      continue;
    }
    const id = `${group[0].e.to}#lane-in-${ids.next++}`;
    for (const { e, corridor } of group) {
      e.trunkId = id;
      e.trunkJoin = corridor.i;
      e.groupBackward = false;
    }
    units.push(unitOf(group));
  }

  // Fan-out: everything before the corridor and its near end.
  const headKey = ({ e, corridor }: CorridorItem) => {
    const wps = e.waypoints!;
    const head = [e.fromPoint, ...wps.slice(0, corridor.i)];
    return `${e.kind ?? ""}|${e.from}|${wps[corridor.i].y}|${pointsKey(head)}`;
  };
  for (const group of groupBy(rest, headKey)) {
    if (group.length < 2) {
      units.push(unitOf(group));
      continue;
    }
    const id = `${group[0].e.from}#lane-out-${ids.next++}`;
    for (const { e, corridor } of group) {
      e.outTrunkId = id;
      e.trunkJoin = corridor.i + 1;
      e.groupBackward = false;
    }
    units.push(unitOf(group));
  }
  return units;
}

/**
 * Greedy interval partitioning of lane units into lanes: units with
 * overlapping y-ranges land on distinct lanes, disjoint ones may share. `laneX`
 * maps a lane index to its gutter x. Rewrites only each corridor's two
 * waypoints' x to the assigned lane (ports, corridor y, and any channel elbows
 * are untouched — moving the corridor x automatically slides the channel
 * horizontal that meets it, staying orthogonal and clear beyond
 * `maxRight`/`minLeft`). Every member of a bundle gets the same x.
 */
function assignGutterLanes(units: LaneUnit[], laneX: (lane: number) => number): void {
  if (units.length === 0) return;
  // Deterministic order: by range start, then end, then edge identity.
  const ranges = [...units].sort(
    (a, b) => a.lo - b.lo || a.hi - b.hi || cmpEdgeId(a.members[0].e, b.members[0].e),
  );
  const laneEnds: number[] = []; // last-assigned range `hi` per lane
  for (const unit of ranges) {
    // First lane whose range ends at or before this one starts (no overlap;
    // touching at a single point is not a visual overlap, so `<=`).
    let lane = laneEnds.findIndex((end) => end <= unit.lo);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(unit.hi);
    } else {
      laneEnds[lane] = unit.hi;
    }
    const x = laneX(lane);
    for (const { e, corridor } of unit.members) {
      const wps = e.waypoints!;
      wps[corridor.i] = { x, y: wps[corridor.i].y };
      wps[corridor.i + 1] = { x, y: wps[corridor.i + 1].y };
    }
  }
}

/** The vertical gutter corridor of a grouped route. */
interface GutterCorridor {
  /** Index of the first of the two consecutive waypoints forming the corridor. */
  i: number;
  x: number;
  lo: number;
  hi: number;
}

/**
 * Locate the single vertical gutter corridor of a grouped route — the pair of
 * consecutive *internal* waypoints sharing an x. Works for both the plain
 * 2-waypoint side route (`[corridorTop, corridorBottom]`, `i = 0`) and the
 * multi-waypoint **mixed route** (`tryMixedRoute`), where a channel end adds an
 * elbow before/after the corridor. The endpoint drops (fromPoint→waypoints[0]
 * and waypoints[last]→toPoint) are *outside* the internal scan, so a channel
 * end's own vertical drop is never mistaken for the corridor. Returns null for a
 * straight edge (no corridor), which the lane/fan passes then skip — exactly as
 * they skipped straight edges before. Generalises `isVerticalGutterRoute` so the
 * #1927 overlap passes cover mixed routes, not just 2-waypoint ones.
 */
function gutterCorridor(edge: LayoutEdge): GutterCorridor | null {
  const wps = edge.waypoints;
  if (!wps || wps.length < 2) return null;
  for (let i = 0; i < wps.length - 1; i++) {
    if (wps[i].x === wps[i + 1].x && wps[i].y !== wps[i + 1].y) {
      return {
        i,
        x: wps[i].x,
        lo: Math.min(wps[i].y, wps[i + 1].y),
        hi: Math.max(wps[i].y, wps[i + 1].y),
      };
    }
  }
  return null;
}
