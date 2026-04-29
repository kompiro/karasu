/**
 * Lane allocation for edges that share an inter-row channel (Phase 3 of
 * #968 — see ADR-20260429-01 and Issue #996).
 *
 * After `routeOrthogonalEdges` adds L-shape waypoints to skip-layer edges,
 * multiple edges can land on the same channel y. Their horizontal segments
 * then visually merge and labels collapse.
 *
 * This pass groups edges by their channel y (with a small tolerance to
 * absorb floating-point drift), sorts each group by (leftX asc, rightX
 * asc) so edges that overlap horizontally end up in adjacent lanes, then
 * staggers their channel y across N lanes spanning a small band centred
 * on the original y.
 *
 * Lane cap: deferred per ADR. Currently unbounded; if real diagrams later
 * push too many edges into one channel, follow-up to bundle overflow.
 *
 * Run after `routeOrthogonalEdges`. Edges without waypoints are untouched.
 */
import type { LayoutEdge } from "./layout.js";

const CHANNEL_KEY_QUANTUM = 0.5;
const LANE_BAND = 18;

interface ChannelEdge {
  edge: LayoutEdge;
  leftX: number;
  rightX: number;
}

export function distributeChannelLanes(layoutEdges: LayoutEdge[]): void {
  // Bucket edges by channel y (rounded to QUANTUM). The L-shape from
  // routeOrthogonalEdges always uses two waypoints with the same y; we
  // index on that shared y.
  const buckets = new Map<number, ChannelEdge[]>();

  for (const edge of layoutEdges) {
    if (!edge.waypoints || edge.waypoints.length !== 2) continue;
    const [w0, w1] = edge.waypoints;
    if (Math.abs(w0.y - w1.y) > CHANNEL_KEY_QUANTUM) continue;
    const key = Math.round(w0.y / CHANNEL_KEY_QUANTUM) * CHANNEL_KEY_QUANTUM;
    const left = Math.min(w0.x, w1.x);
    const right = Math.max(w0.x, w1.x);
    push(buckets, key, { edge, leftX: left, rightX: right });
  }

  for (const [, items] of buckets) {
    if (items.length < 2) continue;
    items.sort((a, b) => {
      if (a.leftX !== b.leftX) return a.leftX - b.leftX;
      return a.rightX - b.rightX;
    });

    const N = items.length;
    // Spread N lanes across LANE_BAND px centred on the original channel y.
    const step = LANE_BAND / (N + 1);
    const baseY = items[0].edge.waypoints![0].y;
    const top = baseY - LANE_BAND / 2;
    for (let i = 0; i < N; i++) {
      const laneY = top + step * (i + 1);
      const wp = items[i].edge.waypoints!;
      wp[0].y = laneY;
      wp[1].y = laneY;
    }
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}
