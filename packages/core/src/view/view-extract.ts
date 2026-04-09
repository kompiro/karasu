import type { KrsNode, KrsEdge, ResourceNode } from "../types/ast.js";

const INFRA_KINDS = new Set(["database", "queue", "storage"] as const);

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

  for (const usecase of usecases) {
    if (usecase.kind !== "usecase") continue;
    for (const resource of usecase.children) {
      if (resource.kind !== "resource") continue;
      const resNode = resource as ResourceNode;
      if (!resNode.ref) continue;

      if (!resourceMap.has(resource.id)) {
        resourceMap.set(resource.id, applyInferredTagsDeep(resource, tagMap));
      }
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

export function extractView(
  systems: KrsNode[],
  path: ViewPath,
  unassignedDomains: KrsNode[] = [],
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
    resourceLabelMap,
    resourceInferredTagsMap,
  };

  if (systems.length === 0) return empty;

  // Root system view (path = [])
  if (path.length === 0) {
    const system = systems[0];
    const allChildren = [...system.children, ...unassignedDomains];
    const childIds = new Set(allChildren.map(nodeId));
    const explicitEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
    const derivedEdges = deriveInfraEdges(allChildren);
    // Merge derived edges, skipping any already covered by explicit edges
    const explicitKeys = new Set(explicitEdges.map((e) => `${e.from}->${e.to}`));
    const childEdges = [
      ...explicitEdges,
      ...derivedEdges.filter((e) => !explicitKeys.has(`${e.from}->${e.to}`)),
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
      resourceLabelMap,
      resourceInferredTagsMap,
    };
  }

  // Determine the active system.
  // path[0] is the system ID when it matches a known system.
  // For unassigned top-level domains (no system prefix), path[0] is the domain ID
  // and does not match any system — fall back to systems[0] and walk from index 0.
  const systemNode = systems.find((s) => s.id === path[0]);
  const system = systemNode ?? systems[0];
  const startIndex = systemNode ? 1 : 0;

  // Walk the path to find the container
  const ancestorChain: KrsNode[] = [system];
  let current: KrsNode = system;

  for (let i = startIndex; i < path.length; i++) {
    const segment = path[i];
    let child = current.children.find((c) => nodeId(c) === segment);
    // At the first level within the system, also search unassigned domains
    if (!child && i === startIndex) {
      child = unassignedDomains.find((c) => nodeId(c) === segment);
    }
    if (!child) return empty;
    ancestorChain.push(child);
    current = child;
  }

  // The last node in ancestorChain is the container; ancestors are everything before it
  const containerNode = ancestorChain.pop()!;
  const childIds = new Set(containerNode.children.map(nodeId));
  const childEdges = containerNode.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));

  // Ghost users: only for service view.
  // With system ID in path: path.length - startIndex === 1 (e.g. ["ECPlatform", "ECommerce"]).
  // Without system ID (unassigned domain fallback): path.length === 1.
  let ghostUsers: KrsNode[] = [];
  let ghostUserEdges: KrsEdge[] = [];
  let ghostSystems: GhostSystem[] = [];
  let ghostSystemEdges: KrsEdge[] = [];
  let callerGhostSystems: GhostSystem[] = [];
  let callerGhostSystemEdges: KrsEdge[] = [];

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
    resourceLabelMap,
    resourceInferredTagsMap,
  };
}
