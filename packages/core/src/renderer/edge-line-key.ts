/**
 * How an edge's line is drawn, as the renderer resolves it, for the layout to
 * compare (#3027): a mutual pair is drawn as one line only when the reader could
 * not tell its two edges apart. Kept beside the renderer's own style lookup so
 * the two cannot disagree.
 */

import type { ResolvedEdgeStyle, ResolvedStyles } from "../types/style.js";
import { edgeStyleKey } from "../resolver/style-resolver.js";
import { edgeKey } from "../diff/view-diff.js";
import type { LayoutEdge } from "./layout-types.js";

/**
 * The resolved style an edge is drawn with. Prefers the kind-qualified entry so
 * parallel sync/async edges between the same pair keep their own stroke style;
 * falls back to the bare key for synthetic layout edges (delivers, owns, ghosts,
 * aggregated domain edges).
 */
export function resolvedEdgeStyle(
  styles: ResolvedStyles,
  edge: Pick<LayoutEdge, "from" | "to" | "kind">,
): ResolvedEdgeStyle {
  return (
    styles.edges.get(edgeStyleKey(edge.from, edge.to, edge.kind)) ??
    styles.edges.get(edgeStyleKey(edge.from, edge.to, undefined)) ??
    styles.defaultEdgeStyle
  );
}

/**
 * What each edge's line will look like once drawn (#3027), for
 * `LayoutOptions.edgeLineKey`: the layout draws a mutual pair as one line only
 * when the reader could not tell the two apart. The same style and diff-state
 * lookups the render loop draws with.
 */
export function edgeLineKeyOf(
  styles: ResolvedStyles,
  edgeDiffState: ReadonlyMap<string, string> | undefined,
): (edge: LayoutEdge) => string {
  return (edge) => {
    const style = resolvedEdgeStyle(styles, edge);
    const diffState = edge.diffState ?? edgeDiffState?.get(edgeKey(edge)) ?? "";
    return `${style.color}|${style.strokeWidth}|${style.strokeStyle}|${diffState}`;
  };
}
