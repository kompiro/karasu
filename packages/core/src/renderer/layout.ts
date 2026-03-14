import type { KrsNode, KrsEdge } from "../types/ast.js";

export interface LayoutNode {
  id: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  width: number;
  height: number;
}

const NODE_PADDING_X = 40;
const NODE_PADDING_Y = 24;
const CHAR_WIDTH = 9;
const LINE_HEIGHT = 18;
const LAYER_GAP = 120;
const NODE_GAP = 60;
const DESCRIPTION_FONT_RATIO = 0.85;

export function layout(systems: KrsNode[]): LayoutResult {
  const allNodes: KrsNode[] = [];
  const allEdges: KrsEdge[] = [];

  for (const system of systems) {
    collectNodesAndEdges(system, allNodes, allEdges);
  }

  if (allNodes.length === 0) {
    return { nodes: new Map(), edges: [], width: 0, height: 0 };
  }

  // Build adjacency for topological sort
  const nodeIds = allNodes.map((n) => n.id ?? n.label);
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

  // Assign layers via topological sort (BFS / Kahn's algorithm)
  const layers = assignLayers(nodeIds, adj, inDegree);

  // Position nodes
  const layoutNodes = new Map<string, LayoutNode>();
  let maxWidth = 0;
  let maxHeight = 0;

  const nodesByLayer = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!nodesByLayer.has(layer)) nodesByLayer.set(layer, []);
    nodesByLayer.get(layer)!.push(id);
  }

  const nodeMap = new Map<string, KrsNode>();
  for (const node of allNodes) {
    nodeMap.set(node.id ?? node.label, node);
  }

  const sortedLayers = Array.from(nodesByLayer.keys()).sort((a, b) => a - b);

  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    let xOffset = NODE_GAP;

    for (const nodeId of nodesInLayer) {
      const krsNode = nodeMap.get(nodeId)!;
      const dims = measureNode(krsNode);
      const y = layerIdx * (dims.height + LAYER_GAP) + NODE_GAP;

      layoutNodes.set(nodeId, {
        id: nodeId,
        label: krsNode.label,
        description: krsNode.description,
        x: xOffset,
        y,
        width: dims.width,
        height: dims.height,
      });

      xOffset += dims.width + NODE_GAP;
      maxWidth = Math.max(maxWidth, xOffset);
      maxHeight = Math.max(maxHeight, y + dims.height + NODE_GAP);
    }
  }

  // Center each layer
  for (const layerIdx of sortedLayers) {
    const nodesInLayer = nodesByLayer.get(layerIdx)!;
    const layerWidth = nodesInLayer.reduce((sum, id) => {
      const n = layoutNodes.get(id)!;
      return sum + n.width + NODE_GAP;
    }, -NODE_GAP);
    const offset = Math.max(0, (maxWidth - layerWidth) / 2);

    let xOffset = offset;
    for (const id of nodesInLayer) {
      const n = layoutNodes.get(id)!;
      n.x = xOffset;
      xOffset += n.width + NODE_GAP;
    }
  }

  // Compute edge connection points
  const layoutEdges: LayoutEdge[] = [];
  for (const edge of allEdges) {
    const fromNode = layoutNodes.get(edge.from);
    const toNode = layoutNodes.get(edge.to);
    if (!fromNode || !toNode) continue;

    const fromPoint = {
      x: fromNode.x + fromNode.width / 2,
      y: fromNode.y + fromNode.height,
    };
    const toPoint = {
      x: toNode.x + toNode.width / 2,
      y: toNode.y,
    };

    // If same layer, connect from side
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
      // Reverse: connect from top to bottom
      fromPoint.y = fromNode.y;
      toPoint.y = toNode.y + toNode.height;
    }

    layoutEdges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      fromPoint,
      toPoint,
    });
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxWidth,
    height: maxHeight,
  };
}

function collectNodesAndEdges(
  node: KrsNode,
  nodes: KrsNode[],
  edges: KrsEdge[]
): void {
  // Collect leaf-level renderable nodes (not the system container)
  if (node.kind !== "system") {
    nodes.push(node);
  }
  edges.push(...node.edges);
  for (const child of node.children) {
    collectNodesAndEdges(child, nodes, edges);
  }
}

function assignLayers(
  nodeIds: string[],
  adj: Map<string, string[]>,
  inDegree: Map<string, number>
): Map<string, number> {
  const layers = new Map<string, number>();
  const queue: string[] = [];

  // Start with nodes that have no incoming edges
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

  // Handle cycles: assign remaining to layer 0
  for (const id of nodeIds) {
    if (!layers.has(id)) {
      layers.set(id, 0);
    }
  }

  return layers;
}

function measureNode(node: KrsNode): { width: number; height: number } {
  const labelWidth = estimateTextWidth(node.label, CHAR_WIDTH);
  const descWidth = node.description
    ? estimateTextWidth(node.description, CHAR_WIDTH * DESCRIPTION_FONT_RATIO)
    : 0;

  const width = Math.max(labelWidth, descWidth, 80) + NODE_PADDING_X * 2;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (node.description) height += LINE_HEIGHT;

  return { width, height };
}

function estimateTextWidth(text: string, charWidth: number): number {
  // Rough estimate: CJK characters are ~1.5x width
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
