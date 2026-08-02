import type { KrsFile } from "../types/ast.js";

/**
 * Facet overlay: the viewer-side highlight layer for `facet` membership (#2174).
 *
 * The selection is **viewer state, never model state** — nothing here is written
 * back to `.krs`. Styling a facet from a sheet is a separate concern that lands
 * with the `.krs.style` facet selectors (slice 3); this module only decides
 * which elements light up and in what colour when a reader picks facets in the
 * toolbar.
 *
 * The whole layer is opt-in: {@link resolveFacetOverlay} returns `undefined`
 * whenever nothing is selected (or the selection names no facet the model
 * knows), and the renderer emits nothing at all in that case. That is what
 * keeps "no facet selected ⇒ byte-identical output" true, which the rest of the
 * design leans on — see `docs/design/facet-overlay.md`.
 */

/**
 * Ring colours, one set shared by both themes.
 *
 * Deliberately not theme-resolved like {@link DiagramPalette}: a facet's colour
 * is an identity ("PII is teal"), and a reader comparing a light export against
 * a dark screen has to see the same one. The values are mid-saturation so they
 * stay legible against both the light and the dark canvas — the constraint
 * TPL-1697 asks of any colour the reader must actually read.
 *
 * Eight is a soft ceiling, not a limit: assignment wraps with `% length`, so a
 * ninth facet reuses the first colour. Distinguishing nine simultaneously
 * selected facets by hue is not a goal — the legend names them.
 */
export const FACET_OVERLAY_COLORS: readonly string[] = [
  "#3B82F6", // blue
  "#14B8A6", // teal
  "#F59E0B", // amber
  "#A855F7", // purple
  "#EF4444", // red
  "#22C55E", // green
  "#EC4899", // pink
  "#0EA5E9", // sky
];

/** Opacity applied to elements outside every selected facet. */
export const FACET_DIM_OPACITY = 0.28;

export interface FacetOverlayEntry {
  id: string;
  /** Declared `label`, or the id when the facet has no declaration. */
  label: string;
  color: string;
}

export interface FacetOverlay {
  /** Selected facets in known-facet order — the legend rows, in the order shown. */
  entries: FacetOverlayEntry[];
  /** Selected-facet ids per node id, in known-facet order. Non-members are absent. */
  membership: Map<string, string[]>;
  /** Colour by facet id, for the ring stroke and the legend swatch. */
  colorOf: Map<string, string>;
}

/**
 * Every facet the model knows, in a **stable** order: declaration order first,
 * then ids that are only referenced from a `facets` property, sorted.
 *
 * Colour assignment indexes into this list rather than into the selection, so
 * deselecting one facet never re-colours the others. Assigning by selection
 * order would make the picture change under a reader who is only narrowing what
 * they look at.
 */
export function knownFacetIds(file: KrsFile): string[] {
  const declared = file.facets.map((f) => f.id);
  const seen = new Set(declared);
  const referenced: string[] = [];
  for (const ids of file.facetIndex.values()) {
    for (const id of ids) {
      if (!seen.has(id)) {
        seen.add(id);
        referenced.push(id);
      }
    }
  }
  referenced.sort();
  return [...declared, ...referenced];
}

/**
 * Resolve a selection against the model.
 *
 * Returns `undefined` when the overlay is inactive — no selection, or a
 * selection that intersects nothing the model knows. Callers treat `undefined`
 * as "render exactly as before"; there is no such thing as an empty-but-present
 * overlay, so a stale selection cannot leave an empty legend band or a stray
 * attribute behind (TPL-1032).
 */
export function resolveFacetOverlay(
  file: KrsFile,
  selected: readonly string[] | undefined,
): FacetOverlay | undefined {
  if (!selected || selected.length === 0) return undefined;

  const wanted = new Set(selected);
  const known = knownFacetIds(file);
  const active = known.filter((id) => wanted.has(id));
  if (active.length === 0) return undefined;

  const labelOf = new Map(file.facets.map((f) => [f.id, f.label ?? f.id]));
  const colorOf = new Map<string, string>();
  const entries: FacetOverlayEntry[] = active.map((id) => {
    const color = FACET_OVERLAY_COLORS[known.indexOf(id) % FACET_OVERLAY_COLORS.length];
    colorOf.set(id, color);
    return { id, label: labelOf.get(id) ?? id, color };
  });

  const membership = new Map<string, string[]>();
  for (const [nodeId, ids] of file.facetIndex) {
    // Filter through `active` (not `ids`) so every node lists its facets in the
    // same known-facet order — the ring order has to agree from node to node,
    // otherwise the same two facets stack differently in different places.
    const mine = active.filter((id) => ids.has(id));
    if (mine.length > 0) membership.set(nodeId, mine);
  }
  if (membership.size === 0 && entries.length === 0) return undefined;

  return { entries, membership, colorOf };
}

/**
 * Union the facets of every node a collapse folded onto the same stub.
 *
 * Without this a stub inherits nothing, so collapsing a team makes the overlay
 * silently vanish for everything inside it — the reader sees "no members here"
 * where the truth is "members you cannot see individually". Re-deriving the
 * decoration onto the stub is the same move `foldedEdgeDiffState` makes for
 * diff state (TPL-1886).
 *
 * `remapEndpoint` is the composed category→group remap, so this handles both
 * collapse mechanisms in one pass; it is the identity where nothing collapsed,
 * which yields an empty map (a node is never its own stub).
 */
export function foldFacetMembership(
  nodes: readonly { id: string }[],
  remapEndpoint: (id: string) => string,
  membership: ReadonlyMap<string, readonly string[]> | undefined,
  /** Known-facet order, so a stub's rings stack like every other element's. */
  order: readonly string[],
): Map<string, string[]> | undefined {
  if (!membership || membership.size === 0) return undefined;
  const accum = new Map<string, Set<string>>();
  for (const node of nodes) {
    const stubId = remapEndpoint(node.id);
    if (stubId === node.id) continue; // not folded — the node draws its own rings
    const mine = membership.get(node.id);
    if (!mine || mine.length === 0) continue;
    const bucket = accum.get(stubId);
    if (bucket) for (const id of mine) bucket.add(id);
    else accum.set(stubId, new Set(mine));
  }
  if (accum.size === 0) return undefined;
  return new Map([...accum].map(([stubId, ids]) => [stubId, order.filter((id) => ids.has(id))]));
}

/**
 * Facets the given element belongs to, in known-facet order.
 *
 * `layoutId` is the fallback for layout forms that do not equal the model id
 * (deploy's `container::unit`), matching how diff decoration looks itself up
 * (TPL-1666).
 */
export function facetsOf(
  overlay: FacetOverlay | undefined,
  nodeId: string,
  layoutId?: string,
): string[] {
  if (!overlay) return [];
  return (
    overlay.membership.get(nodeId) ?? (layoutId ? (overlay.membership.get(layoutId) ?? []) : [])
  );
}
