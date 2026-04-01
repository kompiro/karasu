import type {
  KrsFile,
  KrsNode,
  DeployBlock,
  DeployNode,
  TeamNode,
  MemberNode,
  OrganizationBlock,
} from "@karasu/core";
import type { Range } from "vscode-languageserver/node";

interface LspPosition {
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

// ─── Phase 5 helpers ─────────────────────────────────────────────────────────

/**
 * Collect all defined node IDs from the KrsFile, including top-level services
 * (which collectNodes omits because they appear in krsFile.services, not as
 * children of systems).
 */
export function collectAllIdentifiers(krsFile: KrsFile): string[] {
  const ids: string[] = [];

  function addKrsNode(node: KrsNode): void {
    ids.push(node.id);
    for (const child of node.children) addKrsNode(child);
  }

  function addTeamNode(team: TeamNode): void {
    ids.push(team.id);
    for (const member of team.members) ids.push(member.id);
    for (const sub of team.teams) addTeamNode(sub);
  }

  for (const sys of krsFile.systems) addKrsNode(sys);
  for (const svc of krsFile.services) addKrsNode(svc);
  for (const block of krsFile.deploys) {
    ids.push(block.id);
    for (const node of block.nodes) ids.push(node.id);
  }
  for (const org of krsFile.organizations) {
    ids.push(org.id);
    for (const team of org.teams) addTeamNode(team);
  }

  return ids;
}

/**
 * Find the description of a node by its ID.
 * Returns null if the node has no description or is not found.
 */
export function getNodeDescription(krsFile: KrsFile, nodeId: string): string | null {
  function searchKrsNode(node: KrsNode): string | null {
    if (node.id === nodeId) return node.properties.description ?? null;
    for (const child of node.children) {
      const found = searchKrsNode(child);
      if (found !== null) return found;
    }
    return null;
  }

  function searchTeam(team: TeamNode): string | null {
    if (team.id === nodeId) return team.properties.description ?? null;
    for (const member of team.members) {
      if (member.id === nodeId) return member.properties.description ?? null;
    }
    for (const sub of team.teams) {
      const found = searchTeam(sub);
      if (found !== null) return found;
    }
    return null;
  }

  function searchOrg(org: OrganizationBlock): string | null {
    if (org.id === nodeId) return org.properties.description ?? null;
    for (const team of org.teams) {
      const found = searchTeam(team);
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
  for (const org of krsFile.organizations) {
    const found = searchOrg(org);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Extract the identifier-like word ([\w] characters) around the given position.
 */
export function getWordAtPosition(
  text: string,
  position: { line: number; character: number },
): string | null {
  const lines = text.split("\n");
  const line = lines[position.line];
  if (!line) return null;

  const char = position.character;
  // Return null if cursor is not on a word character
  if (char >= line.length || !/\w/.test(line[char])) return null;

  let start = char;
  let end = char;

  while (start > 0 && /\w/.test(line[start - 1])) start--;
  while (end < line.length && /\w/.test(line[end])) end++;

  return start < end ? line.slice(start, end) : null;
}
