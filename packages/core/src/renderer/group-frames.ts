/**
 * Group boundary frames for the "Group by" views (#1858 P2a, #1884, #2179):
 * the frame-geometry constants, the multi-containment reach machinery, and the
 * shared frame builder both layout pipelines mint their frames with (TPL-219).
 */
import { displayGroupId } from "../types/ast.js";
import { CONTAINER_LABEL_HEIGHT } from "./layout-constants.js";
import type { LayoutNode, ContainerRect, Rect } from "./layout-types.js";

// System-view "Group by" boundary frames (#1858, P2a). Horizontal / bottom
// padding around a group's members, and the space reserved above a group's
// first row for its title. The inter-group vertical gap is derived from these
// so a frame's bottom edge never touches the next frame's title.
const GROUP_FRAME_PAD_X = 16;
const GROUP_FRAME_PAD_TOP = CONTAINER_LABEL_HEIGHT;
const GROUP_FRAME_PAD_BOTTOM = 16;
export const GROUP_FRAME_TITLE_GAP = GROUP_FRAME_PAD_TOP + GROUP_FRAME_PAD_BOTTOM;

/**
 * How far a reach strip (#2179) is padded around the card it wraps. The top pad
 * of a band body is reserved for its title; a strip carries no title, so it uses
 * the bottom pad on both of its ends.
 */
const REACH_STRIP_PAD_Y = GROUP_FRAME_PAD_BOTTOM;

/** Multi-containment inputs for the boundary axis (#2179); omitted on the team axis. */
export interface FrameReach {
  /** Every boundary a node was declared in on this canvas — not just its placement group. */
  membershipOf: (nodeId: string) => readonly string[];
  /** Position of a boundary in the declared order; the renderer maps it to a hue. */
  hueIndexOf: (groupId: string) => number;
}

/**
 * The strip that would widen `body` to enclose `card`, or `null` when it must
 * not be drawn (#2179).
 *
 * Refused in three cases, and the caller falls back to the 縮退 tab:
 *
 * - the card is not wholly above or below the band body, so a strip would have
 *   to run sideways through the band's own rows;
 * - **the corridor holds a card that is not a member** — 縮退規則 4, "偽の包含は
 *   作らない". This is the load-bearing condition. A reach decided by band
 *   *adjacency* instead walks across whatever rows lie between: measured on the
 *   prototype, it covered 100% of one non-member's card and 23% of another, on
 *   models a user would plausibly write. #2176's seam placement narrows that
 *   without removing it (it declines to move a node its intra-group dependents
 *   pin, and a node shared with three boundaries can only be seated toward one
 *   of them), so the gate is on the corridor, not on the band order;
 * - **the strip does not join the body widthwise.** Every row is centred
 *   independently against the widest row, so a shared member can sit in a
 *   different x-column from the boundary's own band entirely. A strip there is
 *   a second island rather than a reach: `rectUnionPath` refuses to trace a
 *   coverage set with a gap along x, so the outline would quietly fall back to
 *   the plain body rect — no widened frame drawn, and no tab either, because
 *   the reach had "succeeded". Refusing here is what keeps every membership on
 *   one of the two paths the spec promises.
 */
function reachStrip(
  body: Rect,
  card: LayoutNode,
  nodes: readonly LayoutNode[],
  isMember: (nodeId: string) => boolean,
): Rect | null {
  const above = card.y + card.height <= body.y;
  const below = card.y >= body.y + body.height;
  if (above === below) return null;
  const top = above ? card.y - REACH_STRIP_PAD_Y : body.y + body.height;
  const bottom = above ? body.y : card.y + card.height + REACH_STRIP_PAD_Y;
  const strip: Rect = {
    x: card.x - GROUP_FRAME_PAD_X,
    y: top,
    width: card.width + GROUP_FRAME_PAD_X * 2,
    height: bottom - top,
  };
  if (strip.height <= 0) return null;
  // The joint has to be wide enough to read as one shape. A bare overlap of a
  // pixel or two traces as a hairline neck, and a zero-width one pinches the
  // polygon at a corner; the frame's own horizontal padding is the smallest
  // width already established as "a frame edge you can see".
  const joint = Math.min(strip.x + strip.width, body.x + body.width) - Math.max(strip.x, body.x);
  if (joint < GROUP_FRAME_PAD_X) return null;
  for (const other of nodes) {
    if (other.id === card.id || isMember(other.id)) continue;
    if (rectsOverlap(strip, other)) return null;
  }
  return strip;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Build one dashed titled boundary frame per team from final node positions and
 * append them to `out`. Members of a group occupy a contiguous row band
 * (guaranteed by `assignGroupedLayers`). Shared by the single-system focus path
 * and the multi-system root path (#1884) — both mint the same `__group_<team>__`
 * frame, so the two grouping paths cannot drift on frame geometry (TPL-219).
 *
 * On the boundary axis (`reach` supplied) a frame is no longer just its band's
 * bounding box: a node declared in this boundary but *placed* in another band is
 * enclosed too, by widening the frame into a rectilinear outline (#2179). The
 * recorded rect stays the band body; the full shape is in `coverage`.
 *
 * Returns the memberships that could not be reached, for the caller to mark on
 * the card and report.
 */
export function buildGroupFrames(
  nodes: readonly LayoutNode[],
  groupOrder: readonly string[],
  groupIdOf: (id: string) => string | null,
  out: ContainerRect[],
  /**
   * Per-group frame metadata (#1921). Team frames use the group id as label; an
   * expanded container instead titles its frame with the service label and sets
   * `expanded`/`nodeId` so the renderer draws a ⊖ `data-expand-node` control.
   * Omitted → the frame reuses the team defaults (label = group id).
   */
  metaOf?: (groupId: string) => { label?: string; expanded?: boolean; nodeId?: string } | undefined,
  reach?: FrameReach,
): { degraded: { nodeId: string; boundaryId: string }[] } {
  const degraded: { nodeId: string; boundaryId: string }[] = [];
  for (const groupId of groupOrder) {
    const members = nodes.filter((n) => groupIdOf(n.id) === groupId);
    if (members.length === 0) continue;
    const minX = Math.min(...members.map((n) => n.x));
    const minY = Math.min(...members.map((n) => n.y));
    const maxX = Math.max(...members.map((n) => n.x + n.width));
    const maxY = Math.max(...members.map((n) => n.y + n.height));
    const meta = metaOf?.(groupId);
    const body: Rect = {
      x: minX - GROUP_FRAME_PAD_X,
      y: minY - GROUP_FRAME_PAD_TOP,
      width: maxX - minX + GROUP_FRAME_PAD_X * 2,
      height: maxY - minY + GROUP_FRAME_PAD_TOP + GROUP_FRAME_PAD_BOTTOM,
    };
    const coverage: Rect[] = [body];
    if (reach) {
      const isMember = (nodeId: string): boolean => reach.membershipOf(nodeId).includes(groupId);
      for (const card of nodes) {
        if (groupIdOf(card.id) === groupId || !isMember(card.id)) continue;
        const strip = reachStrip(body, card, nodes, isMember);
        if (strip) coverage.push(strip);
        else degraded.push({ nodeId: card.id, boundaryId: groupId });
      }
    }
    out.push({
      id: `__group_${groupId}__`,
      // displayGroupId strips the scope qualifier of a scoped boundary's group
      // id (#2036) so the qualifier never surfaces as a title.
      label: meta?.label ?? displayGroupId(groupId),
      ...body,
      ghost: false,
      group: true,
      groupId,
      // Left unset for a plain frame so everything downstream keeps reading the
      // recorded rect on the paths that never reach.
      ...(coverage.length > 1 ? { coverage } : {}),
      ...(reach ? { hueIndex: reach.hueIndexOf(groupId) } : {}),
      ...(meta?.expanded ? { expanded: true, nodeId: meta.nodeId ?? groupId } : {}),
    });
  }
  return { degraded };
}

/**
 * Boundary → its position in the **declared** order (#2179), which is what the
 * renderer's hue cycle indexes by: the colour of a boundary then depends only on
 * where the author declared it, so it is stable across canvases, across collapse
 * state, and across a band reorder. Falls back to the band order for callers with
 * no declared list, and to 0 for a group in neither (the renderer wraps anyway).
 */
export function boundaryHueIndexer(
  declaredGroupOrder: readonly string[] | undefined,
  groupOrder: readonly string[],
): (groupId: string) => number {
  const order = declaredGroupOrder ?? groupOrder;
  return (groupId) => Math.max(0, order.indexOf(groupId));
}

/**
 * Attach the 縮退 fallbacks to the cards that carry them (#2179), so the renderer
 * can draw a `◇ <boundary>` tab without re-deriving which frame missed which node.
 */
export function markDegradedMemberships(
  degraded: readonly { nodeId: string; boundaryId: string }[],
  layoutNodes: Map<string, LayoutNode>,
  labelOf: (groupId: string) => string,
  hueIndexOf: (groupId: string) => number,
): void {
  for (const { nodeId, boundaryId } of degraded) {
    const node = layoutNodes.get(nodeId);
    if (!node) continue;
    node.degradedBoundaries = [
      ...(node.degradedBoundaries ?? []),
      { id: boundaryId, label: labelOf(boundaryId), hueIndex: hueIndexOf(boundaryId) },
    ];
  }
}
