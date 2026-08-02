import type { KrsNode, KrsEdge } from "../types/ast.js";
import {
  INFRA_KIND_SET,
  OWNABLE_KIND_SET,
  boundaryScopeKey,
  displayGroupId,
  scopedBoundaryGroupId,
} from "../types/ast.js";
import { collapseNodeList, collapseCategories, type CategoryId } from "./category-collapse.js";
import {
  assignGroupedLayers,
  groupOrderFor,
  resolvePlacementAxis,
  type GroupedNode,
  type GroupBand,
} from "./group-layout.js";
import { collapseGroups } from "./group-collapse.js";
import { groupLabelsFor, type GroupLabelIndex } from "./group-labels.js";
import type { ViewSlice, GhostSystem } from "../view/view-extract.js";
import type { EdgeDirection, ResolvedLayoutHints } from "../types/style.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { summarizeDescription } from "./description-summary.js";
import {
  CHAR_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  estimateTextWidth,
  teamChipText,
} from "./rendering-constants.js";
import {
  sortByBarycenter,
  bucketByColumn,
  applyEdgeDirectionWithinLayer,
  gridColumnCount,
  wrapLayerIntoRows,
} from "./layer-layout-logics.js";
import { routeOrthogonalEdges } from "./edge-routing-channels.js";
import {
  routeGroupedEdges,
  aggregateGroupTrunks,
  distributeGutterLanes,
  fanOutGutterPorts,
} from "./edge-routing-groups.js";
import { distributePorts } from "./edge-routing-ports.js";
import { distributeChannelLanes } from "./edge-routing-lanes.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import { computeCrossingMarks } from "./crossing-marks.js";
import type {
  LayoutNode,
  LayoutNodeProperties,
  LayoutEdge,
  ContainerRect,
  LayoutResult,
  DisplayMode,
  Rect,
} from "./layout-types.js";

export type { LayoutNode, LayoutEdge, LayoutResult, DisplayMode } from "./layout-types.js";

const LINE_HEIGHT = 18;
const DESCRIPTION_FONT_RATIO = 0.85;
const CONTAINER_PADDING = 40;
const CONTAINER_LABEL_HEIGHT = 30;
const GHOST_MARGIN = 30;

// System-view "Group by" boundary frames (#1858, P2a). Horizontal / bottom
// padding around a group's members, and the space reserved above a group's
// first row for its title. The inter-group vertical gap is derived from these
// so a frame's bottom edge never touches the next frame's title.
const GROUP_FRAME_PAD_X = 16;
const GROUP_FRAME_PAD_TOP = CONTAINER_LABEL_HEIGHT;
const GROUP_FRAME_PAD_BOTTOM = 16;
const GROUP_FRAME_TITLE_GAP = GROUP_FRAME_PAD_TOP + GROUP_FRAME_PAD_BOTTOM;

/**
 * How far a reach strip (#2179) is padded around the card it wraps. The top pad
 * of a band body is reserved for its title; a strip carries no title, so it uses
 * the bottom pad on both of its ends.
 */
const REACH_STRIP_PAD_Y = GROUP_FRAME_PAD_BOTTOM;

/** Multi-containment inputs for the boundary axis (#2179); omitted on the team axis. */
interface FrameReach {
  /** Every boundary a node was declared in on this canvas — not just its placement group. */
  membershipOf: (nodeId: string) => readonly string[];
  /** Position of a boundary in the declared order; the renderer maps it to a hue. */
  hueIndexOf: (groupId: string) => number;
}

/**
 * The strip that would widen `body` to enclose `card`, or `null` when it must
 * not be drawn (#2179).
 *
 * Refused in two cases, and the caller falls back to the 縮退 tab:
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
 *   of them), so the gate is on the corridor, not on the band order.
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
function buildGroupFrames(
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
function boundaryHueIndexer(
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
function markDegradedMemberships(
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

const ICON_CARD_WIDTH = 160;
const ICON_CARD_HEIGHT_WITH_DESC = 100;
const ICON_CARD_HEIGHT_NO_DESC = 56;

// Per-mode gap constants. Shape values are the historical defaults tuned
// for variable-width cards (~250px). Icon values are tuned for uniform
// 160-wide cards — see docs/design/icon-mode-layout-tuning.md.
function getLayoutConstants(displayMode?: DisplayMode): {
  LAYER_GAP: number;
  NODE_GAP: number;
  MAX_LAYER_WIDTH: number;
} {
  if (displayMode === "icon") {
    return { LAYER_GAP: 80, NODE_GAP: 36, MAX_LAYER_WIDTH: 1040 };
  }
  return { LAYER_GAP: 120, NODE_GAP: 60, MAX_LAYER_WIDTH: 1200 };
}

// ---------------------------------------------------------------------------
// Extracted helpers for layout decomposition
// ---------------------------------------------------------------------------

function buildGraph(
  nodeIds: string[],
  edges: KrsEdge[],
  edgeDirections?: Map<string, EdgeDirection>,
): { adj: Map<string, string[]>; inDegree: Map<string, number> } {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  // Pre-pass: build the dependency edges with `direction: up` applied as
  // logical reversals. If applying a reversal would close a cycle, drop the
  // reversal for that edge (keeping the original orientation) so layer
  // assignment stays valid. `down` / `auto` / `left` / `right` use the
  // natural `from -> to` orientation (left/right are not honored by the
  // layered layout — see docs/spec/style.md).
  const dependencyPairs: Array<{ from: string; to: string }> = [];
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    const direction = edgeDirections?.get(`${edge.from}->${edge.to}`);
    if (direction === "up") {
      dependencyPairs.push({ from: edge.to, to: edge.from });
    } else {
      dependencyPairs.push({ from: edge.from, to: edge.to });
    }
  }

  // Cycle guard: if `up` reversals introduce a cycle, retry without them.
  // We don't try to drop a minimal subset — for the MVP, falling back
  // entirely is honest and predictable.
  if (edgeDirections && hasCycle(nodeIds, dependencyPairs)) {
    dependencyPairs.length = 0;
    for (const edge of edges) {
      if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
      dependencyPairs.push({ from: edge.from, to: edge.to });
    }
  }

  for (const pair of dependencyPairs) {
    adj.get(pair.from)!.push(pair.to);
    inDegree.set(pair.to, (inDegree.get(pair.to) ?? 0) + 1);
  }
  return { adj, inDegree };
}

/**
 * Apply `direction: up` / `direction: down` hints on top of an
 * already-assigned forced layer map. The forced kind-based layout in
 * system view (user → client → service → ...) ignores edge orientation
 * by design, so a topological reversal in `buildGraph` never reaches it.
 * Instead, for each hinted edge whose source currently sits on the wrong
 * side of its target, we push the source one layer past the target.
 * Other endpoints (and the target itself) are left in place, so a
 * single hint only perturbs the kind stratification for the involved
 * source.
 *
 *   - `up`:   source.layer  =  target.layer + 1   (source ends up below)
 *   - `down`: source.layer  =  target.layer - 1   (source ends up above)
 *
 * `down` is a no-op when the target is already at layer 0 — there is no
 * room to push the source above the topmost row, so the hint is silently
 * dropped (no warning) and the natural orientation is kept.
 *
 * The pass is intentionally simple: it walks the edges once, in
 * declaration order, applying each hint independently. A chain of hints
 * compounds naturally because each later hint reads the freshly-adjusted
 * layer of its target. Conflicting hints (e.g. `A -> B up` and
 * `B -> A up`) are resolved by last-wins, which is a documented quirk
 * rather than a cycle-guarded fallback — forced layers cannot deadlock
 * on a per-edge adjustment the way the topological DAG can.
 */
function applyDirectionHintsToForcedLayers(
  layers: Map<string, number>,
  edges: KrsEdge[],
  edgeDirections: Map<string, EdgeDirection>,
): Map<string, number> {
  const adjusted = new Map(layers);
  for (const edge of edges) {
    const dir = edgeDirections.get(`${edge.from}->${edge.to}`);
    if (dir === undefined || dir === "auto") continue;
    if (!adjusted.has(edge.from) || !adjusted.has(edge.to)) continue;
    const targetLayer = adjusted.get(edge.to)!;
    const fromLayer = adjusted.get(edge.from)!;
    if (dir === "up" && fromLayer <= targetLayer) {
      adjusted.set(edge.from, targetLayer + 1);
    } else if (dir === "down" && fromLayer >= targetLayer && targetLayer > 0) {
      adjusted.set(edge.from, targetLayer - 1);
    } else if ((dir === "left" || dir === "right") && fromLayer !== targetLayer) {
      // Pull the source into the target's layer so the within-layer
      // reorder pass can place them side by side. The forced kind layout
      // still informs every other node's row, so the perturbation is
      // local to the hinted source endpoint.
      adjusted.set(edge.from, targetLayer);
    }
  }
  return adjusted;
}

function hasCycle(nodeIds: string[], pairs: Array<{ from: string; to: string }>): boolean {
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const pair of pairs) adj.get(pair.from)?.push(pair.to);

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);

  const stack: Array<{ node: string; nextChild: number }> = [];
  for (const start of nodeIds) {
    if (color.get(start) !== WHITE) continue;
    stack.push({ node: start, nextChild: 0 });
    color.set(start, GRAY);
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const children = adj.get(top.node) ?? [];
      if (top.nextChild < children.length) {
        const next = children[top.nextChild++];
        const c = color.get(next);
        if (c === GRAY) return true;
        if (c === WHITE) {
          color.set(next, GRAY);
          stack.push({ node: next, nextChild: 0 });
        }
      } else {
        color.set(top.node, BLACK);
        stack.pop();
      }
    }
  }
  return false;
}

function placeGhostUsers(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode?: DisplayMode,
): void {
  if (viewSlice.ghostUsers.length === 0) return;
  const { NODE_GAP } = getLayoutConstants(displayMode);

  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  const userX = (mainContainer?.x ?? 0) - 20;
  let userY = (mainContainer?.y ?? 0) + CONTAINER_LABEL_HEIGHT + NODE_GAP;
  const ghostUserNodes: LayoutNode[] = [];

  for (const userNode of viewSlice.ghostUsers) {
    const dims = measureNode(userNode, undefined, displayMode);
    const uid = userNode.id;
    const gNode: LayoutNode = {
      kind: userNode.kind,
      tags: userNode.tags,
      id: uid,
      label: userNode.label ?? userNode.id,
      annotations: effectiveAnnotations(userNode),
      properties: extractLayoutProperties(userNode, undefined),
      descriptionSummary: userNode.properties.description
        ? summarizeDescription(userNode.properties.description)
        : undefined,
      linkCount: userNode.properties.links.length,
      hasChildren: userNode.children.length > 0,
      hasDescription: !!userNode.properties.description,
      x: userX - dims.width,
      y: userY,
      width: dims.width,
      height: dims.height,
      ghost: true,
    };
    layoutNodes.set(uid, gNode);
    ghostUserNodes.push(gNode);
    userY += dims.height + NODE_GAP / 2;
  }

  // Expand outermost container to include ghost users
  if (ghostUserNodes.length > 0 && containers.length > 0) {
    const minX = Math.min(...ghostUserNodes.map((n) => n.x)) - GHOST_MARGIN;
    const maxY = Math.max(...ghostUserNodes.map((n) => n.y + n.height)) + GHOST_MARGIN;
    const outermost = containers[0];
    if (minX < outermost.x) {
      const dx = outermost.x - minX;
      outermost.width += dx;
      outermost.x = minX;
    }
    if (maxY > outermost.y + outermost.height) {
      outermost.height = maxY - outermost.y;
    }
  }
}

/**
 * Place a row of muted ghost nodes below the main container, then grow the
 * outermost container to include them. Shared by {@link placeGhostDomains} and
 * {@link placeGhostEntities}: each item carries the layout `key` to store under
 * (bare id for domains, qualified `DomainId.EntityId` for entities) and the
 * `subLabel` (owning service / domain) to show muted. `ghost: true` drives the
 * muting in svg-renderer; no renderer change is needed.
 */
function placeGhostRow(
  items: { node: KrsNode; key: string; subLabel: string }[],
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode: DisplayMode | undefined,
  gap: number,
): void {
  if (items.length === 0 || containers.length === 0) return;
  const { NODE_GAP } = getLayoutConstants(displayMode);

  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  const ghostY = mainContainer.y + mainContainer.height + gap;
  let ghostX = mainContainer.x + CONTAINER_PADDING;

  for (const { node, key, subLabel } of items) {
    const dims = measureNode(node, undefined, displayMode);
    layoutNodes.set(key, {
      kind: node.kind,
      tags: node.tags,
      id: key,
      label: node.label ?? node.id,
      annotations: effectiveAnnotations(node),
      subLabel,
      properties: extractLayoutProperties(node, undefined),
      descriptionSummary: node.properties.description
        ? summarizeDescription(node.properties.description)
        : undefined,
      linkCount: node.properties.links.length,
      hasChildren: node.children.length > 0,
      hasDescription: !!node.properties.description,
      x: ghostX,
      y: ghostY,
      width: dims.width,
      height: dims.height,
      ghost: true,
    });
    ghostX += dims.width + NODE_GAP;
  }

  // Expand outermost container to include the ghost row (both height and width)
  const placed = items
    .map(({ key }) => layoutNodes.get(key))
    .filter((n): n is LayoutNode => n !== undefined);
  if (placed.length > 0) {
    const maxGhostY = Math.max(...placed.map((n) => n.y + n.height)) + GHOST_MARGIN;
    const maxGhostX = Math.max(...placed.map((n) => n.x + n.width)) + GHOST_MARGIN;
    const outermost = containers[0];
    if (maxGhostY > outermost.y + outermost.height) {
      outermost.height = maxGhostY - outermost.y;
    }
    if (maxGhostX > outermost.x + outermost.width) {
      outermost.width = maxGhostX - outermost.x;
    }
  }
}

const GHOST_ROW_GAP = 60;

function placeGhostDomains(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode?: DisplayMode,
): void {
  placeGhostRow(
    viewSlice.ghostDomains.map((gd) => ({
      node: gd.node,
      key: gd.node.id,
      subLabel: gd.parentServiceLabel,
    })),
    layoutNodes,
    containers,
    effectiveAnnotations,
    displayMode,
    GHOST_ROW_GAP,
  );
}

/**
 * Place cross-domain ghost entities below the entity view's main container.
 * Keyed by the qualified `DomainId.EntityId` (not the bare id) because entity
 * ids are only warning-level unique — the matching `ghostEntityEdges` endpoints
 * use the same qualified key for foreign endpoints.
 */
function placeGhostEntities(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode?: DisplayMode,
): void {
  placeGhostRow(
    viewSlice.ghostEntities.map((ge) => ({
      node: ge.node,
      key: ge.key,
      subLabel: ge.parentDomainLabel,
    })),
    layoutNodes,
    containers,
    effectiveAnnotations,
    displayMode,
    GHOST_ROW_GAP,
  );
}

function placeCallerGhostSystems(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ownerOf: OwnerResolver,
  displayMode?: DisplayMode,
): void {
  const GHOST_SYSTEM_GAP = 80;
  if (viewSlice.callerGhostSystems.length === 0 || containers.length === 0) return;

  const outermost = containers[0];
  const ghostStartY = outermost.y;

  const callerContainers: ContainerRect[] = [];
  let tempX = 0;
  for (const gs of viewSlice.callerGhostSystems) {
    const { nodes: gsNodes, containerRect } = layoutGhostSystem(
      gs,
      tempX,
      ghostStartY,
      ownerOf,
      displayMode,
    );
    callerContainers.push(containerRect);
    for (const [id, node] of gsNodes) {
      layoutNodes.set(id, node);
    }
    tempX += containerRect.width + GHOST_SYSTEM_GAP;
  }

  const totalCallerWidth = tempX - GHOST_SYSTEM_GAP;
  const callerStartX = outermost.x - GHOST_SYSTEM_GAP - totalCallerWidth;
  const shiftX = callerStartX;

  for (const gs of viewSlice.callerGhostSystems) {
    for (const svc of gs.visibleServices) {
      const qualifiedId = `${gs.systemNode.id}.${svc.id}`;
      const node = layoutNodes.get(qualifiedId);
      if (node) node.x += shiftX;
    }
  }
  for (const c of callerContainers) {
    c.x += shiftX;
    containers.push(c);
  }
}

function placeOutgoingGhostSystems(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ownerOf: OwnerResolver,
  displayMode?: DisplayMode,
): void {
  const GHOST_SYSTEM_GAP = 80;
  if (viewSlice.ghostSystems.length === 0 || containers.length === 0) return;

  const outermost = containers[0];
  let ghostX = outermost.x + outermost.width + GHOST_SYSTEM_GAP;
  const ghostStartY = outermost.y;

  for (const gs of viewSlice.ghostSystems) {
    const { nodes: gsNodes, containerRect } = layoutGhostSystem(
      gs,
      ghostX,
      ghostStartY,
      ownerOf,
      displayMode,
    );
    containers.push(containerRect);
    for (const [id, node] of gsNodes) {
      layoutNodes.set(id, node);
    }
    ghostX += containerRect.width + GHOST_SYSTEM_GAP;
  }
}

function computeLayoutEdges(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  layers: Map<string, number>,
  containers: ContainerRect[],
  allEdges: KrsEdge[],
  sideExternals: Map<string, "left" | "right"> | undefined,
  // Re-target a ghost edge's internal endpoint onto its group's collapse stub
  // when that member was folded away (#1874). The regular edges in `allEdges`
  // were already remapped by `collapseGroups`; the ghost-edge lists on the
  // ViewSlice still reference original member ids, so without this they miss in
  // `layoutNodes` and fall back to the main container border. The caller passes
  // the identity map outside group-by-team collapse, so the ghost loops are
  // unaffected when nothing folds.
  remapGhostEndpoint: (id: string) => string,
  // Boundary-frame boxes for in-place-expanded containers (#1921), so a
  // service-level edge whose endpoint was expanded anchors on the frame border
  // instead of dropping.
  expandedFrames?: Map<string, { x: number; y: number; width: number; height: number }>,
): LayoutEdge[] {
  const layoutEdges: LayoutEdge[] = [];

  // Regular edges
  for (const edge of allEdges) {
    const le = computeEdgePoints(edge, layoutNodes, layers, sideExternals, expandedFrames);
    if (!le) continue;
    const edgeKey = `${edge.from}->${edge.to}#${edge.kind}`;
    const domainEdges = viewSlice.implicitEdgeDetails.get(edgeKey);
    if (domainEdges) {
      le.domainEdges = domainEdges;
    }
    layoutEdges.push(le);
  }

  // Ghost system edges (outgoing).
  // NOTE: if two members of one collapsed group ever carried a ghost edge to the
  // same external target, remapping both `from` onto the shared stub would emit
  // two overlapping connectors. `collapseGroups` de-dupes its re-targeted edges
  // by (from,to,kind); this ghost path does not. It is unreachable today (view
  // extraction only puts container ids on the internal endpoint), so de-dup is
  // deferred rather than risk dropping legitimately parallel ghost edges here.
  for (const edge of viewSlice.ghostSystemEdges) {
    const toNode = layoutNodes.get(edge.to);
    if (!toNode) continue;

    const fromId = remapGhostEndpoint(edge.from);
    let fromPoint: { x: number; y: number };
    const fromNode = layoutNodes.get(fromId);
    if (fromNode) {
      fromPoint = {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      };
    } else {
      const mainContainer = containers.find((c) => !c.ghost);
      if (!mainContainer) continue;
      fromPoint = {
        x: mainContainer.x + mainContainer.width,
        y: mainContainer.y + mainContainer.height / 2,
      };
    }

    const toPoint = {
      x: toNode.x,
      y: toNode.y + toNode.height / 2,
    };
    layoutEdges.push({
      from: fromId,
      to: edge.to,
      label: edge.label,
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  // Caller ghost system edges (incoming)
  for (const edge of viewSlice.callerGhostSystemEdges) {
    const fromNode = layoutNodes.get(edge.from);
    if (!fromNode) continue;

    const toId = remapGhostEndpoint(edge.to);
    const toNode = layoutNodes.get(toId);
    let toPoint: { x: number; y: number };
    if (toNode) {
      toPoint = { x: toNode.x, y: toNode.y + toNode.height / 2 };
    } else {
      const mainContainer = containers.find((c) => !c.ghost);
      if (!mainContainer) continue;
      toPoint = {
        x: mainContainer.x,
        y: mainContainer.y + mainContainer.height / 2,
      };
    }

    layoutEdges.push({
      from: edge.from,
      to: toId,
      label: edge.label,
      fromPoint: {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      },
      toPoint,
      ghost: true,
    });
  }

  // Ghost user edges
  for (const edge of viewSlice.ghostUserEdges) {
    const containerId = viewSlice.containerNode ? viewSlice.containerNode.id : "";
    const from = remapGhostEndpoint(edge.from);
    const to = remapGhostEndpoint(edge.to);
    const mainContainer = containers.find((c) => !c.ghost);
    const ghostNode = layoutNodes.get(from === containerId ? to : from);
    if (!ghostNode || !mainContainer) continue;

    const fromPoint = {
      x: ghostNode.x + ghostNode.width,
      y: ghostNode.y + ghostNode.height / 2,
    };
    const toPoint = {
      x: mainContainer.x,
      y: ghostNode.y + ghostNode.height / 2,
    };

    layoutEdges.push({
      from,
      to,
      label: edge.label,
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  // Ghost domain edges. A team can `owns` a domain (docs/spec), so a collapsed
  // domain endpoint must re-anchor to its stub like the service ones (#1874).
  pushGhostEdges(viewSlice.ghostDomainEdges, layoutNodes, layoutEdges, remapGhostEndpoint);

  // Ghost entity edges (entity view). Endpoints are pre-normalized in
  // extractEntityView: the foreign endpoint is the qualified `DomainId.EntityId`
  // key (matching the ghost node), the local endpoint is the bare entity id.
  pushGhostEdges(viewSlice.ghostEntityEdges, layoutNodes, layoutEdges, remapGhostEndpoint);

  return layoutEdges;
}

/**
 * Append muted (top/bottom-anchored) ghost edges to `layoutEdges`. Shared by the
 * ghost-domain and ghost-entity edge lists; both are laid out identically (a
 * short vertical connector between the main content and the ghost row below).
 * Endpoints missing from `layoutNodes` are skipped.
 */
function pushGhostEdges(
  edges: KrsEdge[],
  layoutNodes: Map<string, LayoutNode>,
  layoutEdges: LayoutEdge[],
  remapGhostEndpoint: (id: string) => string,
): void {
  for (const edge of edges) {
    const from = remapGhostEndpoint(edge.from);
    const to = remapGhostEndpoint(edge.to);
    const fromNode = layoutNodes.get(from);
    const toNode = layoutNodes.get(to);
    if (!fromNode || !toNode) continue;

    const fromIsAbove = fromNode.y + fromNode.height / 2 < toNode.y + toNode.height / 2;
    layoutEdges.push({
      from,
      to,
      label: edge.label,
      fromPoint: {
        x: fromNode.x + fromNode.width / 2,
        y: fromIsAbove ? fromNode.y + fromNode.height : fromNode.y,
      },
      toPoint: {
        x: toNode.x + toNode.width / 2,
        y: fromIsAbove ? toNode.y : toNode.y + toNode.height,
      },
      ghost: true,
    });
  }
}

function normalizeCoordinates(
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

function computeTotalDimensions(
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

const EXTERNAL_SIDE_GAP = 100;

/**
 * Place `[external]` service nodes (systemTier 4) into left/right side columns
 * instead of the bottom band, so `service → external` edges run horizontally
 * and stop weaving through the downward infra fan-out (#1728, refines
 * ADR-1724). Runs *before* edge computation so `computeEdgePoints`
 * re-picks side anchors from the new relative positions.
 *
 * Side assignment: the consuming-hub barycenter x (median split, ties → left)
 * keeps each hub's external fan on one side, which minimizes cross-hub
 * crossings. An author can override per node with the `column: left|right`
 * style hint. Overflow keeps stacking vertically on the side (no cap).
 *
 * Works for both single-system and multi-system root views: callers pass
 * the raw node list for the system being laid out and the ids of the
 * containers that should be widened to wrap the side columns.
 */
function placeExternalServicesOnSides(
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

  // Median of the auto-assigned (non-hinted) externals' hub barycenters.
  const autoVals = ext
    .filter((n) => {
      const col = layoutHints?.get(n.id)?.column;
      return col !== "left" && col !== "right";
    })
    .map((n) => hubX.get(n.id) ?? 0)
    .sort((a, b) => a - b);
  const median = autoVals.length ? autoVals[Math.floor((autoVals.length - 1) / 2)] : 0;
  const sideOf = (n: LayoutNode): "left" | "right" => {
    const col = layoutHints?.get(n.id)?.column;
    if (col === "left" || col === "right") return col;
    return (hubX.get(n.id) ?? 0) <= median ? "left" : "right";
  };

  const minX = Math.min(...others.map((n) => n.x));
  const maxX = Math.max(...others.map((n) => n.x + n.width));
  const topY = Math.min(...others.map((n) => n.y));
  const botY = Math.max(...others.map((n) => n.y + n.height));

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

/**
 * Optional render toggles for {@link layout}. Every field is optional; a bare
 * `layout(viewSlice)` lays out with defaults. Grouped as an object (rather than
 * trailing positionals) so new toggles append a named field instead of another
 * comma-counted slot — and so the two adjacent `ReadonlySet` params
 * (`collapsedCategories` / `collapsedGroups`) can't be slot-swapped. See #1875.
 */
interface LayoutOptions {
  ownerIndex?: Map<string, string>;
  /**
   * Team id → declared `label`, from `buildTeamLabelIndex`. Supplies the chip's
   * display string on every axis (the group-frame titles get theirs from
   * `groupLabels`, which only exists when grouping by team). Omitted → the chip
   * falls back to the team id (Issue #2157).
   */
  teamLabels?: ReadonlyMap<string, string>;
  /**
   * Declared-boundary axis (P2b): node id → every boundary it is declared in
   * (#2178). Selected as the grouping axis when `groupBy === "boundary"`;
   * `ownerIndex` remains the team badge source regardless of axis. The banded
   * layout places each node in its primary boundary (`primaryBoundaryOf`),
   * except where a boundary with no band of its own claims one of its shared
   * members (`resolvePlacementAxis`, #2176); the rest of the membership is
   * carried for the views that draw it (#2179).
   * See docs/design/boundary-membership-slice-a.md.
   */
  boundaryMembership?: Map<string, string[]>;
  /**
   * Membership from `boundary` blocks declared inside a node block (#2036),
   * keyed by declaring scope (see `boundaryScopeKey`). Only the entry for the
   * canvas being drawn applies, so a scoped boundary frames its own level and
   * nowhere else — unlike `boundaryMembership`, which is model-wide.
   */
  scopedBoundaryMembership?: Map<string, Map<string, string[]>>;
  /**
   * Every group id the model *declares* on the active axis, in declaration
   * order (`declaredGroupOrderOf` in group-labels.ts). Groups the axis map cannot
   * name — a boundary whose members are all claimed by an earlier one, or one
   * with no `contains` at all — would otherwise not exist for the band
   * machinery at all, because their order was derived from the axis map's
   * values (TPL-2161, #2178). Appended after the axis order, so the order of
   * groups that do have members is exactly what it was before.
   *
   * On the boundary axis this also drives the claim in `resolvePlacementAxis`
   * (#2176): a group named here but absent from the axis is one that may take a
   * shared member, so what changes is no longer only the order — which groups
   * end up with members can change too.
   */
  declaredGroupOrder?: readonly string[];
  /**
   * Node id → diff state in compare/diff mode, from `nodeDiffState` upstream.
   * Only the boundary axis reads it, and only to cut a `removed` node back to
   * its primary membership before placement (`placementMembership`, #2176): the
   * rest of its membership was backfilled purely so it could return to its
   * former frame (ADR-1886), and a node the model no longer has must not decide
   * where the live ones go.
   */
  nodeDiffState?: ReadonlyMap<string, string>;
  /**
   * Declared group labels for the active axis (#2133), from
   * `buildGroupLabelIndex`. Resolved per canvas via `groupLabelsFor`; scoped
   * entries are keyed by their scope-qualified group id (#2036), so the model
   * and scoped maps never contend. Titles the group frames; omitted → frames
   * fall back to the (display) group id.
   */
  groupLabels?: GroupLabelIndex;
  displayMode?: DisplayMode;
  layoutHints?: Map<string, ResolvedLayoutHints>;
  edgeDirections?: Map<string, EdgeDirection>;
  collapsedCategories?: ReadonlySet<CategoryId>;
  groupBy?: "team" | "boundary";
  collapsedGroups?: ReadonlySet<string>;
  /**
   * Per-edge diff state keyed `${from}->${to}` (compare/diff mode). Passed
   * through to `collapseGroups` so a collapsed team's re-targeted stub edges
   * keep their diff decoration, re-keyed onto the stub id (#1886).
   */
  edgeDiffState?: ReadonlyMap<string, string>;
}

/** Grouped-layer computation shared by {@link collapseAndAssignGroupLayers}. */
interface GroupedLayerBands {
  layers: Map<string, number>;
  groupBands: Map<string, GroupBand>;
  groupOrder: string[];
}

/**
 * Shared group-collapse + grouped-layer-assignment machinery for the
 * single-system (`layout()`) and multi-system (`layoutMultipleSystems()`)
 * "Group by" paths (#1858 P2a, #1884). Folds any collapsed group's members to
 * a `<Group> (N)` stub and re-targets its edges (`collapseGroups`), then
 * buckets the (possibly collapsed) nodes into group bands via
 * `assignGroupedLayers`.
 *
 * A pure computation only — it does not decide whether the collapse is
 * *committed* when band assignment fails to produce groups. The two callers
 * differ there (`layout()` always keeps the collapsed nodes/edges once this
 * runs; `layoutMultipleSystems()` only adopts them when `grouped` comes back
 * non-null), so that decision is left to each call site to preserve today's
 * behavior exactly.
 */
/**
 * The boundary membership that applies to the canvas being drawn (#2036).
 *
 * `boundaryMembership` is model-wide, so it applies everywhere; a scoped block is
 * declared on one canvas and applies only there. Where both name the same node
 * the scoped entry wins — it is the more specific statement, written next to
 * the node it names — and the top-level form keeps its reach untouched
 * everywhere else.
 *
 * Scoped entries carry a scope-qualified group id (`scopedBoundaryGroupId`):
 * a scoped boundary's identity is (declaring scope, id), so a same-named
 * boundary in another scope is a different group — separate frame container
 * id, independent collapse state. Top-level ids stay bare, keeping today's
 * one-declaration / collapse-everywhere behavior (#1884 precedent).
 *
 * `scopePath` is the chain of node ids from the root down to this canvas's
 * container, which is what the parser keys membership by.
 */
function boundaryAxisFor(
  scopePath: readonly string[],
  boundaryMembership: Map<string, string[]> | undefined,
  scopedBoundaryMembership: Map<string, Map<string, string[]>> | undefined,
): Map<string, string[]> | undefined {
  const scoped = scopedBoundaryMembership?.get(boundaryScopeKey(scopePath));
  if (scoped === undefined || scoped.size === 0) return boundaryMembership;
  const qualified = new Map<string, string[]>();
  for (const [nodeId, boundaryIds] of scoped) {
    qualified.set(
      nodeId,
      boundaryIds.map((boundaryId) => scopedBoundaryGroupId(scopePath, boundaryId)),
    );
  }
  if (boundaryMembership === undefined) return qualified;
  // Scoped *replaces* the node's membership on this canvas rather than adding
  // to it: it restates where the node sits here, and the top-level declaration
  // keeps its reach on every other canvas (ADR-2036). 1:N does not turn that
  // into a union — the two are different statements, not two halves of one.
  return new Map([...boundaryMembership, ...qualified]);
}

/**
 * The nodes a band-less boundary may claim on this canvas (#2176).
 *
 * The diff restores a `removed` node's whole before-side membership so it
 * returns to its former frame (ADR-1886). Returning it is *all* those entries
 * are for. Let them reach the #2176 machinery and a node the model no longer
 * has starts placing the ones it does: handing a band-less boundary a body,
 * pulling two live bands next to each other, or biasing a seam row — each of
 * them a frame or an order the equivalent after-only render never shows.
 *
 * So a removed node is cut back to its primary, which is the entry that returns
 * it. It keeps its frame; it stops deciding anyone else's.
 *
 * Reducing the *membership* rather than filtering the node set matters: the
 * node stays present for `resolvePlacementAxis`'s "does this group already hold
 * a member" count, which is exactly what a removed node still does inside its
 * former frame. Filtering it out of that count instead makes its group look
 * empty and lets a band-less boundary raid a group that was never at risk.
 *
 * Identity when nothing is removed — every non-diff render.
 */
function placementMembership(
  membership: Map<string, string[]> | undefined,
  nodeDiffState: ReadonlyMap<string, string> | undefined,
): Map<string, string[]> | undefined {
  if (membership === undefined || nodeDiffState === undefined) return membership;
  let reduced: Map<string, string[]> | undefined;
  for (const [nodeId, groupIds] of membership) {
    if (groupIds.length < 2 || nodeDiffState.get(nodeId) !== "removed") continue;
    reduced ??= new Map(membership);
    reduced.set(nodeId, [groupIds[0]]);
  }
  return reduced ?? membership;
}

/*
 * The 1:1 axis a banded layout places by — the single point where 1:N
 * membership meets the view's one-band-per-node requirement (TPL-2161) — now
 * lives in `resolvePlacementAxis` (group-layout.ts), which starts from the same
 * primary and only departs from it to give a bandless boundary a body (#2176).
 * Everything downstream — `collapseGroups`, the band assignment, the frames —
 * keeps taking a plain `Map<nodeId, groupId>`.
 */

function collapseAndAssignGroupLayers(
  nodes: readonly KrsNode[],
  edges: readonly KrsEdge[],
  groupIndex: Map<string, string>,
  collapsedGroups: ReadonlySet<string> | undefined,
  edgeDiffState: ReadonlyMap<string, string> | undefined,
  /** Namespaces collapse-stub ids (the enclosing system id); omitted in the single-system view. */
  stubScope: string | undefined,
  /**
   * Band order for `assignGroupedLayers`. The boundary axis resolves it
   * alongside the placement axis (`resolvePlacementAxis`, #2176); the team axis
   * passes the declared ids and lets {@link groupOrderFor} merge them.
   */
  bandOrder: readonly string[] | undefined,
  /**
   * Full declared membership on the boundary axis (#2178), which lets the band
   * order pull boundaries that share members together and the seam bias put a
   * shared node on the row that touches them (#2176). Omitted on the team axis,
   * which stays 1:1 — both terms then reduce to no-ops.
   */
  membership?: ReadonlyMap<string, readonly string[]>,
): {
  nodes: KrsNode[];
  edges: KrsEdge[];
  stubGroup: Map<string, string>;
  remapEndpoint: (id: string) => string;
  foldedEdgeDiffState: Map<string, string>;
  groupIdOf: (id: string) => string | null;
  grouped: GroupedLayerBands | null;
} {
  const collapsed = collapseGroups(
    nodes,
    edges,
    groupIndex,
    collapsedGroups,
    edgeDiffState,
    stubScope,
  );
  const groupIdOf = (id: string): string | null =>
    groupIndex.get(id) ?? collapsed.stubGroup.get(id) ?? null;
  let grouped: GroupedLayerBands | null = null;
  if (groupIndex.size > 0) {
    const groupedNodes: GroupedNode[] = collapsed.nodes.map((n) => {
      const groupId = groupIdOf(n.id);
      // A collapse stub stands in for one group and has no membership of its
      // own, so it never carries a share — `membership` is keyed by real node.
      const declared = membership?.get(n.id);
      return {
        id: n.id,
        groupId,
        ungroupedRank: systemTier(n),
        // The placement group leads, so `applySeamBias` reads the node's *other*
        // groups off the tail; a promoted member (#2176) is not in its own
        // declared list twice.
        ...(declared && groupId !== null
          ? { memberships: [groupId, ...declared.filter((g) => g !== groupId)] }
          : {}),
      };
    });
    // Group declaration order = first-appearance order in the axis map (the
    // parser inserts `owns` / `contains` in declaration order), so the
    // deterministic tie-break in `orderGroups` follows what the author wrote,
    // plus the declared groups the axis map cannot name (#2178). On the
    // boundary axis the caller already resolved it (#2176) so a claimed member
    // cannot reshuffle the stack.
    const result = assignGroupedLayers(
      groupedNodes,
      collapsed.edges.map((e) => ({ from: e.from, to: e.to })),
      membership !== undefined && bandOrder !== undefined
        ? [...bandOrder]
        : groupOrderFor(groupIndex, bandOrder),
    );
    if (result) {
      grouped = {
        layers: result.layers,
        groupBands: result.groupBands,
        groupOrder: result.groupOrder,
      };
    }
  }
  return {
    nodes: collapsed.nodes,
    edges: collapsed.edges,
    stubGroup: collapsed.stubGroup,
    remapEndpoint: collapsed.remapEndpoint,
    foldedEdgeDiffState: collapsed.foldedEdgeDiffState,
    groupIdOf,
    grouped,
  };
}

/**
 * A card's resolved owner: the team `id` the `data-team-button` navigates by,
 * and the `label` the chip shows (the id when the team declared no label).
 */
interface CardOwner {
  id: string;
  label: string;
}

/**
 * Resolves a node's owner, or `undefined` when its kind carries no owner chip.
 * Takes the lookup id separately from the kind because some canvases key their
 * node map by a qualified id (`SystemId.ServiceId`) while `ownerIndex` is
 * always keyed by the declared id.
 */
type OwnerResolver = (kind: string, id: string) => CardOwner | undefined;

/**
 * The single kind gate for the owner chip (Issue #2157). Every kind a team can
 * `owns` ({@link OWNABLE_KIND_SET}) shows one — before this, three inline
 * `service | domain` checks silently dropped a `client`'s owner even though
 * `ownerIndex` had it and the `Group by: team` frame used it.
 */
function makeOwnerResolver(
  ownerIndex?: Map<string, string>,
  teamLabels?: ReadonlyMap<string, string>,
): OwnerResolver {
  return (kind, id) => {
    if (!OWNABLE_KIND_SET.has(kind)) return undefined;
    const teamId = ownerIndex?.get(id);
    if (teamId === undefined) return undefined;
    return { id: teamId, label: teamLabels?.get(teamId) ?? teamId };
  };
}

export function layout(viewSlice: ViewSlice, options: LayoutOptions = {}): LayoutResult {
  const {
    ownerIndex,
    teamLabels,
    boundaryMembership,
    scopedBoundaryMembership,
    declaredGroupOrder,
    groupLabels,
    displayMode,
    layoutHints,
    edgeDirections,
    collapsedCategories,
    groupBy,
    collapsedGroups,
    edgeDiffState,
    nodeDiffState,
  } = options;
  // The canvas being drawn is the container plus its ancestors — for the root
  // system view that is the system itself (`containerNode` is set, with an empty
  // ancestor chain), which is the scope a top-level-looking `system X { boundary
  // … }` declares into.
  const scopePath =
    viewSlice.containerNode !== null
      ? [...viewSlice.ancestorChain.map((n) => n.id), viewSlice.containerNode.id]
      : [];
  const canvasMembership = placementMembership(
    groupBy === "boundary"
      ? boundaryAxisFor(scopePath, boundaryMembership, scopedBoundaryMembership)
      : undefined,
    nodeDiffState,
  );
  const ownerOf = makeOwnerResolver(ownerIndex, teamLabels);
  const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);
  // Build the inherited-annotations map from the focused container's subtree
  // (or all systems for the root view). Within a single drill-down view, IDs
  // are unique by construction, so this map can be safely keyed by id and
  // disambiguates the migration-coexistence scenario where the same `domain
  // Order` appears under multiple annotated services across the project.
  const inheritedAnnotations = buildInheritedAnnotations(
    viewSlice.containerNode ? [viewSlice.containerNode] : viewSlice.systems,
  );
  const effectiveAnnotations = (n: KrsNode): string[] =>
    n.annotations.length > 0 ? n.annotations : (inheritedAnnotations.get(n.id) ?? n.annotations);

  // Multi-system root view: lay out all systems side by side. The same path
  // also handles the single-system case when that system is the synthesized
  // "Unassigned" pseudo-system, so it still gets its own labeled frame
  // instead of rendering as a frameless peer list.
  const isUnassignedOnly =
    viewSlice.systems.length === 1 && viewSlice.systems[0].id === "__unassigned__";
  if (viewSlice.systems.length > 1 || isUnassignedOnly) {
    return layoutMultipleSystems(viewSlice, options);
  }

  // Category collapse (#1821): fold external/infra tiers to a `⊕ N` stub and
  // **re-target** their boundary-crossing edges onto the stub (so "who depends
  // on the external/infra layer" survives as aggregation trunks, not dropped).
  const collapsedCat = collapseCategories(
    viewSlice.childNodes,
    viewSlice.childEdges,
    collapsedCategories,
  );
  let allNodes = collapsedCat.nodes;
  let allEdges: KrsEdge[] = collapsedCat.edges;

  // The grouping axis (#1858 P2a = team, #1822 P2b = boundary). `ownerIndex`
  // stays the team-badge source on every card regardless of axis; only the
  // *grouping* logic below switches to `groupIndex`. Resolved after the category
  // collapse because a boundary with no band of its own claims one of its shared
  // members (#2176), and only the nodes still on the canvas can be claimed.
  const placement =
    canvasMembership !== undefined
      ? resolvePlacementAxis(
          canvasMembership,
          declaredGroupOrder,
          new Set(allNodes.map((n) => n.id)),
        )
      : undefined;
  const groupIndex = placement?.axis ?? (groupBy === "team" ? ownerIndex : undefined);

  // Per-group collapse (#1858 slice B): when a team is collapsed, fold its
  // members to a `<Team> (N)` stub and re-target cross-group edges onto it, so
  // "collapse all" yields the group-dependency-DAG view. Only meaningful in
  // group-by mode with an ownerIndex; a no-op otherwise. `stubGroup` tells the
  // grouping code which group a stub stands in for.
  let stubGroup = new Map<string, string>();
  // Ghost-edge lists on the ViewSlice are separate fields that neither collapse
  // pass rewrites (they only touch childNodes/childEdges), so re-anchor a
  // collapsed member's ghost connectors onto its stub with the *same* remap the
  // collapse applied to the regular edges (#1874). Category and group members
  // are disjoint, so composing the two remaps (category first, then group) is
  // order-independent in practice; identity outside collapse.
  let remapGhostEndpoint: (id: string) => string = collapsedCat.remapEndpoint;
  // Diff state re-keyed onto collapsed-group stub edges (#1886). Empty unless a
  // team collapses in compare/diff mode; merged into the render lookup below.
  let foldedEdgeDiffState = new Map<string, string>();
  // System-view grouping (#1858, P2a): when the viewer picks "Group by: team",
  // bucket nodes into their owning team instead of the kind tiers, stacking each
  // team as a dependency-ordered band that a boundary frame can enclose. Falls
  // back to the ungrouped layout when nothing is grouped (no org / no owns), so
  // this only ever changes output for a model that both opts in and has owners.
  let groupedLayers: Map<string, number> | null = null;
  let groupBands: Map<string, GroupBand> | null = null;
  let groupOrder: string[] = [];
  if (groupBy && groupIndex) {
    const collapsed = collapseAndAssignGroupLayers(
      allNodes,
      allEdges,
      groupIndex,
      collapsedGroups,
      edgeDiffState,
      undefined,
      placement?.groupOrder ?? declaredGroupOrder,
      canvasMembership,
    );
    allNodes = collapsed.nodes;
    allEdges = collapsed.edges;
    stubGroup = collapsed.stubGroup;
    const groupRemap = collapsed.remapEndpoint;
    remapGhostEndpoint = (id) => groupRemap(collapsedCat.remapEndpoint(id));
    foldedEdgeDiffState = collapsed.foldedEdgeDiffState;
    if (collapsed.grouped) {
      groupedLayers = collapsed.grouped.layers;
      groupBands = collapsed.grouped.groupBands;
      groupOrder = collapsed.grouped.groupOrder;
    }
  }
  /** Group a node belongs to — its team owner, or the group a collapse stub stands in for. */
  // In-place expansion (#1921): map each expanded container's spliced domain
  // members to their container id so the group-band machinery frames them.
  // Orthogonal to Group by: team (Phase 1 targets the ungrouped system view),
  // so it only ever engages when not grouping by team.
  const expandMembership = new Map<string, string>();
  if (!groupBy) {
    for (const frame of viewSlice.expandedFrames) {
      for (const memberId of frame.memberIds) expandMembership.set(memberId, frame.containerId);
    }
  }
  const isExpanding = expandMembership.size > 0;

  const groupIdOf = (id: string): string | null =>
    groupIndex?.get(id) ?? stubGroup.get(id) ?? expandMembership.get(id) ?? null;

  // Expansion groups *only* by the expanded container — never by team owner
  // (#1921). A model with `owns` populates `ownerIndex`, and the shared
  // `groupIdOf` prefers it, which would bucket the expanded domains into their
  // team and leave the expansion band empty (no frame). In ungrouped mode
  // (the only mode expansion runs in) teams do not form bands, so expansion
  // must use its own membership exclusively.
  const expandGroupIdOf = (id: string): string | null => expandMembership.get(id) ?? null;

  // In-place expansion band (#1921): reuse the two-level group layout so an
  // expanded container's domain children occupy a contiguous, framed band among
  // the collapsed sibling boxes. Runs only when not already grouping by team.
  if (isExpanding && !groupedLayers) {
    const groupedNodes: GroupedNode[] = allNodes.map((n) => ({
      id: n.id,
      groupId: expandGroupIdOf(n.id),
      ungroupedRank: systemTier(n),
    }));
    const expansionGroupOrder = viewSlice.expandedFrames.map((f) => f.containerId);
    const grouped = assignGroupedLayers(
      groupedNodes,
      allEdges.map((e) => ({ from: e.from, to: e.to })),
      expansionGroupOrder,
    );
    if (grouped) {
      groupedLayers = grouped.layers;
      groupBands = grouped.groupBands;
      groupOrder = grouped.groupOrder;
    }
  }

  if (
    allNodes.length === 0 &&
    viewSlice.ghostUsers.length === 0 &&
    viewSlice.ghostSystems.length === 0 &&
    viewSlice.callerGhostSystems.length === 0
  ) {
    // Empty container: still produce container rects
    const containers = buildContainersForEmpty(viewSlice);
    const outermost = containers.length > 0 ? containers[0] : null;
    return {
      nodes: new Map(),
      edges: [],
      containers,
      width: outermost ? outermost.x + outermost.width + CONTAINER_PADDING : 0,
      height: outermost ? outermost.y + outermost.height + CONTAINER_PADDING : 0,
    };
  }

  // Force kind-based layering (user → client → service) when this looks like
  // a system view (i.e. there is at least one user/client among the children).
  // Otherwise fall back to topological sort, which is what drill-down views
  // (services, domains) need to lay out their internal structure.
  //
  // Note: this single-system path doesn't currently apply a barycenter sort —
  // declaration order falls out of the Map iteration. If barycenter is added
  // here in the future, gate it on `forcedLayers === null` (Q11 of the design
  // doc requires declaration order within forced layers).
  const nodeIds = allNodes.map((n) => n.id);
  const forcedLayers = groupedLayers ?? assignForcedSystemLayers(allNodes, allEdges);
  let layers: Map<string, number>;
  if (forcedLayers) {
    layers = forcedLayers;
  } else {
    const { adj, inDegree } = buildGraph(nodeIds, allEdges, edgeDirections);
    layers = assignLayers(nodeIds, adj, inDegree);
  }
  if (edgeDirections) {
    layers = applyDirectionHintsToForcedLayers(layers, allEdges, edgeDirections);
  }

  // Position nodes inside the container area
  const layoutNodes = new Map<string, LayoutNode>();
  let childMaxWidth = 0;
  let childMaxHeight = 0;

  const nodesByLayer = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
    nodesByLayer.get(layer)!.push(id);
  }

  const nodeMap = new Map<string, KrsNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id, node);
  }

  const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

  // System view: bucket by column hint while preserving declaration order
  // within each bucket. The single-system path does not run a barycenter
  // pass (Q11 of the layout design doc), so the input order *is* the
  // declaration order, and bucketing is the only x-axis intervention.
  const orderedByLayer = new Map<number, string[]>();
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    const bucketed =
      forcedLayers !== null && layoutHints && layoutHints.size > 0
        ? bucketByColumn(
            nodesInLayer.map((id) => ({ id })),
            layoutHints,
          ).map((item) => item.id)
        : nodesInLayer;
    const ordered = applyEdgeDirectionWithinLayer(bucketed, allEdges, edgeDirections, layers);
    orderedByLayer.set(layerIdx, ordered);
  }

  // `grid-columns` hint lives on the focused container and governs how its
  // direct children wrap. Absent a hint, the column count auto-balances
  // (see `gridColumnCount`).
  const containerGridHint = viewSlice.containerNode
    ? layoutHints?.get(viewSlice.containerNode.id)?.gridColumns
    : undefined;

  // Compute initial positions (will be offset later for container nesting).
  // y is fixed per sub-row (max bottom of previously-placed rows) so
  // heterogeneous-height nodes share a top baseline. Without this,
  // `y = layerIdx * (dims.height + LAYER_GAP)` would push the *tallest*
  // node in a row down — a service with a team chip would dive below
  // its rowmate cylinders / clouds. Mirrors the multi-system path.
  //
  // Within each layer, many siblings wrap into a balanced grid
  // (`gridColumnCount` columns, or the author's `grid-columns`), bounded by
  // `MAX_LAYER_WIDTH`, so a wide sibling set does not sprawl into one
  // unreadable row that forces a zoom-out (scoped glance, resolution axis).
  // Group-by mode: reserve a vertical gap above each group's first row for its
  // boundary-frame title (keyed by the group's top layer). No-op when ungrouped.
  const groupStartLayer = new Map<number, string>();
  if (groupBands) {
    for (const [gid, band] of groupBands) groupStartLayer.set(band.min, gid);
  }

  let layerBaselineY = NODE_GAP;
  for (const layerIdx of sortedLayers) {
    if (groupStartLayer.has(layerIdx)) layerBaselineY += GROUP_FRAME_TITLE_GAP;
    const nodesInLayer = orderedByLayer.get(layerIdx)!;
    const dimsById = new Map<string, { width: number; height: number }>();
    for (const nid of nodesInLayer) {
      const krsNode = nodeMap.get(nid)!;
      dimsById.set(nid, measureNode(krsNode, ownerOf(krsNode.kind, nid), displayMode));
    }
    const columnCount = gridColumnCount(nodesInLayer.length, containerGridHint);
    const rows = wrapLayerIntoRows(
      nodesInLayer,
      (nid) => dimsById.get(nid)!.width,
      columnCount,
      MAX_LAYER_WIDTH,
      NODE_GAP,
    );

    let rowY = layerBaselineY;
    let layerBottom = layerBaselineY;
    for (const row of rows) {
      let xOffset = NODE_GAP;
      let rowMaxHeight = 0;
      for (const nid of row) {
        const krsNode = nodeMap.get(nid)!;
        const dims = dimsById.get(nid)!;

        layoutNodes.set(nid, {
          kind: krsNode.kind,
          tags: krsNode.tags,
          id: nid,
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          annotations: effectiveAnnotations(krsNode),
          properties: extractLayoutProperties(krsNode, ownerOf(krsNode.kind, nid)),
          descriptionSummary: krsNode.properties.description
            ? summarizeDescription(krsNode.properties.description)
            : undefined,
          linkCount: krsNode.properties.links.length,
          hasChildren: krsNode.children.length > 0,
          hasDescription: !!krsNode.properties.description,
          x: xOffset,
          y: rowY,
          width: dims.width,
          height: dims.height,
        });

        xOffset += dims.width + NODE_GAP;
        childMaxWidth = Math.max(childMaxWidth, xOffset);
        rowMaxHeight = Math.max(rowMaxHeight, dims.height);
      }
      layerBottom = rowY + rowMaxHeight;
      childMaxHeight = Math.max(childMaxHeight, layerBottom + NODE_GAP);
      rowY = layerBottom + NODE_GAP; // sub-row gap within the layer
    }
    layerBaselineY = layerBottom + LAYER_GAP;
  }

  // Center each sub-row within the container. Rows are grouped by their Y
  // (each wrapped grid row has a distinct baseline), then centered against
  // the widest row so the grid reads as centered columns.
  const rowGroups = new Map<number, string[]>();
  for (const [id, node] of layoutNodes) {
    if (!rowGroups.has(node.y)) rowGroups.set(node.y, []);
    rowGroups.get(node.y)!.push(id);
  }
  for (const ids of rowGroups.values()) {
    ids.sort((a, b) => layoutNodes.get(a)!.x - layoutNodes.get(b)!.x);
    const rowWidth = ids.reduce((sum, id) => {
      const n = layoutNodes.get(id)!;
      return sum + n.width + NODE_GAP;
    }, -NODE_GAP);
    const offset = Math.max(0, (childMaxWidth - rowWidth) / 2);

    let xOffset = offset;
    for (const id of ids) {
      const n = layoutNodes.get(id)!;
      n.x = xOffset;
      xOffset += n.width + NODE_GAP;
    }
  }

  // Build containers (innermost first: focused container, then ancestors)
  const hasContainer =
    viewSlice.ancestorChain.length > 0 || viewSlice.containerNode?.kind !== "system";

  // Calculate the offset needed for nesting
  const containerCount = viewSlice.ancestorChain.length + (hasContainer ? 1 : 0);
  const totalNestOffset =
    containerCount * GHOST_MARGIN + (hasContainer ? CONTAINER_LABEL_HEIGHT : 0);

  // Offset all child nodes for nesting
  if (totalNestOffset > 0) {
    for (const [, node] of layoutNodes) {
      node.x += totalNestOffset;
      node.y += totalNestOffset;
    }
    childMaxWidth += totalNestOffset;
    childMaxHeight += totalNestOffset;
  }

  // Build container rects
  const containers: ContainerRect[] = [];

  if (hasContainer && viewSlice.containerNode) {
    // Focused container wraps child nodes
    const containerX = totalNestOffset - CONTAINER_PADDING;
    const containerY = totalNestOffset - CONTAINER_LABEL_HEIGHT - CONTAINER_PADDING / 2;
    const containerW = childMaxWidth - totalNestOffset + CONTAINER_PADDING * 2;
    const containerH =
      childMaxHeight - totalNestOffset + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;
    containers.push({
      id: viewSlice.containerNode.id,
      label: viewSlice.containerNode.label ?? viewSlice.containerNode.id,
      x: containerX,
      y: containerY,
      width: Math.max(containerW, 200),
      height: Math.max(containerH, 100),
      ghost: false,
    });
  }

  // Ghost ancestor containers (inner to outer)
  for (let i = viewSlice.ancestorChain.length - 1; i >= 0; i--) {
    const ancestor = viewSlice.ancestorChain[i];
    const depth = viewSlice.ancestorChain.length - i; // 1 for immediate parent
    const margin = depth * GHOST_MARGIN;
    const innerContainer = containers.length > 0 ? containers[containers.length - 1] : null;

    let gx: number, gy: number, gw: number, gh: number;
    if (innerContainer) {
      gx = innerContainer.x - GHOST_MARGIN;
      gy = innerContainer.y - GHOST_MARGIN;
      gw = innerContainer.width + GHOST_MARGIN * 2;
      gh = innerContainer.height + GHOST_MARGIN * 2;
    } else {
      gx = margin;
      gy = margin;
      gw = childMaxWidth + CONTAINER_PADDING;
      gh = childMaxHeight + CONTAINER_PADDING;
    }

    containers.push({
      id: ancestor.id,
      label: ancestor.label ?? ancestor.id,
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      ghost: true,
    });
  }

  // Reverse so outermost is first
  containers.reverse();

  /** Memberships this canvas showed as a 縮退 tab rather than a frame (#2179). */
  let degradedMemberships: { nodeId: string; boundaryId: string }[] | undefined;

  // Group boundary frames (#1858, P2a): one dashed titled frame enclosing each
  // team's members (design § P1 measurement 1). Built from final node positions
  // via the shared helper the multi-system path also uses (#1884).
  if (groupBands && (groupIndex || isExpanding)) {
    const expandMeta = isExpanding
      ? (groupId: string) => {
          const frame = viewSlice.expandedFrames.find((f) => f.containerId === groupId);
          return frame
            ? { label: frame.label, expanded: true, nodeId: frame.containerId }
            : undefined;
        }
      : undefined;
    // Expansion frames enclose their own members (by container), not the team
    // buckets `groupIdOf` would report for an `owns` model (#1921).
    const frameGroupIdOf = isExpanding ? expandGroupIdOf : groupIdOf;
    // Expansion meta wins where it applies; otherwise the group's declared
    // label titles the frame (#2133), with the display-id fallback inside
    // buildGroupFrames covering label-less groups. Labels resolve against this
    // canvas's scope — scoped entries are keyed by their scope-qualified group
    // id (#2036), matching the ids boundaryAxisFor put on the axis.
    const canvasLabels = groupLabelsFor(groupLabels, scopePath);
    const frameMeta = (groupId: string) => {
      const meta = expandMeta?.(groupId);
      if (meta) return meta;
      const label = canvasLabels?.get(groupId);
      return label !== undefined ? { label } : undefined;
    };
    // Multi-containment (#2179) is a boundary-axis affordance: only there does a
    // node carry more than one group, and only there are overlapping frames the
    // intended reading. Team frames pass no `reach` and stay exactly as before.
    const hueIndexOf = boundaryHueIndexer(declaredGroupOrder, groupOrder);
    const reach: FrameReach | undefined =
      groupBy === "boundary" && canvasMembership && !isExpanding
        ? { membershipOf: (id) => canvasMembership.get(id) ?? [], hueIndexOf }
        : undefined;
    const { degraded } = buildGroupFrames(
      [...layoutNodes.values()],
      groupOrder,
      frameGroupIdOf,
      containers,
      frameMeta,
      reach,
    );
    markDegradedMemberships(
      degraded,
      layoutNodes,
      (groupId) => canvasLabels?.get(groupId) ?? displayGroupId(groupId),
      hueIndexOf,
    );
    if (degraded.length > 0) degradedMemberships = degraded;
  }

  // Place ghost nodes
  placeGhostUsers(viewSlice, layoutNodes, containers, effectiveAnnotations, displayMode);
  placeGhostDomains(viewSlice, layoutNodes, containers, effectiveAnnotations, displayMode);
  placeGhostEntities(viewSlice, layoutNodes, containers, effectiveAnnotations, displayMode);
  placeCallerGhostSystems(viewSlice, layoutNodes, containers, ownerOf, displayMode);
  placeOutgoingGhostSystems(viewSlice, layoutNodes, containers, ownerOf, displayMode);

  // Move [external] services to side columns before edges are computed, so
  // anchors re-pick sides from the new positions (#1728). Skipped in group-by
  // mode: externals belong to their group's frame (or the trailing un-grouped
  // band), and pulling them to the canvas sides would break that placement.
  const sideExternals = groupBands
    ? new Map<string, "left" | "right">()
    : placeExternalServicesOnSides(
        viewSlice.childNodes,
        new Set(viewSlice.systems.map((s) => s.id)),
        layoutNodes,
        containers,
        allEdges,
        layoutHints,
      );

  // Boundary-frame boxes for in-place-expanded containers, keyed by the expanded
  // service id, so a service-level edge whose endpoint was expanded anchors on
  // the frame border instead of dropping (#1921).
  const expandedFrameRects = isExpanding
    ? new Map(
        containers
          .filter((c) => c.expanded && c.nodeId !== undefined)
          .map((c) => [c.nodeId!, c] as const),
      )
    : undefined;
  // Give each expanded frame a layer (its band's top row) so `computeEdgePoints`
  // picks the correct vertical anchor for edges touching it — otherwise the
  // frame id is absent from `layers`, defaults to layer 0, and a top-tier→frame
  // edge is mis-routed as same-layer (#1921).
  if (isExpanding && groupBands) {
    for (const frame of viewSlice.expandedFrames) {
      const band = groupBands.get(frame.containerId);
      if (band) layers.set(frame.containerId, band.min);
    }
  }

  // Compute all edges (regular + ghost)
  const layoutEdges = computeLayoutEdges(
    viewSlice,
    layoutNodes,
    layers,
    containers,
    allEdges,
    sideExternals,
    remapGhostEndpoint,
    expandedFrameRects,
  );

  // Phase 3: distribute ports across each node side that hosts ≥ 2 edges,
  // so labels separate horizontally / vertically instead of stacking. Must
  // run before channel routing so the orthogonal pass uses the new ports.
  // See ADR-968 and Issue #996.
  distributePorts(layoutNodes, layoutEdges);

  // Orthogonal routing. In Group-by mode the two-level band layout adds group
  // frames a straight edge would pierce, which the skip-layer router does not
  // treat as obstacles; route through side gutters instead so no edge crosses a
  // node or frame interior (#1859, P2c-A). Ungrouped keeps the skip-layer
  // channel router unchanged, so "Group by: none" stays byte-identical.
  // See ADR-968 and docs/design/system-view-grouping.md § "P2c 実装設計".
  if (groupBands) {
    const groupFrames = containers.filter((c) => c.group);
    // In-place expansion (#1921/#1923) shares the group router: passing the
    // expanded frame rects lets a service-level edge anchor on the frame border
    // and detour around the *other* frames, while an edge to an interior domain
    // still enters its own frame. With multiple expansions this keeps every
    // frame's edges connected instead of piercing the neighbours.
    routeGroupedEdges(layoutNodes, layoutEdges, groupFrames, expandedFrameRects);
    // Merge edges sharing an infra/external target onto one trunk lane per
    // target so distinct targets' spines no longer overlap (#1859 P2c-B).
    // `expandedFrameRects` lets frame-anchored expansion edges trunk/fan-out too.
    aggregateGroupTrunks(layoutNodes, layoutEdges, groupFrames, expandedFrameRects);
    // Give the remaining non-trunked gutter corridors distinct lanes so two
    // single-incoming edges no longer share a collinear vertical segment (#1927).
    // Waypoint-based, so it already covers frame-anchored edges.
    distributeGutterLanes(layoutNodes, layoutEdges, groupFrames);
    // Fan out the anchors of edges leaving *or entering* one node/frame on the
    // same side, so their horizontal stubs no longer overlap into one line (#1927).
    fanOutGutterPorts(layoutNodes, layoutEdges, groupFrames, expandedFrameRects);
  } else {
    routeOrthogonalEdges(layoutNodes, layoutEdges);
  }

  // Phase 3: stagger horizontal segments that share an inter-row channel
  // across distinct lanes. No-op when each channel hosts ≤ 1 edge.
  distributeChannelLanes(layoutEdges);

  // Annotate parallel-edge bundles (edges sharing `(from, to)`) so the
  // renderer can slide labels along the edge instead of stacking them at
  // the midpoint. Also nudges ghost/cyclic edges perpendicular when they
  // land in a bundle, since `distributePorts` skipped those above.
  // See docs/design/parallel-edge-bundling.md and Issue #1185.
  markParallelBundles(layoutEdges);

  // Normalize coordinates and compute dimensions
  normalizeCoordinates(containers, layoutNodes, layoutEdges);
  const { width: totalWidth, height: totalHeight } = computeTotalDimensions(
    containers,
    layoutNodes,
    layoutEdges,
    displayMode,
  );

  // Crossing marks (#1859 P2c-C, extended to the ungrouped view in #1956). Derived
  // from final coordinates for every single-system layout, grouped or not — hop
  // arcs neutralise crossings ("not connected") so the default view's crossings
  // read unambiguously too. Junction dots stay grouped-only (the ungrouped view
  // has no aggregation trunks). See docs/design/system-view-grouping.md.
  const crossingMarks = computeCrossingMarks(layoutEdges);

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    containers,
    width: totalWidth,
    height: totalHeight,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    crossingMarks,
    degradedMemberships,
  };
}

/**
 * Lay out the visible services inside a ghost system and produce a container rect.
 * Nodes are keyed by the qualified ID "SystemId.ServiceId" to avoid collisions.
 */
function layoutGhostSystem(
  gs: GhostSystem,
  originX: number,
  originY: number,
  ownerOf: OwnerResolver,
  displayMode?: DisplayMode,
): { nodes: Map<string, LayoutNode>; containerRect: ContainerRect } {
  const { NODE_GAP } = getLayoutConstants(displayMode);
  const nodes = new Map<string, LayoutNode>();
  let maxW = 0;
  let maxH = 0;
  let y = originY + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;

  for (const svc of gs.visibleServices) {
    const owner = ownerOf(svc.kind, svc.id);
    const dims = measureNode(svc, owner, displayMode);
    const x = originX + CONTAINER_PADDING;
    const qualifiedId = `${gs.systemNode.id}.${svc.id}`;
    nodes.set(qualifiedId, {
      kind: svc.kind,
      tags: svc.tags,
      id: qualifiedId,
      label: svc.label ?? svc.id,
      annotations: svc.annotations,
      properties: extractLayoutProperties(svc, owner),
      descriptionSummary: svc.properties.description
        ? summarizeDescription(svc.properties.description)
        : undefined,
      linkCount: svc.properties.links.length,
      hasChildren: svc.children.length > 0,
      hasDescription: !!svc.properties.description,
      x,
      y,
      width: dims.width,
      height: dims.height,
      ghost: true,
    });
    maxW = Math.max(maxW, dims.width);
    maxH = y + dims.height + CONTAINER_PADDING - originY;
    y += dims.height + NODE_GAP / 2;
  }

  const containerW = Math.max(maxW + CONTAINER_PADDING * 2, 200);
  const containerH = Math.max(maxH, 100);

  const containerRect: ContainerRect = {
    id: gs.systemNode.id,
    label: gs.systemNode.label ?? gs.systemNode.id,
    x: originX,
    y: originY,
    width: containerW,
    height: containerH,
    ghost: true,
  };

  return { nodes, containerRect };
}

/**
 * Lay out multiple systems side by side for root view.
 * All systems are rendered as full (non-ghost) nodes.
 */
function layoutMultipleSystems(viewSlice: ViewSlice, options: LayoutOptions): LayoutResult {
  const {
    ownerIndex,
    teamLabels,
    boundaryMembership,
    scopedBoundaryMembership,
    declaredGroupOrder,
    groupLabels,
    displayMode,
    layoutHints,
    edgeDirections,
    collapsedCategories,
    groupBy,
    collapsedGroups,
    edgeDiffState,
    nodeDiffState,
  } = options;
  const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);
  // Grouping axis (team = ownerIndex, boundary = the primary of
  // boundaryMembership); `ownerIndex` stays the per-card team badge source
  // regardless of axis (mirrors layout()).
  const ownerOf = makeOwnerResolver(ownerIndex, teamLabels);
  // Each system frame is its own canvas, so a scoped boundary declared in
  // `system X { … }` applies inside X's frame and nowhere else (#2036). Resolved
  // per system in the loop below; the team axis stays model-wide.
  const membershipForSystem = (systemId: string): Map<string, string[]> | undefined =>
    placementMembership(
      groupBy === "boundary"
        ? boundaryAxisFor([systemId], boundaryMembership, scopedBoundaryMembership)
        : undefined,
      nodeDiffState,
    );
  // Multi-system view places only services (one nesting level), and a system's
  // annotations do not propagate to its services, so no inheritance is needed.
  const effectiveAnnotations = (n: KrsNode): string[] => n.annotations;
  const allLayoutNodes = new Map<string, LayoutNode>();
  const allContainers: ContainerRect[] = [];
  const allEdges: LayoutEdge[] = [];
  // Group-by-team (#1884): diff-state re-keyed onto collapsed-group stub edges,
  // accumulated across systems (empty unless a team collapses in diff mode).
  const foldedEdgeDiffState = new Map<string, string>();
  // Endpoint id → collapse-stub id, accumulated across systems, so cross-system
  // edges whose endpoint was folded into a collapsed team re-anchor onto the
  // stub instead of being dropped (#1884; mirrors the single-system ghost-edge
  // remap). Identity for un-collapsed endpoints.
  const crossSystemRemap = new Map<string, string>();
  /** 縮退 fallbacks across every system frame (#2179), in system order. */
  const allDegradedMemberships: { nodeId: string; boundaryId: string }[] = [];

  let offsetX = CONTAINER_PADDING;
  const offsetY = CONTAINER_PADDING;

  for (let si = 0; si < viewSlice.systems.length; si++) {
    const sys = viewSlice.systems[si];
    const isGhost = false;

    // Layout this system's children independently.
    // For the primary system (si === 0), use viewSlice.childNodes which includes
    // unassigned top-level domains merged in by extractView (legacy back-compat
    // for direct callers that pre-date the "Unassigned" pseudo-system).
    const rawNodes = collapseNodeList(
      si === 0 ? viewSlice.childNodes : sys.children,
      collapsedCategories,
    );

    // Group-by-team (#1884): apply the P2a grouping *inside this system's frame*
    // (per-(system, team) frames — a team that owns members in two systems shows
    // one frame in each; cross-system spanning frames stay out of scope, see
    // docs/design/system-view-grouping.md). Reuses the single-system machinery:
    // fold collapsed teams to `<Team> (N)` stubs, then band nodes by team via
    // `assignGroupedLayers`. Gated on group-by so ungrouped output is unchanged.
    let workNodes = rawNodes;
    let workEdges: KrsEdge[] = sys.edges;
    let groupedLayers: Map<string, number> | null = null;
    let groupBandsS: Map<string, GroupBand> | null = null;
    let groupOrderS: string[] = [];
    let groupIdOf: (id: string) => string | null = () => null;
    const systemMembership = membershipForSystem(sys.id);
    // Same per-canvas resolution as `layout()`: a boundary with no band of its
    // own claims one of the shared members present in *this* system (#2176).
    const systemPlacement =
      systemMembership !== undefined
        ? resolvePlacementAxis(
            systemMembership,
            declaredGroupOrder,
            new Set(rawNodes.map((n) => n.id)),
          )
        : undefined;
    const systemGroupIndex = systemPlacement?.axis ?? (groupBy === "team" ? ownerIndex : undefined);
    if (groupBy && systemGroupIndex && systemGroupIndex.size > 0) {
      // Scope stub ids by system id so a group owning members in ≥2 systems gets
      // a distinct `__group_collapsed_<sys>_<group>__` stub per system instead of
      // one colliding id that would overwrite in `allLayoutNodes` (#1884).
      const collapsed = collapseAndAssignGroupLayers(
        rawNodes,
        sys.edges,
        systemGroupIndex,
        collapsedGroups,
        edgeDiffState,
        sys.id,
        systemPlacement?.groupOrder ?? declaredGroupOrder,
        systemMembership,
      );
      if (collapsed.grouped) {
        workNodes = collapsed.nodes;
        workEdges = collapsed.edges;
        groupedLayers = collapsed.grouped.layers;
        groupBandsS = collapsed.grouped.groupBands;
        groupOrderS = collapsed.grouped.groupOrder;
        groupIdOf = collapsed.groupIdOf;
        for (const [k, v] of collapsed.foldedEdgeDiffState) foldedEdgeDiffState.set(k, v);
        // Record each folded member → stub so cross-system edges re-anchor onto
        // the stub instead of dropping (#1884). Only when a team actually
        // collapsed — `remapEndpoint` is identity otherwise.
        if (collapsedGroups && collapsedGroups.size > 0) {
          for (const n of rawNodes) {
            const mapped = collapsed.remapEndpoint(n.id);
            if (mapped !== n.id) crossSystemRemap.set(n.id, mapped);
          }
        }
      }
    }

    const nodeIds = workNodes.map((n) => n.id);
    const idSet = new Set(nodeIds);
    // Only include intra-system edges for layout ordering. In group-by mode the
    // team bands come from `assignGroupedLayers` (non-null `groupedLayers`) and
    // win over the kind-tier layering.
    const forcedLayers = groupedLayers ?? assignForcedSystemLayers(workNodes, workEdges);
    let layers: Map<string, number>;
    if (forcedLayers) {
      layers = forcedLayers;
    } else {
      const { adj, inDegree } = buildGraph(nodeIds, workEdges, edgeDirections);
      layers = assignLayers(nodeIds, adj, inDegree);
    }
    if (edgeDirections) {
      layers = applyDirectionHintsToForcedLayers(layers, workEdges, edgeDirections);
    }
    // Group bands start a new titled frame; reserve vertical room for the title.
    const groupStartLayer = new Map<number, string>();
    if (groupBandsS) {
      for (const [gid, band] of groupBandsS) groupStartLayer.set(band.min, gid);
    }

    const nodesByLayer = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer)!.push(id);
    }
    const nodeMap = new Map<string, KrsNode>();
    for (const node of workNodes) nodeMap.set(node.id, node);

    const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

    // Build predecessors map for barycenter heuristic
    const predecessorsMap = new Map<string, string[]>();
    for (const id of nodeIds) predecessorsMap.set(id, []);
    for (const edge of workEdges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        predecessorsMap.get(edge.to)!.push(edge.from);
      }
    }

    // Tracks the X-center of each placed node (used by barycenter sort for subsequent layers)
    const nodeCenterX = new Map<string, number>();

    const localNodes = new Map<string, LayoutNode>();
    let childMaxWidth = 0;
    let childMaxHeight = 0;

    // `grid-columns` on this system governs how its direct children wrap.
    const sysGridHint = layoutHints?.get(sys.id)?.gridColumns;

    for (let layerOrder = 0; layerOrder < sortedLayers.length; layerOrder++) {
      const layerIdx = sortedLayers[layerOrder];
      const rawLayer = nodesByLayer.get(layerIdx)!.map((id) => ({ id }));
      // Sort by barycenter for all layers after the first to minimize edge
      // crossings. Skip when the forced system layout is in effect — Q11 of
      // the design doc requires preserving declaration order within each layer.
      const innerSorted =
        forcedLayers !== null || layerOrder === 0
          ? rawLayer
          : sortByBarycenter(rawLayer, predecessorsMap, nodeCenterX);
      const bucketed =
        forcedLayers !== null && layoutHints && layoutHints.size > 0
          ? bucketByColumn(innerSorted, layoutHints)
          : innerSorted;
      const sortedLayer = applyEdgeDirectionWithinLayer(
        bucketed.map((item) => item.id),
        workEdges,
        edgeDirections,
        layers,
      ).map((id) => ({ id }));

      // Place nodes with sub-row wrapping. A new sub-row starts when either
      // the balanced-grid column count is reached or the layer width would
      // exceed MAX_LAYER_WIDTH (whichever comes first).
      const columnCount = gridColumnCount(sortedLayer.length, sysGridHint);
      let colInRow = 0;
      let currentX = NODE_GAP;
      let subRowY = layerOrder === 0 ? NODE_GAP : 0; // will be computed below
      let subRowMaxHeight = 0;

      // Compute the Y start for this layer based on the previous layer's bottom
      if (layerOrder > 0) {
        // Find the max Y + height among all nodes placed in earlier layers
        let prevBottom = 0;
        for (const [, n] of localNodes) {
          prevBottom = Math.max(prevBottom, n.y + n.height + LAYER_GAP);
        }
        subRowY = prevBottom;
      } else {
        subRowY = NODE_GAP;
      }
      // Reserve room above a group band's first layer for its frame title.
      if (groupStartLayer.has(layerIdx)) subRowY += GROUP_FRAME_TITLE_GAP;

      for (const item of sortedLayer) {
        const nid = item.id;
        const krsNode = nodeMap.get(nid)!;
        const owner = ownerOf(krsNode.kind, nid);
        const dims = measureNode(krsNode, owner, displayMode);

        // Wrap to a new sub-row at the column cap or when the node would
        // exceed MAX_LAYER_WIDTH.
        if (
          currentX > NODE_GAP &&
          (colInRow >= columnCount || currentX + dims.width > MAX_LAYER_WIDTH)
        ) {
          subRowY += subRowMaxHeight + NODE_GAP;
          currentX = NODE_GAP;
          subRowMaxHeight = 0;
          colInRow = 0;
        }

        localNodes.set(nid, {
          kind: krsNode.kind,
          tags: krsNode.tags,
          id: nid,
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          annotations: effectiveAnnotations(krsNode),
          properties: extractLayoutProperties(krsNode, owner),
          descriptionSummary: krsNode.properties.description
            ? summarizeDescription(krsNode.properties.description)
            : undefined,
          linkCount: krsNode.properties.links.length,
          hasChildren: krsNode.children.length > 0,
          hasDescription: !!krsNode.properties.description,
          x: currentX,
          y: subRowY,
          width: dims.width,
          height: dims.height,
          ghost: isGhost,
        });

        nodeCenterX.set(nid, currentX + dims.width / 2);
        subRowMaxHeight = Math.max(subRowMaxHeight, dims.height);
        currentX += dims.width + NODE_GAP;
        colInRow += 1;
        childMaxWidth = Math.max(childMaxWidth, currentX);
        childMaxHeight = Math.max(childMaxHeight, subRowY + dims.height + NODE_GAP);
      }
    }

    // Center each sub-row within the system
    // Group nodes by their Y coordinate (sub-row), then center each row
    const rowGroups = new Map<number, string[]>();
    for (const [id, node] of localNodes) {
      if (!rowGroups.has(node.y)) rowGroups.set(node.y, []);
      rowGroups.get(node.y)!.push(id);
    }
    for (const ids of rowGroups.values()) {
      const rowWidth = ids.reduce((sum, id) => {
        const n = localNodes.get(id)!;
        return sum + n.width + NODE_GAP;
      }, -NODE_GAP);
      const off = Math.max(0, (childMaxWidth - rowWidth) / 2);
      let xOff = off;
      // Sort by current x to maintain order when centering
      ids.sort((a, b) => localNodes.get(a)!.x - localNodes.get(b)!.x);
      for (const id of ids) {
        const n = localNodes.get(id)!;
        n.x = xOff;
        xOff += n.width + NODE_GAP;
      }
    }

    const containerW = Math.max(childMaxWidth + CONTAINER_PADDING, 200);
    const containerH = Math.max(childMaxHeight + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING, 100);

    const containerRect: ContainerRect = {
      id: sys.id,
      label: sys.label ?? sys.id,
      x: offsetX,
      y: offsetY,
      width: containerW,
      height: containerH,
      ghost: isGhost,
    };
    allContainers.push(containerRect);

    // Offset local nodes into global coordinate space
    for (const [id, node] of localNodes) {
      node.x += offsetX + CONTAINER_PADDING / 2;
      node.y += offsetY + CONTAINER_LABEL_HEIGHT;
      allLayoutNodes.set(id, node);
    }

    // Group boundary frames (#1884): one dashed titled frame per team, enclosing
    // that team's members *within this system's frame* (per-(system, team)),
    // via the shared helper the single-system path also uses. Built from final
    // (offset) node positions. A team that spans systems is framed once per
    // system, so two frames intentionally share the same `__group_<team>__`
    // container id (app collapse is keyed by team id → collapse-everywhere).
    if (groupBandsS) {
      // Labels resolve per system canvas ([sys.id]), matching the axis
      // resolution in boundaryAxisForSystem (#2133).
      const systemLabels = groupLabelsFor(groupLabels, [sys.id]);
      // Multi-containment per system frame (#2179): a boundary spans one system
      // here (cross-system frames are out of scope), so the reach is resolved
      // against this system's membership and this system's cards only.
      const hueIndexOf = boundaryHueIndexer(declaredGroupOrder, groupOrderS);
      const reach: FrameReach | undefined =
        groupBy === "boundary" && systemMembership
          ? { membershipOf: (id) => systemMembership.get(id) ?? [], hueIndexOf }
          : undefined;
      const { degraded } = buildGroupFrames(
        [...localNodes.values()],
        groupOrderS,
        groupIdOf,
        allContainers,
        (groupId) => {
          const label = systemLabels?.get(groupId);
          return label !== undefined ? { label } : undefined;
        },
        reach,
      );
      markDegradedMemberships(
        degraded,
        localNodes,
        (groupId) => systemLabels?.get(groupId) ?? displayGroupId(groupId),
        hueIndexOf,
      );
      allDegradedMemberships.push(...degraded);
    }

    // Move [external] services to side columns for this system (#1728). Skipped
    // in group-by mode: externals belong to their group's frame (or the trailing
    // un-grouped band), so pulling them to the canvas sides would break that
    // placement (mirrors the single-system path).
    const sideExternals = groupBandsS
      ? new Map<string, "left" | "right">()
      : placeExternalServicesOnSides(
          workNodes,
          new Set([sys.id]),
          allLayoutNodes,
          allContainers,
          sys.edges,
          layoutHints,
        );

    // Intra-system edges
    for (const edge of workEdges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        const le = computeEdgePoints(edge, allLayoutNodes, layers, sideExternals);
        if (le) {
          if (isGhost) le.ghost = true;
          allEdges.push(le);
        }
      }
    }

    // Use the container's final width (may have been widened by side columns).
    offsetX += containerRect.width + GHOST_MARGIN * 3;
  }

  // Cross-system edges. When a team is collapsed (#1884), an endpoint here may
  // have been folded into that team's stub — re-anchor onto the stub via
  // `crossSystemRemap` instead of silently dropping the edge (mirrors the
  // single-system ghost-edge remap; TPL-1738: a collapsed node's edges
  // must resolve both endpoints). De-dupe *only* re-targeted edges (one stub can
  // absorb several), so authored parallel cross-system edges between two
  // expanded nodes are untouched and the un-collapsed path stays byte-identical.
  const seenCrossStub = new Set<string>();
  for (const edge of viewSlice.crossSystemEdges) {
    const fromId = crossSystemRemap.get(edge.from) ?? edge.from;
    const dot = edge.to.indexOf(".");
    const toService = edge.to.slice(dot + 1);
    const toServiceRemapped = crossSystemRemap.get(toService) ?? toService;
    const retargeted = fromId !== edge.from || toServiceRemapped !== toService;
    const toField =
      toServiceRemapped !== toService ? edge.to.slice(0, dot + 1) + toServiceRemapped : edge.to;
    const fromNode = allLayoutNodes.get(fromId);
    const toNode = allLayoutNodes.get(toServiceRemapped);
    if (!fromNode || !toNode) continue;
    if (retargeted) {
      const key = `${fromId}->${toField}`;
      if (seenCrossStub.has(key)) continue;
      seenCrossStub.add(key);
    }
    allEdges.push({
      from: fromId,
      to: toField,
      // A re-targeted edge stands for one-or-more real edges, so drop its label.
      label: retargeted ? undefined : edge.label,
      fromPoint: {
        x: fromNode.x + fromNode.width,
        y: fromNode.y + fromNode.height / 2,
      },
      toPoint: {
        x: toNode.x,
        y: toNode.y + toNode.height / 2,
      },
    });
  }

  markParallelBundles(allEdges);

  // The first system's left side column (#1728) can extend to negative x;
  // shift everything back into the positive quadrant so it isn't clipped.
  // No-op when nothing went negative (the common case without side columns).
  normalizeCoordinates(allContainers, allLayoutNodes, allEdges);

  // Calculate total dimensions
  let totalWidth = 0;
  let totalHeight = 0;
  for (const c of allContainers) {
    totalWidth = Math.max(totalWidth, c.x + c.width + CONTAINER_PADDING);
    totalHeight = Math.max(totalHeight, c.y + c.height + CONTAINER_PADDING);
  }

  return {
    nodes: allLayoutNodes,
    edges: allEdges,
    containers: allContainers,
    width: totalWidth,
    height: totalHeight,
    foldedEdgeDiffState: foldedEdgeDiffState.size > 0 ? foldedEdgeDiffState : undefined,
    degradedMemberships: allDegradedMemberships.length > 0 ? allDegradedMemberships : undefined,
  };
}

function buildContainersForEmpty(viewSlice: ViewSlice): ContainerRect[] {
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

function computeEdgePoints(
  edge: KrsEdge,
  layoutNodes: Map<string, LayoutNode>,
  layers: Map<string, number>,
  sideExternals?: Map<string, "left" | "right">,
  /**
   * Boundary-frame boxes for containers expanded in place (#1921), keyed by the
   * expanded service id. An edge authored at the service level whose endpoint is
   * an expanded container has no node to anchor to (the service was replaced by
   * its domain children), so it anchors on the frame border here instead of
   * being silently dropped — mirroring the ghost-edge container fallback.
   */
  expandedFrames?: Map<string, { x: number; y: number; width: number; height: number }>,
): LayoutEdge | null {
  const fromNode = layoutNodes.get(edge.from) ?? expandedFrames?.get(edge.from);
  const toNode = layoutNodes.get(edge.to) ?? expandedFrames?.get(edge.to);
  if (!fromNode || !toNode) return null;

  const fromPoint = {
    x: fromNode.x + fromNode.width / 2,
    y: fromNode.y + fromNode.height,
  };
  const toPoint = {
    x: toNode.x + toNode.width / 2,
    y: toNode.y,
  };

  // Side-placed external endpoints (#1728): anchor on the external's *inner*
  // side so the connector runs horizontally and the arrowhead points inward —
  // a left-side external is entered from its right edge, a right-side external
  // from its left edge. The opposite endpoint anchors on the side that faces
  // the external. This overrides the layer-based vertical anchoring below
  // (external is still on a deeper tier index, which would otherwise pick a
  // top/bottom anchor).
  const toSide = sideExternals?.get(edge.to);
  const fromSide = sideExternals?.get(edge.from);
  if (toSide || fromSide) {
    // Set horizontal inner-side anchors and fall through to the shared return
    // below so any future LayoutEdge field is picked up in one place.
    if (toSide === "left") {
      toPoint.x = toNode.x + toNode.width;
      fromPoint.x = fromNode.x;
    } else if (toSide === "right") {
      toPoint.x = toNode.x;
      fromPoint.x = fromNode.x + fromNode.width;
    } else if (fromSide === "left") {
      fromPoint.x = fromNode.x + fromNode.width;
      toPoint.x = toNode.x;
    } else if (fromSide === "right") {
      fromPoint.x = fromNode.x;
      toPoint.x = toNode.x + toNode.width;
    }
    toPoint.y = toNode.y + toNode.height / 2;
    fromPoint.y = fromNode.y + fromNode.height / 2;
    // Skip layer-based adjustments below.
  } else {
    const fromLayer = layers.get(edge.from) ?? 0;
    const toLayer = layers.get(edge.to) ?? 0;
    if (fromLayer === toLayer) {
      // Same layer: horizontal edge
      if (fromNode.x < toNode.x) {
        fromPoint.x = fromNode.x + fromNode.width;
        fromPoint.y = fromNode.y + fromNode.height / 2;
        toPoint.x = toNode.x;
        toPoint.y = toNode.y + toNode.height / 2;
      } else {
        fromPoint.x = fromNode.x;
        fromPoint.y = fromNode.y + fromNode.height / 2;
        toPoint.x = toNode.x + toNode.width;
        toPoint.y = toNode.y + toNode.height / 2;
      }
    } else if (fromLayer > toLayer) {
      // Reverse edge
      fromPoint.y = fromNode.y;
      toPoint.y = toNode.y + toNode.height;
    }
  } // end of else branch (layer-based adjustments)

  return {
    from: edge.from,
    to: edge.to,
    label: edge.label,
    kind: edge.kind,
    fromPoint,
    toPoint,
    cyclic: edge.cyclic,
    ...(edge.canonicalId !== undefined ? { canonicalId: edge.canonicalId } : {}),
    ...(edge.syntheticLabel ? { syntheticLabel: true } : {}),
  };
}

/**
 * Bucket a system-view node into one of five ordered tiers.
 * Lower index → upper row group.
 *
 *   0: user       — actor at the top of the access path
 *   1: client     — user-facing surface (mobile / web / desktop / etc.)
 *   2: internal   — services we own (and any other non-infra logical kinds)
 *   3: infra      — owned data stores (database/queue/storage) the services read/write
 *   4: external   — services that run in *another system* (`[external]`)
 *
 * Splitting the former combined "dep" tier (#1724): infra sits directly under
 * the internal services it backs (most read/write edges are short), and
 * external systems form a separate row below. This roughly halves the widest
 * bottom row when a model has many of both.
 *
 * Boundary rule: infra kinds (database/queue/storage) are always *inside* the
 * system boundary, so they stay in the infra tier regardless of an `[external]`
 * tag — the kind check comes before the tag check. The external tier is only
 * for nodes that genuinely live in another system (e.g. `service [external]`).
 * A `database [external]` is a modeling contradiction (an in-boundary store
 * tagged as another boundary); we keep it on the infra row rather than promote
 * it. See ADR-1724 (docs/adr/1724-system-view-infra-external-tier-split.md).
 */
const SYSTEM_TIER_COUNT = 5;
function systemTier(node: KrsNode): 0 | 1 | 2 | 3 | 4 {
  if (node.kind === "user") return 0;
  if (node.kind === "client") return 1;
  if (INFRA_KIND_SET.has(node.kind)) return 3;
  if (node.tags.includes("external")) return 4;
  return 2;
}

/**
 * Force a kind-based layered placement for the system-view (Phase 6 of #823).
 *
 * Two-step layering:
 *   1. Bucket each node into one of five tiers (`systemTier`).
 *   2. Within each tier, run a fresh topological sort on the intra-tier
 *      edges to assign sub-rows. Cross-tier edges don't influence sub-rows
 *      (the tier order already pins them).
 *
 * Final row = (sum of tier heights of preceding tiers) + sub-row in own tier.
 * Empty tiers contribute zero height. So a system with `service A → B → C`
 * and a single `database D` yields A at row 0, B at row 1, C at row 2,
 * D at row 3 — the call chain flows top-to-bottom and the dep sits below.
 *
 * Returns `null` when no `user`, `client`, infra, or external node appears —
 * in that case there is no kind-based separation to enforce, so the caller
 * falls back to top-level topological layering. This keeps service drill-down
 * views (domains / usecases / resources) on the existing topo path.
 */
function assignForcedSystemLayers(nodes: KrsNode[], edges: KrsEdge[]): Map<string, number> | null {
  const occupied: boolean[] = new Array(SYSTEM_TIER_COUNT).fill(false);
  const byTier: KrsNode[][] = Array.from({ length: SYSTEM_TIER_COUNT }, () => []);
  for (const n of nodes) {
    const t = systemTier(n);
    occupied[t] = true;
    byTier[t].push(n);
  }

  // No system-view signal beyond plain internal services → let topo handle it.
  if (!occupied[0] && !occupied[1] && !occupied[3] && !occupied[4]) return null;

  // Per-tier sub-layer assignment via topological sort on intra-tier edges.
  const subLayers: Map<string, number>[] = byTier.map((tierNodes) => {
    if (tierNodes.length === 0) return new Map<string, number>();
    const ids = tierNodes.map((n) => n.id);
    const idSet = new Set(ids);
    const intraEdges = edges.filter((e) => idSet.has(e.from) && idSet.has(e.to));
    const { adj, inDegree } = buildGraph(ids, intraEdges);
    return assignLayers(ids, adj, inDegree);
  });

  // Tier base = cumulative height of preceding tiers (each tier contributes
  // (max sub-layer + 1) when occupied, 0 when empty).
  const tierBase: number[] = [];
  let acc = 0;
  for (let t = 0; t < SYSTEM_TIER_COUNT; t++) {
    tierBase.push(acc);
    if (occupied[t]) {
      let maxSub = 0;
      for (const n of byTier[t]) {
        maxSub = Math.max(maxSub, subLayers[t].get(n.id) ?? 0);
      }
      acc += maxSub + 1;
    }
  }

  const layers = new Map<string, number>();
  for (const n of nodes) {
    const t = systemTier(n);
    layers.set(n.id, tierBase[t] + (subLayers[t].get(n.id) ?? 0));
  }

  // Post-pass: mirror of the user pull-down for the infra tier (Issue #974).
  // An infra node used only by a service that sits above the deepest internal
  // service would otherwise be forced to the global bottom, with a long edge
  // cutting through several intermediate rows. Pull each infra node up to one
  // row below its deepest source. Strictly upward — never push a node down.
  // Infra with no incoming edges keeps the bottom-tier default.
  //
  // Iterate to a fixed point so that infra-on-infra chains propagate
  // regardless of `byTier[3]` order: when an upstream node gets pulled up,
  // its downstream consumers see the updated layer on the next pass.
  // Bounded by `byTier[3].length` iterations (each pass either pulls at
  // least one node up or terminates), so the cost stays linear.
  //
  // NB: this pull-up runs only on the infra tier (3), not on external (4).
  // External is the *upper* dep tier's sibling sitting strictly below it, so
  // pulling external up would let it collide with the infra row and undo the
  // infra/external split that narrows the diagram (#1724). External placement
  // is handled separately below.
  const infraIds = new Set(byTier[3].map((n) => n.id));
  const inByInfra = new Map<string, string[]>();
  for (const e of edges) {
    if (!infraIds.has(e.to)) continue;
    const list = inByInfra.get(e.to) ?? [];
    list.push(e.from);
    inByInfra.set(e.to, list);
  }
  for (let pass = 0; pass < byTier[3].length; pass++) {
    let changed = false;
    for (const d of byTier[3]) {
      const sources = inByInfra.get(d.id);
      if (!sources || sources.length === 0) continue;
      let maxSourceLayer = -Infinity;
      for (const sid of sources) {
        const sl = layers.get(sid);
        if (sl === undefined) continue;
        if (sl > maxSourceLayer) maxSourceLayer = sl;
      }
      if (!Number.isFinite(maxSourceLayer)) continue;
      const desired = maxSourceLayer + 1;
      const current = layers.get(d.id) ?? 0;
      if (desired < current) {
        layers.set(d.id, desired);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // External tier (4): place it as a fresh band strictly below every other
  // node (services, domains, and infra after their pull-up). Third-party SaaS
  // reads as the outermost dependency, and keeping it on its own bottom band
  // — rather than merged with infra — is what halves the widest row (#1724).
  // We intentionally do NOT pull external up toward shallow consumers: that
  // would reintroduce the infra/external overlap. The resulting skip-layer
  // edges to external are rescued by orthogonal routing (ADR-968).
  if (byTier[4].length > 0) {
    const externalIds = new Set(byTier[4].map((n) => n.id));
    let maxOtherLayer = 0;
    for (const [id, l] of layers) {
      if (externalIds.has(id)) continue;
      if (l > maxOtherLayer) maxOtherLayer = l;
    }
    const externalBase = maxOtherLayer + 1;
    for (const n of byTier[4]) {
      layers.set(n.id, externalBase + (subLayers[4].get(n.id) ?? 0));
    }
  }

  // Post-pass: an actor that bypasses the client tier (e.g. an admin that
  // connects directly to a backend service) would otherwise sit in the top
  // row and have its edge cut through any intermediate client card. Pull
  // each user whose outgoing edges all target a deeper row down to one row
  // above its closest target. Users with no outgoing edges keep the tier-0
  // placement.
  //
  // Runs last, after the infra pull-up and the external band, so a user
  // whose only target is an in-boundary node is pulled down correctly.
  // External services (tier 4) are intentionally excluded from this
  // calculation: when the ≥2-hub gate engages they move to side columns
  // at service-tier height, so pulling a user toward their former
  // bottom-band layer index would strand the user in an empty row with a
  // long diagonal edge to the side column.  A user that targets only
  // externals keeps the default tier-0 placement.
  const outByUser = new Map<string, string[]>();
  for (const e of edges) {
    const fromNode = nodes.find((n) => n.id === e.from);
    if (!fromNode || fromNode.kind !== "user") continue;
    const list = outByUser.get(e.from) ?? [];
    list.push(e.to);
    outByUser.set(e.from, list);
  }
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const u of byTier[0]) {
    const targets = outByUser.get(u.id);
    if (!targets || targets.length === 0) continue;
    let minTargetLayer = Infinity;
    for (const tid of targets) {
      const targetNode = nodeById.get(tid);
      if (targetNode && systemTier(targetNode) === 4) continue; // skip externals
      const tl = layers.get(tid);
      if (tl === undefined) continue;
      if (tl < minTargetLayer) minTargetLayer = tl;
    }
    if (!Number.isFinite(minTargetLayer)) continue;
    const desired = Math.max(0, minTargetLayer - 1);
    const current = layers.get(u.id) ?? 0;
    if (desired > current) layers.set(u.id, desired);
  }

  return layers;
}

function assignLayers(
  nodeIds: string[],
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
): Map<string, number> {
  const layers = new Map<string, number>();
  const queue: string[] = [];

  for (const id of nodeIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
      layers.set(id, 0);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLayer = layers.get(current)!;

    for (const next of adj.get(current) ?? []) {
      const newLayer = currentLayer + 1;
      if (!layers.has(next) || layers.get(next)! < newLayer) {
        layers.set(next, newLayer);
      }
      inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
      if (inDegree.get(next) === 0) {
        queue.push(next);
      }
    }
  }

  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  return layers;
}

const META_FONT_RATIO = 0.7;
const INFO_BUTTON_WIDTH = 24;

function extractLayoutProperties(node: KrsNode, owner?: CardOwner): LayoutNodeProperties {
  const props: LayoutNodeProperties = {
    description: node.properties.description,
    links: node.properties.links,
  };
  if (node.kind === "user") props.role = node.properties.role;
  if (owner) {
    props.team = owner.id;
    props.teamLabel = owner.label;
  }
  if (node.kind === "client" && node.properties.resources.length > 0) {
    props.resources = node.properties.resources;
  }
  if (node.kind === "client" && node.properties.capabilities.length > 0) {
    props.capabilities = node.properties.capabilities;
  }
  return props;
}

function measureNode(
  node: KrsNode,
  owner?: CardOwner,
  displayMode?: DisplayMode,
): { width: number; height: number } {
  if (displayMode === "icon") {
    return {
      width: ICON_CARD_WIDTH,
      height: node.properties.description ? ICON_CARD_HEIGHT_WITH_DESC : ICON_CARD_HEIGHT_NO_DESC,
    };
  }

  const labelWidth = estimateTextWidth(node.label ?? node.id, CHAR_WIDTH);
  const description = node.properties.description;
  const role = node.kind === "user" ? node.properties.role : undefined;
  const resources = node.kind === "client" ? node.properties.resources : [];
  const capabilities = node.kind === "client" ? node.properties.capabilities : [];

  // Description should not widen the box beyond label width
  const descWidth = 0;
  const roleWidth = role ? estimateTextWidth(role, CHAR_WIDTH * DESCRIPTION_FONT_RATIO) : 0;

  // Meta row: link count icon + team chip
  const hasMetaRow = node.properties.links.length > 0 || !!owner;
  let metaWidth = 0;
  if (hasMetaRow) {
    if (node.properties.links.length > 0)
      metaWidth += estimateTextWidth(
        `🔗${node.properties.links.length}`,
        CHAR_WIDTH * META_FONT_RATIO,
      );
    if (owner) {
      if (metaWidth > 0) metaWidth += CHAR_WIDTH; // spacing
      metaWidth += estimateTextWidth(
        `👥${teamChipText(owner.label)}`,
        CHAR_WIDTH * META_FONT_RATIO,
      );
    }
  }

  // Info button adds width for nodes with children and description
  const infoButtonExtra = node.children.length > 0 && description ? INFO_BUTTON_WIDTH : 0;

  // Resource badge (client-only): "📦 ×N" — one line regardless of count.
  const hasResourceBadge = resources.length > 0;
  const resourceBadgeWidth = hasResourceBadge
    ? estimateTextWidth(`📦 ×${resources.length}`, CHAR_WIDTH * META_FONT_RATIO)
    : 0;

  // Capability badge (client-only): "🔐 ×N" — same single-line pattern as resource.
  const hasCapabilityBadge = capabilities.length > 0;
  const capabilityBadgeWidth = hasCapabilityBadge
    ? estimateTextWidth(`🔐 ×${capabilities.length}`, CHAR_WIDTH * META_FONT_RATIO)
    : 0;

  const width =
    Math.max(
      labelWidth,
      descWidth,
      roleWidth,
      metaWidth,
      resourceBadgeWidth,
      capabilityBadgeWidth,
      80,
    ) +
    NODE_PADDING_X * 2 +
    infoButtonExtra;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (description) height += LINE_HEIGHT;
  if (role) height += LINE_HEIGHT;
  if (hasResourceBadge) height += LINE_HEIGHT;
  if (hasCapabilityBadge) height += LINE_HEIGHT;
  if (hasMetaRow) height += LINE_HEIGHT;

  return { width, height };
}
