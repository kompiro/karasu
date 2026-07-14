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
  team?: string;
  /** Client-only: operation-tied storage resources rendered inline on the card. */
  resources?: ClientResource[];
  /** Client-only: device / browser capabilities rendered inline on the card. */
  capabilities?: ClientCapability[];
};

export interface LayoutNode {
  kind: LogicalNodeKind | DeployNodeKind;
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

export interface ContainerRect {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ghost: boolean;
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
   * Hop/junction crossing marks for the Group-by view (#1859 P2c-C). Set only by
   * the grouped layout branch (after all geometry passes, from final
   * coordinates); the ungrouped branch never sets it, so the ungrouped SVG stays
   * byte-identical (AC-5). The renderer emits a `crossing-marks` layer on top of
   * the edges when present. See docs/design/system-view-grouping.md § "P2c-C 詳細設計".
   */
  crossingMarks?: CrossingMarks;
}

/**
 * A hop arc bumping over a vertical at `(x, y)`, spanning `[x-halfWidth, x+halfWidth]`
 * (#1859 P2c-C). `edge` is the index (into `LayoutResult.edges`) of the horizontal
 * edge the arc sits on, so the renderer can colour the mark like its own edge.
 */
export interface HopMark {
  x: number;
  y: number;
  halfWidth: number;
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
