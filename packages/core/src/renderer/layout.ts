import type {
  KrsNode,
  KrsEdge,
  LogicalNodeKind,
  DeployNodeKind,
  CommonProperties,
} from "../types/ast.js";
import type { ViewSlice, GhostSystem, DomainEdgeDetail } from "../view/view-extract.js";
import { buildInheritedAnnotations } from "../resolver/inherited-annotations.js";
import { summarizeDescription } from "./description-summary.js";
import { CHAR_WIDTH, NODE_PADDING_X, NODE_PADDING_Y } from "./rendering-constants.js";
import { sortByBarycenter } from "./layer-layout-logics.js";

export type LayoutNodeProperties = CommonProperties & {
  role?: string;
  team?: string;
};

export interface LayoutNode {
  kind: LogicalNodeKind | DeployNodeKind;
  id: string;
  label: string;
  annotations?: string[];
  properties: LayoutNodeProperties;
  descriptionSummary?: string;
  linkCount: number;
  hasChildren: boolean;
  hasDescription: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost?: boolean;
  /** Optional sub-label rendered below the main label (e.g., parent service name for ghost domains). */
  subLabel?: string;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  ghost?: boolean;
  cyclic?: boolean;
  /** Constituent domain edges for aggregated "N domain edges" implicit service edges. */
  domainEdges?: DomainEdgeDetail[];
}

export interface ContainerRect {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost: boolean;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  containers: ContainerRect[];
  width: number;
  height: number;
}

const LINE_HEIGHT = 18;
const LAYER_GAP = 120;
const NODE_GAP = 60;
const DESCRIPTION_FONT_RATIO = 0.85;
const CONTAINER_PADDING = 40;
const CONTAINER_LABEL_HEIGHT = 30;
const GHOST_MARGIN = 30;

// Icon-mode card dimensions (from design doc)
const MAX_LAYER_WIDTH = 1200; // wrap nodes to a new sub-row when a layer exceeds this width
const ICON_CARD_WIDTH = 160;
const ICON_CARD_HEIGHT_WITH_DESC = 100;
const ICON_CARD_HEIGHT_NO_DESC = 56;

export type DisplayMode = "shape" | "icon";

// ---------------------------------------------------------------------------
// Extracted helpers for layout decomposition
// ---------------------------------------------------------------------------

function buildGraph(
  nodeIds: string[],
  edges: KrsEdge[],
): { adj: Map<string, string[]>; inDegree: Map<string, number> } {
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    if (idSet.has(edge.from) && idSet.has(edge.to)) {
      adj.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }
  return { adj, inDegree };
}

function placeGhostUsers(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  effectiveAnnotations: (n: KrsNode) => string[],
  displayMode?: DisplayMode,
): void {
  if (viewSlice.ghostUsers.length === 0) return;

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
): { width: number; height: number } {
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
): LayoutResult {
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

  // Multi-system root view: lay out all systems side by side
  if (viewSlice.systems.length > 1) {
    return layoutMultipleSystems(viewSlice, ownerIndex, displayMode);
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

  // Layout child nodes using topological sort
  const nodeIds = allNodes.map((n) => n.id);
  const { adj, inDegree } = buildGraph(nodeIds, allEdges);
  const layers = assignLayers(nodeIds, adj, inDegree);

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

  // Compute initial positions (will be offset later for container nesting)
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    let xOffset = NODE_GAP;

    for (const nid of nodesInLayer) {
      const krsNode = nodeMap.get(nid)!;
      const resolvedTeam =
        krsNode.kind === "service" || krsNode.kind === "domain"
          ? (ownerIndex?.get(nid) ?? krsNode.properties.team)
          : undefined;
      const dims = measureNode(krsNode, resolvedTeam, displayMode);
      const y = layerIdx * (dims.height + LAYER_GAP) + NODE_GAP;

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
        y,
        width: dims.width,
        height: dims.height,
      });

      xOffset += dims.width + NODE_GAP;
      childMaxWidth = Math.max(childMaxWidth, xOffset);
      childMaxHeight = Math.max(childMaxHeight, y + dims.height + NODE_GAP);
    }
  }

  // Center each layer
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    const layerWidth = nodesInLayer.reduce((sum, id) => {
      const n = layoutNodes.get(id)!;
      return sum + n.width + NODE_GAP;
    }, -NODE_GAP);
    const offset = Math.max(0, (childMaxWidth - layerWidth) / 2);

    let xOffset = offset;
    for (const id of nodesInLayer) {
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

  // Normalize coordinates and compute dimensions
  normalizeCoordinates(containers, layoutNodes, layoutEdges);
  const { width: totalWidth, height: totalHeight } = computeTotalDimensions(containers, layoutNodes);

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
  const nodes = new Map<string, LayoutNode>();
  let maxW = 0;
  let maxH = 0;
  let y = originY + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;

  for (const svc of gs.visibleServices) {
    const svcTeam =
      svc.kind === "service" || svc.kind === "domain" ? svc.properties.team : undefined;
    const dims = measureNode(svc, ownerIndex?.get(svc.id) ?? svcTeam, displayMode);
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
): LayoutResult {
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
    // unassigned top-level domains merged in by extractView.
    const rawNodes = si === 0 ? viewSlice.childNodes : sys.children;
    const nodeIds = rawNodes.map((n) => n.id);
    const idSet = new Set(nodeIds);
    // Only include intra-system edges for layout ordering
    const { adj, inDegree } = buildGraph(nodeIds, sys.edges);
    const layers = assignLayers(nodeIds, adj, inDegree);

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

    for (let layerOrder = 0; layerOrder < sortedLayers.length; layerOrder++) {
      const layerIdx = sortedLayers[layerOrder];
      const rawLayer = nodesByLayer.get(layerIdx)!.map((id) => ({ id }));
      // Sort by barycenter for all layers after the first to minimize edge crossings
      const sortedLayer =
        layerOrder === 0 ? rawLayer : sortByBarycenter(rawLayer, predecessorsMap, nodeCenterX);

      // Place nodes with sub-row wrapping when layer width exceeds MAX_LAYER_WIDTH
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
            ? (ownerIndex?.get(nid) ?? krsNode.properties.team)
            : undefined;
        const dims = measureNode(krsNode, resolvedTeam, displayMode);

        // Wrap to a new sub-row when the node would exceed MAX_LAYER_WIDTH
        if (currentX > NODE_GAP && currentX + dims.width > MAX_LAYER_WIDTH) {
          subRowY += subRowMaxHeight + NODE_GAP;
          currentX = NODE_GAP;
          subRowMaxHeight = 0;
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
    fromPoint,
    toPoint,
    cyclic: edge.cyclic,
  };
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

  const width =
    Math.max(labelWidth, descWidth, roleWidth, metaWidth, 80) +
    NODE_PADDING_X * 2 +
    infoButtonExtra;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (description) height += LINE_HEIGHT;
  if (role) height += LINE_HEIGHT;
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
