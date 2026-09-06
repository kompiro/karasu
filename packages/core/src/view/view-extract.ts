import type { KrsNode, KrsEdge, NodeIdPath, ResourceNode } from "../types/ast.js";
import { INFRA_KIND_SET, unionEdgeFacets } from "../types/ast.js";
import { nodePathKey, resolveNodePathBySuffix } from "../parser/node-path.js";
import {
  buildGhostEndpointResolver,
  edgeEndpointRef,
  type GhostEndpointMatch,
} from "../resolver/edge-endpoint.js";
import { isWriteOperation } from "../spec/operations.js";
import { buildEntityResolver, type EntityResolver } from "../resolver/resource-entity.js";

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

/** Walk service→domain→usecase→resource chain and return every resource node. */
function collectResources(node: KrsNode): ResourceNode[] {
  const results: ResourceNode[] = [];
  for (const child of node.children) {
    if (child.kind === "resource") {
      results.push(child as ResourceNode);
    } else {
      results.push(...collectResources(child));
    }
  }
  return results;
}

/**
 * At domain level: collect resource nodes with dot-notation refs from each usecase child,
 * deduplicate by ID, and produce synthetic usecase→resource edges.
 * Used to promote sub-resources to sibling level in the UseCase diagram.
 */
function deriveUsecaseResourceNodes(
  usecases: KrsNode[],
  tagMap: Map<string, string>,
  resolver: EntityResolver,
): { resourceNodes: KrsNode[]; edges: KrsEdge[] } {
  const resourceMap = new Map<string, KrsNode>();
  // Last-wins: a later declaration of the same (usecase, resource) pair
  // overrides the earlier classification. This mirrors how cascading
  // stylesheets resolve conflicts and lets authors override an inherited
  // classification by re-stating the resource with different operations.
  const edgeMap = new Map<string, KrsEdge>();

  for (const usecase of usecases) {
    if (usecase.kind !== "usecase") continue;
    for (const resource of usecase.children) {
      if (resource.kind !== "resource") continue;
      const resNode = resource as ResourceNode;
      // Promote a resource once it is *resolved*: physical dot-notation, or a
      // bare id that resolves to a unique entity (the canonical logical form).
      // Unresolved / ambiguous / [external] bare resources stay unpromoted, as
      // before — their unassigned-resource warning is raised by the resolver.
      if (!resNode.ref && resolver.resolve(resNode).entityId === undefined) continue;

      if (!resourceMap.has(resource.id)) {
        resourceMap.set(resource.id, applyInferredTagsDeep(resource, tagMap));
      }
      const key = `${usecase.id}->${resource.id}`;
      const isWrite = isWriteOperation(resNode.properties.operations);
      edgeMap.set(key, {
        from: usecase.id,
        to: resource.id,
        kind: "sync",
        tags: [isWrite ? "write" : "read"],
        label: isWrite ? "W" : "R",
        syntheticLabel: true,
        loc: resource.loc,
        ...(resNode.authorId !== undefined ? { authorId: resNode.authorId } : {}),
      });
    }
  }

  return { resourceNodes: Array.from(resourceMap.values()), edges: Array.from(edgeMap.values()) };
}

/**
 * Build a map from domain ID → owning service ID, for all services in the given list.
 */
function buildDomainServiceMap(services: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const service of services) {
    if (service.kind !== "service") continue;
    for (const child of service.children) {
      if (child.kind === "domain") {
        map.set(child.id, service.id);
      }
    }
  }
  return map;
}

/**
 * Derive implicit service→service edges from domain-level edges that cross service boundaries.
 * When a domain in serviceA has `-> domainInServiceB`, and no explicit serviceA→serviceB edge
 * exists in the system, synthesize one with tags: ["implicit"].
 *
 * Edges are grouped by (from, to, kind) so sync and async cross-service domain edges between
 * the same service pair produce two distinct implicit edges. This preserves the visual
 * sync/async distinction at the system level (color = derived, dash style = async).
 *
 * Multiple domain edges sharing the same (from, to, kind) are aggregated into a single edge
 * with label "N domain edges" (or the single label if there is only one).
 *
 * Returns both the synthesized edges and a detail map keyed by "fromServiceId->toServiceId"
 * containing the constituent domain edges for each aggregated pair.
 */
function deriveImplicitServiceEdges(
  services: KrsNode[],
  explicitKeys: Set<string>,
  /**
   * Service ids expanded in place (#1921). A domain whose owning service is
   * expanded keeps its own id as the cross-boundary endpoint (so the edge lands
   * on the exact internal domain, not the aggregated service), while an endpoint
   * in a collapsed sibling stays at the service id. When both endpoints are
   * inside the *same* expanded service the edge is a real internal domain edge,
   * returned via `internalEdges` (not implicit-tagged, not aggregated).
   */
  expanded?: ReadonlySet<string>,
): {
  edges: KrsEdge[];
  details: Map<string, DomainEdgeDetail[]>;
  internalEdges: KrsEdge[];
} {
  const domainServiceMap = buildDomainServiceMap(services);

  // Build a map from domain ID → domain label for display in the detail panel
  const domainLabelMap = new Map<string, string>();
  for (const service of services) {
    if (service.kind !== "service") continue;
    for (const domain of service.children) {
      if (domain.kind === "domain") {
        domainLabelMap.set(domain.id, domain.label ?? domain.id);
      }
    }
  }

  // The visible cross-boundary endpoint for a domain: its own id when its owning
  // service is expanded in place, otherwise the aggregated owning-service id.
  const endpointOf = (domainId: string, ownerServiceId: string): string =>
    expanded?.has(ownerServiceId) ? domainId : ownerServiceId;

  // Collect all cross-boundary domain edges grouped by (endpoint pair, kind)
  const grouped = new Map<
    string,
    {
      edge: KrsEdge;
      count: number;
      label: string | undefined;
      details: DomainEdgeDetail[];
      /** Union over the constituents, for the aggregate's overlay membership (#2544). */
      facets: string[] | undefined;
    }
  >();
  // Real domain→domain edges internal to an expanded service (both ends inside
  // the same expanded service): shown as first-class edges, not aggregated.
  const internalEdges: KrsEdge[] = [];

  for (const service of services) {
    if (service.kind !== "service") continue;
    for (const domain of service.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        const targetServiceId = domainServiceMap.get(edge.to);
        if (!targetServiceId) continue;
        if (targetServiceId === service.id) {
          // Same-service domain edge: only surfaced when that service is
          // expanded in place (otherwise it stays hidden inside the box).
          if (expanded?.has(service.id)) internalEdges.push(edge);
          continue;
        }
        // Suppression stays keyed on the *service* pair even under expansion:
        // an authored explicit serviceA→serviceB edge should still hide the
        // derived edge, whichever granularity the endpoints render at (#1921).
        const servicePairKey = `${service.id}->${targetServiceId}`;
        if (explicitKeys.has(servicePairKey)) continue;
        const fromEndpoint = endpointOf(domain.id, service.id);
        const toEndpoint = endpointOf(edge.to, targetServiceId);
        const groupKey = `${fromEndpoint}->${toEndpoint}#${edge.kind}`;
        const detail: DomainEdgeDetail = {
          fromDomainId: domain.id,
          fromDomainLabel: domainLabelMap.get(domain.id) ?? domain.id,
          toDomainId: edge.to,
          toDomainLabel: domainLabelMap.get(edge.to) ?? edge.to,
          label: edge.label,
        };
        const existing = grouped.get(groupKey);
        if (existing) {
          existing.count += 1;
          existing.label = undefined; // multiple: will use count label
          existing.details.push(detail);
          existing.facets = unionEdgeFacets(existing.facets, edge.facets);
        } else {
          grouped.set(groupKey, {
            edge: { ...edge, from: fromEndpoint, to: toEndpoint, tags: ["implicit"] },
            count: 1,
            label: edge.label,
            details: [detail],
            facets: unionEdgeFacets(undefined, edge.facets),
          });
        }
      }
    }
  }

  const edges = Array.from(grouped.entries()).map(([, { edge, count, label, facets }]) => {
    // A single passthrough *is* the authored edge, re-anchored to the service
    // endpoints, so it keeps that edge's label and its property block.
    if (count === 1) return { ...edge, label };
    // An aggregate is not any one of the edges it folds. Its label is already
    // machine-generated, and carrying the first constituent's `description` /
    // `link` would attribute that prose to a bundle it does not describe
    // (#2543). The constituents stay readable through `implicitEdgeDetails`.
    //
    // Membership goes the other way: it is a set, so the union *is* true of the
    // bundle, and dropping it would leave a folded edge dim while a folded node
    // in the same facet lights up (#2544).
    const aggregated: KrsEdge = {
      ...edge,
      label: `${count} domain edges`,
      syntheticLabel: true,
    };
    delete aggregated.description;
    delete aggregated.links;
    if (facets !== undefined && facets.length > 0) aggregated.facets = facets;
    else delete aggregated.facets;
    return aggregated;
  });

  // Only include detail map entries for aggregated (multi-edge) pairs
  const details = new Map<string, DomainEdgeDetail[]>();
  for (const [key, { count, details: d }] of grouped) {
    if (count > 1) {
      details.set(key, d);
    }
  }

  return { edges, details, internalEdges };
}

/**
 * Derive synthetic service→database/queue/storage edges from resource references.
 * For each service, walks all descendant resource nodes with dot-notation refs and
 * creates one edge per unique (service, infra) pair.
 *
 * Exported as the single source of truth for the service→infra dependency: the
 * system view consumes it to draw `service → database` edges, and the deploy view
 * (`extractDeployView`) reuses it so both views agree on the dependency set
 * (see ADR-1658, TPL-1415).
 */
export function deriveInfraEdges(
  children: KrsNode[],
  // The resolver that maps a bare `resource <id>` to its entity's store. Callers
  // with a model-wide resolver already built (`extractView`) pass it so resource→
  // entity resolution matches the usecase-view promotion exactly (one namespace,
  // not one scope per call). Defaults to a resolver over `children` for callers
  // that don't have one (e.g. the deploy view, whose `children` is model-wide).
  resolver: EntityResolver = buildEntityResolver(children),
): KrsEdge[] {
  const infraIds = new Set(children.filter((n) => INFRA_KIND_SET.has(n.kind)).map((n) => n.id));
  if (infraIds.size === 0) return [];

  const syntheticEdges: KrsEdge[] = [];
  const seen = new Set<string>();

  for (const child of children) {
    if (child.kind !== "service") continue;
    for (const resource of collectResources(child)) {
      // Resolve to the target store, whether physical (`OrderDB.orders`) or
      // entity-mediated (`resource Order` → `entity Order { table OrderDB.orders }`).
      const parentId = resolver.resolve(resource).infraParentId;
      if (parentId === undefined || !infraIds.has(parentId)) continue;
      // Keyed on the resolved store, so a physical direct reference and an
      // entity-mediated reference reaching the *same* store are not double
      // counted (the same class of dedup as explicit-suppresses-derived below).
      const key = `${child.id}->${parentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      syntheticEdges.push({
        from: child.id,
        to: parentId,
        kind: "sync",
        tags: [],
        loc: resource.loc,
      });
    }
  }

  return syntheticEdges;
}

/**
 * Derive `service -> client` edges from each service's `properties.delivers` declaration.
 * Only edges whose target id matches a `client` peer in `children` are surfaced; unresolved
 * targets are reported as warnings by the resolver. Edges are tagged `delivers` so the
 * stylesheet can render them distinctly from regular communication edges.
 */
function deriveDeliversEdges(children: KrsNode[]): KrsEdge[] {
  const clientIds = new Set(children.filter((c) => c.kind === "client").map((c) => c.id));
  if (clientIds.size === 0) return [];

  const edges: KrsEdge[] = [];
  const seen = new Set<string>();
  for (const child of children) {
    if (child.kind !== "service") continue;
    const delivers = child.properties.delivers;
    if (!delivers || delivers.length === 0) continue;
    for (const targetId of delivers) {
      if (!clientIds.has(targetId)) continue;
      const key = `${child.id}->${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: child.id,
        to: targetId,
        kind: "sync",
        tags: ["delivers"],
        loc: child.loc,
      });
    }
  }
  return edges;
}

/**
 * ViewPath identifies the drill-down position in the hierarchy.
 * [] = root system view (shows systems[0])
 * ["ECPlatform", "ECommerce"] = ECommerce service inside ECPlatform system
 * ["ECPlatform", "ECommerce", "Order"] = Order domain inside ECommerce
 *
 * path[0] is the system ID when it matches a known system.
 * Unassigned top-level domains retain single-segment paths (e.g. ["Payment"]).
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

interface GhostDomain {
  node: KrsNode;
  /** Label of the service that owns this domain — shown as sub-label on the ghost node. */
  parentServiceLabel: string;
}

interface GhostEntity {
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
  resourceLabelMap: Map<string, string>;
  /**
   * Maps dot-notation resource node IDs (e.g. "OrderDB.OrderTable") to the
   * inferred style tag (e.g. "table", "queue", "storage").
   * Used to automatically apply resource[table]/resource[queue]/resource[storage]
   * style rules to dot-notation resource nodes that have no explicit tags.
   */
  resourceInferredTagsMap: Map<string, string>;
  /**
   * Maps "fromServiceId->toServiceId" to the list of constituent domain edges
   * that were aggregated into a single "N domain edges" implicit service edge.
   * Only populated for pairs with 2 or more domain edges.
   */
  implicitEdgeDetails: Map<string, DomainEdgeDetail[]>;
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
interface ExpandedFrame {
  containerId: string;
  label: string;
  memberIds: string[];
}

function nodeId(node: KrsNode): string {
  return node.id;
}

/**
 * Identity of a drawn edge: the endpoint pair **and** the arrow kind, so a
 * sync and an async edge between the same pair stay two edges. Suppression of
 * *derived* edges keys on the bare pair instead — see `explicitKeys`.
 */
function drawnEdgeKey(edge: KrsEdge): string {
  return `${edge.from}-${edge.kind}->${edge.to}`;
}

/**
 * Does this edge start at the block that declares it? The **edge origin scope**
 * rule (spec § Edge declaration), stated once for every consumer: the parser
 * rejects a mismatch with `edge-source-mismatch` but keeps the declaration for
 * recovery, so the render side has to ask the same question again (#2501).
 *
 * Kept as one definition because the answer feeds three separate paths — the
 * peer canvas, the system-scope machinery, and the entity view — and a rule
 * spelled three times is a rule that drifts.
 */
function isAnchoredAt(child: KrsNode, edge: KrsEdge): boolean {
  return edge.from === nodeId(child);
}

/**
 * The block kinds the parser binds to their own id, mirroring the `parentId`
 * it passes in `parser.ts` (`kind === "service" || "domain" || "entity"`). Only
 * these raise `edge-source-mismatch`, so only these have a diagnostic to carry
 * the signal when the render side drops an edge.
 */
const ORIGIN_SCOPED_KINDS: ReadonlySet<KrsNode["kind"]> = new Set(["service", "domain", "entity"]);

/**
 * May the parent canvas lift this edge off `child`? Anchored edges always may.
 * An edge in a block with **no** origin-scope rule may too, exactly as written:
 * `client W { S1 -> S2 }` parses clean and is reported by nothing, so guarding
 * it would drop it with no signal anywhere — the silent drop TPL-2075 forbids.
 * That placement is outside the spec either way; this keeps it as it was rather
 * than making it newly renderable or newly invisible.
 */
function isLiftableToPeerCanvas(child: KrsNode, edge: KrsEdge): boolean {
  return !ORIGIN_SCOPED_KINDS.has(child.kind) || isAnchoredAt(child, edge);
}

/**
 * Child-anchored edges (#2223). An edge declared inside a `service` / `domain`
 * block originates from that block (spec § Edge origin scope), so the canvas
 * that can draw it is the **parent's** — the one where the declaring block
 * itself is a node. Collecting them here is what gives `service S1 { S1 -> S2 }`
 * a rendering path at all; without it the edge sits on `S1.edges`, is only ever
 * consulted while drawing S1's own canvas, and can never satisfy that canvas's
 * "both endpoints are children of S1" filter.
 *
 * The peer set is the drawn siblings' ids, which is exactly the `peersOf` set
 * `detectEdgeEndpointsNotAtScope` uses (`resolver/warnings.ts`). Peer-ness is
 * not the whole keep condition, though: the edge must also be
 * {@link isLiftableToPeerCanvas}, which sends a source-mismatched declaration
 * to the **parser's** `edge-source-mismatch` instead (#2501). So an edge is
 * still drawn here or reported somewhere and never both, but "reported" now
 * spans both stages rather than this detector alone (TPL-2075).
 *
 * `entity` children are excluded: their relations render in the (separate)
 * entity view via {@link extractEntityView}, and the entities themselves are
 * filtered out of this canvas's nodes.
 *
 * `drawnKeys` is read **and extended**, so callers can chain this after the
 * container's own edges and let those win on a duplicate spelling.
 */
function collectAnchoredPeerEdges(children: KrsNode[], drawnKeys: Set<string>): KrsEdge[] {
  const renderable = children.filter((c) => c.kind !== "entity");
  const peerIds = new Set(renderable.map(nodeId));
  const anchored: KrsEdge[] = [];
  for (const child of renderable) {
    for (const edge of child.edges) {
      if (!isLiftableToPeerCanvas(child, edge)) continue;
      if (!peerIds.has(edge.from) || !peerIds.has(edge.to)) continue;
      const key = drawnEdgeKey(edge);
      if (drawnKeys.has(key)) continue;
      anchored.push(edge);
      drawnKeys.add(key);
    }
  }
  return anchored;
}

/**
 * A system's edges plus every edge anchored inside one of its child blocks
 * (#2223) — `service S { S -> Other.Svc }` is the service-scope spelling of
 * `system T { S -> Other.Svc }`, so it must feed the same system-scope
 * machinery: ghost systems, caller ghost systems, cross-system edges and
 * ghost users. Only {@link isAnchoredAt} edges are lifted, and the premise is
 * why: an edge is the child-scope spelling of a system-scope one *because* it
 * starts at the child. An edge that does not — `client W { S1 -> S2 }` — is no
 * such spelling, and feeding it here would attribute cross-system calls and
 * caller ghosts to a service that never declared them, and (this list carrying
 * no dedup of its own) draw a second parallel arrow beside the system-scope
 * edge it duplicates. Unlike {@link collectAnchoredPeerEdges}, this is not a
 * canvas keep-filter, so the extra allowance made there does not apply here.
 *
 * Exported for `renderer/layout.ts`: the multi-system / `__unassigned__` root
 * lays each system out from `sys.edges` rather than from `ViewSlice.childEdges`,
 * so it has to lift the anchored ones itself or the edge is dropped again
 * between extraction and layout.
 */
export function withChildAnchoredEdges(system: KrsNode): KrsEdge[] {
  const anchored = system.children.flatMap((child) =>
    child.edges.filter((e) => isAnchoredAt(child, e)),
  );
  return anchored.length > 0 ? [...system.edges, ...anchored] : system.edges;
}

/**
 * Build an empty {@link ViewSlice}. Callers that already resolved the
 * model-level resource maps pass them in; the rest default to empty maps.
 * Single-sources the empty-slice shape shared by {@link extractView} and
 * {@link extractEntityView} so a new field cannot be forgotten in one of them.
 */
function emptySlice(
  resourceLabelMap: Map<string, string> = new Map(),
  resourceInferredTagsMap: Map<string, string> = new Map(),
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
    expandedFrames: [],
  };
}

/** Maps infra sub-resource kind to the style tag used in resource[tag] rules. */
const KIND_TO_INFERRED_TAG: Partial<Record<string, string>> = {
  table: "table",
  "queue-item": "queue",
  bucket: "storage",
};

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * inferred style tag (e.g. "table") derived from the referenced sub-resource kind.
 */
function buildResourceInferredTagsMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const tag = KIND_TO_INFERRED_TAG[sub.kind];
        if (tag) map.set(`${node.id}.${sub.id}`, tag);
      }
    }
  }
  return map;
}

/**
 * Recursively apply inferred tags to all resource nodes in a subtree that have a
 * dot-notation ref but no explicit tags. Explicit tags always take precedence.
 * Non-resource interior nodes are shallow-copied only when their children changed.
 */
function applyInferredTagsDeep(node: KrsNode, tagMap: Map<string, string>): KrsNode {
  const patchedChildren =
    node.children.length > 0
      ? node.children.map((c) => applyInferredTagsDeep(c, tagMap))
      : node.children;
  const childrenChanged = patchedChildren.some((c, i) => c !== node.children[i]);

  if (node.kind === "resource" && node.tags.length === 0 && node.ref) {
    const inferredTag = tagMap.get(node.id);
    if (inferredTag) {
      return {
        ...node,
        children: childrenChanged ? patchedChildren : node.children,
        tags: [inferredTag],
      };
    }
  }

  if (childrenChanged) return { ...node, children: patchedChildren };
  return node;
}

/**
 * Apply inferred tags to all resource nodes (at any depth) that have a dot-notation ref
 * but no explicit tags. Nodes with explicit tags are returned unchanged.
 */
function applyInferredTags(nodes: KrsNode[], tagMap: Map<string, string>): KrsNode[] {
  if (tagMap.size === 0) return nodes;
  return nodes.map((node) => applyInferredTagsDeep(node, tagMap));
}

/**
 * Build a map from dot-notation resource IDs (e.g. "OrderDB.OrderTable") to the
 * label of the referenced infra sub-resource (e.g. "注文テーブル").
 * Covers database/queue/storage nodes and their children across all systems.
 */
function buildResourceLabelMap(systems: KrsNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const system of systems) {
    for (const node of system.children) {
      if (!INFRA_KIND_SET.has(node.kind)) continue;
      for (const sub of node.children) {
        const key = `${node.id}.${sub.id}`;
        map.set(key, sub.label ?? sub.id);
      }
    }
  }
  return map;
}

/**
 * Find all services in other systems that have a cross-system edge targeting
 * `containerSystemId.containerId`. Returns caller ghost systems (rendered to the
 * left of the container) and synthetic edges in the form:
 *   from = "CallerSystemId.CallerServiceId", to = containerId
 */
function buildCallerGhostSystems(
  containerId: string,
  containerSystemId: string,
  allSystems: KrsNode[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): { callerGhostSystems: GhostSystem[]; callerGhostSystemEdges: KrsEdge[] } {
  const targetKey = nodePathKey([containerSystemId, containerId]);
  const map = new Map<string, GhostSystem>();
  const edges: KrsEdge[] = [];

  for (const sys of allSystems) {
    if (sys.id === containerSystemId) continue;
    // Service-anchored edges count as callers too (#2223).
    for (const edge of withChildAnchoredEdges(sys)) {
      if (!edge.to.includes(".")) continue;
      // Match on where the reference *resolves*, not on how it is spelled: a
      // caller may now name this container by any suffix that reaches it
      // (#2577). For `Sys.Child` the resolved path is that same string, so
      // existing caller frames are unchanged.
      const match = resolveGhost(edgeEndpointRef(edge.to));
      if (!match || nodePathKey(match.path) !== targetKey) continue;
      const callerService = sys.children.find((c) => c.id === edge.from);
      if (!callerService) continue;
      const callerPath = [sys.id, callerService.id];
      if (!map.has(sys.id)) {
        map.set(sys.id, { systemNode: sys, visibleServices: [] });
      }
      const gs = map.get(sys.id)!;
      if (!gs.visibleServices.some((s) => s.node.id === callerService.id)) {
        gs.visibleServices.push({ node: callerService, path: callerPath });
      }
      // Qualify the from-ID so layout can find it in layoutNodes by qualified key
      edges.push({ ...edge, from: nodePathKey(callerPath), to: containerId });
    }
  }
  return {
    callerGhostSystems: Array.from(map.values()),
    callerGhostSystemEdges: edges,
  };
}

/** The separator between ancestor labels on a deep ghost's sub-label. */
const GHOST_PATH_SEPARATOR = " › ";

/** Muted "where this actually lives" line for a ghost below the frame's top level. */
function ghostSubLabel(match: GhostEndpointMatch): string | undefined {
  if (match.ancestors.length === 0) return undefined;
  return match.ancestors.map((a) => a.label ?? a.id).join(GHOST_PATH_SEPARATOR);
}

function buildGhostSystems(
  edges: KrsEdge[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): GhostSystem[] {
  const map = new Map<string, GhostSystem>();
  for (const edge of edges) {
    if (!edge.to.includes(".")) continue;
    const match = resolveGhost(edgeEndpointRef(edge.to));
    if (!match) continue;
    const sysId = match.system.id;
    if (!map.has(sysId)) {
      map.set(sysId, { systemNode: match.system, visibleServices: [] });
    }
    const gs = map.get(sysId)!;
    const key = nodePathKey(match.path);
    if (!gs.visibleServices.some((s) => nodePathKey(s.path) === key)) {
      const subLabel = ghostSubLabel(match);
      gs.visibleServices.push({
        node: match.node,
        path: match.path,
        ...(subLabel !== undefined ? { subLabel } : {}),
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Collect ghost domain nodes for the service drill-down view.
 * A ghost domain is a domain node in another service that is connected to
 * this service's domains via a cross-service domain edge (outgoing or incoming).
 *
 * Returns:
 *   ghostDomains — unique foreign GhostDomain entries (node + parentServiceLabel)
 *   ghostDomainEdges — the cross-service edges (original from/to domain IDs preserved)
 */
function buildGhostDomains(
  containerId: string,
  system: KrsNode,
): { ghostDomains: GhostDomain[]; ghostDomainEdges: KrsEdge[] } {
  const allServices = system.children.filter((c) => c.kind === "service");
  const domainServiceMap = buildDomainServiceMap(allServices);
  const localDomainIds = new Set(
    allServices
      .find((s) => s.id === containerId)
      ?.children.filter((c) => c.kind === "domain")
      .map((c) => c.id) ?? [],
  );

  const ghostDomainMap = new Map<string, GhostDomain>();
  const ghostDomainEdges: KrsEdge[] = [];

  // Outgoing: edges from this service's domains to domains in other services
  const containerService = allServices.find((s) => s.id === containerId);
  if (containerService) {
    for (const domain of containerService.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        const targetServiceId = domainServiceMap.get(edge.to);
        if (!targetServiceId || targetServiceId === containerId) continue;
        if (!ghostDomainMap.has(edge.to)) {
          const targetService = allServices.find((s) => s.id === targetServiceId);
          const foreignDomain = targetService?.children.find(
            (c) => c.kind === "domain" && c.id === edge.to,
          );
          if (foreignDomain) {
            ghostDomainMap.set(edge.to, {
              node: foreignDomain,
              parentServiceLabel: targetService?.label ?? targetServiceId,
            });
          }
        }
        ghostDomainEdges.push(edge);
      }
    }
  }

  // Incoming: edges from domains in other services into this service's domains
  for (const service of allServices) {
    if (service.id === containerId) continue;
    for (const domain of service.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        if (!localDomainIds.has(edge.to)) continue;
        if (!ghostDomainMap.has(domain.id)) {
          ghostDomainMap.set(domain.id, {
            node: domain,
            parentServiceLabel: service.label ?? service.id,
          });
        }
        ghostDomainEdges.push(edge);
      }
    }
  }

  return {
    ghostDomains: Array.from(ghostDomainMap.values()),
    ghostDomainEdges,
  };
}

/**
 * Shared context threaded through the {@link extractView} phase helpers:
 * model-wide maps and resolvers that don't vary across the orphan / root /
 * drill-down branches, computed once in {@link extractView}.
 */
interface ViewExtractContext {
  resourceLabelMap: Map<string, string>;
  resourceInferredTagsMap: Map<string, string>;
  empty: ViewSlice;
  entityResolver: EntityResolver;
  /**
   * Resolves a qualified endpoint to the node and the top-level system that
   * frames it (#2577). Built once per extraction, like `entityResolver`: the
   * walk is over every system and each ghost lookup would otherwise repeat it.
   */
  ghostEndpoint: (ref: NodeIdPath) => GhostEndpointMatch | undefined;
}

interface PromotedChildren {
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
}

/**
 * Child-collection phase, shared by the orphan drill-down and system
 * drill-down branches: at domain level, promote resource nodes with
 * dot-notation refs to sibling level (via {@link deriveUsecaseResourceNodes})
 * so they appear as connected nodes in the UseCase diagram. Entities are
 * excluded at every container kind — they render only in the (separate)
 * entity view, so keeping them out here avoids stray unstyled boxes and a
 * collision with an entity-resolved bare `resource` promoted above (which
 * shares the entity's id).
 */
function collectPromotedChildren(
  container: KrsNode,
  edges: KrsEdge[],
  resourceInferredTagsMap: Map<string, string>,
  entityResolver: EntityResolver,
): PromotedChildren {
  const renderableChildren = container.children.filter((c) => c.kind !== "entity");
  let childNodes = applyInferredTags(renderableChildren, resourceInferredTagsMap);
  let childEdges = edges;
  if (container.kind === "domain") {
    const { resourceNodes, edges: resourceEdges } = deriveUsecaseResourceNodes(
      renderableChildren,
      resourceInferredTagsMap,
      entityResolver,
    );
    if (resourceNodes.length > 0) {
      childNodes = [...childNodes, ...resourceNodes];
      childEdges = [...edges, ...resourceEdges];
    }
  }
  return { childNodes, childEdges };
}

interface GhostSynthesis {
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
  ghostSystems: GhostSystem[];
  ghostSystemEdges: KrsEdge[];
  callerGhostSystems: GhostSystem[];
  callerGhostSystemEdges: KrsEdge[];
  ghostDomains: GhostDomain[];
  ghostDomainEdges: KrsEdge[];
}

function emptyGhostSynthesis(): GhostSynthesis {
  return {
    ghostUsers: [],
    ghostUserEdges: [],
    ghostSystems: [],
    ghostSystemEdges: [],
    callerGhostSystems: [],
    callerGhostSystemEdges: [],
    ghostDomains: [],
    ghostDomainEdges: [],
  };
}

/**
 * Ghost-edge synthesis phase, service view only: builds every ghost category
 * (users, ghost systems, caller ghost systems, ghost domains) attached to
 * `containerNode`. Only called when the drill-down path resolves to service
 * granularity — see {@link extractSystemDrillDownView}'s `isServiceView` check.
 */
function synthesizeGhosts(
  containerNode: KrsNode,
  system: KrsNode,
  systems: KrsNode[],
  resolveGhost: (ref: NodeIdPath) => GhostEndpointMatch | undefined,
): GhostSynthesis {
  const containerId = nodeId(containerNode);
  // Service-anchored edges behave as system-scope edges (#2223), so every
  // system-scope lookup below reads them too.
  const systemScopeEdges = withChildAnchoredEdges(system);
  const users = system.children.filter((c) => c.kind === "user");
  const connectedEdges = systemScopeEdges.filter(
    (e) =>
      (users.some((p) => nodeId(p) === e.from) && e.to === containerId) ||
      (users.some((p) => nodeId(p) === e.to) && e.from === containerId),
  );
  const connectedUserIds = new Set(
    connectedEdges.flatMap((e) => {
      const ids: string[] = [];
      if (e.from !== containerId) ids.push(e.from);
      if (e.to !== containerId) ids.push(e.to);
      return ids;
    }),
  );
  const ghostUsers = users.filter((p) => connectedUserIds.has(nodeId(p)));
  const ghostUserEdges = connectedEdges;

  // Ghost systems: edges from this service to qualified targets in other known systems
  const candidateEdges = systemScopeEdges.filter(
    (e) => e.from === containerId && e.to.includes("."),
  );
  const ghostSystems = buildGhostSystems(candidateEdges, resolveGhost);
  // Only include edges that resolved to a known ghost system. Asking the
  // resolver again (rather than re-splitting the string) keeps this filter and
  // the frame it filters against on one definition of where a path lands.
  const ghostSystemEdges = candidateEdges.filter(
    (e) => resolveGhost(edgeEndpointRef(e.to)) !== undefined,
  );

  // Caller ghost systems: other systems that have edges pointing into this service
  const { callerGhostSystems, callerGhostSystemEdges } = buildCallerGhostSystems(
    containerId,
    system.id,
    systems,
    resolveGhost,
  );

  // Ghost domains: cross-service domain edges (both outgoing and incoming)
  const { ghostDomains, ghostDomainEdges } = buildGhostDomains(containerId, system);

  return {
    ghostUsers,
    ghostUserEdges,
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
  };
}

/**
 * Among `allChildren`, find every service named in `expandedContainers`
 * (#1921) that actually has domain children — the ones eligible to be
 * spliced into the sibling grid as a boundary-frame band.
 */
function resolveExpandedServices(
  allChildren: KrsNode[],
  expandedContainers: ReadonlySet<string> | undefined,
): { expandedServices: Map<string, KrsNode>; expandedSet: ReadonlySet<string> | undefined } {
  const expandedServices = new Map<string, KrsNode>();
  if (expandedContainers && expandedContainers.size > 0) {
    for (const child of allChildren) {
      if (
        child.kind === "service" &&
        expandedContainers.has(child.id) &&
        child.children.some((c) => c.kind === "domain")
      ) {
        expandedServices.set(child.id, child);
      }
    }
  }
  const expandedSet = expandedServices.size > 0 ? new Set(expandedServices.keys()) : undefined;
  return { expandedServices, expandedSet };
}

/**
 * Expanded-frame construction phase: splice each expanded service's domains
 * into the sibling grid in place of the service node, and record the frame
 * band the layout draws around each contiguous member band.
 */
function spliceExpandedFrames(
  allChildren: KrsNode[],
  expandedServices: Map<string, KrsNode>,
  resourceInferredTagsMap: Map<string, string>,
): { childNodes: KrsNode[]; expandedFrames: ExpandedFrame[] } {
  const expandedFrames: ExpandedFrame[] = [];
  const childNodes: KrsNode[] = [];
  for (const child of allChildren) {
    const expanded = expandedServices.get(nodeId(child));
    if (expanded) {
      const domains = applyInferredTags(
        expanded.children.filter((c) => c.kind === "domain"),
        resourceInferredTagsMap,
      );
      childNodes.push(...domains);
      expandedFrames.push({
        containerId: expanded.id,
        label: expanded.label ?? expanded.id,
        memberIds: domains.map(nodeId),
      });
    } else {
      childNodes.push(child);
    }
  }
  return { childNodes, expandedFrames };
}

/**
 * No-system-file phase: render orphan services/domains as peer nodes with no
 * container (`path.length === 0`), or drill down from an orphan as the path
 * root (`path.length > 0`). Mirrors {@link extractRootSystemView} /
 * {@link extractSystemDrillDownView} for the no-system case.
 */
function extractOrphanView(orphans: KrsNode[], path: ViewPath, ctx: ViewExtractContext): ViewSlice {
  const { empty, resourceInferredTagsMap, entityResolver } = ctx;
  if (orphans.length === 0) return empty;

  if (path.length === 0) {
    // Orphans are drawn as siblings on one canvas, so an edge anchored inside
    // one of them draws here (#2223) — the same treatment the `__unassigned__`
    // pseudo-system gives them on the SVG path. Collected first so an anchored
    // service edge suppresses the implicit one derived for the same pair.
    const anchoredEdges = collectAnchoredPeerEdges(orphans, new Set());
    const { edges: implicitServiceEdges, details: implicitEdgeDetails } =
      deriveImplicitServiceEdges(
        orphans.filter((c) => c.kind === "service"),
        new Set(anchoredEdges.map((e) => `${e.from}->${e.to}`)),
      );
    const derivedEdges = deriveInfraEdges(orphans, entityResolver);
    const deliversEdges = deriveDeliversEdges(orphans);
    return {
      ...empty,
      childNodes: orphans,
      childEdges: [...anchoredEdges, ...derivedEdges, ...implicitServiceEdges, ...deliversEdges],
      implicitEdgeDetails,
    };
  }

  // Drill-down under orphan root
  const root = orphans.find((c) => nodeId(c) === path[0]);
  if (!root) return empty;
  const chain: KrsNode[] = [root];
  let cursor: KrsNode = root;
  for (let i = 1; i < path.length; i++) {
    const child = cursor.children.find((c) => nodeId(c) === path[i]);
    if (!child) return empty;
    chain.push(child);
    cursor = child;
  }
  const container = chain.pop()!;
  const containerChildIds = new Set(container.children.map(nodeId));
  const ownEdges = container.edges.filter(
    (e) => containerChildIds.has(e.from) && containerChildIds.has(e.to),
  );
  const drawnKeys = new Set(ownEdges.map(drawnEdgeKey));
  const edges = [...ownEdges, ...collectAnchoredPeerEdges(container.children, drawnKeys)];
  // Entities render only in the (separate) entity view — exclude them from the
  // domain / usecase drill-down so they neither appear as stray unstyled boxes
  // nor collide with an entity-resolved bare `resource` promoted below (which
  // shares the entity's id). Mirrors the systems-branch filter.
  const { childNodes, childEdges } = collectPromotedChildren(
    container,
    edges,
    resourceInferredTagsMap,
    entityResolver,
  );
  return {
    ...empty,
    containerNode: container,
    childNodes,
    childEdges,
    ancestorChain: chain,
  };
}

/**
 * Root system view phase (`path.length === 0`, at least one system present):
 * shows `systems[0]`'s direct children plus unassigned orphans, with derived
 * infra/implicit-service/delivers edges, in-place service expansion (#1921),
 * and the full cross-system edge set for the multi-system root.
 */
function extractRootSystemView(
  systems: KrsNode[],
  unassignedServices: KrsNode[],
  unassignedDomains: KrsNode[],
  expandedContainers: ReadonlySet<string> | undefined,
  ctx: ViewExtractContext,
): ViewSlice {
  const { resourceLabelMap, resourceInferredTagsMap, entityResolver } = ctx;
  const system = systems[0];
  const allChildren = [...system.children, ...unassignedServices, ...unassignedDomains];
  const childIds = new Set(allChildren.map(nodeId));
  const systemScopeEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
  const derivedEdges = deriveInfraEdges(allChildren, entityResolver);
  // Service-anchored edges (#2223) are explicit edges of this canvas too: the
  // peer set is the system's own children, so a spliced-in orphan is not a
  // peer of a service the way a declared sibling is.
  const anchoredEdges = collectAnchoredPeerEdges(
    system.children,
    new Set(systemScopeEdges.map(drawnEdgeKey)),
  );
  const explicitEdges = [...systemScopeEdges, ...anchoredEdges];
  // Merge derived edges, skipping any already covered by an explicit one. Keyed
  // on the bare pair (not the arrow kind) because suppression asks "is this
  // dependency already authored", which an anchored edge answers too.
  const explicitKeys = new Set(explicitEdges.map((e) => `${e.from}->${e.to}`));

  // In-place expansion (#1921): a service named in `expandedContainers` that
  // actually has domain children is replaced by those domains as a boundary
  // frame band; cross-boundary edges re-anchor to the exact internal domain.
  const { expandedServices, expandedSet } = resolveExpandedServices(
    allChildren,
    expandedContainers,
  );

  const {
    edges: implicitServiceEdges,
    details: implicitEdgeDetails,
    internalEdges,
  } = deriveImplicitServiceEdges(
    allChildren.filter((c) => c.kind === "service"),
    explicitKeys,
    expandedSet,
  );
  const deliversEdges = deriveDeliversEdges(allChildren);

  // Splice each expanded service's domains into the sibling grid, and record
  // the frame band the layout draws around them.
  const { childNodes, expandedFrames } = spliceExpandedFrames(
    allChildren,
    expandedServices,
    resourceInferredTagsMap,
  );

  const childEdges = [
    ...explicitEdges,
    ...derivedEdges.filter((e) => !explicitKeys.has(`${e.from}->${e.to}`)),
    ...implicitServiceEdges,
    ...internalEdges,
    ...deliversEdges,
  ];

  // Cross-system edges: collect from all systems where the target is qualified
  // and lands somewhere in the model. The membership test used to be "the
  // first segment names a known system", which is the same question the ghost
  // resolver answers — asked once, at any depth (#2577).
  const crossSystemTargets = new Map<string, NodeIdPath>();
  const crossSystemEdges = systems.flatMap((sys) =>
    withChildAnchoredEdges(sys).filter((e) => {
      if (!e.to.includes(".")) return false;
      const match = ctx.ghostEndpoint(edgeEndpointRef(e.to));
      if (!match) return false;
      crossSystemTargets.set(e.to, match.path);
      return true;
    }),
  );

  return {
    containerNode: system,
    childNodes,
    childEdges,
    ancestorChain: [],
    ghostUsers: [],
    ghostUserEdges: [],
    systems,
    crossSystemEdges,
    crossSystemTargets,
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
    implicitEdgeDetails,
    expandedFrames,
  };
}

/**
 * Drill-down phase for a known system (`path.length > 0`): resolves the
 * container via {@link resolveContainerChain} (path resolution), collects its
 * child edges (including domain-to-domain edges surfaced at service level),
 * synthesizes ghost users/systems/domains at service granularity, and
 * promotes dot-notation resources at domain granularity.
 */
function extractSystemDrillDownView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedServices: KrsNode[],
  unassignedDomains: KrsNode[],
  ctx: ViewExtractContext,
): ViewSlice {
  const { empty, resourceLabelMap, resourceInferredTagsMap, entityResolver } = ctx;

  // Determine the active system and walk the path to the container.
  // path[0] is the system ID when it matches a known system. Otherwise the
  // caller omitted the system prefix (e.g. drilling into a child shown at the
  // multi-system root, including the "Unassigned" pseudo-system) — the shared
  // helper searches every system for a direct child whose id matches so the
  // correct owning system becomes the drill-down root.
  const resolved = resolveContainerChain(systems, path, unassignedServices, unassignedDomains);
  if (!resolved) return empty;
  const { ancestorChain, startIndex } = resolved;
  const system = ancestorChain[0];

  // The last node in ancestorChain is the container; ancestors are everything before it
  const containerNode = ancestorChain.pop()!;
  const childIds = new Set(containerNode.children.map(nodeId));
  const ownEdges = containerNode.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));

  // Edges anchored inside a child block draw on this canvas, where the
  // declaring block is a node: intra-service domain-to-domain edges on the
  // service view, and service-anchored edges when this container is the
  // system (#2223).
  const drawnKeys = new Set(ownEdges.map(drawnEdgeKey));
  const childEdges = [...ownEdges, ...collectAnchoredPeerEdges(containerNode.children, drawnKeys)];
  // A `database` canvas also draws the entity relations that land on its
  // leaves (#2721). Every system is a resolution scope: an entity may map into
  // a store declared in another system, and the `__unassigned__` pseudo-system
  // is how a no-system file's orphan domains reach here.
  childEdges.push(
    ...projectEntityRelationsOntoStore(
      containerNode,
      systems.map((s) => buildDomainEntityIndex(s)),
      childEdges,
    ),
  );

  // Ghost users/systems/domains: only for service view.
  // With system ID in path: path.length - startIndex === 1 (e.g. ["ECPlatform", "ECommerce"]).
  // Without system ID (unassigned domain fallback): path.length === 1.
  const isServiceView = path.length - startIndex === 1;
  const {
    ghostUsers,
    ghostUserEdges,
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
  } = isServiceView
    ? synthesizeGhosts(containerNode, system, systems, ctx.ghostEndpoint)
    : emptyGhostSynthesis();

  // At domain level: promote resource nodes with dot-notation refs to sibling level
  // so they appear as connected nodes in the UseCase diagram.
  // Entities are conceptual data nodes rendered only in the (deferred) entity
  // view — exclude them here so they don't appear as stray unstyled boxes in
  // the domain / usecase drill-down.
  const { childNodes: promotedChildNodes, childEdges: finalChildEdges } = collectPromotedChildren(
    containerNode,
    childEdges,
    resourceInferredTagsMap,
    entityResolver,
  );

  return {
    containerNode,
    childNodes: promotedChildNodes,
    childEdges: finalChildEdges,
    ancestorChain,
    ghostUsers,
    ghostUserEdges,
    systems: [],
    crossSystemEdges: [],
    crossSystemTargets: new Map(),
    ghostSystems,
    ghostSystemEdges,
    callerGhostSystems,
    callerGhostSystemEdges,
    ghostDomains,
    ghostDomainEdges,
    // Entity-view only; the usecase/service view never has ghost entities.
    ghostEntities: [],
    ghostEntityEdges: [],
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: new Map(),
    expandedFrames: [],
  };
}

export function extractView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedDomains: KrsNode[] = [],
  unassignedServices: KrsNode[] = [],
  /**
   * Service ids to expand in place in the root system view (#1921). Each named
   * service is replaced by its domain children (spliced as a boundary-frame
   * band) while siblings stay collapsed; cross-boundary edges re-anchor to the
   * exact internal domain. Only honoured on the root system view; ignored on
   * drill-down levels and multi-system roots (Phase 1 scope).
   */
  expandedContainers?: ReadonlySet<string>,
): ViewSlice {
  const resourceLabelMap = buildResourceLabelMap(systems);
  const resourceInferredTagsMap = buildResourceInferredTagsMap(systems);

  const empty = emptySlice(resourceLabelMap, resourceInferredTagsMap);

  const orphans = [...unassignedServices, ...unassignedDomains];

  // Resolver over the whole model: a bare `resource <id>` in one domain may
  // resolve to an `entity` declared in another domain / service, so this is
  // built once from every root, not per-container.
  const entityResolver = buildEntityResolver([...systems, ...orphans]);
  const ctx: ViewExtractContext = {
    resourceLabelMap,
    resourceInferredTagsMap,
    empty,
    entityResolver,
    ghostEndpoint: buildGhostEndpointResolver(systems),
  };

  // No-system file: render orphan services/domains as peer nodes with no container.
  // Drill-down walks from the orphan as path root.
  if (systems.length === 0) {
    return extractOrphanView(orphans, path, ctx);
  }

  // Root system view (path = [])
  if (path.length === 0) {
    return extractRootSystemView(
      systems,
      unassignedServices,
      unassignedDomains,
      expandedContainers,
      ctx,
    );
  }

  // Determine the active system and walk the path to the container.
  return extractSystemDrillDownView(systems, path, unassignedServices, unassignedDomains, ctx);
}

/**
 * Walk `path` to its container node, returning the ancestor chain (the
 * container is the last element) or `null` when the path does not resolve.
 * Shared by {@link extractView} and {@link extractEntityView} so the two views
 * of the same node always resolve to the same container.
 */
function resolveContainerChain(
  systems: KrsNode[],
  path: ViewPath,
  unassignedServices: KrsNode[] = [],
  unassignedDomains: KrsNode[] = [],
): { ancestorChain: KrsNode[]; startIndex: number } | null {
  if (systems.length === 0 || path.length === 0) return null;
  const systemNode = systems.find((s) => s.id === path[0]);
  let system: KrsNode;
  let startIndex: number;
  if (systemNode) {
    system = systemNode;
    startIndex = 1;
  } else {
    const owningSystem = systems.find((s) => s.children.some((c) => c.id === path[0]));
    system = owningSystem ?? systems[0];
    startIndex = 0;
  }
  const ancestorChain: KrsNode[] = [system];
  let current: KrsNode = system;
  for (let i = startIndex; i < path.length; i++) {
    const segment = path[i];
    let child = current.children.find((c) => nodeId(c) === segment);
    if (!child && i === startIndex) {
      child =
        unassignedServices.find((c) => nodeId(c) === segment) ??
        unassignedDomains.find((c) => nodeId(c) === segment);
    }
    if (!child) return null;
    ancestorChain.push(child);
    current = child;
  }
  return { ancestorChain, startIndex };
}

/**
 * Extract the **entity view** of a domain: its `entity` children and the
 * relation edges between them — an alternative drill-down to the domain's
 * usecase view. Returns an empty slice when the path does not resolve to a
 * domain or the domain owns no entities.
 *
 * v1 scope: relations whose target is not a local entity (cross-domain
 * relations) are dropped; surfacing the foreign entity as a ghost lands with
 * the interactive toggle, which wires the ghost through the renderer's
 * `layoutNode.ghost` muting mechanism.
 */
interface DomainEntityEntry {
  domain: KrsNode;
  /** The domain's full path within its system (`[systemId, …, domainId]`), for suffix resolution (#2088). */
  path: NodeIdPath;
  entities: Map<string, KrsNode>;
}

const domainEntityIndexCache = new WeakMap<KrsNode, DomainEntityEntry[]>();

/**
 * Index every domain (at any depth) **within one system** by id, with its
 * `entity` children. Resolves qualified `DomainId.EntityId` cross-domain relation
 * targets in the entity view.
 *
 * Scoped to a single system on purpose: `DomainId` is only error-level unique
 * *within* a system, so a model-wide index could not disambiguate a domain id
 * shared by two systems. Cross-**system** entity references are out of scope in
 * v1 (this view is per-domain, cross-**domain**). Memoized per system node so the
 * static bundle (which extracts the entity view of every domain) builds it once.
 */
function buildDomainEntityIndex(system: KrsNode): DomainEntityEntry[] {
  const cached = domainEntityIndexCache.get(system);
  if (cached) return cached;
  // Every domain in the system, each with its full path (#2088 slice D1) —
  // duplicates included: which one a reference means is the resolver's
  // question, not the index's. The old id-keyed `!index.has` build let the
  // first domain with an id occupy the slot even when it lacked the
  // referenced entity, silently dropping a written relation (#2575).
  const index: DomainEntityEntry[] = [];
  const walk = (node: KrsNode, prefix: readonly string[]): void => {
    const path = [...prefix, node.id];
    if (node.kind === "domain") {
      const entities = new Map<string, KrsNode>();
      for (const child of node.children) {
        if (child.kind === "entity") entities.set(child.id, child);
      }
      index.push({ domain: node, path, entities });
    }
    for (const child of node.children) walk(child, path);
  };
  for (const child of system.children) walk(child, [system.id]);
  domainEntityIndexCache.set(system, index);
  return index;
}

/**
 * The tag the store canvas stamps on an edge it derived from an `entity`
 * relation (#2721). System-assigned, in the same register as `[implicit]`:
 * never present in `.krs` source. `[implicit]` rolls domain edges **up** to
 * the service level; `[projected]` rolls entity relations **down** onto the
 * `table` leaves they map to. Colour only in the builtin sheet — line style
 * stays owned by `[sync]` / `[async]` (TPL-510).
 */
const PROJECTED_TAG = "projected";

/**
 * Project `entity` relations onto a `database` canvas as `table` → `table`
 * edges (#2721, slice A of #2585).
 *
 * A relation projects when **both** endpoints carry a `table <store>.<leaf>`
 * mapping into `store`. Nothing is recorded in the `.krs`: the projection is
 * a render-time derivation, so the store canvas — which drew its leaves with
 * no relations at all — gains the edges with no edit to the model.
 *
 * Endpoint resolution is the entity view's, not a second copy of it: the
 * relation must start at the entity that declares it ({@link isAnchoredAt},
 * the direction rule), a bare target is intra-domain only, and a qualified
 * `DomainId.EntityId` target goes through {@link resolveQualifiedEntity}
 * within the same scope (TPL-1936). A relation the entity view would not draw
 * is not projected either, so the two views cannot disagree about one edge.
 *
 * What does **not** project, by design (TPL-2585): a relation whose endpoint
 * has no `table` mapping, and a relation whose endpoints map into two
 * different stores (it appears on neither canvas). The view is therefore not
 * a complete ER diagram of the entity layer; `coverage` counts the tableless
 * remainder.
 *
 * `scopes` are the per-system domain indexes the model resolves relations in
 * (a no-system file reaches this canvas through the `__unassigned__`
 * pseudo-system, so its orphan domains are one such scope). An edge the
 * canvas already draws for the same ordered leaf pair (an authored
 * `table` edge) suppresses the projection; the union rule that transfers a
 * label onto it is slice B (#2722). Within the projection the first relation
 * per ordered pair wins, in declaration order.
 */
function projectEntityRelationsOntoStore(
  store: KrsNode,
  scopes: readonly (readonly DomainEntityEntry[])[],
  drawn: readonly KrsEdge[],
): KrsEdge[] {
  if (store.kind !== "database") return [];
  const leafIds = new Set(store.children.map(nodeId));
  const leafOf = (entity: KrsNode): string | undefined => {
    const ref = entity.kind === "entity" ? entity.tableRef : undefined;
    if (!ref || ref.parent !== store.id || !leafIds.has(ref.child)) return undefined;
    return ref.child;
  };
  const pairKey = (from: string, to: string): string => `${from}->${to}`;
  const taken = new Set(drawn.map((e) => pairKey(e.from, e.to)));
  const projected: KrsEdge[] = [];
  for (const index of scopes) {
    for (const entry of index) {
      for (const entity of entry.entities.values()) {
        const from = leafOf(entity);
        if (from === undefined) continue;
        for (const edge of entity.edges) {
          if (!isAnchoredAt(entity, edge)) continue; // #2501: origin = reference holder
          const target = edge.to.includes(".")
            ? resolveQualifiedEntity(edge.to, index)?.entity
            : entry.entities.get(edge.to);
          if (!target) continue; // bare foreign id / unresolved — dropped, as in the entity view
          const to = leafOf(target);
          if (to === undefined) continue;
          const key = pairKey(from, to);
          if (taken.has(key)) continue;
          taken.add(key);
          projected.push({ ...edge, from, to, tags: [...edge.tags, PROJECTED_TAG] });
        }
      }
    }
  }
  return projected;
}

/**
 * Resolve a qualified relation target to its domain + entity by the suffix
 * rule (#2088): the reference matches an entity whose full path it suffixes,
 * so the leading segments must suffix the owning domain's path and the entity
 * must actually exist in it. Returns `null` for a bare id (no dot) or an
 * unresolved reference.
 *
 * Qualifiers run to any depth since slice E lifted `parseEdge`'s two-segment
 * cap (#2577) — `Parent.Child.Entity` is read here the same way `DomainId.EntityId`
 * always was, which is what closes #2575's out-of-scope note. A multi-match
 * keeps the first in declaration order; ambiguity is reported by the edge
 * detector, which sees the declaring scope this resolver does not.
 */
function resolveQualifiedEntity(
  target: string,
  index: readonly DomainEntityEntry[],
): { domain: KrsNode; entity: KrsNode; domainId: string; entityId: string } | null {
  if (!target.includes(".")) return null;
  const ref = edgeEndpointRef(target);
  // A leading or trailing dot leaves an empty segment, which names nothing.
  if (ref.some((segment) => segment === "")) return null;
  const entityId = ref[ref.length - 1];
  const candidates = index.flatMap((entry) => {
    const entity = entry.entities.get(entityId);
    return entity ? [{ path: [...entry.path, entity.id], entry, entity }] : [];
  });
  const match = resolveNodePathBySuffix(ref, candidates)[0];
  if (match === undefined) return null;
  return {
    domain: match.entry.domain,
    entity: match.entity,
    domainId: match.entry.domain.id,
    entityId: match.entity.id,
  };
}

/**
 * Extract the **entity view** of a domain: its `entity` children and their
 * relation edges — an alternative drill-down to the domain's usecase view.
 * Returns an empty slice when the path does not resolve to a domain or the
 * domain owns no entities.
 *
 * Relations:
 * - **intra-domain** — a bare `edge.to` matching a local entity id.
 * - **cross-domain** — a qualified `DomainId.EntityId` target. The foreign
 *   entity is surfaced as a muted **ghost** ({@link GhostEntity}), keyed by the
 *   qualified id (entity ids are only warning-level unique, so a bare id can't
 *   disambiguate). Both outgoing (this domain → foreign) and incoming (foreign →
 *   this domain) directions are collected, mirroring the ghost-domain view
 *   (ADR-460). Bare cross-domain references, and qualified references to
 *   a resource / unknown target, are dropped.
 */
export function extractEntityView(systems: KrsNode[], path: ViewPath): ViewSlice {
  const empty = emptySlice();

  const resolved = resolveContainerChain(systems, path);
  if (!resolved) return empty;
  const { ancestorChain } = resolved;
  // ancestorChain[0] is the owning system (resolveContainerChain always seeds it
  // first). Cross-domain resolution is scoped to it — see buildDomainEntityIndex.
  const owningSystem = ancestorChain[0];
  const domain = ancestorChain.pop()!;
  if (domain.kind !== "domain") return empty;

  const entities = domain.children.filter((c) => c.kind === "entity");
  if (entities.length === 0) return empty;
  const localEntityIds = new Set(entities.map((e) => e.id));

  const childNodes: KrsNode[] = [...entities];
  const childEdges: KrsEdge[] = [];

  const index = buildDomainEntityIndex(owningSystem);
  const ghostMap = new Map<string, GhostEntity>();
  const ghostEntityEdges: KrsEdge[] = [];
  const addGhost = (foreignDomain: KrsNode, foreignEntity: KrsNode, key: string): void => {
    if (!ghostMap.has(key)) {
      ghostMap.set(key, {
        node: foreignEntity,
        parentDomainLabel: foreignDomain.label ?? foreignDomain.id,
        key,
      });
    }
  };

  // Outgoing: this domain's entities → other-domain entities. Bare targets are
  // intra-domain (or dropped); qualified `Other.Foreign` targets become ghosts.
  for (const entity of entities) {
    for (const edge of entity.edges) {
      // The origin-scope rule is what enforces the relation direction here
      // (origin = the reference holder), so a mismatched source is not merely
      // misplaced — it names the wrong end. Drawing it would show a reference
      // the model does not contain, and the ghost branch below would restate
      // it as `entity.id -> …`, fabricating a source the author never wrote
      // (#2501).
      if (!isAnchoredAt(entity, edge)) continue;
      if (localEntityIds.has(edge.to)) {
        childEdges.push(edge); // intra-domain (bare local id)
        continue;
      }
      const foreign = resolveQualifiedEntity(edge.to, index);
      if (!foreign) continue; // bare non-local / resource / unresolved → drop
      if (foreign.domain === domain) {
        // Qualified reference to a local entity — treat as intra-domain.
        if (localEntityIds.has(foreign.entityId)) {
          childEdges.push({ ...edge, to: foreign.entityId });
        }
        continue;
      }
      const key = `${foreign.domainId}.${foreign.entityId}`;
      addGhost(foreign.domain, foreign.entity, key);
      ghostEntityEdges.push({ ...edge, from: entity.id, to: key });
    }
  }

  // Incoming: other-domain entities → this domain's entities (qualified `D.local`).
  for (const entry of index) {
    if (entry.domain === domain) continue; // node identity, robust to id collisions
    for (const foreignEntity of entry.entities.values()) {
      for (const edge of foreignEntity.edges) {
        if (!isAnchoredAt(foreignEntity, edge)) continue; // #2501, as above
        const target = resolveQualifiedEntity(edge.to, index);
        if (!target || target.domain !== domain) continue;
        if (!localEntityIds.has(target.entityId)) continue;
        const key = `${entry.domain.id}.${foreignEntity.id}`;
        addGhost(entry.domain, foreignEntity, key);
        ghostEntityEdges.push({ ...edge, from: key, to: target.entityId });
      }
    }
  }

  return {
    ...empty,
    containerNode: domain,
    childNodes,
    childEdges,
    ancestorChain,
    ghostEntities: Array.from(ghostMap.values()),
    ghostEntityEdges,
  };
}
