import { Parser } from "../parser/parser.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenType } from "../types/tokens.js";
import type { Token } from "../types/tokens.js";
import { quoteId } from "./quote-id.js";
import type {
  KrsFile,
  KrsNode,
  KrsEdge,
  DeployBlock,
  DeployNode,
  ImportDeclaration,
  OrganizationBlock,
  TeamNode,
  MemberNode,
  LinkEntry,
} from "../types/ast.js";

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

/**
 * Format a .krs source string.
 *
 * - Normalises indentation (2 spaces), blank lines, and spacing.
 * - Preserves line comments (// ...) and block comments (/* ... *\/).
 * - Throws FormatError when the source has parse errors.
 * - Idempotent: format(format(src)) === format(src).
 *
 * Known limitation (v1): comments that appear between properties inside a
 * block body may be relocated to immediately before the next child node or
 * edge, because property positions are not stored in the AST.
 */
export function format(src: string): string {
  const parseResult = Parser.parse(src);
  if (parseResult.diagnostics.some((d) => d.severity === "error")) {
    throw new FormatError("Cannot format: source contains parse errors");
  }
  const commentTokens = new Lexer(src)
    .tokenizeWithComments()
    .filter((t) => t.type === TokenType.LineComment || t.type === TokenType.BlockComment);
  return new Printer(commentTokens).printFile(parseResult.value);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function kindToKeyword(kind: string): string {
  // queue-item uses "queue" keyword in source
  return kind === "queue-item" ? "queue" : kind;
}

type HasLoc = { loc: { start: { line: number }; end: { line: number } } };

// ---------------------------------------------------------------------------
// Printer
// ---------------------------------------------------------------------------

class Printer {
  /** Comment tokens indexed by source line (1-based). */
  private readonly byLine: Map<number, Token[]>;
  /** Lines whose comment tokens have already been emitted. */
  private readonly emitted: Set<number>;

  constructor(commentTokens: Token[]) {
    this.byLine = new Map();
    this.emitted = new Set();
    for (const tok of commentTokens) {
      const bucket = this.byLine.get(tok.loc.line) ?? [];
      bucket.push(tok);
      this.byLine.set(tok.loc.line, bucket);
    }
  }

  // ── Public entry point ────────────────────────────────────────────────────

  printFile(file: KrsFile): string {
    const out: string[] = [];
    let prevEndLine = 0;

    // @import (style imports — no loc available)
    for (const path of file.styleImports) {
      out.push(`@import "${path}"`);
    }

    // import (node imports — have loc)
    for (const imp of file.nodeImports) {
      const leadingToks = this.extractLeading(prevEndLine + 1, imp.loc.start.line - 1);
      out.push(...this.renderLeading(leadingToks, ""));
      const trail = this.extractTrailing(imp.loc.start.line);
      out.push(this.renderImport(imp) + trail);
      prevEndLine = imp.loc.end.line;
    }

    // Top-level blocks sorted by source line
    const topLevel = [
      ...file.systems,
      ...file.services,
      ...file.domains,
      ...file.deploys,
      ...file.organizations,
    ].sort((a, b) => a.loc.start.line - b.loc.start.line);

    for (const block of topLevel) {
      const startLine = block.loc.start.line;
      const leadingToks = this.extractLeading(prevEndLine + 1, startLine - 1);

      if (out.length > 0) out.push(""); // blank line between top-level blocks
      out.push(...this.renderLeading(leadingToks, ""));
      out.push(...this.renderTopLevel(block));
      prevEndLine = block.loc.end.line;
    }

    // Remaining comments (e.g. file footer)
    const remaining = this.remainingComments();
    if (remaining.length > 0) {
      if (out.length > 0) out.push("");
      out.push(...this.renderLeading(remaining, ""));
    }

    return out.join("\n") + "\n";
  }

  // ── Comment helpers ───────────────────────────────────────────────────────

  /** Extract not-yet-emitted comments between source lines [from, to]. */
  private extractLeading(from: number, to: number): Token[] {
    const result: Token[] = [];
    for (let line = from; line <= to; line++) {
      if (this.emitted.has(line)) continue;
      const toks = this.byLine.get(line);
      if (toks) {
        result.push(...toks);
        this.emitted.add(line);
      }
    }
    return result;
  }

  /**
   * Extract a trailing comment on a specific line (same line as a declaration).
   * Returns a formatted string like " // comment" or "" if none.
   */
  private extractTrailing(line: number): string {
    if (this.emitted.has(line)) return "";
    const toks = this.byLine.get(line);
    if (!toks || toks.length === 0) return "";
    this.emitted.add(line);
    return " " + toks.map((t) => this.renderCommentToken(t)).join(" ");
  }

  /** Collect all remaining (not yet emitted) comment tokens in source order. */
  private remainingComments(): Token[] {
    const result: Token[] = [];
    const sortedLines = [...this.byLine.keys()].sort((a, b) => a - b);
    for (const line of sortedLines) {
      if (this.emitted.has(line)) continue;
      result.push(...(this.byLine.get(line) ?? []));
      this.emitted.add(line);
    }
    return result;
  }

  private renderLeading(toks: Token[], indent: string): string[] {
    return toks.map((t) => indent + this.renderCommentToken(t));
  }

  private renderCommentToken(tok: Token): string {
    if (tok.type === TokenType.LineComment) return `// ${tok.value}`;
    return `/* ${tok.value} */`;
  }

  // ── Import ────────────────────────────────────────────────────────────────

  private renderImport(imp: ImportDeclaration): string {
    if (imp.ids.length === 0) return `import "${imp.path}"`;
    // Bare ids are stored as `["Foo"]`; multi-segment paths as `["A", "B", "C"]`.
    // Re-join each path with "." to round-trip through the formatter.
    const formatted = imp.ids.map((segments) => segments.map(quoteId).join(".")).join(", ");
    return `import { ${formatted} } from "${imp.path}"`;
  }

  // ── Top-level dispatch ────────────────────────────────────────────────────

  private renderTopLevel(block: HasLoc): string[] {
    if ("nodes" in block) return this.renderDeployBlock(block as DeployBlock);
    if ("teams" in block) return this.renderOrganizationBlock(block as OrganizationBlock);
    return this.renderNode(block as KrsNode, 0);
  }

  // ── KrsNode ───────────────────────────────────────────────────────────────

  private renderNode(node: KrsNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const keyword = kindToKeyword(node.kind);

    // Declaration parts: keyword id [tags] @annotations
    const decl: string[] = [keyword, quoteId(node.id)];
    if (node.tags.length > 0) decl.push(`[${node.tags.join(", ")}]`);
    for (const ann of node.annotations) decl.push(`@${ann}`);

    const propLines = this.renderProperties(node, indent + "  ");
    const hasProps = propLines.length > 0;
    const hasChildren = node.children.length > 0;
    const hasEdges = node.edges.length > 0;

    if (!hasProps && !hasChildren && !hasEdges) {
      const trail = this.extractTrailing(node.loc.start.line);
      return [`${indent}${decl.join(" ")} {}${trail}`];
    }

    const trail = this.extractTrailing(node.loc.start.line);
    const lines: string[] = [`${indent}${decl.join(" ")} {${trail}`];
    lines.push(...propLines);

    // Children and edges sorted by source line
    type Item =
      | { kind: "child"; node: KrsNode; line: number; endLine: number }
      | { kind: "edge"; edge: KrsEdge; line: number; endLine: number };

    const items: Item[] = [
      ...node.children.map((n) => ({
        kind: "child" as const,
        node: n,
        line: n.loc.start.line,
        endLine: n.loc.end.line,
      })),
      ...node.edges.map((e) => ({
        kind: "edge" as const,
        edge: e,
        line: e.loc.start.line,
        endLine: e.loc.end.line,
      })),
    ].sort((a, b) => a.line - b.line);

    let prevEndLine = node.loc.start.line;
    let prevItemKind: "property" | "child" | "edge" | null = hasProps ? "property" : null;

    for (const item of items) {
      const leadingToks = this.extractLeading(prevEndLine + 1, item.line - 1);

      // Blank line rules:
      // - before each child block (always, unless it's the very first item and no properties)
      // - before first edge when preceded by properties or children
      // - no blank line between consecutive edges
      const needsBlank =
        item.kind === "child"
          ? prevItemKind !== null // blank before child (except if very first with no props)
          : prevItemKind !== null && prevItemKind !== "edge"; // blank before first edge only

      if (needsBlank) lines.push("");
      lines.push(...this.renderLeading(leadingToks, indent + "  "));

      if (item.kind === "child") {
        lines.push(...this.renderNode(item.node, depth + 1));
      } else {
        const edgeTrail = this.extractTrailing(item.edge.loc.start.line);
        lines.push(`${indent}  ${this.renderEdge(item.edge, node.kind)}${edgeTrail}`);
      }

      prevEndLine = item.endLine;
      prevItemKind = item.kind;
    }

    lines.push(`${indent}}`);
    return lines;
  }

  private renderProperties(node: KrsNode, indent: string): string[] {
    const lines: string[] = [];
    if (node.label !== undefined) lines.push(`${indent}label "${node.label}"`);
    if (node.properties.description !== undefined) {
      lines.push(this.renderDescription(node.properties.description, indent));
    }
    if ("role" in node.properties && node.properties.role !== undefined) {
      lines.push(`${indent}role "${node.properties.role}"`);
    }
    if ("team" in node.properties && node.properties.team !== undefined) {
      lines.push(`${indent}team "${node.properties.team}"`);
    }
    if (
      "delivers" in node.properties &&
      Array.isArray(node.properties.delivers) &&
      node.properties.delivers.length > 0
    ) {
      lines.push(`${indent}delivers ${node.properties.delivers.map(quoteId).join(", ")}`);
    }
    if (
      "operations" in node.properties &&
      Array.isArray(node.properties.operations) &&
      node.properties.operations.length > 0
    ) {
      lines.push(`${indent}operations ${this.renderOperations(node.properties.operations)}`);
    }
    for (const link of node.properties.links) {
      lines.push(this.renderLink(link, indent));
    }
    return lines;
  }

  private renderOperations(
    ops: readonly { verb: string; decoratedAs?: readonly string[] }[],
  ): string {
    return ops
      .map((op) => {
        if (op.decoratedAs && op.decoratedAs.length > 0) {
          return `${quoteId(op.verb)}:${op.decoratedAs.join(",")}`;
        }
        return quoteId(op.verb);
      })
      .join(", ");
  }

  private renderDescription(value: string, indent: string): string {
    if (!value.includes("\n")) return `${indent}description "${value}"`;
    const body = value
      .split("\n")
      .map((l) => (l ? `${indent}  ${l}` : ""))
      .join("\n");
    return `${indent}description """\n${body}\n${indent}  """`;
  }

  private renderLink(link: LinkEntry, indent: string): string {
    if (link.label !== undefined) return `${indent}link "${link.url}" "${link.label}"`;
    return `${indent}link "${link.url}"`;
  }

  private renderEdge(edge: KrsEdge, parentKind?: string): string {
    const arrow = edge.kind === "async" ? "-->" : "->";
    const label = edge.label !== undefined ? ` "${edge.label}"` : "";
    const tags = edge.tags.length > 0 ? ` [${edge.tags.join(", ")}]` : "";
    // Use implicit-source shorthand for service/domain blocks (from is always parentId)
    const from =
      parentKind === "service" || parentKind === "domain" ? "" : `${quoteId(edge.from)} `;
    return `${from}${arrow} ${quoteId(edge.to)}${label}${tags}`;
  }

  // ── DeployBlock ───────────────────────────────────────────────────────────

  private renderDeployBlock(block: DeployBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const lines: string[] = [`deploy ${quoteId(block.id)} {${trail}`];

    if (block.label !== undefined) lines.push(`  label "${block.label}"`);

    let prevEndLine = block.loc.start.line;
    for (let i = 0; i < block.nodes.length; i++) {
      const node = block.nodes[i];
      const leadingToks = this.extractLeading(prevEndLine + 1, node.loc.start.line - 1);
      if (i > 0 || block.label !== undefined) lines.push("");
      lines.push(...this.renderLeading(leadingToks, "  "));
      lines.push(...this.renderDeployNode(node));
      prevEndLine = node.loc.end.line;
    }

    lines.push("}");
    return lines;
  }

  private renderDeployNode(node: DeployNode): string[] {
    const trail = this.extractTrailing(node.loc.start.line);
    const lines: string[] = [`  ${node.kind} ${quoteId(node.id)} {${trail}`];

    if (node.label !== undefined) lines.push(`    label "${node.label}"`);
    if (node.properties.runtime !== undefined)
      lines.push(`    runtime "${node.properties.runtime}"`);
    if (node.properties.image !== undefined) lines.push(`    image "${node.properties.image}"`);
    if (node.properties.type !== undefined) lines.push(`    type "${node.properties.type}"`);
    if (node.properties.schedule !== undefined)
      lines.push(`    schedule "${node.properties.schedule}"`);
    for (const r of node.properties.realizes ?? []) {
      lines.push(`    realizes ${quoteId(r)}`);
    }

    lines.push("  }");
    return lines;
  }

  // ── OrganizationBlock ─────────────────────────────────────────────────────

  private renderOrganizationBlock(block: OrganizationBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const lines: string[] = [`organization ${quoteId(block.id)} {${trail}`];

    if (block.label !== undefined) lines.push(`  label "${block.label}"`);
    if (block.properties.description !== undefined) {
      lines.push(this.renderDescription(block.properties.description, "  "));
    }
    for (const link of block.properties.links) {
      lines.push(this.renderLink(link, "  "));
    }

    let prevEndLine = block.loc.start.line;
    for (let i = 0; i < block.teams.length; i++) {
      const team = block.teams[i];
      const leadingToks = this.extractLeading(prevEndLine + 1, team.loc.start.line - 1);
      if (lines.length > 1) lines.push("");
      lines.push(...this.renderLeading(leadingToks, "  "));
      lines.push(...this.renderTeam(team, 1));
      prevEndLine = team.loc.end.line;
    }

    lines.push("}");
    return lines;
  }

  private renderTeam(team: TeamNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const trail = this.extractTrailing(team.loc.start.line);
    const lines: string[] = [`${indent}team ${quoteId(team.id)} {${trail}`];

    if (team.label !== undefined) lines.push(`${indent}  label "${team.label}"`);
    if (team.properties.description !== undefined) {
      lines.push(this.renderDescription(team.properties.description, `${indent}  `));
    }
    for (const link of team.properties.links) {
      lines.push(this.renderLink(link, `${indent}  `));
    }
    for (const owns of team.properties.owns) {
      lines.push(`${indent}  owns ${quoteId(owns)}`);
    }

    let prevEndLine = team.loc.start.line;
    for (const child of team.children) {
      const startLine = child.loc.start.line;
      const endLine = child.loc.end.line;
      const leadingToks = this.extractLeading(prevEndLine + 1, startLine - 1);
      if (lines.length > 1) lines.push("");
      lines.push(...this.renderLeading(leadingToks, `${indent}  `));
      if (child.kind === "team") {
        lines.push(...this.renderTeam(child as TeamNode, depth + 1));
      } else {
        lines.push(...this.renderMember(child as MemberNode, depth + 1));
      }
      prevEndLine = endLine;
    }

    lines.push(`${indent}}`);
    return lines;
  }

  private renderMember(member: MemberNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const trail = this.extractTrailing(member.loc.start.line);
    const lines: string[] = [`${indent}member ${quoteId(member.id)} {${trail}`];

    if (member.label !== undefined) lines.push(`${indent}  label "${member.label}"`);
    if (member.properties.description !== undefined) {
      lines.push(this.renderDescription(member.properties.description, `${indent}  `));
    }
    if (member.properties.slack !== undefined)
      lines.push(`${indent}  slack "${member.properties.slack}"`);
    if (member.properties.github !== undefined)
      lines.push(`${indent}  github "${member.properties.github}"`);

    lines.push(`${indent}}`);
    return lines;
  }
}
