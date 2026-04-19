import type { FileTreeNode } from "../components/file-tree/types.js";

/**
 * Returns a copy of `nodes` with the node at `path` shallow-merged with `updates`.
 * Descends into `children` recursively; siblings not on the path are returned
 * by reference.
 */
export function updateNode(
  nodes: FileTreeNode[],
  path: string,
  updates: Partial<FileTreeNode>,
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) {
      return { ...node, ...updates };
    }
    if (node.children) {
      return { ...node, children: updateNode(node.children, path, updates) };
    }
    return node;
  });
}
