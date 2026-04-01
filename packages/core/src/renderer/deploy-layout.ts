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
 * Layout a deploy diagram.
 * Containers are arranged horizontally; units within each container are stacked vertically.
 * Ghost edges connect container centers based on system-level edges.
 */
export function layoutDeploy(slice: DeployViewSlice): LayoutResult {
  const layoutNodes = new Map<string, LayoutNode>();
  const containers: ContainerRect[] = [];

  // Build a list of all groups (classified + unclassified)
  type Group = { id: string; label: string; units: DeployNode[] };
  const groups: Group[] = [
    ...slice.containers.map((c) => ({ id: c.serviceId, label: c.serviceLabel, units: c.units })),
  ];
  if (slice.unclassifiedUnits.length > 0) {
    groups.push({
      id: "__unclassified__",
      label: UNCLASSIFIED_LABEL,
      units: slice.unclassifiedUnits,
    });
  }

  if (groups.length === 0) {
    return { nodes: new Map(), edges: [], containers: [], width: 0, height: 0 };
  }

  let currentX = OUTER_PADDING;
  let maxHeight = 0;

  for (const group of groups) {
    const containerW = measureContainerWidth(group.units, group.label);
    const containerH = measureContainerHeight(group.units);
    const containerY = OUTER_PADDING;

    containers.push({
      id: group.id,
      label: group.label,
      x: currentX,
      y: containerY,
      width: containerW,
      height: containerH,
      ghost: false,
    });

    // Stack units vertically inside the container
    let unitY = containerY + CONTAINER_PADDING_TOP;
    for (const unit of group.units) {
      const dims = measureDeployUnit(unit);
      const unitX = currentX + CONTAINER_PADDING_X;

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
        x: unitX,
        y: unitY,
        width: dims.width,
        height: dims.height,
      });

      unitY += dims.height + NODE_GAP;
    }

    maxHeight = Math.max(maxHeight, containerH);
    currentX += containerW + CONTAINER_GAP;
  }

  // Ghost edges between service containers
  const containerById = new Map(containers.map((c) => [c.id, c]));
  const layoutEdges: LayoutEdge[] = [];
  for (const edge of slice.ghostEdges) {
    const fromContainer = containerById.get(edge.from);
    const toContainer = containerById.get(edge.to);
    if (!fromContainer || !toContainer) continue;

    // Connect right edge of from-container to left edge of to-container
    // (or vice versa depending on horizontal order)
    let fromPoint: { x: number; y: number };
    let toPoint: { x: number; y: number };
    const fromCenterY = fromContainer.y + fromContainer.height / 2;
    const toCenterY = toContainer.y + toContainer.height / 2;

    if (fromContainer.x < toContainer.x) {
      fromPoint = { x: fromContainer.x + fromContainer.width, y: fromCenterY };
      toPoint = { x: toContainer.x, y: toCenterY };
    } else {
      fromPoint = { x: fromContainer.x, y: fromCenterY };
      toPoint = { x: toContainer.x + toContainer.width, y: toCenterY };
    }

    layoutEdges.push({
      from: edge.from,
      to: edge.to,
      label: edge.label,
      fromPoint,
      toPoint,
      ghost: true,
    });
  }

  const totalWidth = currentX - CONTAINER_GAP + OUTER_PADDING;
  const totalHeight = OUTER_PADDING + maxHeight + OUTER_PADDING;

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    containers,
    width: totalWidth,
    height: totalHeight,
  };
}
