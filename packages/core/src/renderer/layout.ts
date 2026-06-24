import type { KrsNode, KrsEdge } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
import type { ViewSlice, GhostSystem } from "../view/view-extract.js";
import type { EdgeDirection, ResolvedLayoutHints } from "../types/style.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { summarizeDescription } from "./description-summary.js";
import { CHAR_WIDTH, NODE_PADDING_X, NODE_PADDING_Y } from "./rendering-constants.js";
import {
  sortByBarycenter,
  bucketByColumn,
  applyEdgeDirectionWithinLayer,
  gridColumnCount,
  wrapLayerIntoRows,
} from "./layer-layout-logics.js";
import { routeOrthogonalEdges } from "./edge-routing-channels.js";
import { distributePorts } from "./edge-routing-ports.js";
import { distributeChannelLanes } from "./edge-routing-lanes.js";
import { markParallelBundles } from "./edge-routing-bundles.js";
import type {
  LayoutNode,
  LayoutNodeProperties,
  LayoutEdge,
  ContainerRect,
  LayoutResult,
  DisplayMode,
} from "./layout-types.js";

export type { LayoutNode, LayoutEdge, LayoutResult, DisplayMode } from "./layout-types.js";

const LINE_HEIGHT = 18;
const DESCRIPTION_FONT_RATIO = 0.85;
const CONTAINER_PADDING = 40;
const CONTAINER_LABEL_HEIGHT = 30;
const GHOST_MARGIN = 30;

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

function placeGhostDomains(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode?: DisplayMode,
): void {
  const GHOST_DOMAIN_GAP = 60;
  if (viewSlice.ghostDomains.length === 0 || containers.length === 0) return;
  const { NODE_GAP } = getLayoutConstants(displayMode);

  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  const ghostY = mainContainer.y + mainContainer.height + GHOST_DOMAIN_GAP;
  let ghostX = mainContainer.x + CONTAINER_PADDING;

  for (const gd of viewSlice.ghostDomains) {
    const dims = measureNode(gd.node, undefined, displayMode);
    layoutNodes.set(gd.node.id, {
      kind: gd.node.kind,
      id: gd.node.id,
      label: gd.node.label ?? gd.node.id,
      annotations: effectiveAnnotations(gd.node),
      subLabel: gd.parentServiceLabel,
      properties: extractLayoutProperties(gd.node, undefined),
      descriptionSummary: gd.node.properties.description
        ? summarizeDescription(gd.node.properties.description)
        : undefined,
      linkCount: gd.node.properties.links.length,
      hasChildren: gd.node.children.length > 0,
      hasDescription: !!gd.node.properties.description,
      x: ghostX,
      y: ghostY,
      width: dims.width,
      height: dims.height,
      ghost: true,
    });
    ghostX += dims.width + NODE_GAP;
  }

  // Expand outermost container to include ghost domains (both height and width)
  const ghostDomainNodes = viewSlice.ghostDomains
    .map((gd) => layoutNodes.get(gd.node.id))
    .filter((n): n is LayoutNode => n !== undefined);
  if (ghostDomainNodes.length > 0) {
    const maxGhostY = Math.max(...ghostDomainNodes.map((n) => n.y + n.height)) + GHOST_MARGIN;
    const maxGhostX = Math.max(...ghostDomainNodes.map((n) => n.x + n.width)) + GHOST_MARGIN;
    const outermost = containers[0];
    if (maxGhostY > outermost.y + outermost.height) {
      outermost.height = maxGhostY - outermost.y;
    }
    if (maxGhostX > outermost.x + outermost.width) {
      outermost.width = maxGhostX - outermost.x;
    }
  }
}

function placeCallerGhostSystems(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ownerIndex?: Map<string, string>,
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
      ownerIndex,
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
  ownerIndex?: Map<string, string>,
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
      ownerIndex,
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
): LayoutEdge[] {
  const layoutEdges: LayoutEdge[] = [];

  // Regular edges
  for (const edge of allEdges) {
    const le = computeEdgePoints(edge, layoutNodes, layers);
    if (!le) continue;
    const edgeKey = `${edge.from}->${edge.to}#${edge.kind}`;
    const domainEdges = viewSlice.implicitEdgeDetails.get(edgeKey);
    if (domainEdges) {
      le.domainEdges = domainEdges;
    }
    layoutEdges.push(le);
  }

  // Ghost system edges (outgoing)
  for (const edge of viewSlice.ghostSystemEdges) {
    const toNode = layoutNodes.get(edge.to);
    if (!toNode) continue;

    let fromPoint: { x: number; y: number };
    const fromNode = layoutNodes.get(edge.from);
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
      from: edge.from,
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

    const toNode = layoutNodes.get(edge.to);
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
      to: edge.to,
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
    const mainContainer = containers.find((c) => !c.ghost);
    const ghostNode = layoutNodes.get(edge.from === containerId ? edge.to : edge.from);
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
      from: edge.from,
      to: edge.to,
      label: edge.label,
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  // Ghost domain edges
  for (const edge of viewSlice.ghostDomainEdges) {
    const fromNode = layoutNodes.get(edge.from);
    const toNode = layoutNodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromIsAbove = fromNode.y + fromNode.height / 2 < toNode.y + toNode.height / 2;
    layoutEdges.push({
      from: edge.from,
      to: edge.to,
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

  return layoutEdges;
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

  const shiftX = minX < CONTAINER_PADDING ? CONTAINER_PADDING - minX : 0;
  const shiftY = minY < CONTAINER_PADDING ? CONTAINER_PADDING - minY : 0;

  if (shiftX > 0 || shiftY > 0) {
    for (const c of containers) {
      c.x += shiftX;
      c.y += shiftY;
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
  return { width: totalWidth, height: totalHeight };
}

export function layout(
  viewSlice: ViewSlice,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
  layoutHints?: Map<string, ResolvedLayoutHints>,
  edgeDirections?: Map<string, EdgeDirection>,
): LayoutResult {
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
    return layoutMultipleSystems(viewSlice, ownerIndex, displayMode, layoutHints, edgeDirections);
  }

  const allNodes = viewSlice.childNodes;
  const allEdges = viewSlice.childEdges;

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
  const forcedLayers = assignForcedSystemLayers(allNodes, allEdges);
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
  let layerBaselineY = NODE_GAP;
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = orderedByLayer.get(layerIdx)!;
    const dimsById = new Map<string, { width: number; height: number }>();
    for (const nid of nodesInLayer) {
      const krsNode = nodeMap.get(nid)!;
      const resolvedTeam =
        krsNode.kind === "service" || krsNode.kind === "domain" ? ownerIndex?.get(nid) : undefined;
      dimsById.set(nid, measureNode(krsNode, resolvedTeam, displayMode));
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
        const resolvedTeam =
          krsNode.kind === "service" || krsNode.kind === "domain"
            ? ownerIndex?.get(nid)
            : undefined;
        const dims = dimsById.get(nid)!;

        layoutNodes.set(nid, {
          kind: krsNode.kind,
          id: nid,
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          annotations: effectiveAnnotations(krsNode),
          properties: extractLayoutProperties(krsNode, resolvedTeam),
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

  // Place ghost nodes
  placeGhostUsers(viewSlice, layoutNodes, containers, effectiveAnnotations, displayMode);
  placeGhostDomains(viewSlice, layoutNodes, containers, effectiveAnnotations, displayMode);
  placeCallerGhostSystems(viewSlice, layoutNodes, containers, ownerIndex, displayMode);
  placeOutgoingGhostSystems(viewSlice, layoutNodes, containers, ownerIndex, displayMode);

  // Compute all edges (regular + ghost)
  const layoutEdges = computeLayoutEdges(viewSlice, layoutNodes, layers, containers, allEdges);

  // Phase 3: distribute ports across each node side that hosts ≥ 2 edges,
  // so labels separate horizontally / vertically instead of stacking. Must
  // run before channel routing so the orthogonal pass uses the new ports.
  // See ADR-20260429-01 and Issue #996.
  distributePorts(layoutNodes, layoutEdges);

  // Phase 2: orthogonal channel routing for skip-layer edges that would
  // cross intermediate node cards. Sets `waypoints` only when needed.
  // See ADR-20260429-01.
  routeOrthogonalEdges(layoutNodes, layoutEdges);

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
    displayMode,
  );

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    containers,
    width: totalWidth,
    height: totalHeight,
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
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
): { nodes: Map<string, LayoutNode>; containerRect: ContainerRect } {
  const { NODE_GAP } = getLayoutConstants(displayMode);
  const nodes = new Map<string, LayoutNode>();
  let maxW = 0;
  let maxH = 0;
  let y = originY + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;

  for (const svc of gs.visibleServices) {
    const dims = measureNode(svc, ownerIndex?.get(svc.id), displayMode);
    const x = originX + CONTAINER_PADDING;
    const qualifiedId = `${gs.systemNode.id}.${svc.id}`;
    nodes.set(qualifiedId, {
      kind: svc.kind,
      id: qualifiedId,
      label: svc.label ?? svc.id,
      annotations: svc.annotations,
      properties: extractLayoutProperties(svc, ownerIndex?.get(svc.id)),
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
function layoutMultipleSystems(
  viewSlice: ViewSlice,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
  layoutHints?: Map<string, ResolvedLayoutHints>,
  edgeDirections?: Map<string, EdgeDirection>,
): LayoutResult {
  const { LAYER_GAP, NODE_GAP, MAX_LAYER_WIDTH } = getLayoutConstants(displayMode);
  // Multi-system view places only services (one nesting level), and a system's
  // annotations do not propagate to its services, so no inheritance is needed.
  const effectiveAnnotations = (n: KrsNode): string[] => n.annotations;
  const allLayoutNodes = new Map<string, LayoutNode>();
  const allContainers: ContainerRect[] = [];
  const allEdges: LayoutEdge[] = [];

  let offsetX = CONTAINER_PADDING;
  const offsetY = CONTAINER_PADDING;

  for (let si = 0; si < viewSlice.systems.length; si++) {
    const sys = viewSlice.systems[si];
    const isGhost = false;

    // Layout this system's children independently.
    // For the primary system (si === 0), use viewSlice.childNodes which includes
    // unassigned top-level domains merged in by extractView (legacy back-compat
    // for direct callers that pre-date the "Unassigned" pseudo-system).
    const rawNodes = si === 0 ? viewSlice.childNodes : sys.children;
    const nodeIds = rawNodes.map((n) => n.id);
    const idSet = new Set(nodeIds);
    // Only include intra-system edges for layout ordering
    const forcedLayers = assignForcedSystemLayers(rawNodes, sys.edges);
    let layers: Map<string, number>;
    if (forcedLayers) {
      layers = forcedLayers;
    } else {
      const { adj, inDegree } = buildGraph(nodeIds, sys.edges, edgeDirections);
      layers = assignLayers(nodeIds, adj, inDegree);
    }
    if (edgeDirections) {
      layers = applyDirectionHintsToForcedLayers(layers, sys.edges, edgeDirections);
    }

    const nodesByLayer = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer)!.push(id);
    }
    const nodeMap = new Map<string, KrsNode>();
    for (const node of rawNodes) nodeMap.set(node.id, node);

    const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

    // Build predecessors map for barycenter heuristic
    const predecessorsMap = new Map<string, string[]>();
    for (const id of nodeIds) predecessorsMap.set(id, []);
    for (const edge of sys.edges) {
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
        sys.edges,
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

      for (const item of sortedLayer) {
        const nid = item.id;
        const krsNode = nodeMap.get(nid)!;
        const resolvedTeam =
          krsNode.kind === "service" || krsNode.kind === "domain"
            ? ownerIndex?.get(nid)
            : undefined;
        const dims = measureNode(krsNode, resolvedTeam, displayMode);

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
          id: nid,
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          annotations: effectiveAnnotations(krsNode),
          properties: extractLayoutProperties(krsNode, resolvedTeam),
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

    // Intra-system edges
    for (const edge of sys.edges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        const le = computeEdgePoints(edge, allLayoutNodes, layers);
        if (le) {
          if (isGhost) le.ghost = true;
          allEdges.push(le);
        }
      }
    }

    offsetX += containerW + GHOST_MARGIN * 3;
  }

  // Cross-system edges
  for (const edge of viewSlice.crossSystemEdges) {
    const fromNode = allLayoutNodes.get(edge.from);
    const toNode = allLayoutNodes.get(edge.to.slice(edge.to.indexOf(".") + 1));
    if (!fromNode || !toNode) continue;
    allEdges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
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
): LayoutEdge | null {
  const fromNode = layoutNodes.get(edge.from);
  const toNode = layoutNodes.get(edge.to);
  if (!fromNode || !toNode) return null;

  const fromPoint = {
    x: fromNode.x + fromNode.width / 2,
    y: fromNode.y + fromNode.height,
  };
  const toPoint = {
    x: toNode.x + toNode.width / 2,
    y: toNode.y,
  };

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
 * it. See ADR-20260623-06 (docs/adr/20260623-06-system-view-infra-external-tier-split.md).
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
  // edges to external are rescued by orthogonal routing (ADR-20260429-01).
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
  // whose only target is an external node is pulled down relative to that
  // node's *final* bottom-band row — not its provisional pre-band row, which
  // would leave the actor floating several rows above its sole target.
  const outByUser = new Map<string, string[]>();
  for (const e of edges) {
    const fromNode = nodes.find((n) => n.id === e.from);
    if (!fromNode || fromNode.kind !== "user") continue;
    const list = outByUser.get(e.from) ?? [];
    list.push(e.to);
    outByUser.set(e.from, list);
  }
  for (const u of byTier[0]) {
    const targets = outByUser.get(u.id);
    if (!targets || targets.length === 0) continue;
    let minTargetLayer = Infinity;
    for (const tid of targets) {
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

function extractLayoutProperties(node: KrsNode, resolvedTeam?: string): LayoutNodeProperties {
  const props: LayoutNodeProperties = {
    description: node.properties.description,
    links: node.properties.links,
  };
  if (node.kind === "user") props.role = node.properties.role;
  if (node.kind === "service" || node.kind === "domain") props.team = resolvedTeam;
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
  resolvedTeam?: string,
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
  const team = node.kind === "service" || node.kind === "domain" ? resolvedTeam : undefined;
  const resources = node.kind === "client" ? node.properties.resources : [];
  const capabilities = node.kind === "client" ? node.properties.capabilities : [];

  // Description should not widen the box beyond label width
  const descWidth = 0;
  const roleWidth = role ? estimateTextWidth(role, CHAR_WIDTH * DESCRIPTION_FONT_RATIO) : 0;

  // Meta row: link count icon + team name
  const hasMetaRow = node.properties.links.length > 0 || !!team;
  let metaWidth = 0;
  if (hasMetaRow) {
    if (node.properties.links.length > 0)
      metaWidth += estimateTextWidth(
        `🔗${node.properties.links.length}`,
        CHAR_WIDTH * META_FONT_RATIO,
      );
    if (team) {
      if (metaWidth > 0) metaWidth += CHAR_WIDTH; // spacing
      const teamDisplay = [...team].length > 15 ? [...team].slice(0, 15).join("") + "…" : team;
      metaWidth += estimateTextWidth(`👥${teamDisplay}`, CHAR_WIDTH * META_FONT_RATIO);
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

function estimateTextWidth(text: string, charWidth: number): number {
  let width = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) {
      width += charWidth * 1.5;
    } else {
      width += charWidth;
    }
  }
  return width;
}
