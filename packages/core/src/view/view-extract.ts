import type { KrsNode, KrsEdge, SystemNode } from "../types/ast.js";

/**
 * ViewPath identifies the drill-down position in the hierarchy.
 * [] = system view, ["ECommerce"] = service view, ["ECommerce", "Order"] = domain view
 */
export type ViewPath = string[];

export interface ViewSlice {
  containerNode: KrsNode | null;
  childNodes: KrsNode[];
  childEdges: KrsEdge[];
  ancestorChain: KrsNode[];
  ghostUsers: KrsNode[];
  ghostUserEdges: KrsEdge[];
}

function nodeId(node: KrsNode): string {
  return node.id;
}

/**
 * Returns true if the edge target is a fully qualified cross-system reference (e.g. "System.Service").
 */
function isQualifiedRef(id: string): boolean {
  return id.includes(".");
}

/**
 * Creates a ghost external SystemNode for a cross-system reference.
 * The ghost system contains the referenced service as a child (enabling drill-down).
 * Labels are taken from the actual nodes when resolved; otherwise IDs are used as fallback.
 */
function createGhostSystemNode(qualifiedId: string, allSystems: KrsNode[]): SystemNode {
  const [systemId, serviceId] = qualifiedId.split(".");
  const referencedSystem = allSystems.find((s) => s.id === systemId);
  const referencedService = referencedSystem?.children.find((c) => c.id === serviceId);

  const zeroLoc = { line: 0, column: 0, offset: 0 };
  const loc = { start: zeroLoc, end: zeroLoc };

  const ghostService = referencedService ?? {
    kind: "service" as const,
    id: serviceId,
    label: serviceId,
    tags: [],
    annotations: [],
    children: [],
    edges: [],
    properties: { links: [] },
    loc,
  };

  return {
    kind: "system",
    id: systemId,
    label: referencedSystem?.label ?? systemId,
    tags: ["external"],
    annotations: [],
    children: [ghostService],
    edges: [],
    properties: { links: [] },
    loc,
  };
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
  };

  if (systems.length === 0) return empty;

  const system = systems[0];

  // System view (default)
  if (path.length === 0) {
    const allChildren = [...system.children, ...unassignedDomains];
    const childIds = new Set(allChildren.map(nodeId));

    // Build a map from system ID to explicit [external] child node.
    // Used to suppress ghost node creation when an explicit declaration already exists.
    const explicitExternalById = new Map<string, KrsNode>(
      allChildren.filter((c) => c.tags.includes("external")).map((c) => [c.id, c]),
    );

    // Collect cross-system reference targets as ghost external SystemNodes.
    // Each qualified edge target (System.Service) becomes a ghost SystemNode containing
    // the referenced service as a child. The edge target is remapped to the system ID.
    // If an explicit [external] child with the same system ID already exists, reuse it.
    const ghostExternalNodes: KrsNode[] = [];
    const crossSystemEdges: KrsEdge[] = [];

    for (const edge of system.edges) {
      if (!isQualifiedRef(edge.to) || childIds.has(edge.to)) continue;

      const systemId = edge.to.split(".")[0];
      const explicitNode = explicitExternalById.get(systemId);

      if (explicitNode) {
        // Remap edge to the explicit [external] node's ID to avoid a duplicate
        crossSystemEdges.push({ ...edge, to: systemId });
      } else {
        if (!ghostExternalNodes.some((n) => n.id === systemId)) {
          ghostExternalNodes.push(createGhostSystemNode(edge.to, systems));
        }
        // Remap edge to the ghost system's ID
        crossSystemEdges.push({ ...edge, to: systemId });
      }
    }

    const extendedChildIds = new Set([...childIds, ...ghostExternalNodes.map(nodeId)]);
    const internalEdges = system.edges.filter(
      (e) => extendedChildIds.has(e.from) && extendedChildIds.has(e.to) && !isQualifiedRef(e.to),
    );

    return {
      containerNode: system,
      childNodes: [...allChildren, ...ghostExternalNodes],
      childEdges: [...internalEdges, ...crossSystemEdges],
      ancestorChain: [],
      ghostUsers: [],
      ghostUserEdges: [],
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
  }

  return {
    containerNode,
    childNodes: containerNode.children,
    childEdges,
    ancestorChain,
    ghostUsers,
    ghostUserEdges,
  };
}
