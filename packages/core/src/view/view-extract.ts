import type { KrsNode, KrsEdge, ResourceNode } from "../types/ast.js";

const INFRA_KINDS = new Set(["database", "queue", "storage"] as const);

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
}

/** Walk service→domain→usecase→resource chain and return all resource nodes with ref. */
function collectResourceRefs(node: KrsNode): ResourceNode[] {
  const results: ResourceNode[] = [];
  for (const child of node.children) {
    if (child.kind === "resource" && child.ref) {
      results.push(child as ResourceNode);
    } else {
      results.push(...collectResourceRefs(child));
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
): { resourceNodes: KrsNode[]; edges: KrsEdge[] } {
  const resourceMap = new Map<string, KrsNode>();
  const edges: KrsEdge[] = [];
  const seen = new Set<string>();

  for (const usecase of usecases) {
    if (usecase.kind !== "usecase") continue;
    for (const resource of usecase.children) {
      if (resource.kind !== "resource") continue;
      const resNode = resource as ResourceNode;
      if (!resNode.ref) continue;

      if (!resourceMap.has(resource.id)) {
        resourceMap.set(resource.id, applyInferredTagsDeep(resource, tagMap));
      }
      const key = `${usecase.id}->${resource.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: usecase.id,
        to: resource.id,
        kind: "sync",
        tags: [],
        loc: resource.loc,
      });
    }
  }

  return { resourceNodes: Array.from(resourceMap.values()), edges };
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
): { edges: KrsEdge[]; details: Map<string, DomainEdgeDetail[]> } {
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

  // Collect all cross-service domain edges grouped by (service pair, kind)
  const grouped = new Map<
    string,
    { edge: KrsEdge; count: number; label: string | undefined; details: DomainEdgeDetail[] }
  >();

  for (const service of services) {
    if (service.kind !== "service") continue;
    for (const domain of service.children) {
      if (domain.kind !== "domain") continue;
      for (const edge of domain.edges) {
        const targetServiceId = domainServiceMap.get(edge.to);
        if (!targetServiceId || targetServiceId === service.id) continue;
        const pairKey = `${service.id}->${targetServiceId}`;
        if (explicitKeys.has(pairKey)) continue;
        const groupKey = `${pairKey}#${edge.kind}`;
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
            edge: { ...edge, from: service.id, to: targetServiceId, tags: ["implicit"] },
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
  }));

  // Only include detail map entries for aggregated (multi-edge) pairs
  const details = new Map<string, DomainEdgeDetail[]>();
  for (const [key, { count, details: d }] of grouped) {
    if (count > 1) {
      details.set(key, d);
    }
  }

  return { edges, details };
}

/**
 * Derive synthetic service→database/queue/storage edges from resource references.
 * For each service, walks all descendant resource nodes with dot-notation refs and
 * creates one edge per unique (service, infra) pair.
 */
function deriveInfraEdges(children: KrsNode[]): KrsEdge[] {
  const infraIds = new Set(
    children
      .filter((n) => INFRA_KINDS.has(n.kind as "database" | "queue" | "storage"))
      .map((n) => n.id),
  );
  if (infraIds.size === 0) return [];

  const syntheticEdges: KrsEdge[] = [];
  const seen = new Set<string>();

  for (const child of children) {
    if (child.kind !== "service") continue;
    const refs = collectResourceRefs(child);
    for (const ref of refs) {
      const parentId = ref.ref!.parent;
      if (!infraIds.has(parentId)) continue;
      const key = `${child.id}->${parentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      syntheticEdges.push({
        from: child.id,
        to: parentId,
        kind: "sync",
        tags: [],
        loc: ref.loc,
      });
    }
  }

  return syntheticEdges;
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
}

function nodeId(node: KrsNode): string {
  return node.id;
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
      if (!INFRA_KINDS.has(node.kind as "database" | "queue" | "storage")) continue;
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
      if (!INFRA_KINDS.has(node.kind as "database" | "queue" | "storage")) continue;
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

export function extractView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedDomains: KrsNode[] = [],
  unassignedServices: KrsNode[] = [],
): ViewSlice {
  const resourceLabelMap = buildResourceLabelMap(systems);
  const resourceInferredTagsMap = buildResourceInferredTagsMap(systems);

  const empty: ViewSlice = {
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
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: new Map(),
  };

  const orphans = [...unassignedServices, ...unassignedDomains];

  // No-system file: render orphan services/domains as peer nodes with no container.
  // Drill-down walks from the orphan as path root.
  if (systems.length === 0) {
    if (orphans.length === 0) return empty;

    if (path.length === 0) {
      const { edges: implicitServiceEdges, details: implicitEdgeDetails } =
        deriveImplicitServiceEdges(
          orphans.filter((c) => c.kind === "service"),
          new Set(),
        );
      const derivedEdges = deriveInfraEdges(orphans);
      return {
        ...empty,
        childNodes: orphans,
        childEdges: [...derivedEdges, ...implicitServiceEdges],
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
    let promoted = applyInferredTags(container.children, resourceInferredTagsMap);
    let finalEdges = edges;
    if (container.kind === "domain") {
      const { resourceNodes, edges: resourceEdges } = deriveUsecaseResourceNodes(
        container.children,
        resourceInferredTagsMap,
      );
      if (resourceNodes.length > 0) {
        promoted = [...promoted, ...resourceNodes];
        finalEdges = [...edges, ...resourceEdges];
      }
    }
    return {
      ...empty,
      containerNode: container,
      childNodes: promoted,
      childEdges: finalEdges,
      ancestorChain: chain,
    };
  }

  // Root system view (path = [])
  if (path.length === 0) {
    const system = systems[0];
    const allChildren = [...system.children, ...unassignedServices, ...unassignedDomains];
    const childIds = new Set(allChildren.map(nodeId));
    const explicitEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
    const derivedEdges = deriveInfraEdges(allChildren);
    // Merge derived edges, skipping any already covered by explicit edges
    const explicitKeys = new Set(explicitEdges.map((e) => `${e.from}->${e.to}`));
    const { edges: implicitServiceEdges, details: implicitEdgeDetails } =
      deriveImplicitServiceEdges(
        allChildren.filter((c) => c.kind === "service"),
        explicitKeys,
      );
    const childEdges = [
      ...explicitEdges,
      ...derivedEdges.filter((e) => !explicitKeys.has(`${e.from}->${e.to}`)),
      ...implicitServiceEdges,
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
      childNodes: allChildren,
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
      resourceLabelMap,
      resourceInferredTagsMap,
      implicitEdgeDetails,
    };
  }

  // Determine the active system.
  // path[0] is the system ID when it matches a known system.
  // For unassigned top-level services/domains (no system prefix), path[0] is the
  // orphan node ID and does not match any system — fall back to systems[0] and
  // walk from index 0.
  const systemNode = systems.find((s) => s.id === path[0]);
  const system = systemNode ?? systems[0];
  const startIndex = systemNode ? 1 : 0;

  // Walk the path to find the container
  const ancestorChain: KrsNode[] = [system];
  let current: KrsNode = system;

  for (let i = startIndex; i < path.length; i++) {
    const segment = path[i];
    let child = current.children.find((c) => nodeId(c) === segment);
    // At the first level within the system, also search unassigned services/domains
    if (!child && i === startIndex) {
      child =
        unassignedServices.find((c) => nodeId(c) === segment) ??
        unassignedDomains.find((c) => nodeId(c) === segment);
    }
    if (!child) return empty;
    ancestorChain.push(child);
    current = child;
  }

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

  // Ghost users: only for service view.
  // With system ID in path: path.length - startIndex === 1 (e.g. ["ECPlatform", "ECommerce"]).
  // Without system ID (unassigned domain fallback): path.length === 1.
  let ghostUsers: KrsNode[] = [];
  let ghostUserEdges: KrsEdge[] = [];
  let ghostSystems: GhostSystem[] = [];
  let ghostSystemEdges: KrsEdge[] = [];
  let callerGhostSystems: GhostSystem[] = [];
  let callerGhostSystemEdges: KrsEdge[] = [];
  let ghostDomains: GhostDomain[] = [];
  let ghostDomainEdges: KrsEdge[] = [];

  const isServiceView = path.length - startIndex === 1;
  if (isServiceView) {
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
    ghostUsers = users.filter((p) => connectedUserIds.has(nodeId(p)));
    ghostUserEdges = connectedEdges;

    // Ghost systems: edges from this service to qualified targets in other known systems
    const candidateEdges = system.edges.filter((e) => e.from === containerId && e.to.includes("."));
    ghostSystems = buildGhostSystems(candidateEdges, systems);
    // Only include edges that resolved to a known ghost system
    const resolvedSysIds = new Set(ghostSystems.map((gs) => gs.systemNode.id));
    ghostSystemEdges = candidateEdges.filter((e) => {
      const sysId = e.to.slice(0, e.to.indexOf("."));
      return resolvedSysIds.has(sysId);
    });

    // Caller ghost systems: other systems that have edges pointing into this service
    ({ callerGhostSystems, callerGhostSystemEdges } = buildCallerGhostSystems(
      containerId,
      system.id,
      systems,
    ));

    // Ghost domains: cross-service domain edges (both outgoing and incoming)
    ({ ghostDomains, ghostDomainEdges } = buildGhostDomains(containerId, system));
  }

  // At domain level: promote resource nodes with dot-notation refs to sibling level
  // so they appear as connected nodes in the UseCase diagram.
  let promotedChildNodes = applyInferredTags(containerNode.children, resourceInferredTagsMap);
  let finalChildEdges = childEdges;

  if (containerNode.kind === "domain") {
    const { resourceNodes, edges: resourceEdges } = deriveUsecaseResourceNodes(
      containerNode.children,
      resourceInferredTagsMap,
    );
    if (resourceNodes.length > 0) {
      promotedChildNodes = [...promotedChildNodes, ...resourceNodes];
      finalChildEdges = [...childEdges, ...resourceEdges];
    }
  }

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
    resourceLabelMap,
    resourceInferredTagsMap,
    implicitEdgeDetails: new Map(),
  };
}
