import type { KrsFile, KrsNode, DeployBlock, DeployNode, TeamNode, MemberNode } from "@karasu/core";
import type { Range } from "vscode-languageserver/node";

export interface LspPosition {
  line: number;
  character: number;
}

interface NodeEntry {
  id: string;
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Collect all named nodes from the KrsFile AST into a flat list.
 * AST positions are 1-based.
 */
export function collectNodes(krsFile: KrsFile): NodeEntry[] {
  const entries: NodeEntry[] = [];

  function addKrsNode(node: KrsNode): void {
    entries.push({ id: node.id, start: node.loc.start, end: node.loc.end });
    for (const child of node.children) addKrsNode(child);
  }

  function addDeployNode(node: DeployNode): void {
    entries.push({ id: node.id, start: node.loc.start, end: node.loc.end });
  }

  function addTeamNode(team: TeamNode): void {
    entries.push({ id: team.id, start: team.loc.start, end: team.loc.end });
    for (const member of team.members) addMemberNode(member);
    for (const sub of team.teams) addTeamNode(sub);
  }

  function addMemberNode(member: MemberNode): void {
    entries.push({ id: member.id, start: member.loc.start, end: member.loc.end });
  }

  function addDeployBlock(block: DeployBlock): void {
    entries.push({ id: block.id, start: block.loc.start, end: block.loc.end });
    for (const node of block.nodes) addDeployNode(node);
  }

  for (const sys of krsFile.systems) addKrsNode(sys);
  for (const block of krsFile.deploys) addDeployBlock(block);
  for (const org of krsFile.organizations) {
    for (const team of org.teams) addTeamNode(team);
  }

  return entries;
}

/**
 * Given an LSP position (0-based), find the innermost node that contains it.
 * Returns the node ID, or null if no node covers the position.
 */
export function findNodeAtPosition(krsFile: KrsFile, position: LspPosition): string | null {
  // Convert LSP 0-based to AST 1-based
  const astLine = position.line + 1;
  const astCol = position.character + 1;

  const entries = collectNodes(krsFile);
  let best: NodeEntry | null = null;

  for (const entry of entries) {
    if (!containsPosition(entry, astLine, astCol)) continue;
    // Prefer the entry that starts latest (innermost node)
    if (
      best === null ||
      entry.start.line > best.start.line ||
      (entry.start.line === best.start.line && entry.start.column > best.start.column)
    ) {
      best = entry;
    }
  }
  return best ? best.id : null;
}

function containsPosition(entry: NodeEntry, astLine: number, astCol: number): boolean {
  const { start, end } = entry;
  if (astLine < start.line || astLine > end.line) return false;
  if (astLine === start.line && astCol < start.column) return false;
  if (astLine === end.line && astCol > end.column) return false;
  return true;
}

/**
 * Given a node ID, find its source range in the AST.
 * Returns an LSP Range (0-based), or null if not found.
 */
export function findRangeOfNode(krsFile: KrsFile, nodeId: string): Range | null {
  const entries = collectNodes(krsFile);
  const entry = entries.find((e) => e.id === nodeId);
  if (!entry) return null;

  return {
    start: toLspPosition(entry.start.line, entry.start.column),
    end: toLspPosition(entry.end.line, entry.end.column),
  };
}

function toLspPosition(line: number, column: number) {
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, column - 1),
  };
}
