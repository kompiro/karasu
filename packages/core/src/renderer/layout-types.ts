import type {
  LogicalNodeKind,
  DeployNodeKind,
  CommonProperties,
  ClientResource,
  ClientCapability,
} from "../types/ast.js";
import type { DomainEdgeDetail } from "../view/view-extract.js";

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
export type OrgLayoutNodeKind = "member" | "team";

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
