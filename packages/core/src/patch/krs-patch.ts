import { Parser } from "../parser/parser.js";
import type { KrsNode, DeployBlock, OrganizationBlock, OrgNode } from "../types/ast.js";
import type { SourceRange } from "../types/tokens.js";

export type PatchOperation = "append" | "replace" | "remove" | "insert-child";

type PatchResult = { ok: true; source: string } | { ok: false; error: string };

/** Minimal shape shared by KrsNode and DeployBlock for offset-based patching. */
interface LocatedNode {
  id: string;
  loc: SourceRange;
}

/**
 * Apply a structural patch to a .krs source string.
 *
 * - append:       appends `content` as a new top-level block at the end of the file
 * - replace:      finds the node with `targetNodeId` in the AST and replaces its source range
 * - remove:       finds the node with `targetNodeId` in the AST and removes its source range
 * - insert-child: inserts `content` as the last child of the node with `targetNodeId`,
 *                 automatically indenting relative to the parent's closing `}`
 *
 * Searches logical nodes (systems, services, domains), deploy blocks, and org nodes
 * (organizations, teams, members).
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

  if ((operation === "replace" || operation === "insert-child") && !content) {
    return { ok: false, error: `content is required for ${operation}` };
  }

  const parseResult = Parser.parse(source);
  const node = findNodeById(
    parseResult.value.systems,
    parseResult.value.services,
    parseResult.value.domains,
    parseResult.value.deploys,
    parseResult.value.organizations,
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

  if (operation === "insert-child") {
    // loc.end.offset points to the closing `}` of the parent node (inclusive).
    const closingBrace = node.loc.end.offset;
    const beforeClose = source.slice(0, closingBrace);
    const afterClose = source.slice(closingBrace); // starts with `}`

    // Determine the indentation of the closing `}` from the last line before it.
    const lastNewlineIdx = beforeClose.lastIndexOf("\n");
    const lineAfterLastNewline = lastNewlineIdx >= 0 ? beforeClose.slice(lastNewlineIdx + 1) : "";
    const closingIndent = lineAfterLastNewline.match(/^(\s*)/)?.[1] ?? "";
    const childIndent = closingIndent + "  ";

    const indentedContent = applyChildIndent(content!.trim(), childIndent);

    // Strip trailing horizontal whitespace (the indentation of the closing `}`)
    // so we don't leave a whitespace-only line before the inserted child.
    const trimmedBeforeClose = beforeClose.replace(/[ \t]+$/, "");
    // Empty blocks (`system Foo {}`) have no newline before `}` — add one.
    const needsNewline = !trimmedBeforeClose.endsWith("\n");
    return {
      ok: true,
      source:
        trimmedBeforeClose +
        (needsNewline ? "\n" : "") +
        indentedContent +
        "\n" +
        closingIndent +
        afterClose,
    };
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

/**
 * Normalize `content` indentation and prepend `childIndent` to every line.
 * The minimum indentation among non-empty lines is stripped first so that
 * content pasted with arbitrary leading whitespace is handled correctly.
 */
function applyChildIndent(content: string, childIndent: string): string {
  const lines = content.split("\n");
  const nonEmptyLines = lines.filter((l) => l.trim());
  if (nonEmptyLines.length === 0) return content;

  const minIndentLen = Math.min(...nonEmptyLines.map((l) => (l.match(/^(\s*)/)?.[1] ?? "").length));
  return lines
    .map((line) => (line.trim() ? childIndent + line.slice(minIndentLen) : ""))
    .join("\n");
}

function findNodeById(
  systems: KrsNode[],
  services: KrsNode[],
  domains: KrsNode[],
  deploys: DeployBlock[],
  organizations: OrganizationBlock[],
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
  // Search org blocks and their nested team/member trees
  for (const org of organizations) {
    if (org.id === id) return org;
    for (const team of org.teams) {
      const found = searchOrgNode(team, id);
      if (found !== null) return found;
    }
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

function searchOrgNode(node: OrgNode, id: string): LocatedNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = searchOrgNode(child, id);
    if (found !== null) return found;
  }
  return null;
}
