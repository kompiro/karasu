import { Parser } from "../parser/parser.js";
import type { KrsNode, DeployBlock } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";

export type PatchOperation = "append" | "replace" | "remove";

type PatchResult = { ok: true; source: string } | { ok: false; error: string };

/** Minimal shape shared by KrsNode and DeployBlock for offset-based patching. */
interface LocatedNode {
  id: string;
  loc: SourceRange;
}

/**
 * Apply a structural patch to a .krs source string.
 *
 * - append: appends `content` as a new top-level block at the end of the file
 * - replace: finds the node with `targetNodeId` in the AST and replaces its source range
 * - remove: finds the node with `targetNodeId` in the AST and removes its source range
 *
 * Searches logical nodes (systems, services, domains) and deploy blocks.
 *
 * The `loc.end.offset` from the parser points to the `}` character (inclusive),
 * so all slice operations use `end.offset + 1` as the exclusive end boundary.
 */
export function applyKrsPatch(
  source: string,
  operation: PatchOperation,
  targetNodeId?: string,
  content?: string,
): PatchResult {
  if (operation === "append") {
    if (!content) {
      return { ok: false, error: "content is required for append" };
    }
    // When source is empty (new file), do not prepend a newline separator.
    return { ok: true, source: source ? source + "\n" + content : content };
  }

  if (targetNodeId === undefined) {
    return { ok: false, error: `targetNodeId is required for ${operation}` };
  }

  if (operation === "replace" && !content) {
    return { ok: false, error: "content is required for replace" };
  }

  const parseResult = Parser.parse(source);
  const node = findNodeById(
    parseResult.value.systems,
    parseResult.value.services,
    parseResult.value.domains,
    parseResult.value.deploys,
    targetNodeId,
  );

  if (node === null) {
    return { ok: false, error: `Node "${targetNodeId}" not found` };
  }

  const start = node.loc.start.offset;
  const end = node.loc.end.offset + 1; // end.offset is the position of `}` (inclusive)

  if (operation === "replace") {
    return { ok: true, source: source.slice(0, start) + content + source.slice(end) };
  }

  // operation === "remove"
  const before = source.slice(0, start).replace(/[ \t]*\n?$/, "");
  const raw = source.slice(end);
  // For the first node (before is empty/whitespace), strip all leading whitespace.
  // For middle/trailing nodes, strip one newline to close the gap left by the removed block.
  const after = before.trim() === "" ? raw.replace(/^\s+/, "") : raw.replace(/^\n/, "");
  return { ok: true, source: before + after };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function findNodeById(
  systems: KrsNode[],
  services: KrsNode[],
  domains: KrsNode[],
  deploys: DeployBlock[],
  id: string,
): LocatedNode | null {
  // Search logical nodes recursively
  for (const root of [...systems, ...services, ...domains]) {
    const found = searchNode(root, id);
    if (found !== null) return found;
  }
  // Search deploy blocks (top-level only; deploy units are not patchable)
  for (const deploy of deploys) {
    if (deploy.id === id) return deploy;
  }
  return null;
}

function searchNode(node: KrsNode, id: string): KrsNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = searchNode(child, id);
    if (found !== null) return found;
  }
  return null;
}
