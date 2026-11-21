/**
 * Room the ghost band's channels need for their lanes (#3881), measured on a
 * routed layout and handed back to the band placer by `layout()`'s second
 * placement. Kept apart from `band-routing.ts`, which the lane pass imports.
 */
import type { ContainerRect, LayoutEdge, LayoutNode, Rect } from "./layout-types.js";
import { LANE_PITCH } from "./edge-routing-lanes.js";

/**
 * The room each ghost band channel lacks for its lanes (#3881), keyed like
 * `BandInput.bandGaps`: `"<side>:0"` between the focus side and the first row,
 * `"<side>:<r>"` before row `r`. A channel holds its band runs at `LANE_PITCH`
 * with a pitch of air at either edge; where the runs that overlap the most
 * need more than the channel's height, the difference is reserved. Only the
 * band's runs are counted: the canvas's routes never enter these channels.
 * `undefined` when every channel fits, so a second placement is not made for it.
 */
export function bandGapReservations(result: {
  nodes: ReadonlyMap<string, LayoutNode>;
  edges: readonly LayoutEdge[];
  containers: readonly ContainerRect[];
}): Map<string, number> | undefined {
  const frames = result.containers.filter((c) => c.ghostBand !== undefined);
  const boxes: { side: "above" | "below"; top: number; bottom: number }[] = [
    ...frames.map((f) => ({ side: f.ghostBand!, top: f.y, bottom: f.y + f.height })),
    ...[...result.nodes.values()]
      .filter((n) => n.ghostBand !== undefined && !frames.some((f) => contains(f, n)))
      .map((n) => ({ side: n.ghostBand!, top: n.y, bottom: n.y + n.height })),
  ];
  if (boxes.length === 0) return undefined;
  // The focus side the first row faces: every frame between the outermost one
  // and the focus, as the band placer measures it.
  const nest = result.containers.filter((c) => c.ghostBand === undefined && c.group !== true);
  const focus = nest.find((c) => !c.ghost) ?? nest[0];
  if (!focus) return undefined;
  // Ghost system frames sit beside the outermost frame and do not count.
  const inner = nest.filter(
    (c) => c === focus || (c !== result.containers[0] && contains(c, focus)),
  );
  // Ghost users hang beside the focus and can reach below it; the placer starts
  // the lower band below them too. A ghost system's cards sit in their frame.
  const users = [...result.nodes.values()].filter(
    (n) =>
      n.ghost &&
      n.ghostBand === undefined &&
      !result.containers.some((c, i) => i > 0 && c.ghost && contains(c, n)),
  );
  const focusTop = Math.min(...inner.map((c) => c.y));
  const focusBottom = Math.max(
    ...inner.map((c) => c.y + c.height),
    ...users.map((n) => n.y + n.height),
  );
  const runs = result.edges
    .filter((e) => e.band === true)
    .flatMap((e) => {
      const pts = [e.fromPoint, ...(e.waypoints ?? []), e.toPoint];
      return pts.slice(0, -1).flatMap((a, i) => {
        const b = pts[i + 1];
        return Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6
          ? [{ y: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }]
          : [];
      });
    });
  const out = new Map<string, number>();
  for (const side of ["above", "below"] as const) {
    // Rows share their facing edge: tops below the focus, bottoms above it.
    const facing = new Map<number, { top: number; bottom: number }>();
    for (const b of boxes.filter((x) => x.side === side)) {
      const key = Math.round(side === "below" ? b.top : b.bottom);
      const row = facing.get(key);
      facing.set(
        key,
        row ? { top: Math.min(row.top, b.top), bottom: Math.max(row.bottom, b.bottom) } : b,
      );
    }
    const rows = [...facing.values()].sort((a, b) =>
      side === "below" ? a.top - b.top : b.bottom - a.bottom,
    );
    rows.forEach((row, r) => {
      const [lo, hi] =
        side === "below"
          ? [r === 0 ? focusBottom : rows[r - 1].bottom, row.top]
          : [row.bottom, r === 0 ? focusTop : rows[r - 1].top];
      const inGap = runs.filter((run) => run.y > lo + 1e-6 && run.y < hi - 1e-6);
      const lanes = lanesFor(inGap);
      const lack = Math.ceil((lanes + 1) * LANE_PITCH - (hi - lo));
      if (lanes > 0 && lack > 0) out.set(`${side}:${r}`, lack);
    });
  }
  return out.size > 0 ? out : undefined;
}

const contains = (f: Rect, n: Rect) =>
  n.x >= f.x && n.y >= f.y && n.x + n.width <= f.x + f.width && n.y + n.height <= f.y + f.height;

/**
 * How many lanes runs take when each goes on the first lane whose last run
 * ends a lane's gap before it starts: the interval partition the lane pass
 * (`collectChannels`) does.
 */
function lanesFor(runs: readonly { lo: number; hi: number }[]): number {
  const ends: number[] = [];
  for (const run of [...runs].sort((a, b) => a.lo - b.lo)) {
    const lane = ends.findIndex((end) => end + LANE_PITCH <= run.lo);
    if (lane === -1) ends.push(run.hi);
    else ends[lane] = run.hi;
  }
  return ends.length;
}
