import type { DeployNode } from "../types/ast.js";
import type { LayoutResult, LayoutNode, ContainerRect, LayoutEdge } from "./layout.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import { CHAR_WIDTH, NODE_PADDING_X, NODE_PADDING_Y } from "./rendering-constants.js";
const LINE_HEIGHT = 18;
const NODE_GAP = 16;
const CONTAINER_GAP = 48;
const CONTAINER_PADDING_X = 20;
const CONTAINER_PADDING_TOP = 36; // room for container label
const CONTAINER_PADDING_BOTTOM = 20;
const OUTER_PADDING = 40;
const ROW_GAP = 64; // vertical gap between layers (larger than CONTAINER_GAP to leave room for edges)
const UNCLASSIFIED_LABEL = "Unclassified";

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (ch.charCodeAt(0) > 0x2e80) {
      width += CHAR_WIDTH * 1.5;
    } else {
      width += CHAR_WIDTH;
    }
  }
  return width;
}

function measureDeployUnit(unit: DeployNode): { width: number; height: number } {
  const labelWidth = estimateTextWidth(unit.label ?? unit.id);
  const width = Math.max(labelWidth, 80) + NODE_PADDING_X * 2;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (unit.properties.runtime) height += LINE_HEIGHT;
  return { width, height };
}

function measureContainerWidth(units: DeployNode[], label: string): number {
  const labelWidth = estimateTextWidth(label) + CONTAINER_PADDING_X * 2 + 24;
  const maxUnitWidth = Math.max(...units.map((u) => measureDeployUnit(u).width), 80);
  return Math.max(maxUnitWidth + CONTAINER_PADDING_X * 2, labelWidth);
}

function measureContainerHeight(units: DeployNode[]): number {
  const totalUnitHeight = units.reduce((sum, u) => sum + measureDeployUnit(u).height, 0);
  const gaps = Math.max(0, units.length - 1) * NODE_GAP;
  return CONTAINER_PADDING_TOP + totalUnitHeight + gaps + CONTAINER_PADDING_BOTTOM;
}

/**
 * Assigns a layer number to each container using Longest Path Layering (BFS).
 * Containers with no incoming edges are placed at layer 0.
 * Back edges (cycles) are detected and skipped to prevent infinite loops.
 * Returns a map from container id to layer number.
 */
function assignLayers(
  containerIds: string[],
  edges: Array<{ from: string; to: string }>,
): Map<string, number> {
  const layer = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();
  const containerSet = new Set(containerIds);

  for (const id of containerIds) {
    layer.set(id, 0);
    inDegree.set(id, 0);
    successors.set(id, []);
  }

  for (const edge of edges) {
    if (!containerSet.has(edge.from) || !containerSet.has(edge.to)) continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    successors.get(edge.from)!.push(edge.to);
  }

  // BFS from roots (in-degree = 0), updating layer to max(current, predecessor+1)
  const queue: string[] = [];
  for (const id of containerIds) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  }

  const processed = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (processed.has(node)) continue;
    processed.add(node);

    for (const successor of successors.get(node) ?? []) {
      const newLayer = (layer.get(node) ?? 0) + 1;
      if (newLayer > (layer.get(successor) ?? 0)) {
        layer.set(successor, newLayer);
      }
      const deg = (inDegree.get(successor) ?? 1) - 1;
      inDegree.set(successor, deg);
      if (deg === 0) queue.push(successor);
    }
  }

  return layer;
}

/**
 * Compute ghost edge connection points between two containers.
 * - Different layers (different Y): connect bottom-center → top-center (or top → bottom for reverse)
 * - Same layer (same Y): connect right/left edges at mid-height
 */
function ghostEdgePoints(
  from: ContainerRect,
  to: ContainerRect,
): { fromPoint: { x: number; y: number }; toPoint: { x: number; y: number } } {
  if (from.y < to.y) {
    return {
      fromPoint: { x: from.x + from.width / 2, y: from.y + from.height },
      toPoint: { x: to.x + to.width / 2, y: to.y },
    };
  } else if (from.y > to.y) {
    return {
      fromPoint: { x: from.x + from.width / 2, y: from.y },
      toPoint: { x: to.x + to.width / 2, y: to.y + to.height },
    };
  } else {
    if (from.x < to.x) {
      return {
        fromPoint: { x: from.x + from.width, y: from.y + from.height / 2 },
        toPoint: { x: to.x, y: to.y + to.height / 2 },
      };
    } else {
      return {
        fromPoint: { x: from.x, y: from.y + from.height / 2 },
        toPoint: { x: to.x + to.width, y: to.y + to.height / 2 },
      };
    }
  }
}

/**
 * Sort containers within a layer by barycenter heuristic to minimize edge crossings.
 *
 * For each container, the barycenter is the average X-center of its predecessors
 * in the previous layer (containers that already have a recorded center X position).
 * Containers with no predecessors in the previous layer get Infinity and are placed last,
 * preserving their relative insertion order (stable sort).
 */
function sortLayerByBarycenter<T extends { id: string }>(
  layerGroups: T[],
  predecessorsMap: Map<string, string[]>,
  containerCenterX: Map<string, number>,
): T[] {
  const barycenter = new Map<string, number>();
  for (const group of layerGroups) {
    const preds = (predecessorsMap.get(group.id) ?? []).filter((p) => containerCenterX.has(p));
    if (preds.length === 0) {
      barycenter.set(group.id, Infinity);
    } else {
      const avg = preds.reduce((sum, p) => sum + containerCenterX.get(p)!, 0) / preds.length;
      barycenter.set(group.id, avg);
    }
  }
  return [...layerGroups].sort((a, b) => barycenter.get(a.id)! - barycenter.get(b.id)!);
}

/**
 * Layout a deploy diagram using a layered DAG layout (Longest Path Layering).
 *
 * Containers are grouped into layers based on service dependency edges (ghost edges).
 * Within each layer containers are arranged horizontally; layers are stacked vertically.
 * Containers within each layer are sorted by the barycenter heuristic to minimize edge crossings.
 * Unclassified units (no realizes) are placed in a separate row at the bottom.
 */
export function layoutDeploy(slice: DeployViewSlice): LayoutResult {
  const layoutNodes = new Map<string, LayoutNode>();
  const containers: ContainerRect[] = [];

  type Group = { id: string; label: string; units: DeployNode[] };
  const classifiedGroups: Group[] = slice.containers.map((c) => ({
    id: c.serviceId,
    label: c.serviceLabel,
    units: c.units,
  }));

  const hasUnclassified = slice.unclassifiedUnits.length > 0;

  if (classifiedGroups.length === 0 && !hasUnclassified) {
    return { nodes: new Map(), edges: [], containers: [], width: 0, height: 0 };
  }

  // --- Layer assignment ---
  const classifiedIds = classifiedGroups.map((g) => g.id);
  const layerMap = assignLayers(classifiedIds, slice.ghostEdges);

  // Group containers by layer number
  const layerBuckets = new Map<number, Group[]>();
  for (const group of classifiedGroups) {
    const l = layerMap.get(group.id) ?? 0;
    if (!layerBuckets.has(l)) layerBuckets.set(l, []);
    layerBuckets.get(l)!.push(group);
  }

  const sortedLayerNums = [...layerBuckets.keys()].sort((a, b) => a - b);

  // Build predecessors map for barycenter heuristic:
  // predecessorsMap[containerId] = list of container ids that point TO this container
  const predecessorsMap = new Map<string, string[]>();
  for (const id of classifiedIds) {
    predecessorsMap.set(id, []);
  }
  for (const edge of slice.ghostEdges) {
    if (predecessorsMap.has(edge.to) && predecessorsMap.has(edge.from)) {
      predecessorsMap.get(edge.to)!.push(edge.from);
    }
  }

  // Tracks the X-center of each placed container (used by barycenter sort for subsequent layers)
  const containerCenterX = new Map<string, number>();

  // --- Place containers layer by layer ---
  let currentY = OUTER_PADDING;
  let totalWidth = 0;

  for (let layerOrder = 0; layerOrder < sortedLayerNums.length; layerOrder++) {
    const layerIdx = sortedLayerNums[layerOrder];
    // Sort by barycenter for all layers after the first
    const layerGroups =
      layerOrder === 0
        ? layerBuckets.get(layerIdx)!
        : sortLayerByBarycenter(layerBuckets.get(layerIdx)!, predecessorsMap, containerCenterX);
    let currentX = OUTER_PADDING;
    let maxLayerHeight = 0;

    for (const group of layerGroups) {
      const containerW = measureContainerWidth(group.units, group.label);
      const containerH = measureContainerHeight(group.units);

      containers.push({
        id: group.id,
        label: group.label,
        x: currentX,
        y: currentY,
        width: containerW,
        height: containerH,
        ghost: false,
      });

      let unitY = currentY + CONTAINER_PADDING_TOP;
      for (const unit of group.units) {
        const dims = measureDeployUnit(unit);
        // Key is "${containerId}::${unit.id}" so the same unit can appear in multiple
        // containers at different positions without overwriting its layout entry.
        layoutNodes.set(`${group.id}::${unit.id}`, {
          kind: unit.kind,
          id: unit.id,
          label: unit.label ?? unit.id,
          properties: {
            description: unit.properties.runtime,
            links: [],
          },
          descriptionSummary: undefined,
          linkCount: 0,
          hasChildren: false,
          hasDescription: !!unit.properties.runtime,
          x: currentX + CONTAINER_PADDING_X,
          y: unitY,
          width: dims.width,
          height: dims.height,
        });
        unitY += dims.height + NODE_GAP;
      }

      containerCenterX.set(group.id, currentX + containerW / 2);
      maxLayerHeight = Math.max(maxLayerHeight, containerH);
      currentX += containerW + CONTAINER_GAP;
    }

    totalWidth = Math.max(totalWidth, currentX - CONTAINER_GAP + OUTER_PADDING);
    currentY += maxLayerHeight + ROW_GAP;
  }

  // --- Unclassified units: bottom row ---
  if (hasUnclassified) {
    const containerW = measureContainerWidth(slice.unclassifiedUnits, UNCLASSIFIED_LABEL);
    const containerH = measureContainerHeight(slice.unclassifiedUnits);

    containers.push({
      id: "__unclassified__",
      label: UNCLASSIFIED_LABEL,
      x: OUTER_PADDING,
      y: currentY,
      width: containerW,
      height: containerH,
      ghost: false,
    });

    let unitY = currentY + CONTAINER_PADDING_TOP;
    for (const unit of slice.unclassifiedUnits) {
      const dims = measureDeployUnit(unit);
      layoutNodes.set(unit.id, {
        kind: unit.kind,
        id: unit.id,
        label: unit.label ?? unit.id,
        properties: {
          description: unit.properties.runtime,
          links: [],
        },
        descriptionSummary: undefined,
        linkCount: 0,
        hasChildren: false,
        hasDescription: !!unit.properties.runtime,
        x: OUTER_PADDING + CONTAINER_PADDING_X,
        y: unitY,
        width: dims.width,
        height: dims.height,
      });
      unitY += dims.height + NODE_GAP;
    }

    totalWidth = Math.max(totalWidth, OUTER_PADDING + containerW + OUTER_PADDING);
    currentY += containerH + OUTER_PADDING;
  } else {
    // Replace last ROW_GAP with OUTER_PADDING
    currentY = currentY - ROW_GAP + OUTER_PADDING;
  }

  // --- Ghost edges ---
  const containerById = new Map(containers.map((c) => [c.id, c]));
  const layoutEdges: LayoutEdge[] = [];

  for (const edge of slice.ghostEdges) {
    const fromContainer = containerById.get(edge.from);
    const toContainer = containerById.get(edge.to);
    if (!fromContainer || !toContainer) continue;

    const { fromPoint, toPoint } = ghostEdgePoints(fromContainer, toContainer);
    layoutEdges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    containers,
    width: totalWidth,
    height: currentY,
  };
}
