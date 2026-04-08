import type {
  KrsNode,
  KrsEdge,
  LogicalNodeKind,
  DeployNodeKind,
  CommonProperties,
} from "../types/ast.js";
import type { ViewSlice, GhostSystem } from "../view/view-extract.js";
import { summarizeDescription } from "./description-summary.js";
import { CHAR_WIDTH, NODE_PADDING_X, NODE_PADDING_Y } from "./rendering-constants.js";

export type LayoutNodeProperties = CommonProperties & {
  role?: string;
  team?: string;
};

export interface LayoutNode {
  kind: LogicalNodeKind | DeployNodeKind;
  id: string;
  label: string;
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
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  ghost?: boolean;
  cyclic?: boolean;
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
const ICON_CARD_WIDTH = 160;
const ICON_CARD_HEIGHT_WITH_DESC = 100;
const ICON_CARD_HEIGHT_NO_DESC = 56;

export type DisplayMode = "shape" | "icon";

export function layout(
  viewSlice: ViewSlice,
  ownerIndex?: Map<string, string>,
  displayMode?: DisplayMode,
): LayoutResult {
  // Multi-system root view: lay out all systems side by side
  if (viewSlice.systems.length > 1) {
    return layoutMultipleSystems(viewSlice, ownerIndex, displayMode);
  }

  const allNodes = viewSlice.childNodes;
  const allEdges = viewSlice.childEdges;

  if (allNodes.length === 0 && viewSlice.ghostUsers.length === 0) {
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
  const idSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    adj.set(id, []);
    inDegree.set(id, 0);
  }

  for (const edge of allEdges) {
    if (idSet.has(edge.from) && idSet.has(edge.to)) {
      adj.get(edge.from)!.push(edge.to);
      inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    }
  }

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

  // Ghost users: position to the left of the main container
  const ghostUserNodes: LayoutNode[] = [];
  if (viewSlice.ghostUsers.length > 0) {
    const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
    const userX = (mainContainer?.x ?? 0) - 20;
    let userY = (mainContainer?.y ?? 0) + CONTAINER_LABEL_HEIGHT + NODE_GAP;

    for (const userNode of viewSlice.ghostUsers) {
      const dims = measureNode(userNode, undefined, displayMode);
      const uid = userNode.id;
      const gNode: LayoutNode = {
        kind: userNode.kind,
        id: uid,
        label: userNode.label ?? userNode.id,
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

  // Ghost systems: position to the right of the outermost container
  if (viewSlice.ghostSystems.length > 0 && containers.length > 0) {
    const outermost = containers[0];
    const GHOST_SYSTEM_GAP = 80;
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

  // Compute edges
  const layoutEdges: LayoutEdge[] = [];
  for (const edge of allEdges) {
    const le = computeEdgePoints(edge, layoutNodes, layers);
    if (le) layoutEdges.push(le);
  }

  // Ghost system edges: from a primary node to a ghost service (qualified ID)
  for (const edge of viewSlice.ghostSystemEdges) {
    const fromNode = layoutNodes.get(edge.from);
    // Target is qualified (SystemId.ServiceId); use the full qualified key
    const toNode = layoutNodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromPoint = {
      x: fromNode.x + fromNode.width,
      y: fromNode.y + fromNode.height / 2,
    };
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

  // Ghost user edges
  for (const edge of viewSlice.ghostUserEdges) {
    const containerId = viewSlice.containerNode ? viewSlice.containerNode.id : "";
    // Ghost user edges connect to the container box, not a laid-out node
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

  // Normalize: shift everything so all coordinates are positive
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

  // Calculate total dimensions
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
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const id of nodeIds) {
      adj.set(id, []);
      inDegree.set(id, 0);
    }
    // Only include intra-system edges for layout ordering
    for (const edge of sys.edges) {
      if (idSet.has(edge.from) && idSet.has(edge.to)) {
        adj.get(edge.from)!.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
      }
    }
    const layers = assignLayers(nodeIds, adj, inDegree);

    const nodesByLayer = new Map<number, string[]>();
    for (const [id, layer] of layers) {
      if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
      nodesByLayer.get(layer)!.push(id);
    }
    const nodeMap = new Map<string, KrsNode>();
    for (const node of rawNodes) nodeMap.set(node.id, node);

    const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

    const localNodes = new Map<string, LayoutNode>();
    let childMaxWidth = 0;
    let childMaxHeight = 0;

    for (const layerIdx of sortedLayers) {
      const nodesInLayer = nodesByLayer.get(layerIdx)!;
      let xOff = NODE_GAP;
      for (const nid of nodesInLayer) {
        const krsNode = nodeMap.get(nid)!;
        const resolvedTeam =
          krsNode.kind === "service" || krsNode.kind === "domain"
            ? (ownerIndex?.get(nid) ?? krsNode.properties.team)
            : undefined;
        const dims = measureNode(krsNode, resolvedTeam, displayMode);
        const y = layerIdx * (dims.height + LAYER_GAP) + NODE_GAP;
        localNodes.set(nid, {
          kind: krsNode.kind,
          id: nid,
          label: viewSlice.resourceLabelMap.get(nid) ?? krsNode.label ?? krsNode.id,
          properties: extractLayoutProperties(krsNode, resolvedTeam),
          descriptionSummary: krsNode.properties.description
            ? summarizeDescription(krsNode.properties.description)
            : undefined,
          linkCount: krsNode.properties.links.length,
          hasChildren: krsNode.children.length > 0,
          hasDescription: !!krsNode.properties.description,
          x: xOff,
          y,
          width: dims.width,
          height: dims.height,
          ghost: isGhost,
        });
        xOff += dims.width + NODE_GAP;
        childMaxWidth = Math.max(childMaxWidth, xOff);
        childMaxHeight = Math.max(childMaxHeight, y + dims.height + NODE_GAP);
      }
    }

    // Center each layer within the system
    for (const layerIdx of sortedLayers) {
      const nodesInLayer = nodesByLayer.get(layerIdx)!;
      const layerWidth = nodesInLayer.reduce((sum, id) => {
        const n = localNodes.get(id)!;
        return sum + n.width + NODE_GAP;
      }, -NODE_GAP);
      const off = Math.max(0, (childMaxWidth - layerWidth) / 2);
      let xOff = off;
      for (const id of nodesInLayer) {
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
