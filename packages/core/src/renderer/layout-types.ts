import type {
  LogicalNodeKind,
  DeployNodeKind,
  CommonProperties,
  ClientResource,
  ClientCapability,
  LinkEntry,
} from "../types/ast.js";
import type { DomainEdgeDetail } from "../view/view-extract.js";
import type { EdgeDirection, ResolvedLayoutHints } from "../types/style.js";
import type { CategoryId } from "./category-collapse.js";
import type { GroupLabelIndex } from "./group-labels.js";

export type LayoutNodeProperties = CommonProperties & {
  role?: string;
  /** Owning team **id** — the identity the `data-team-button` navigates by. */
  team?: string;
  /**
   * Owning team's declared `label`, when it has one. The chip renders this and
   * falls back to {@link team}, so a card and a `Group by: team` frame title
   * name the same team the same way (Issue #2157).
   */
  teamLabel?: string;
  /** Client-only: operation-tied storage resources rendered inline on the card. */
  resources?: ClientResource[];
  /** Client-only: device / browser capabilities rendered inline on the card. */
  capabilities?: ClientCapability[];
};

/**
 * Org-chart node kinds that appear in layouts produced for the org view
 * (currently only the draw.io org exporter emits them as `LayoutNode`s;
 * the main SVG org renderer has its own tree renderer). Kept as a named
 * union so `kind` switches can handle org nodes explicitly instead of
 * receiving smuggled strings via casts.
 */
type OrgLayoutNodeKind = "member" | "team";

export interface LayoutNode {
  kind: LogicalNodeKind | DeployNodeKind | OrgLayoutNodeKind;
  id: string;
  label: string;
  /** Source-node tags (e.g. `external`, the collapse-stub marker). Used by the
   * renderer to detect collapsible categories and stubs (Issue #1821). */
  tags?: string[];
  annotations?: string[];
  properties: LayoutNodeProperties;
  descriptionSummary?: string;
  linkCount: number;
  hasChildren: boolean;
  hasDescription: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost?: boolean;
  /** Optional sub-label rendered below the main label (e.g., parent service name for ghost domains). */
  subLabel?: string;
  /**
   * Boundaries this node belongs to whose frame could **not** be widened to
   * enclose it (#2179) — the 縮退 fallback. The renderer draws one `◇ <label>`
   * tab per entry on the card's bottom edge, in that frame's stroke language, so
   * a membership the geometry cannot show is still readable on the card.
   *
   * Expect this to be the common outcome rather than the exception: reaching is
   * refused whenever the corridor to the card holds a non-member (縮退規則 4).
   */
  degradedBoundaries?: readonly { id: string; label: string; hueIndex: number }[];
  /**
   * The card's top-right corner lane — the annotation chip plus the i / D
   * buttons (#2420). Stamped by the renderer, which is where resolved styles
   * (and so the chip's measured width) are known; consumers read it to keep
   * clear of the corner, notably the edge-port keep-outs of #2422.
   *
   * The reservation assumes the buttons this node's data allows, whether or
   * not a given render draws them, so it does not move between the app and a
   * static export.
   */
  chipZone?: Rect;
}

export interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  /** "sync" (`->`) or "async" (`-->`); needed to disambiguate canonicalId in the SVG output. */
  kind?: "sync" | "async";
  /**
   * The resolver-derived canonical id for `edge#<id>` style selectors. Mirrors
   * `KrsEdge.canonicalId`; left undefined for edges that lost their id to a
   * base collision or for synthetic layout-only edges (ghosts, delivers, etc.)
   * that aren't represented as a single KrsEdge.
   */
  canonicalId?: string;
  ghost?: boolean;
  cyclic?: boolean;
  /** Constituent domain edges for aggregated "N domain edges" implicit service edges. */
  domainEdges?: DomainEdgeDetail[];
  /** Mirrors `KrsEdge.description`: prose from the edge property block (#2543). */
  description?: string;
  /** Mirrors `KrsEdge.links`: `link` rows from the edge property block (#2543). */
  links?: LinkEntry[];
  /**
   * Mirrors `KrsEdge.facets`: the facets this edge belongs to (#2544).
   *
   * The overlay resolves an edge's membership from **this field**, never from a
   * membership map keyed by id: an edge's `canonicalId` is `undefined` whenever
   * its base form collided and no `#id` disambiguated it (ADR-1096), so an
   * id-keyed lookup silently loses exactly those edges.
   *
   * On a derived edge — an aggregated `"N domain edges"`, a collapse stub —
   * this holds the **union** over what it folds, so a fold never makes the
   * overlay go dark on membership the reader can no longer see individually.
   */
  facets?: string[];
  /** Mirrors `KrsEdge.syntheticLabel`: `label` is machine-generated (W/R markers, aggregation counts), not authored. */
  syntheticLabel?: boolean;
  /**
   * Optional intermediate points for orthogonal routing (skip-layer edges).
   * When set, the edge renders as a polyline `fromPoint → ...waypoints → toPoint`.
   * When unset/empty, renders as a straight line `fromPoint → toPoint`.
   * See docs/design/auto-layout-edge-routing-orthogonal.md.
   */
  waypoints?: { x: number; y: number }[];
  /**
   * 0-based index inside a parallel-edge bundle (edges sharing `(from, to)`).
   * Set together with `bundleSize` only when `bundleSize >= 2`. Used by the
   * renderer to slide labels along the edge so parallel labels don't stack.
   * See docs/design/parallel-edge-bundling.md.
   */
  bundleIndex?: number;
  /** Total number of edges in this edge's parallel bundle; ≥ 2 when set. */
  bundleSize?: number;
  /**
   * Set by the Group-by router (`routeGroupedEdges`, #1859) when an edge runs
   * against the top-to-bottom group flow (its target band sits above its source
   * band). The renderer dashes such edges — unless the author set an explicit
   * `stroke-style` — so backward inter-group dependencies stand out (a Conway
   * observation). See docs/design/system-view-grouping.md § "P2c 実装設計".
   */
  groupBackward?: boolean;
  /**
   * Set by the aggregation-trunk pass (`aggregateGroupTrunks`, #1859 P2c-B) to
   * the shared target's id when this edge is merged onto a target's trunk spine
   * with ≥ 1 other edge. Edges sharing a `trunkId` run down one vertical lane
   * and enter the target once; the elbow (`waypoints[0]`) where each stub meets
   * the spine is the merge point P2c-C marks with a junction dot. Edge identity
   * is preserved (the line is still its own `LayoutEdge`).
   */
  trunkId?: string;
}

/** Axis-aligned box. The unit `ContainerRect.coverage` is built from. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContainerRect {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost: boolean;
  /**
   * The rects this frame actually covers (#2179): its band body first, then one
   * strip per out-of-band member it reaches. Set only when a frame reaches — a
   * plain frame leaves it `undefined`, its single rect being the degenerate case.
   *
   * The recorded `x/y/width/height` stay the **band body** even when this is set.
   * The title is drawn from them, and growing them drops it onto the very card
   * the strip wraps (measured on the prototype). Anything asking "what does this
   * frame cover?" — the renderer's outline, routing obstacles, the
   * false-containment guard — must read this, not the bounding box: an L-shaped
   * frame's bbox includes rows it does not enclose.
   */
  coverage?: readonly Rect[];
  /**
   * Position of this boundary in the declared group order (#2179), which the
   * renderer maps to a hue in `DiagramPalette.boundaryHues`. Set on the boundary
   * axis only; team frames leave it `undefined` and stay monochrome.
   *
   * Boundary frames overlap by design, and with one shared stroke colour the
   * overlap reads as *nesting* — the prototype's two plates differed in colour
   * alone. The hue is what makes multi-containment legible, not decoration.
   */
  hueIndex?: number;
  /**
   * Kind band marker (deploy view, #1738). Set on the job band wrapper and its
   * member containers so the renderer can emit `data-kind-band` for styling /
   * e2e hooks. `undefined` for ordinary containers.
   */
  kindBand?: "job";
  /**
   * Group boundary-frame marker (system-view Group by, #1858). When set, the
   * renderer draws this container as a dashed group frame (full opacity, unlike
   * a ghost) with the group label. `undefined` for ordinary containers.
   */
  group?: boolean;
  /**
   * The team/group id this frame encloses (system-view Group by, #1858). Set
   * together with `group`; drives the ⊖/⊕ collapse control's
   * `data-collapse-group` so the app can toggle this group.
   */
  groupId?: string;
  /**
   * Which "Group by" axis minted this frame (#2269). Set together with `group`.
   *
   * The renderer needs it to know which id space `groupId` names before it looks
   * a style override up: a boundary id on the boundary axis, an org team id on
   * the team axis. Inferring the axis from `hueIndex` being absent would be
   * wrong — a boundary frame on an expanding canvas carries no hue either, and a
   * `#<id>` rule naming a node would then leak onto it.
   */
  groupAxis?: "team" | "boundary";
  /**
   * In-place expansion marker (#1921). Set together with `group` when this frame
   * is a container expanded in place (its domain children shown inside). Drives
   * the ⊖ collapse control's `data-expand-node` so the app can un-expand it.
   */
  expanded?: boolean;
  /**
   * The expanded container's own node id (#1921). Set together with `expanded`;
   * the value the `data-expand-node` control carries.
   */
  nodeId?: string;
}

export interface LayoutResult {
  nodes: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  containers: ContainerRect[];
  width: number;
  height: number;
  /**
   * Row-width budget the canvas search settled on (#2593), reported so a test
   * or a debugging session can see *which* candidate produced this canvas.
   *
   * Deliberately an output and never an input: ADR-2521 rejected
   * canvas-dimension flags on the shared helpers, and a `widthBudget` a caller
   * could pass in would be one — two contracts hiding behind one function.
   * Equal to the mode's `MAX_LAYER_WIDTH` whenever no wider budget produced a
   * smaller canvas, which is the observable form of "this view kept the layout
   * it already had".
   */
  widthBudget?: number;
  /**
   * Whether any row break came from the width budget rather than from the
   * balanced-grid column count (#2593). False means a wider budget produces
   * the identical placement, so the search stops instead of re-laying out
   * every candidate — the common case, since most views never fill a row.
   */
  widthBound?: boolean;
  /**
   * True when measurement compensated for shape content insets (#2366 F):
   * a shapeForNode hook was supplied and the display mode is not the
   * fixed-card icon mode. renderFromLayout applies inset-aware text layout
   * only when set — a hook-less layout (deploy view, drawio, bare tests)
   * measured padding-only, and drawing with insets anyway would re-wrap
   * text into space the card never reserved.
   */
  shapeInsetsApplied?: boolean;
  /**
   * Diff state re-keyed onto collapsed-group stub edges, keyed by the render
   * lookup form `${from}->${to}` (#1886). Present only when a team collapses in
   * compare/diff mode; `renderFromLayout` merges it over `options.edgeDiffState`
   * so a re-targeted stub edge keeps its diff decoration.
   */
  foldedEdgeDiffState?: Map<string, string>;
  /**
   * Selected-facet membership re-derived onto collapse stubs, keyed by stub id
   * (#2174). Present only when something collapsed while the overlay was on.
   * Without it a collapsed group would drop its overlay entirely, reading as
   * "nothing here belongs" rather than "the members are folded away" — the same
   * re-derivation `foldedEdgeDiffState` does for diff state (TPL-1886).
   */
  foldedFacetMembership?: Map<string, string[]>;
  /**
   * Hop/junction crossing marks for the system view (#1859 P2c-C). Set by every
   * single-system layout — grouped and, since #1956, ungrouped (Group by: none) —
   * from final coordinates; junction dots stay grouped-only (no trunks ungrouped).
   * Multi-system (`layoutMultipleSystems`) leaves it unset (straight-line edges,
   * out of scope). The renderer emits a `crossing-marks` layer on top of the edges
   * when present. See docs/design/system-view-grouping.md § "P2c-C 詳細設計".
   */
  crossingMarks?: CrossingMarks;
  /**
   * Memberships this canvas resolved to a 縮退 tab instead of a frame (#2179),
   * in the order the frames were built. The renderer turns each into the info
   * diagnostic `boundary-membership-not-drawn`.
   *
   * Kept alongside `LayoutNode.degradedBoundaries` rather than derived from it
   * because the diagnostic names the boundary by **id** while the tab shows its
   * label, and only the geometry pass knows both (TPL-2167).
   */
  degradedMemberships?: readonly { nodeId: string; boundaryId: string }[];
}

/**
 * A hop arc centred at `(x, y)`, spanning `halfWidth` px either side along the
 * host segment's direction (#1859 P2c-C, oriented in #1939). `angle` is the host
 * segment's direction in **degrees** (0 = horizontal, so an axis-aligned hop
 * renders exactly as before); the arc bumps perpendicular to it. `edge` is the
 * index (into `LayoutResult.edges`) of the host edge, so the renderer can colour
 * the mark like its own edge.
 */
export interface HopMark {
  x: number;
  y: number;
  halfWidth: number;
  angle: number;
  edge: number;
}

/**
 * A connection dot at a trunk merge point (#1859 P2c-C). `edge` is the index of
 * the joining stub edge, so the dot is coloured like the edge that merges there.
 */
export interface JunctionMark {
  x: number;
  y: number;
  edge: number;
}

/** Crossing marks for the Group-by view: hops (crossing = not connected) + junctions (merge = connected). */
export interface CrossingMarks {
  hops: HopMark[];
  junctions: JunctionMark[];
}

export type DisplayMode = "shape" | "icon";

/**
 * Optional render toggles for the `layout()` entry point (layout.ts). Every field is optional; a bare
 * `layout(viewSlice)` lays out with defaults. Grouped as an object (rather than
 * trailing positionals) so new toggles append a named field instead of another
 * comma-counted slot — and so the two adjacent `ReadonlySet` params
 * (`collapsedCategories` / `collapsedGroups`) can't be slot-swapped. See #1875.
 */
export interface LayoutOptions {
  ownerIndex?: Map<string, string>;
  /**
   * Resolved shape name for a node (from the style cascade). measureNode
   * uses it to grow cards whose shape insets exceed the base padding
   * (#2366 proposal F — practically the hexagon's 20% notches and wide
   * clouds). Callers without resolved styles (drawio export, bare-layout
   * tests) omit it; measurement then assumes padding-only clearance,
   * matching the pre-F behavior.
   */
  shapeForNode?: (id: string, annotations: readonly string[]) => string | undefined;
  /**
   * The corner lane a node's chrome occupies (#2420), so ports can keep out of
   * it (#2422). Injected rather than computed here because the lane's width
   * comes from the resolved badge style, which layout does not resolve; the
   * renderer supplies it, and callers without styles simply get no keep-out.
   */
  chipZoneFor?: (node: LayoutNode) => Rect | undefined;
  /**
   * Team id → declared `label`, from `buildTeamLabelIndex`. Supplies the chip's
   * display string on every axis (the group-frame titles get theirs from
   * `groupLabels`, which only exists when grouping by team). Omitted → the chip
   * falls back to the team id (Issue #2157).
   */
  teamLabels?: ReadonlyMap<string, string>;
  /**
   * Declared-boundary axis (P2b): node id → every boundary it is declared in
   * (#2178). Selected as the grouping axis when `groupBy === "boundary"`;
   * `ownerIndex` remains the team badge source regardless of axis. The banded
   * layout places each node in its primary boundary (`primaryBoundaryOf`),
   * except where a boundary with no band of its own claims one of its shared
   * members (`resolvePlacementAxis`, #2176); the rest of the membership is
   * carried for the views that draw it (#2179).
   * See ADR-2161 (docs/adr/2161-boundary-membership-1n.md).
   */
  boundaryMembership?: Map<string, string[]>;
  /**
   * Membership from `boundary` blocks declared inside a node block (#2036),
   * keyed by declaring scope (see `boundaryScopeKey`). Only the entry for the
   * canvas being drawn applies, so a scoped boundary frames its own level and
   * nowhere else — unlike `boundaryMembership`, which is model-wide.
   */
  scopedBoundaryMembership?: Map<string, Map<string, string[]>>;
  /**
   * Selected-facet membership per node id, already resolved against the
   * selection (`resolveFacetOverlay`). Layout needs it only to re-derive the
   * decoration onto collapse stubs — placement and geometry never read it, which
   * is what keeps the overlay orthogonal to the Group-by axis.
   */
  facetMembership?: ReadonlyMap<string, readonly string[]>;
  /** Known-facet order, so a stub's folded membership stacks like every other element's. */
  facetOrder?: readonly string[];

  /**
   * Every group id the model *declares* on the active axis, in declaration
   * order (`declaredGroupOrderOf` in group-labels.ts). Groups the axis map cannot
   * name — a boundary whose members are all claimed by an earlier one, or one
   * with no `contains` at all — would otherwise not exist for the band
   * machinery at all, because their order was derived from the axis map's
   * values (TPL-2161, #2178). Appended after the axis order, so the order of
   * groups that do have members is exactly what it was before.
   *
   * On the boundary axis this also drives the claim in `resolvePlacementAxis`
   * (#2176): a group named here but absent from the axis is one that may take a
   * shared member, so what changes is no longer only the order — which groups
   * end up with members can change too.
   */
  declaredGroupOrder?: readonly string[];
  /**
   * Node id → diff state in compare/diff mode, from `nodeDiffState` upstream.
   * Only the boundary axis reads it, and only to cut a `removed` node back to
   * its primary membership before placement (`placementMembership`, #2176): the
   * rest of its membership was backfilled purely so it could return to its
   * former frame (ADR-1886), and a node the model no longer has must not decide
   * where the live ones go.
   */
  nodeDiffState?: ReadonlyMap<string, string>;
  /**
   * Declared group labels for the active axis (#2133), from
   * `buildGroupLabelIndex`. Resolved per canvas via `groupLabelsFor`; scoped
   * entries are keyed by their scope-qualified group id (#2036), so the model
   * and scoped maps never contend. Titles the group frames; omitted → frames
   * fall back to the (display) group id.
   */
  groupLabels?: GroupLabelIndex;
  displayMode?: DisplayMode;
  layoutHints?: Map<string, ResolvedLayoutHints>;
  edgeDirections?: Map<string, EdgeDirection>;
  collapsedCategories?: ReadonlySet<CategoryId>;
  groupBy?: "team" | "boundary";
  collapsedGroups?: ReadonlySet<string>;
  /**
   * Per-edge diff state keyed `${from}->${to}` (compare/diff mode). Passed
   * through to `collapseGroups` so a collapsed team's re-targeted stub edges
   * keep their diff decoration, re-keyed onto the stub id (#1886).
   */
  edgeDiffState?: ReadonlyMap<string, string>;
}
