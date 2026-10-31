import type { KrsNode, KrsEdge, NodeIdPath } from "../types/ast.js";

/**
 * A single constituent domain edge that was aggregated into an implicit service edge.
 * Used to populate the detail panel when the user clicks "N domain edges".
 */
export interface DomainEdgeDetail {
  fromDomainId: string;
  fromDomainLabel: string;
  toDomainId: string;
  toDomainLabel: string;
  label?: string;
  /**
   * Set only in diff mode: indicates whether this constituent edge was
   * added, removed, or unchanged between before/after. Consumed by
   * EdgeDetailPanel to render +/- markers.
   */
  diffState?: "unchanged" | "added" | "removed";
}

/**
 * ViewPath identifies the drill-down position in the hierarchy.
 * [] = root system view (shows systems[0])
 * ["ECPlatform", "ECommerce"] = ECommerce service inside ECPlatform system
 * ["ECPlatform", "ECommerce", "Order"] = Order domain inside ECommerce
 *
 * path[0] is the system ID when it matches a known system. A path with no
 * system segment names a top-level (Unassigned) node, e.g. ["Payment"], and
 * falls back to a real system's child only when no top-level node walks it
 * (`resolveContainerChain` in `view-path.ts`, #3113).
 */
export type ViewPath = string[];

/**
 * An external system referenced via a cross-system edge, along with the specific
 * services inside it that are referenced.
 */
/**
 * One node drawn inside a ghost system frame. Before #2577 this was the
 * `KrsNode` alone, because a ghost was always a system's *direct* child and
 * `SystemId.ChildId` reconstructed its path. Deep qualifiers (`Shop.Checkout.Payment`)
 * break that arithmetic, so the resolved path travels with the node.
 */
interface GhostService {
  node: KrsNode;
  /** Full path rooted at the frame's system id — the layout key (#2548). */
  path: NodeIdPath;
  /**
   * Labels of the nodes between the frame and this one, joined with ` › `, shown
   * muted under the card. Absent for a direct child, which is every ghost that
   * existed before deep qualifiers — so existing frames are unchanged.
   */
  subLabel?: string;
}

export interface GhostSystem {
  systemNode: KrsNode;
  visibleServices: GhostService[];
}

export interface GhostDomain {
  node: KrsNode;
  /** Label of the service that owns this domain — shown as sub-label on the ghost node. */
  parentServiceLabel: string;
}

export interface GhostEntity {
  /** The foreign entity node (its `id` is the bare entity id). */
  node: KrsNode;
  /** Label of the domain that owns this entity — shown as sub-label on the ghost node. */
  parentDomainLabel: string;
  /**
   * Qualified `<domainId>.<entityId>` key. Ghost entities are keyed and laid out
   * by this (not the bare id) because entity ids are only warning-level unique
   * (`entity-anchor-collision`), so two foreign entities could share a bare id.
   */
  key: string;
}

export interface ViewSlice {
  containerNode: KrsNode | null;
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
  ancestorChain: KrsNode[];
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
  /** Root view only: all systems for parallel display. Empty at other levels. */
  systems: KrsNode[];
  /** Root view only: edges with qualified targets (SystemId.ServiceId) between systems. */
  crossSystemEdges: KrsEdge[];
  /**
   * For each qualified `to` in {@link crossSystemEdges}, the full path it
   * resolved to (#2577). The root canvas draws only a system's direct
   * children, so the renderer anchors the edge on `path[1]` — for the
   * two-segment `Sys.Svc` that is the same `Svc` the first-dot split used to
   * produce, and for a deeper target it is the service that contains it.
   * Resolving once here keeps the renderer from re-parsing the string with an
   * arity assumption of its own.
   */
  crossSystemTargets: Map<string, NodeIdPath>;
  /** Service view only: external systems referenced via cross-system edges (outgoing). */
  ghostSystems: GhostSystem[];
  /** Service view only: the cross-system edges targeting ghost systems (outgoing). */
  ghostSystemEdges: KrsEdge[];
  /** Service view only: external systems that call into this service (incoming). */
  callerGhostSystems: GhostSystem[];
  /**
   * Service view only: incoming cross-system edges from caller ghost systems.
   * Edge format: from = "CallerSystemId.CallerServiceId", to = containerId.
   */
  callerGhostSystemEdges: KrsEdge[];
  /**
   * Service view only: domains in other services connected via cross-service domain edges.
   * Each entry pairs the foreign domain node with its parent service label for display.
   */
  ghostDomains: GhostDomain[];
  /**
   * Service view only: cross-service domain edges connecting this service's domains
   * to ghost domains in other services (both outgoing and incoming).
   */
  ghostDomainEdges: KrsEdge[];
  /**
   * Entity view only: entities in other domains connected to this domain's
   * entities via a cross-domain relation (both outgoing and incoming), rendered
   * as muted ghosts. Cross-domain relations use qualified `DomainId.EntityId`
   * targets (bare ids are intra-domain only).
   */
  ghostEntities: GhostEntity[];
  /**
   * Entity view only: the cross-domain relation edges to/from ghost entities.
   * Endpoints are normalized so the foreign endpoint is the qualified
   * `DomainId.EntityId` key and the local endpoint is the bare local entity id,
   * matching how {@link GhostEntity} and local child nodes are keyed in layout.
   */
  ghostEntityEdges: KrsEdge[];
  /**
   * Maps dot-notation resource node IDs (e.g. "OrderDB.OrderTable") to the
   * resolved label of the referenced infra sub-resource (e.g. "注文テーブル").
   * Used to display the infra-defined label instead of the raw ID.
   */
  resourceLabelMap: ReadonlyMap<string, string>;
  /**
   * Maps dot-notation resource node IDs (e.g. "OrderDB.OrderTable") to the
   * inferred style tag (e.g. "table", "queue", "storage").
   * Used to automatically apply resource[table]/resource[queue]/resource[storage]
   * style rules to dot-notation resource nodes that have no explicit tags.
   */
  resourceInferredTagsMap: ReadonlyMap<string, string>;
  /**
   * Maps "fromServiceId->toServiceId" to the list of constituent domain edges
   * that were aggregated into a single "N domain edges" implicit service edge.
   * Only populated for pairs with 2 or more domain edges.
   */
  implicitEdgeDetails: Map<string, DomainEdgeDetail[]>;
  /**
   * Root view only: per-system-frame edge sets, keyed by system id (#2756).
   *
   * The multi-system / `__unassigned__` root lays each system out in its own
   * frame and reads its entry here; {@link childEdges} is the union over all of
   * them, for the consumers that want the whole canvas (style resolution,
   * canonical edge ids, the compare-mode merge) rather than one frame.
   *
   * Absent on every other view, and a missing entry makes the layout fall back to
   * `withChildAnchoredEdges` (`anchored-edges.ts`) — so a hand-built slice keeps
   * working.
   */
  systemEdges?: ReadonlyMap<string, SystemFrameEdges>;
  /**
   * Containers expanded in place (#1921): each entry names a service whose
   * domain children were spliced into `childNodes` as a boundary-frame band.
   * The layout bands the members contiguously and draws a titled frame; empty
   * on every view except the root system view with expansion active.
   */
  expandedFrames: ExpandedFrame[];
}

/**
 * One container expanded in place in the system view (#1921). Its `memberIds`
 * are the domain child ids spliced into the sibling grid; `label` titles the
 * boundary frame the layout draws around that contiguous band.
 */
export interface ExpandedFrame {
  containerId: string;
  label: string;
  memberIds: string[];
}

/**
 * One root-view system frame's edge set, derived by `deriveCanvasEdges` in
 * `derived-edges.ts`.
 *
 * The root view is N frames, each drawing one system's direct children, and each
 * frame owns the edges derived from *its own* node set. Keeping the sets apart is
 * not tidiness: the root view's node map is keyed by bare id, so two systems may
 * each hold an `Api` and a `Store`, and a single flat edge list would let
 * Alpha's `Api->Store` pass Beta's id filter and draw a dependency Beta never
 * declared (#2756).
 */
export interface SystemFrameEdges {
  /**
   * The frame's edges in `childEdges` order: system-scope explicit, child-anchored
   * (#2223), infra-derived, implicit service, expanded-internal, `delivers`.
   */
  edges: KrsEdge[];
  /**
   * The constituent domain edges behind this frame's aggregated implicit service
   * edges (ADR-463's detail panel), keyed by the bare
   * `` `${from}->${to}#${kind}` `` the layout builds from the edge it is drawing.
   *
   * Scoped to the frame rather than merged into {@link ViewSlice.implicitEdgeDetails}:
   * the key carries no system, so merging would make two systems that each
   * aggregate an `Api`→`Store` pair collide, and the last one extracted would
   * supply the details for both frames' lines. A per-frame map answers "whose
   * constituents are these" by construction instead of by key discipline.
   */
  implicitEdgeDetails: Map<string, DomainEdgeDetail[]>;
  /**
   * Compare mode only: this frame's edge diff states, keyed by the kind-less
   * `edgeKey` (#2756). Set by `diffSystemViewSlices`, never by
   * extraction, and scoped to the frame for the same reason the details are:
   * the key does not carry a system, so one shared map would let a change in
   * one system decide the state of an identically named edge in another.
   */
  edgeDiffState?: ReadonlyMap<string, string>;
}

/**
 * Build an empty {@link ViewSlice}. Callers that already resolved the
 * model-level resource maps pass them in; the rest default to empty maps.
 * Single-sources the empty-slice shape shared by `extractView`
 * (`view-extract.ts`) and `extractEntityView` (`entity-relations.ts`) so a new
 * field cannot be forgotten in one of them.
 */
export function emptySlice(
  resourceLabelMap: ReadonlyMap<string, string> = new Map(),
  resourceInferredTagsMap: ReadonlyMap<string, string> = new Map(),
): ViewSlice {
  return {
    containerNode: null,
    childNodes: [],
    childEdges: [],
    ancestorChain: [],
    ghostUsers: [],
    ghostUserEdges: [],
    systems: [],
    crossSystemEdges: [],
    crossSystemTargets: new Map(),
    ghostSystems: [],
    ghostSystemEdges: [],
    callerGhostSystems: [],
    callerGhostSystemEdges: [],
    ghostDomains: [],
    ghostDomainEdges: [],
    ghostEntities: [],
    ghostEntityEdges: [],
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: new Map(),
    systemEdges: new Map(),
    expandedFrames: [],
  };
}
