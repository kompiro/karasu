import type { KrsNode, KrsEdge, ServiceNode } from "../types/ast.js";

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
 * Creates a ghost external ServiceNode for a cross-system reference target.
 * If the referenced node is found in allSystems, its label is used; otherwise the qualified name is used.
 */
function createGhostExternalNode(qualifiedId: string, allSystems: KrsNode[]): ServiceNode {
  const [systemId, serviceId] = qualifiedId.split(".");
  const referencedSystem = allSystems.find((s) => s.id === systemId);
  const referencedService = referencedSystem?.children.find((c) => c.id === serviceId);

  const zeroLoc = { line: 0, column: 0, offset: 0 };
  return {
    kind: "service",
    id: qualifiedId,
    label: referencedService?.label ?? qualifiedId,
    tags: ["external"],
    annotations: [],
    children: [],
    edges: [],
    properties: { links: [] },
    loc: { start: zeroLoc, end: zeroLoc },
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

    // Build a map from bare service ID to explicit [external] child node.
    // Used to suppress ghost node creation when an explicit declaration already exists.
    const explicitExternalById = new Map<string, KrsNode>(
      allChildren.filter((c) => c.tags.includes("external")).map((c) => [c.id, c]),
    );

    // Collect cross-system reference targets as ghost external nodes.
    // If an explicit [external] child with the bare service ID exists, remap the edge to
    // that child instead of creating a new ghost node with the qualified name.
    const ghostExternalNodes: KrsNode[] = [];
    const crossSystemEdges: KrsEdge[] = [];

    for (const edge of system.edges) {
      if (!isQualifiedRef(edge.to) || childIds.has(edge.to)) continue;

      const serviceId = edge.to.split(".")[1];
      const explicitNode = explicitExternalById.get(serviceId);

      if (explicitNode) {
        // Remap edge to the explicit [external] node's ID to avoid a duplicate node
        crossSystemEdges.push({ ...edge, to: serviceId });
      } else {
        if (!ghostExternalNodes.some((n) => n.id === edge.to)) {
          ghostExternalNodes.push(createGhostExternalNode(edge.to, systems));
        }
        crossSystemEdges.push(edge);
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
