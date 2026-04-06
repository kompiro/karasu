import type { KrsNode, KrsEdge } from "../types/ast.js";

/**
 * ViewPath identifies the drill-down position in the hierarchy.
 * [] = system view, ["ECommerce"] = service view, ["ECommerce", "Order"] = domain view
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
  /** Service view only: external systems referenced via cross-system edges. */
  ghostSystems: GhostSystem[];
  /** Service view only: the cross-system edges targeting ghost systems. */
  ghostSystemEdges: KrsEdge[];
}

function nodeId(node: KrsNode): string {
  return node.id;
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
  };

  if (systems.length === 0) return empty;

  const system = systems[0];

  // System view (default)
  if (path.length === 0) {
    const allChildren = [...system.children, ...unassignedDomains];
    const childIds = new Set(allChildren.map(nodeId));
    const childEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));

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
    };
  }

  // Walk the path to find the container
  const ancestorChain: KrsNode[] = [system];
  let current: KrsNode = system;

  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    let child = current.children.find((c) => nodeId(c) === segment);
    // At the first level, also search unassigned domains
    if (!child && i === 0) {
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

  // Ghost users: only for service view (path.length === 1)
  let ghostUsers: KrsNode[] = [];
  let ghostUserEdges: KrsEdge[] = [];
  let ghostSystems: GhostSystem[] = [];
  let ghostSystemEdges: KrsEdge[] = [];

  if (path.length === 1) {
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
    const candidateEdges = system.edges.filter(
      (e) => e.from === containerId && e.to.includes("."),
    );
    ghostSystems = buildGhostSystems(candidateEdges, systems);
    // Only include edges that resolved to a known ghost system
    const resolvedSysIds = new Set(ghostSystems.map((gs) => gs.systemNode.id));
    ghostSystemEdges = candidateEdges.filter((e) => {
      const sysId = e.to.slice(0, e.to.indexOf("."));
      return resolvedSysIds.has(sysId);
    });
  }

  return {
    containerNode,
    childNodes: containerNode.children,
    childEdges,
    ancestorChain,
    ghostUsers,
    ghostUserEdges,
    systems: [],
    crossSystemEdges: [],
    ghostSystems,
    ghostSystemEdges,
  };
}
