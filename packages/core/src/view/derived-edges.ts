import type { KrsNode, KrsEdge, ResourceNode } from "../types/ast.js";
import { INFRA_KIND_SET, unionEdgeFacets } from "../types/ast.js";
import { buildEntityResolver, type EntityResolver } from "../resolver/resource-entity.js";
import { collectAnchoredPeerEdges, drawnEdgeKey, nodeId } from "./anchored-edges.js";
import type { DomainEdgeDetail, SystemFrameEdges } from "./view-slice.js";

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
 * Build a map from domain ID → owning service ID, for all services in the given list.
 */
export function buildDomainServiceMap(services: KrsNode[]): Map<string, string> {
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
export function deriveImplicitServiceEdges(
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
export function deriveDeliversEdges(children: KrsNode[]): KrsEdge[] {
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
 * Derive every edge family one root-view frame draws, from the nodes that frame
 * places. The single source of truth for "what edges does this canvas have":
 * called once per system by `extractRootSystemView` (`view-extract.ts`), so a family added
 * here reaches every frame instead of only the primary one.
 *
 * `canvasChildren` is the node set the frame places and `anchorChildren` the
 * subset whose blocks may contribute child-anchored edges — they differ only for
 * the primary frame, which splices top-level orphans in beside the system's own
 * children (an orphan is not a declared peer, ADR-2223).
 */
export function deriveCanvasEdges(opts: {
  /** The frame's own scope edges (`system X { A -> B }`). */
  scopeEdges: KrsEdge[];
  /** Every node the frame places, before in-place expansion splices domains in. */
  canvasChildren: KrsNode[];
  /** The children whose blocks may hold liftable anchored edges (#2223). */
  anchorChildren: KrsNode[];
  /** Model-wide entity resolver, so `resource` refs resolve in one namespace. */
  entityResolver: EntityResolver;
  /** Services expanded in place (#1921); unset on every frame but the primary. */
  expandedSet: ReadonlySet<string> | undefined;
}): SystemFrameEdges {
  const { scopeEdges, canvasChildren, anchorChildren, entityResolver, expandedSet } = opts;
  const childIds = new Set(canvasChildren.map(nodeId));
  const systemScopeEdges = scopeEdges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
  const derivedEdges = deriveInfraEdges(canvasChildren, entityResolver);
  const anchoredEdges = collectAnchoredPeerEdges(
    anchorChildren,
    new Set(systemScopeEdges.map(drawnEdgeKey)),
  );
  const explicitEdges = [...systemScopeEdges, ...anchoredEdges];
  // Merge derived edges, skipping any already covered by an explicit one. Keyed
  // on the bare pair (not the arrow kind) because suppression asks "is this
  // dependency already authored", which an anchored edge answers too.
  const explicitKeys = new Set(explicitEdges.map((e) => `${e.from}->${e.to}`));

  const {
    edges: implicitServiceEdges,
    details: implicitEdgeDetails,
    internalEdges,
  } = deriveImplicitServiceEdges(
    canvasChildren.filter((c) => c.kind === "service"),
    explicitKeys,
    expandedSet,
  );
  const deliversEdges = deriveDeliversEdges(canvasChildren);

  return {
    edges: [
      ...explicitEdges,
      ...derivedEdges.filter((e) => !explicitKeys.has(`${e.from}->${e.to}`)),
      ...implicitServiceEdges,
      ...internalEdges,
      ...deliversEdges,
    ],
    implicitEdgeDetails,
  };
}
