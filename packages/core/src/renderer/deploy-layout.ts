import type { DeployNode } from "../types/ast.js";
import type { LayoutResult, LayoutNode, ContainerRect, LayoutEdge } from "./layout-types.js";
import type { DeployViewSlice } from "../view/deploy-view-extract.js";
import {
  CHAR_WIDTH,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  LINE_HEIGHT,
  DESCRIPTION_FONT_RATIO,
  DESC_MAX_CONTENT_WIDTH,
  DESC_MAX_LINES,
  estimateTextWidth,
} from "./rendering-constants.js";
import { wrapToWidth } from "./svg-builder.js";
import {
  sortByBarycenter,
  gridColumnCount,
  wrapLayerIntoRows,
  GRID_COLUMN_CAP,
} from "./layer-layout-logics.js";
import { relaxedColumnCap, searchWidthBudget } from "./aspect-search.js";
const NODE_GAP = 16;
const CONTAINER_GAP = 48;
const CONTAINER_PADDING_X = 20;
const CONTAINER_PADDING_TOP = 36; // room for container label
const CONTAINER_PADDING_BOTTOM = 20;
const OUTER_PADDING = 40;
const ROW_GAP = 64; // vertical gap between layers (larger than CONTAINER_GAP to leave room for edges)
const MAX_LAYER_WIDTH = 1200; // wrap containers to a new sub-row when a layer exceeds this width
// English fallbacks for the synthetic container captions. Callers pass localized
// strings via `DeployBandLabels` (the app's EmptyStateLabels pass-through, per
// docs/spec/i18n.md); these apply only when no label is supplied (CLI/tests).
const UNCLASSIFIED_LABEL = "Unclassified";
const JOB_BAND_LABEL = "Scheduled jobs";

type Group = { id: string; label: string; units: DeployNode[]; kindBand?: "job" };

/**
 * The single description line shown under a deploy unit. `runtime` is the
 * primary form for code artifacts; kinds without a runtime fall back to their
 * defining property so e.g. a `store` shows its `type` ("Aurora PostgreSQL 15")
 * instead of an empty card.
 */
function deployUnitDescription(unit: DeployNode): string | undefined {
  const p = unit.properties;
  return p.runtime ?? p.type ?? p.image ?? p.schedule;
}

function measureDeployUnit(unit: DeployNode): { width: number; height: number } {
  const labelWidth = estimateTextWidth(unit.label ?? unit.id, CHAR_WIDTH);
  const desc = deployUnitDescription(unit);
  // Same width/wrap rules as measureNode (#2366 C): the shared renderer
  // wraps the description into up to DESC_MAX_LINES lines, so the card must
  // reserve the same line count or the padding silently absorbs the overflow.
  const descWidth = desc
    ? Math.min(estimateTextWidth(desc, CHAR_WIDTH * DESCRIPTION_FONT_RATIO), DESC_MAX_CONTENT_WIDTH)
    : 0;
  const width = Math.max(labelWidth, descWidth, 80) + NODE_PADDING_X * 2;
  let height = NODE_PADDING_Y * 2 + LINE_HEIGHT;
  if (desc) {
    const descLines = wrapToWidth(
      desc,
      width - NODE_PADDING_X * 2,
      CHAR_WIDTH * DESCRIPTION_FONT_RATIO,
      DESC_MAX_LINES,
    ).length;
    height += LINE_HEIGHT * descLines;
  }
  return { width, height };
}

/** Units of one container, wrapped into rows, with the box that holds them. */
interface UnitGrid {
  rows: DeployNode[][];
  width: number;
  height: number;
}

/**
 * Wrap a container's units into a balanced grid instead of one column (#2593).
 *
 * ADR-1737 gridded the deploy *containers* but left the units inside each one
 * stacked vertically, so a container that realizes a fan of interchangeable
 * services — dify's `VectorStore` carries a dozen vector-database images —
 * measures one card wide and a dozen cards tall. That single ribbon then sets
 * the height of its whole row and pushes every later layer past it, which is
 * where most of the deploy canvas's empty space comes from.
 *
 * Same rule as the sibling grid: `ceil(sqrt(n))` columns row-major in
 * declaration order, wrapping early if a row would exceed the width budget.
 */
function layoutContainerUnits(units: DeployNode[], label: string, widthBudget: number): UnitGrid {
  const labelWidth = estimateTextWidth(label, CHAR_WIDTH) + CONTAINER_PADDING_X * 2 + 24;
  const columnCount = gridColumnCount(
    units.length,
    undefined,
    relaxedColumnCap(GRID_COLUMN_CAP, widthBudget, MAX_LAYER_WIDTH),
  );
  const rows = wrapLayerIntoRows(
    units,
    (unit) => measureDeployUnit(unit).width,
    columnCount,
    Math.max(80, widthBudget - CONTAINER_PADDING_X * 2),
    NODE_GAP,
  );

  let contentWidth = 80;
  let contentHeight = 0;
  for (const [index, row] of rows.entries()) {
    const dims = row.map((unit) => measureDeployUnit(unit));
    const rowWidth = dims.reduce((sum, d) => sum + d.width, 0) + (row.length - 1) * NODE_GAP;
    contentWidth = Math.max(contentWidth, rowWidth);
    contentHeight += Math.max(...dims.map((d) => d.height));
    if (index > 0) contentHeight += NODE_GAP;
  }

  return {
    rows,
    width: Math.max(contentWidth + CONTAINER_PADDING_X * 2, labelWidth),
    height: CONTAINER_PADDING_TOP + contentHeight + CONTAINER_PADDING_BOTTOM,
  };
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
 * Place an ordered list of containers as one horizontal block, wrapping into
 * grid sub-rows at the balanced-grid column cap or when `MAX_LAYER_WIDTH` would
 * be exceeded (whichever comes first). Mutates `containers` / `layoutNodes` /
 * `containerCenterX` in place and returns the block's bottom Y and right edge.
 *
 * Shared by both the DAG layers and the job band so the band grids identically
 * (one source of truth for the wrap rule; balanced-grid #1748 lives here too).
 * Callers sort `groups` beforehand (e.g. barycenter) — this only positions.
 */
function placeGroupBlock(
  groups: Group[],
  startX: number,
  startY: number,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  containerCenterX: Map<string, number>,
  // Row-width budget for this block, chosen by the canvas-level aspect search
  // (#2593). `MAX_LAYER_WIDTH` is its floor.
  widthBudget: number = MAX_LAYER_WIDTH,
  // The unclassified row keys its nodes by the bare unit id (units there have no
  // `realizes`, so they appear once); classified/banded containers prefix with
  // the container id because a multi-`realizes` unit can appear in several.
  bareNodeKeys = false,
): { bottomY: number; maxRight: number } {
  const columnCount = gridColumnCount(
    groups.length,
    undefined,
    relaxedColumnCap(GRID_COLUMN_CAP, widthBudget, MAX_LAYER_WIDTH),
  );
  let colInRow = 0;
  let currentX = startX;
  let subRowY = startY;
  let subRowMaxHeight = 0;
  let maxRight = startX;

  for (const group of groups) {
    const grid = layoutContainerUnits(group.units, group.label, widthBudget);
    const containerW = grid.width;
    const containerH = grid.height;

    if (
      currentX > startX &&
      (colInRow >= columnCount || currentX + containerW > startX + widthBudget)
    ) {
      subRowY += subRowMaxHeight + CONTAINER_GAP;
      currentX = startX;
      subRowMaxHeight = 0;
      colInRow = 0;
    }

    containers.push({
      id: group.id,
      label: group.label,
      x: currentX,
      y: subRowY,
      width: containerW,
      height: containerH,
      ghost: false,
      kindBand: group.kindBand,
    });

    let unitY = subRowY + CONTAINER_PADDING_TOP;
    for (const row of grid.rows) {
      let unitX = currentX + CONTAINER_PADDING_X;
      let rowHeight = 0;
      for (const unit of row) {
        const dims = measureDeployUnit(unit);
        // Key is "${containerId}::${unit.id}" so the same unit can appear in multiple
        // containers at different positions without overwriting its layout entry.
        const nodeKey = bareNodeKeys ? unit.id : `${group.id}::${unit.id}`;
        layoutNodes.set(nodeKey, {
          kind: unit.kind,
          id: unit.id,
          label: unit.label ?? unit.id,
          properties: {
            description: deployUnitDescription(unit),
            links: [],
          },
          descriptionSummary: undefined,
          linkCount: 0,
          hasChildren: false,
          hasDescription: !!deployUnitDescription(unit),
          x: unitX,
          y: unitY,
          width: dims.width,
          height: dims.height,
        });
        unitX += dims.width + NODE_GAP;
        rowHeight = Math.max(rowHeight, dims.height);
      }
      unitY += rowHeight + NODE_GAP;
    }

    containerCenterX.set(group.id, currentX + containerW / 2);
    subRowMaxHeight = Math.max(subRowMaxHeight, containerH);
    currentX += containerW + CONTAINER_GAP;
    colInRow += 1;
    maxRight = Math.max(maxRight, currentX - CONTAINER_GAP);
  }

  return { bottomY: subRowY + subRowMaxHeight, maxRight };
}

/**
 * Layout a deploy diagram using a layered DAG layout (Longest Path Layering).
 *
 * Containers are grouped into layers based on service dependency edges (ghost edges).
 * Within each layer containers are arranged horizontally; layers are stacked vertically.
 * Containers within each layer are sorted by the barycenter heuristic to minimize edge crossings.
 * Job-only containers are pulled out of the DAG into a dedicated job band below it (#1738).
 * Unclassified units (no realizes) are placed in a separate row at the bottom.
 */
/** Localized captions for the synthetic deploy containers (#1738). */
interface DeployBandLabels {
  /** Caption for the job band wrapper. */
  jobBand?: string;
  /** Caption for the unclassified (no-`realizes`) container. */
  unclassified?: string;
}

/**
 * Lay the deploy canvas out for one candidate row-width budget. Pure — every
 * map and array it touches is built inside — so the aspect search can call it
 * once per candidate and keep only the squarest run (#2593).
 */
function layoutDeployForBudget(
  slice: DeployViewSlice,
  labels: DeployBandLabels | undefined,
  widthBudget: number,
): LayoutResult {
  const jobBandLabel = labels?.jobBand ?? JOB_BAND_LABEL;
  const unclassifiedLabel = labels?.unclassified ?? UNCLASSIFIED_LABEL;
  const layoutNodes = new Map<string, LayoutNode>();
  const containers: ContainerRect[] = [];

  const classifiedGroups: Group[] = slice.containers.map((c) => ({
    id: c.serviceId,
    label: c.serviceLabel,
    units: c.units,
    kindBand: c.kindBand,
  }));

  // Job-only containers leave the dependency DAG and cluster into a dedicated
  // job band below it (#1738). Their DAG position is accidental (the depth of
  // the domain they realize), so banding them turns scattered jobs into one
  // operational group. compute / mixed containers stay on the DAG.
  const dagGroups = classifiedGroups.filter((g) => g.kindBand !== "job");
  const jobBandGroups = classifiedGroups.filter((g) => g.kindBand === "job");

  const hasUnclassified = slice.unclassifiedUnits.length > 0;

  if (classifiedGroups.length === 0 && !hasUnclassified) {
    return { nodes: new Map(), edges: [], containers: [], width: 0, height: 0 };
  }

  // --- Layer assignment (DAG groups only) ---
  const classifiedIds = dagGroups.map((g) => g.id);
  const layerMap = assignLayers(classifiedIds, slice.ghostEdges);

  // Group containers by layer number
  const layerBuckets = new Map<number, Group[]>();
  for (const group of dagGroups) {
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
        : sortByBarycenter(layerBuckets.get(layerIdx)!, predecessorsMap, containerCenterX);

    const { bottomY, maxRight } = placeGroupBlock(
      layerGroups,
      OUTER_PADDING,
      currentY,
      layoutNodes,
      containers,
      containerCenterX,
      widthBudget,
    );
    totalWidth = Math.max(totalWidth, maxRight + OUTER_PADDING);
    currentY = bottomY + ROW_GAP;
  }

  // --- Job band: job-only containers, clustered below the DAG (#1738) ---
  // Pulled out of the dependency DAG and grouped under a labelled ghost wrapper
  // so scheduled jobs read as one operational group. The band reuses the same
  // placeGroupBlock wrapping as the DAG layers, so it grids identically. Ghost
  // wrapper containers render before non-ghost ones, so the wrapper sits behind
  // its member containers (z-order). Ghost edges to/from these containers route
  // across the band for free (the containers keep their real ids).
  if (jobBandGroups.length > 0) {
    const bandTop = currentY;
    // Indent content so the wrapper has left/right padding and its caption (at
    // the wrapper's top-left) does not collide with the first container label.
    const contentTop = bandTop + CONTAINER_PADDING_TOP;
    const { bottomY, maxRight } = placeGroupBlock(
      jobBandGroups,
      OUTER_PADDING + CONTAINER_PADDING_X,
      contentTop,
      layoutNodes,
      containers,
      containerCenterX,
      widthBudget,
    );

    const bandWidth = maxRight - OUTER_PADDING + CONTAINER_PADDING_X;
    const bandHeight = bottomY - bandTop + CONTAINER_PADDING_BOTTOM;
    containers.push({
      id: "__job_band__",
      label: jobBandLabel,
      x: OUTER_PADDING,
      y: bandTop,
      width: bandWidth,
      height: bandHeight,
      ghost: true,
      kindBand: "job",
    });

    totalWidth = Math.max(totalWidth, OUTER_PADDING + bandWidth + OUTER_PADDING);
    currentY = bandTop + bandHeight + ROW_GAP;
  }

  // --- Unclassified units: single container, bottom row ---
  // Reuses placeGroupBlock (one group = one container) with bare node keys, so
  // the container-push + unit-placement logic lives in one place. gridColumnCount(1)
  // is 1, so the single container never wraps — same output as before.
  if (hasUnclassified) {
    const { bottomY, maxRight } = placeGroupBlock(
      [{ id: "__unclassified__", label: unclassifiedLabel, units: slice.unclassifiedUnits }],
      OUTER_PADDING,
      currentY,
      layoutNodes,
      containers,
      containerCenterX,
      widthBudget,
      true, // bareNodeKeys: unclassified units key by bare id
    );
    totalWidth = Math.max(totalWidth, maxRight + OUTER_PADDING);
    currentY = bottomY + OUTER_PADDING;
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

/**
 * Lay out the deploy diagram, choosing the row-width budget that brings the
 * canvas closest to square (Issue #2593).
 *
 * Deploy containers are wide, so the fixed `MAX_LAYER_WIDTH` fits only two per
 * row on a real compose file; every further container grows the canvas
 * downward and the diagram ends up a ribbon several screens tall. The search
 * re-runs the whole layout over the candidate budgets and keeps the squarest
 * result; the floor candidate is today's constant, so a deploy view that is
 * already square or landscape is untouched.
 */
export function layoutDeploy(slice: DeployViewSlice, labels?: DeployBandLabels): LayoutResult {
  const found = searchWidthBudget(
    (budget) => layoutDeployForBudget(slice, labels, budget),
    (result) => ({ width: result.width, height: result.height }),
    { floor: MAX_LAYER_WIDTH },
  );
  // Report which candidate won rather than accepting one as input: ADR-2521
  // rejected canvas-dimension flags on the shared helpers, and a caller that
  // could pin the budget would be exactly that. Tests assert the floor keeps
  // an already-landscape canvas by reading this back.
  found.result.widthBudget = found.budget;
  return found.result;
}
