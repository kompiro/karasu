import type { KrsNode, KrsEdge } from "../types/ast.js";

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
  return node.id ?? node.label;
}

export function extractView(systems: KrsNode[], path: ViewPath): ViewSlice {
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
    const childIds = new Set(system.children.map(nodeId));
    const childEdges = system.edges.filter((e) => childIds.has(e.from) && childIds.has(e.to));
    return {
      containerNode: system,
      childNodes: system.children,
      childEdges,
      ancestorChain: [],
      ghostUsers: [],
      ghostUserEdges: [],
    };
  }

  // Walk the path to find the container
  const ancestorChain: KrsNode[] = [system];
  let current: KrsNode = system;

  for (const segment of path) {
    const child = current.children.find((c) => nodeId(c) === segment);
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
