import type { ResolvedNodeStyle, ResolvedStyles } from "../types/style.js";
import type { LayoutNode } from "./layout-types.js";
import { getShapeContentInset, type ShapeInsets } from "../shapes/shape-registry.js";
import type { LaneInset } from "./corner-lane.js";
import { nodeStyleKey } from "../resolver/style-resolver.js";
import { nodePathRefId } from "../parser/node-path.js";

export const ZERO_INSETS: ShapeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Registry name of a resolved shape (a builtin keyword or an icon URL). */
export function shapeNameOf(shape: ResolvedNodeStyle["shape"]): string {
  return typeof shape === "string" ? shape : shape.url;
}

/**
 * The per-node style fallback chain, shared by renderFromLayout and the
 * measurement-time shapeForNode hook so the two can never resolve different
 * styles (#2412 review). `layoutId` is the deploy `containerId::unitId`
 * carrier — resolved styles are keyed by the bare unit id (#735 / #1666).
 *
 * `path` is the card's `LayoutNode.path`. It is looked up first, so two nodes
 * that share an id are each drawn with their own style rather than with the
 * one the bare entry holds (#2934). A card without one (a ghost, a stub, a
 * deploy unit) and a path the style pass did not record fall through to the
 * id-keyed chain.
 */
export function resolveNodeStyle(
  styles: ResolvedStyles,
  id: string,
  annotations: readonly string[] | undefined,
  layoutId?: string,
  path?: readonly string[],
): ResolvedNodeStyle {
  return (
    (path !== undefined ? styles.nodesByPath.get(nodePathRefId(path)) : undefined) ??
    styles.nodes.get(nodeStyleKey(id, annotations)) ??
    styles.nodes.get(id) ??
    (layoutId !== undefined ? styles.nodes.get(layoutId) : undefined) ??
    styles.defaultNodeStyle
  );
}

/**
 * The two insets the corner lane needs (#2420). Content insets are what the
 * shape registry exposes today, and they are the conservative choice: the lane
 * lands inside the shape's drawn body on every registered shape, where the
 * bounding box would hang the ⓘ over a `user` card's medallion strip or a
 * hexagon's cut corner. Slice C's `portFrame` may offer a tighter outline.
 */
export function laneInsetOf(
  style: ResolvedNodeStyle,
  node: LayoutNode,
  applyShapeInsets: boolean,
): LaneInset {
  // Gated on `applyShapeInsets` for the same reason the text is: when the
  // layout measured a card with flat padding, the drawing has to use flat
  // padding too, or the lane drops to a content top the text does not observe
  // and lands on the first line.
  const insets = applyShapeInsets ? shapeInsetsOf(style, node.width, node.height) : ZERO_INSETS;
  return { top: insets.top, right: insets.right };
}

/** Content insets for a node's resolved shape, or zeros (box, external icons). */
export function shapeInsetsOf(
  style: ResolvedNodeStyle,
  width: number,
  height: number,
): ShapeInsets {
  return getShapeContentInset(shapeNameOf(style.shape))?.(width, height) ?? ZERO_INSETS;
}
