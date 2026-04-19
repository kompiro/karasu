import type { KrsFile, KrsNode, OrgNode } from "@karasu-tools/core";

/**
 * Find the 0-based start line of a node in the KrsFile AST.
 * Returns null if the node is not found.
 * AST positions are 1-based, so we subtract 1 to convert to LSP/Monaco convention.
 */
export function findNodeLine(krsFile: KrsFile, nodeId: string): number | null {
  function searchKrsNode(node: KrsNode): number | null {
    if (node.id === nodeId) return node.loc.start.line - 1;
    for (const child of node.children) {
      const found = searchKrsNode(child);
      if (found !== null) return found;
    }
    return null;
  }

  function searchOrgNode(node: OrgNode): number | null {
    if (node.id === nodeId) return node.loc.start.line - 1;
    for (const child of node.children) {
      const found = searchOrgNode(child);
      if (found !== null) return found;
    }
    return null;
  }

  for (const sys of krsFile.systems) {
    const found = searchKrsNode(sys);
    if (found !== null) return found;
  }
  for (const svc of krsFile.services) {
    const found = searchKrsNode(svc);
    if (found !== null) return found;
  }
  for (const domain of krsFile.domains) {
    const found = searchKrsNode(domain);
    if (found !== null) return found;
  }
  for (const block of krsFile.deploys) {
    if (block.id === nodeId) return block.loc.start.line - 1;
    for (const node of block.nodes) {
      if (node.id === nodeId) return node.loc.start.line - 1;
    }
  }
  for (const org of krsFile.organizations) {
    if (org.id === nodeId) return org.loc.start.line - 1;
    for (const team of org.teams) {
      const found = searchOrgNode(team);
      if (found !== null) return found;
    }
  }
  return null;
}
