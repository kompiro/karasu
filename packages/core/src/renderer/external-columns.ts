/**
 * Side-column placement for `[external]` services (#1728 / #2384 / #2394,
 * ADR-2394): pulls externals out of the bottom band into left/right columns
 * beside their consuming hubs, for both the single-system and multi-system
 * pipelines.
 */
import type { KrsNode, KrsEdge } from "../types/ast.js";
import type { ResolvedLayoutHints } from "../types/style.js";
import { systemTier } from "./layer-assignment.js";
import { CONTAINER_PADDING } from "./layout-constants.js";
import type { LayoutNode, ContainerRect } from "./layout-types.js";

const EXTERNAL_SIDE_GAP = 100;

/**
 * Spread below which the auto-assigned externals' hub barycenters count as one
 * value, so the median split has nothing to divide (#2384). Sub-pixel, so it
 * absorbs float noise from averaging node centres without ever merging two
 * barycenters a reader could tell apart.
 */
const SIDE_SPLIT_EPSILON = 0.5;

/**
 * Place `[external]` service nodes (systemTier 4) into left/right side columns
 * instead of the bottom band, so `service → external` edges run horizontally
 * and stop weaving through the downward infra fan-out (#1728, refines
 * ADR-1724). Runs *before* edge computation so `computeEdgePoints`
 * re-picks side anchors from the new relative positions.
 *
 * Side assignment reads the consuming-hub barycenter x, in two regimes. When
 * those barycenters straddle the content centre, a median split keeps each
 * hub's external fan on one side, which minimizes cross-hub crossings (#1728).
 * When they do not — every hub on one side, of which "every external shares one
 * barycenter" (#2384) is the limiting case — there is nothing to separate, so
 * the whole auto-assigned group goes to the side its hubs are on (#2394). An
 * author can override per node with the `column: left|right` style hint.
 * Overflow keeps stacking vertically on the side (no cap).
 *
 * Works for both single-system and multi-system root views: callers pass
 * the raw node list for the system being laid out and the ids of the
 * containers that should be widened to wrap the side columns.
 */
export function placeExternalServicesOnSides(
  sourceNodes: KrsNode[],
  systemContainerIds: Set<string>,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  allEdges: KrsEdge[],
  layoutHints?: Map<string, ResolvedLayoutHints>,
): Map<string, "left" | "right"> {
  const sides = new Map<string, "left" | "right">();
  const extIds = new Set<string>();
  for (const c of sourceNodes) if (systemTier(c) === 4) extIds.add(c.id);
  if (extIds.size === 0) return sides;
  // Scope to THIS system's nodes only. In the multi-system path `layoutNodes`
  // accumulates every system placed so far, so without this scope the bbox
  // (min/max) below would span all systems and place this system's externals
  // at the global figure edge, overlapping its neighbours.
  const sourceIds = new Set(sourceNodes.map((c) => c.id));
  const ext = [...layoutNodes.values()].filter((n) => extIds.has(n.id) && !n.ghost);
  const others = [...layoutNodes.values()].filter(
    (n) => sourceIds.has(n.id) && !extIds.has(n.id) && !n.ghost,
  );
  if (ext.length === 0 || others.length === 0) return sides;

  // Gate: side placement only pays off when ≥2 distinct hubs fan out to
  // externals — the condition that produces cross-hub edge crossings (#1728).
  // A single-hub fan does not cross itself, so a simple diagram keeps the
  // compact bottom band (ADR-1724) rather than spreading wide. An
  // explicit `column: left|right` on any external still forces side placement.
  const hubs = new Set<string>();
  for (const ed of allEdges) if (extIds.has(ed.to)) hubs.add(ed.from);
  const hasExplicitSide = ext.some((n) => {
    const c = layoutHints?.get(n.id)?.column;
    return c === "left" || c === "right";
  });
  if (hubs.size < 2 && !hasExplicitSide) return sides;

  // Consuming-hub barycenter x per external (from explicit edges into it).
  const hubX = new Map<string, number>();
  for (const e of ext) {
    const xs = allEdges
      .filter((ed) => ed.to === e.id)
      .map((ed) => layoutNodes.get(ed.from))
      .filter((s): s is LayoutNode => !!s)
      .map((s) => s.x + s.width / 2);
    hubX.set(e.id, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : e.x + e.width / 2);
  }

  const minX = Math.min(...others.map((n) => n.x));
  const maxX = Math.max(...others.map((n) => n.x + n.width));
  const topY = Math.min(...others.map((n) => n.y));
  const botY = Math.max(...others.map((n) => n.y + n.height));

  // Consuming-hub barycenters of the auto-assigned (non-hinted) externals,
  // sorted — the set the threshold below splits.
  const autoVals = ext
    .filter((n) => {
      const col = layoutHints?.get(n.id)?.column;
      return col !== "left" && col !== "right";
    })
    .map((n) => hubX.get(n.id) ?? 0)
    .sort((a, b) => a - b);
  // Which side an external lands on has two regimes, and telling them apart is
  // what #2394 settled.
  //
  // A median splits by *rank*, so it always lands inside the set: `<= median`
  // keeps between 1 and n-1 externals on the left whatever the hubs are doing.
  // That is what ADR-1728 wants when two hubs' fans need pulling apart — the
  // cross-hub crossings it removes were 28 of the 33 measured on `hato`. It is
  // the wrong answer when every hub sits on one side of the diagram: the split
  // still happens, stranding the lowest external in the far column with its one
  // edge dragged across the whole figure (#2394 — 640px of external edge
  // against 421px once it sits by its hub).
  //
  // So the regimes are decided by whether the hub barycenters **straddle** the
  // centre of the content span the side columns hug. That centre is
  // coordinate-derived (ADR-1728) and comes from outside the set being split,
  // which is what lets the answer be "none of them need separating".
  //
  //   straddling → split by the median, as before
  //   otherwise  → the whole auto-assigned group goes to the side its hubs are
  //                on, as one decision
  //
  // The second regime assigns a *group*, not a threshold. Comparing each
  // external against the centre instead re-opens the same hole one layer down:
  // a hub sitting exactly on the centre ties, and `<=` sends that one external
  // to the left while its siblings go right — the stranding this rule exists to
  // prevent (caught in review of #2507; `Ccc` at the centre of a right-leaning
  // set landed alone in the left column).
  //
  // The comparisons carry `SIDE_SPLIT_EPSILON` for the same reason `noSpread`
  // did in #2384: these barycenters are means of node centres, so mathematically
  // equal values can differ in their last bits when the summation order differs.
  // A set with no spread therefore cannot straddle, which is why that separate
  // degenerate check is gone — it is this predicate's limiting case.
  const contentCentre = (minX + maxX) / 2;
  const anyLeftOfCentre = autoVals.length > 0 && autoVals[0] < contentCentre - SIDE_SPLIT_EPSILON;
  const anyRightOfCentre =
    autoVals.length > 0 && autoVals[autoVals.length - 1] > contentCentre + SIDE_SPLIT_EPSILON;
  const straddlesCentre = anyLeftOfCentre && anyRightOfCentre;
  // Every barycenter on the centre (one hub, dead centre — `hato`) leaves both
  // flags false and lands left, which is where that arrangement already sat.
  const groupSide: "left" | "right" = anyRightOfCentre ? "right" : "left";
  const median = autoVals[Math.floor((autoVals.length - 1) / 2)];
  const sideOf = (n: LayoutNode): "left" | "right" => {
    const col = layoutHints?.get(n.id)?.column;
    if (col === "left" || col === "right") return col;
    if (!straddlesCentre) return groupSide;
    return (hubX.get(n.id) ?? 0) <= median ? "left" : "right";
  };

  const place = (group: LayoutNode[], x: number): void => {
    // Stable order within a side: hub-x, then consuming-hub y, then existing y.
    group.sort((a, b) => (hubX.get(a.id) ?? 0) - (hubX.get(b.id) ?? 0) || a.y - b.y);
    const count = group.length;
    group.forEach((node, i) => {
      node.x = x;
      node.y = topY + ((i + 1) * (botY - topY)) / (count + 1) - node.height / 2;
    });
  };
  const left = ext.filter((n) => sideOf(n) === "left");
  const right = ext.filter((n) => sideOf(n) === "right");
  // Per-side column width so a narrow side does not reserve the wide side's
  // gutter (each column hugs the system by its own widest member).
  const leftColW = left.reduce((m, n) => Math.max(m, n.width), 0);
  const rightColW = right.reduce((m, n) => Math.max(m, n.width), 0);
  place(left, minX - EXTERNAL_SIDE_GAP - leftColW);
  place(right, maxX + EXTERNAL_SIDE_GAP);
  for (const n of left) sides.set(n.id, "left");
  for (const n of right) sides.set(n.id, "right");

  // Grow the system container(s) to wrap the populated side columns.
  const leftEdge = left.length
    ? minX - EXTERNAL_SIDE_GAP - leftColW - CONTAINER_PADDING
    : undefined;
  const rightEdge = right.length
    ? maxX + EXTERNAL_SIDE_GAP + rightColW + CONTAINER_PADDING
    : undefined;
  for (const c of containers) {
    if (!systemContainerIds.has(c.id)) continue;
    let nx = c.x;
    let nr = c.x + c.width;
    if (leftEdge !== undefined) nx = Math.min(nx, leftEdge);
    if (rightEdge !== undefined) nr = Math.max(nr, rightEdge);
    c.x = nx;
    c.width = nr - nx;
  }
  return sides;
}
