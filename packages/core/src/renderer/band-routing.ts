/**
 * What the routing chain does with ghosts now that the ghost band (#2823)
 * places cross-domain ghost entities and cross-service ghost domains in rows
 * above and below the focus frame.
 *
 * A **band edge** (a ghost entity or ghost domain relation) goes through the
 * routing chain like any other edge and keeps only its muted drawing. Every
 * other ghost edge (ghost users, ghost systems) and every cyclic edge stays
 * peripheral: the passes leave it as the straight line it was drawn with.
 *
 * A **band card** counts as a card of a row, so the channels between the focus
 * frame and the band are measured against it. Ghost user and ghost system
 * cards stay out of the rows, as before.
 */
import type { LayoutEdge, LayoutNode } from "./layout-types.js";

/** Whether the routing passes leave this edge as drawn (a ghost outside the band, or a cycle). */
export function isPeripheralEdge(edge: LayoutEdge): boolean {
  return edge.cyclic === true || (edge.ghost === true && edge.band !== true);
}

/** Whether this card is one a row of the canvas is measured with. */
export function isRowCard(node: LayoutNode): boolean {
  return node.ghost !== true || node.ghostBand !== undefined;
}
