/**
 * Ghost placement for the single-system pipeline (#2512): muted users /
 * domains / entities around the main container, and caller / outgoing ghost
 * system frames with their visible services.
 */
import type { KrsNode } from "../types/ast.js";
import type { ViewSlice, GhostSystem } from "../view/view-extract.js";
import type { LayoutNode, ContainerRect } from "./layout-types.js";
import { nodePathKey } from "../parser/node-path.js";
import {
  CONTAINER_PADDING,
  CONTAINER_LABEL_HEIGHT,
  GHOST_MARGIN,
  getLayoutConstants,
} from "./layout-constants.js";
import {
  makeLayoutNode,
  measureNode,
  type MeasureContext,
  type OwnerResolver,
} from "./layout-measure.js";

export function placeGhostUsers(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
): void {
  if (viewSlice.ghostUsers.length === 0) return;
  const { NODE_GAP } = getLayoutConstants(ctx.displayMode);

  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  const userX = (mainContainer?.x ?? 0) - 20;
  let userY = (mainContainer?.y ?? 0) + CONTAINER_LABEL_HEIGHT + NODE_GAP;
  const ghostUserNodes: LayoutNode[] = [];

  for (const userNode of viewSlice.ghostUsers) {
    const dims = measureNode(userNode, undefined, ctx);
    const uid = userNode.id;
    const gNode = makeLayoutNode(userNode, uid, {
      label: userNode.label ?? userNode.id,
      annotations: ctx.effectiveAnnotations(userNode),
      x: userX - dims.width,
      y: userY,
      width: dims.width,
      height: dims.height,
      ghost: true,
    });
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
  ctx: MeasureContext,
  gap: number,
): void {
  if (items.length === 0 || containers.length === 0) return;
  const { NODE_GAP } = getLayoutConstants(ctx.displayMode);

  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  const ghostY = mainContainer.y + mainContainer.height + gap;
  let ghostX = mainContainer.x + CONTAINER_PADDING;

  for (const { node, key, subLabel } of items) {
    const dims = measureNode(node, undefined, ctx);
    layoutNodes.set(
      key,
      makeLayoutNode(node, key, {
        label: node.label ?? node.id,
        annotations: ctx.effectiveAnnotations(node),
        subLabel,
        x: ghostX,
        y: ghostY,
        width: dims.width,
        height: dims.height,
        ghost: true,
      }),
    );
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

/** Horizontal gap between a ghost system frame and its neighbor / the main container. */
const GHOST_SYSTEM_GAP = 80;

export function placeGhostDomains(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
): void {
  placeGhostRow(
    viewSlice.ghostDomains.map((gd) => ({
      node: gd.node,
      key: gd.node.id,
      subLabel: gd.parentServiceLabel,
    })),
    layoutNodes,
    containers,
    ctx,
    GHOST_ROW_GAP,
  );
}

/**
 * Place cross-domain ghost entities below the entity view's main container.
 * Keyed by the qualified `DomainId.EntityId` (not the bare id) because entity
 * ids are only warning-level unique — the matching `ghostEntityEdges` endpoints
 * use the same qualified key for foreign endpoints.
 */
export function placeGhostEntities(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
): void {
  placeGhostRow(
    viewSlice.ghostEntities.map((ge) => ({
      node: ge.node,
      key: ge.key,
      subLabel: ge.parentDomainLabel,
    })),
    layoutNodes,
    containers,
    ctx,
    GHOST_ROW_GAP,
  );
}

export function placeCallerGhostSystems(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ownerOf: OwnerResolver,
  ctx: MeasureContext,
): void {
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
      ctx,
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
      const node = layoutNodes.get(nodePathKey(svc.path));
      if (node) node.x += shiftX;
    }
  }
  for (const c of callerContainers) {
    c.x += shiftX;
    containers.push(c);
  }
}

export function placeOutgoingGhostSystems(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ownerOf: OwnerResolver,
  ctx: MeasureContext,
): void {
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
      ctx,
    );
    containers.push(containerRect);
    for (const [id, node] of gsNodes) {
      layoutNodes.set(id, node);
    }
    ghostX += containerRect.width + GHOST_SYSTEM_GAP;
  }
}

/**
 * Lay out the visible nodes inside a ghost system and produce a container rect.
 * Nodes are keyed by their full path to avoid collisions — for a system's
 * direct child that is the same `SystemId.ServiceId` string as before, and for
 * a deeper endpoint (`Shop.Checkout.Payment`, #2577) it is the whole path.
 */
function layoutGhostSystem(
  gs: GhostSystem,
  originX: number,
  originY: number,
  ownerOf: OwnerResolver,
  ctx: MeasureContext,
): { nodes: Map<string, LayoutNode>; containerRect: ContainerRect } {
  const { NODE_GAP } = getLayoutConstants(ctx.displayMode);
  const nodes = new Map<string, LayoutNode>();
  let maxW = 0;
  let maxH = 0;
  let y = originY + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING;

  for (const { node: svc, path, subLabel } of gs.visibleServices) {
    // The resolved full path is the layout key, which is exactly what the
    // path-keyed ownerIndex holds for the node (#2548). A direct child's path
    // joins to the same `Sys.Svc` the hand-built qualified id used to produce.
    const qualifiedId = nodePathKey(path);
    const owner = ownerOf(svc.kind, qualifiedId);
    const dims = measureNode(svc, owner, ctx);
    const x = originX + CONTAINER_PADDING;
    nodes.set(
      qualifiedId,
      makeLayoutNode(svc, qualifiedId, {
        label: svc.label ?? svc.id,
        annotations: svc.annotations,
        owner,
        // Muted "Shop › Checkout" line naming the ancestors between the frame
        // and this card; absent for a direct child, so existing ghosts keep
        // their geometry.
        ...(subLabel !== undefined ? { subLabel } : {}),
        x,
        y,
        width: dims.width,
        height: dims.height,
        ghost: true,
      }),
    );
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
