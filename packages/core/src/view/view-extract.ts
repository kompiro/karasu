import type { KrsNode, KrsEdge, ResourceNode } from "../types/ast.js";
import { INFRA_KIND_SET } from "../types/ast.js";
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
    { edge: KrsEdge; count: number; label: string | undefined; details: DomainEdgeDetail[] }
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
        } else {
          grouped.set(groupKey, {
            edge: { ...edge, from: fromEndpoint, to: toEndpoint, tags: ["implicit"] },
            count: 1,
            label: edge.label,
            details: [detail],
          });
        }
      }
    }
  }

  const edges = Array.from(grouped.entries()).map(([, { edge, count, label }]) => ({
    ...edge,
    label: count === 1 ? label : `${count} domain edges`,
    // The count label is machine-generated; a single passthrough keeps the
    // authored domain-edge label.
    ...(count > 1 ? { syntheticLabel: true } : {}),
  }));

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
 * (see ADR-20260616-12, TPL-20260519-02).
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
export interface GhostSystem {
  systemNode: KrsNode;
  visibleServices: KrsNode[];
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
export interface ExpandedFrame {
  containerId: string;
  label: string;
  memberIds: string[];
}

function nodeId(node: KrsNode): string {
  return node.id;
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
): { callerGhostSystems: GhostSystem[]; callerGhostSystemEdges: KrsEdge[] } {
  const qualifiedTarget = `${containerSystemId}.${containerId}`;
  const map = new Map<string, GhostSystem>();
  const edges: KrsEdge[] = [];

  for (const sys of allSystems) {
    if (sys.id === containerSystemId) continue;
    for (const edge of sys.edges) {
      if (edge.to !== qualifiedTarget) continue;
      const callerService = sys.children.find((c) => c.id === edge.from);
      if (!callerService) continue;
      if (!map.has(sys.id)) {
        map.set(sys.id, { systemNode: sys, visibleServices: [] });
      }
      const gs = map.get(sys.id)!;
      if (!gs.visibleServices.some((s) => s.id === callerService.id)) {
        gs.visibleServices.push(callerService);
      }
      // Qualify the from-ID so layout can find it in layoutNodes by qualified key
      edges.push({ ...edge, from: `${sys.id}.${edge.from}`, to: containerId });
    }
  }
  return {
    callerGhostSystems: Array.from(map.values()),
    callerGhostSystemEdges: edges,
  };
}

function buildGhostSystems(edges: KrsEdge[], allSystems: KrsNode[]): GhostSystem[] {
  const map = new Map<string, GhostSystem>();
  for (const edge of edges) {
    const dotIdx = edge.to.indexOf(".");
    if (dotIdx === -1) continue;
    const sysId = edge.to.slice(0, dotIdx);
    const svcId = edge.to.slice(dotIdx + 1);
    const systemNode = allSystems.find((s) => s.id === sysId);
    if (!systemNode) continue;
    const serviceNode = systemNode.children.find((c) => c.id === svcId);
    if (!serviceNode) continue;
    if (!map.has(sysId)) {
      map.set(sysId, { systemNode, visibleServices: [] });
    }
    const gs = map.get(sysId)!;
    if (!gs.visibleServices.some((s) => s.id === svcId)) {
      gs.visibleServices.push(serviceNode);
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
): GhostSynthesis {
  const containerId = nodeId(containerNode);
  const users = system.children.filter((c) => c.kind === "user");
  const connectedEdges = system.edges.filter(
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
  const candidateEdges = system.edges.filter((e) => e.from === containerId && e.to.includes("."));
  const ghostSystems = buildGhostSystems(candidateEdges, systems);
  // Only include edges that resolved to a known ghost system
  const resolvedSysIds = new Set(ghostSystems.map((gs) => gs.systemNode.id));
  const ghostSystemEdges = candidateEdges.filter((e) => {
    const sysId = e.to.slice(0, e.to.indexOf("."));
    return resolvedSysIds.has(sysId);
  });

  // Caller ghost systems: other systems that have edges pointing into this service
  const { callerGhostSystems, callerGhostSystemEdges } = buildCallerGhostSystems(
    containerId,
    system.id,
    systems,
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
    const { edges: implicitServiceEdges, details: implicitEdgeDetails } = deriveImplicitServiceEdges(
      orphans.filter((c) => c.kind === "service"),
      new Set(),
    );
    const derivedEdges = deriveInfraEdges(orphans, entityResolver);
    const deliversEdges = deriveDeliversEdges(orphans);
    return {
      ...empty,
      childNodes: orphans,
      childEdges: [...derivedEdges, ...implicitServiceEdges, ...deliversEdges],
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
  let edges = container.edges.filter(
    (e) => containerChildIds.has(e.from) && containerChildIds.has(e.to),
  );
  if (container.kind === "service") {
    const domainIds = new Set(
      container.children.filter((c) => c.kind === "domain").map((c) => c.id),
    );
    const existing = new Set(edges.map((e) => `${e.from}->${e.to}`));
    for (const domain of container.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        if (!domainIds.has(edge.from) || !domainIds.has(edge.to)) continue;
        const key = `${edge.from}->${edge.to}`;
        if (!existing.has(key)) {
          edges = [...edges, edge];
          existing.add(key);
        }
      }
    }
  }
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
  const explicitEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
  const derivedEdges = deriveInfraEdges(allChildren, entityResolver);
  // Merge derived edges, skipping any already covered by explicit edges
  const explicitKeys = new Set(explicitEdges.map((e) => `${e.from}->${e.to}`));

  // In-place expansion (#1921): a service named in `expandedContainers` that
  // actually has domain children is replaced by those domains as a boundary
  // frame band; cross-boundary edges re-anchor to the exact internal domain.
  const { expandedServices, expandedSet } = resolveExpandedServices(allChildren, expandedContainers);

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

  // Cross-system edges: collect from all systems where target is qualified
  const crossSystemEdges = systems.flatMap((sys) =>
    sys.edges.filter((e) => {
      if (!e.to.includes(".")) return false;
      const sysId = e.to.slice(0, e.to.indexOf("."));
      return systems.some((s) => s.id === sysId);
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
  let childEdges = containerNode.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));

  // Service view: collect intra-service domain-to-domain edges from domain children.
  // Domain edges where both endpoints are direct domain children of this service are
  // surfaced here so they appear in the service drill-down diagram.
  if (containerNode.kind === "service") {
    const domainIds = new Set(
      containerNode.children.filter((c) => c.kind === "domain").map((c) => c.id),
    );
    const intraDomainEdges: KrsEdge[] = [];
    const existingEdgeKeys = new Set(childEdges.map((e) => `${e.from}->${e.to}`));
    for (const domain of containerNode.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        if (!domainIds.has(edge.from) || !domainIds.has(edge.to)) continue;
        const key = `${edge.from}->${edge.to}`;
        if (!existingEdgeKeys.has(key)) {
          intraDomainEdges.push(edge);
          existingEdgeKeys.add(key);
        }
      }
    }
    childEdges = [...childEdges, ...intraDomainEdges];
  }

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
  } = isServiceView ? synthesizeGhosts(containerNode, system, systems) : emptyGhostSynthesis();

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
  const ctx: ViewExtractContext = { resourceLabelMap, resourceInferredTagsMap, empty, entityResolver };

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
  entities: Map<string, KrsNode>;
}

const domainEntityIndexCache = new WeakMap<KrsNode, Map<string, DomainEntityEntry>>();

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
function buildDomainEntityIndex(system: KrsNode): Map<string, DomainEntityEntry> {
  const cached = domainEntityIndexCache.get(system);
  if (cached) return cached;
  const index = new Map<string, DomainEntityEntry>();
  const walk = (node: KrsNode): void => {
    if (node.kind === "domain" && !index.has(node.id)) {
      const entities = new Map<string, KrsNode>();
      for (const child of node.children) {
        if (child.kind === "entity") entities.set(child.id, child);
      }
      index.set(node.id, { domain: node, entities });
    }
    for (const child of node.children) walk(child);
  };
  for (const child of system.children) walk(child);
  domainEntityIndexCache.set(system, index);
  return index;
}

/**
 * Resolve a qualified `DomainId.EntityId` relation target to its domain + entity.
 * Returns `null` for a bare id (no dot) or an unresolved reference. Splits on the
 * first `.`; nested-domain qualifiers (`Parent.Child.Entity`) are out of scope in
 * v1 and resolve to `null`.
 */
function resolveQualifiedEntity(
  target: string,
  index: Map<string, DomainEntityEntry>,
): { domain: KrsNode; entity: KrsNode; domainId: string; entityId: string } | null {
  const dot = target.indexOf(".");
  if (dot <= 0 || dot === target.length - 1) return null;
  const domainId = target.slice(0, dot);
  const entityId = target.slice(dot + 1);
  const entry = index.get(domainId);
  const entity = entry?.entities.get(entityId);
  if (!entry || !entity) return null;
  return { domain: entry.domain, entity, domainId, entityId };
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
 *   (ADR-20260411-05). Bare cross-domain references, and qualified references to
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
  for (const [domainId, entry] of index) {
    if (entry.domain === domain) continue; // node identity, robust to id collisions
    for (const foreignEntity of entry.entities.values()) {
      for (const edge of foreignEntity.edges) {
        const target = resolveQualifiedEntity(edge.to, index);
        if (!target || target.domain !== domain) continue;
        if (!localEntityIds.has(target.entityId)) continue;
        const key = `${domainId}.${foreignEntity.id}`;
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
