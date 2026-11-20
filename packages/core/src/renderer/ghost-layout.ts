/**
 * Ghost placement for the single-system pipeline (#2512): muted users /
 * domains / entities around the main container, and caller / outgoing ghost
 * system frames with their visible services.
 */
import type { KrsNode } from "../types/ast.js";
import type { ViewSlice, GhostSystem } from "../view/view-slice.js";
import type { LayoutNode, ContainerRect } from "./layout-types.js";
import { nodePathKey, nodePathRefId } from "../parser/node-path.js";
import { gridColumnCount } from "./layer-layout-logics.js";
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

const GHOST_ROW_GAP = 60;

/** Horizontal gap between a ghost system frame and its neighbor / the main container. */
const GHOST_SYSTEM_GAP = 80;

// ---------------------------------------------------------------------------
// SPIKE (#2823, design PR #3842 slice A): ghost band.
//
// Ghosts go above the focus frame when they have more incoming relations
// (the foreign side references this one), below otherwise. Per
// (foreign group × side), two or more ghosts share one muted frame titled
// with the group label; a lone ghost stays a sub-labelled card. Frames and
// cards are ordered by their local partners' mean centre x and wrapped at
// max(width budget, focus frame width).
// ---------------------------------------------------------------------------

interface BandItem {
  node: KrsNode;
  key: string;
  groupLabel: string;
}

type Side = "above" | "below";

interface BandBox {
  width: number;
  height: number;
  order: number;
  partnerX: number;
  /** Move every card (and the frame) of this box to its final top-left. */
  place: (x: number, y: number) => void;
}

const BAND_GAP = 40;

/** Place ghost band items; returns whether the width budget cut a band row. */
function placeGhostBand(
  items: BandItem[],
  edges: readonly { from: string; to: string }[],
  remap: (id: string) => string,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
  widthBudget: number,
): boolean {
  if (items.length === 0 || containers.length === 0) return false;
  const { NODE_GAP } = getLayoutConstants(ctx.displayMode);
  const mainContainer = containers.find((c) => !c.ghost) ?? containers[0];
  // Every frame enclosing the focus except the outermost one, which is grown
  // around the band afterwards (design: "which ancestor encloses the band").
  const inner = containers.slice(1).length > 0 ? containers.slice(1) : [mainContainer];
  const innerTop = Math.min(...inner.map((c) => c.y));
  const innerBottom = Math.max(...inner.map((c) => c.y + c.height));
  const centreX = mainContainer.x + mainContainer.width / 2;

  // Direction counts and partner x per ghost.
  const keys = new Set(items.map((i) => i.key));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const partnerXs = new Map<string, number[]>();
  for (const e of edges) {
    const from = remap(e.from);
    const to = remap(e.to);
    const ghost = keys.has(from) ? from : keys.has(to) ? to : undefined;
    if (!ghost) continue;
    const partner = ghost === from ? to : from;
    const counts = ghost === from ? incoming : outgoing;
    counts.set(ghost, (counts.get(ghost) ?? 0) + 1);
    const p = layoutNodes.get(partner);
    if (p) {
      const xs = partnerXs.get(ghost) ?? [];
      xs.push(p.x + p.width / 2);
      partnerXs.set(ghost, xs);
    }
  }
  const mean = (xs: number[]) =>
    xs.length === 0 ? centreX : xs.reduce((a, b) => a + b, 0) / xs.length;
  const sideOf = (key: string): Side =>
    (incoming.get(key) ?? 0) > (outgoing.get(key) ?? 0) ? "above" : "below";

  // Group by (side, groupLabel), keeping discovery order.
  const groups = new Map<
    string,
    { side: Side; label: string; members: BandItem[]; order: number }
  >();
  items.forEach((item, order) => {
    const side = sideOf(item.key);
    const gk = `${side}\u0000${item.groupLabel}`;
    let g = groups.get(gk);
    if (!g) {
      g = { side, label: item.groupLabel, members: [], order };
      groups.set(gk, g);
    }
    g.members.push(item);
  });

  const boxes: Record<Side, BandBox[]> = { above: [], below: [] };
  for (const g of groups.values()) {
    const cards = g.members.map((m, order) => {
      const dims = measureNode(m.node, undefined, ctx);
      return { m, order, dims, px: mean(partnerXs.get(m.key) ?? []) };
    });
    cards.sort((a, b) => a.px - b.px || a.order - b.order);
    const boxPartnerX = mean(g.members.flatMap((m) => partnerXs.get(m.key) ?? []));

    if (cards.length === 1) {
      const [{ m, dims }] = cards;
      boxes[g.side].push({
        width: dims.width,
        height: dims.height,
        order: g.order,
        partnerX: boxPartnerX,
        place: (x, y) => {
          layoutNodes.set(
            m.key,
            makeLayoutNode(m.node, m.key, {
              label: m.node.label ?? m.node.id,
              annotations: ctx.effectiveAnnotations(m.node),
              subLabel: g.label,
              x,
              y,
              width: dims.width,
              height: dims.height,
              ghost: true,
            }),
          );
        },
      });
      continue;
    }

    // Grid inside the frame.
    const cols = gridColumnCount(cards.length);
    const colW = Math.max(...cards.map((c) => c.dims.width));
    const rows: (typeof cards)[] = [];
    for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));
    const rowH = rows.map((r) => Math.max(...r.map((c) => c.dims.height)));
    const contentW =
      Math.min(cols, cards.length) * colW + (Math.min(cols, cards.length) - 1) * NODE_GAP;
    const contentH = rowH.reduce((a, b) => a + b, 0) + (rows.length - 1) * (NODE_GAP / 2);
    const width = contentW + CONTAINER_PADDING * 2;
    const height =
      CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING / 2 + contentH + CONTAINER_PADDING / 2;
    boxes[g.side].push({
      width,
      height,
      order: g.order,
      partnerX: boxPartnerX,
      place: (x, y) => {
        containers.push({
          id: `ghost-band:${g.side}:${g.label}`,
          label: g.label,
          x,
          y,
          width,
          height,
          ghost: true,
        });
        let cy = y + CONTAINER_LABEL_HEIGHT + CONTAINER_PADDING / 2;
        rows.forEach((row, ri) => {
          row.forEach((c, ci) => {
            layoutNodes.set(
              c.m.key,
              makeLayoutNode(c.m.node, c.m.key, {
                label: c.m.node.label ?? c.m.node.id,
                annotations: ctx.effectiveAnnotations(c.m.node),
                x: x + CONTAINER_PADDING + ci * (colW + NODE_GAP) + (colW - c.dims.width) / 2,
                y: cy,
                width: c.dims.width,
                height: c.dims.height,
                ghost: true,
              }),
            );
          });
          cy += rowH[ri] + NODE_GAP / 2;
        });
      },
    });
  }

  // Wrap each side into rows at max(budget, focus width), centred on the focus.
  const limit = Math.max(widthBudget, mainContainer.width);
  let widthBound = false;
  const placedRects: { x: number; y: number; width: number; height: number }[] = [];
  for (const side of ["above", "below"] as const) {
    const list = boxes[side].sort((a, b) => a.partnerX - b.partnerX || a.order - b.order);
    if (list.length === 0) continue;
    const rows: BandBox[][] = [[]];
    let rowW = 0;
    for (const b of list) {
      const cur = rows[rows.length - 1];
      const next = cur.length === 0 ? b.width : rowW + BAND_GAP + b.width;
      if (cur.length > 0 && next > limit) {
        widthBound = true;
        rows.push([b]);
        rowW = b.width;
      } else {
        cur.push(b);
        rowW = next;
      }
    }
    // Row 0 touches the focus side; above rows stack upward, bottom-aligned.
    let edgeY = side === "below" ? innerBottom + GHOST_ROW_GAP : innerTop - GHOST_ROW_GAP;
    for (const row of rows) {
      const w = row.reduce((a, b) => a + b.width, 0) + (row.length - 1) * BAND_GAP;
      const h = Math.max(...row.map((b) => b.height));
      let x = centreX - w / 2;
      for (const b of row) {
        const y = side === "below" ? edgeY : edgeY - b.height;
        b.place(x, y);
        placedRects.push({ x, y, width: b.width, height: b.height });
        x += b.width + BAND_GAP;
      }
      edgeY = side === "below" ? edgeY + h + BAND_GAP : edgeY - h - BAND_GAP;
    }
  }

  // Grow the outermost frame around the band on all four sides.
  if (placedRects.length > 0) {
    const outermost = containers[0];
    const minX = Math.min(...placedRects.map((r) => r.x)) - GHOST_MARGIN;
    const maxX = Math.max(...placedRects.map((r) => r.x + r.width)) + GHOST_MARGIN;
    const minY = Math.min(...placedRects.map((r) => r.y)) - GHOST_MARGIN - CONTAINER_LABEL_HEIGHT;
    const maxY = Math.max(...placedRects.map((r) => r.y + r.height)) + GHOST_MARGIN;
    if (minX < outermost.x) {
      outermost.width += outermost.x - minX;
      outermost.x = minX;
    }
    if (minY < outermost.y) {
      outermost.height += outermost.y - minY;
      outermost.y = minY;
    }
    if (maxX > outermost.x + outermost.width) outermost.width = maxX - outermost.x;
    if (maxY > outermost.y + outermost.height) outermost.height = maxY - outermost.y;
  }
  return widthBound;
}

export function placeGhostDomains(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
  remap: (id: string) => string,
  widthBudget: number,
): boolean {
  return placeGhostBand(
    viewSlice.ghostDomains.map((gd) => ({
      node: gd.node,
      key: gd.node.id,
      groupLabel: gd.parentServiceLabel,
    })),
    viewSlice.ghostDomainEdges,
    remap,
    layoutNodes,
    containers,
    ctx,
    widthBudget,
  );
}

/**
 * Place cross-domain ghost entities in the band around the entity view's main
 * container. Keyed by the qualified `DomainId.EntityId` (not the bare id)
 * because entity ids are only warning-level unique — the matching
 * `ghostEntityEdges` endpoints use the same qualified key for foreign endpoints.
 */
export function placeGhostEntities(
  viewSlice: ViewSlice,
  layoutNodes: Map<string, LayoutNode>,
  containers: ContainerRect[],
  ctx: MeasureContext,
  remap: (id: string) => string,
  widthBudget: number,
): boolean {
  return placeGhostBand(
    viewSlice.ghostEntities.map((ge) => ({
      node: ge.node,
      key: ge.key,
      groupLabel: ge.parentDomainLabel,
    })),
    viewSlice.ghostEntityEdges,
    remap,
    layoutNodes,
    containers,
    ctx,
    widthBudget,
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
    // The resolved full path is the layout key. A direct child's path joins to
    // the same `Sys.Svc` the hand-built qualified id used to produce. The owner
    // lookup encodes the same path the way the ownerIndex does (#2548, #2819):
    // the two spellings agree unless a segment carries a `.`.
    const qualifiedId = nodePathKey(path);
    const owner = ownerOf(svc.kind, nodePathRefId(path));
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
