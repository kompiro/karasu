import { Parser, annotationParamKind } from "../parser/parser.js";
import { Lexer } from "../lexer/lexer.js";
import { TokenType } from "../types/tokens.js";
import type { SourceRange, Token } from "../types/tokens.js";
import { quoteId } from "./quote-id.js";
import { quoteString, emitDescription } from "./quote-string.js";
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
  ClientCapability,
  BoundaryBlock,
  FacetBlock,
  LegendBlock,
  LegendEntry,
  LegendRefTarget,
  DiagnosticCode,
} from "../types/ast.js";
import { edgeArrow } from "../types/ast.js";

export class FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatError";
  }
}

/**
 * Diagnostics that stop `format` although they are warnings everywhere else.
 *
 * `fmt`'s contract is "reformat, change nothing", and the formatter prints
 * what the AST holds. When the parser could not record what the author wrote,
 * printing the AST deletes it: an unreadable parameter value comes back as a
 * bare annotation, and a conflicting parameter comes back with the surviving
 * value printed over the other. Rendering is unaffected by either, so they
 * stay warnings and the refusal lives here instead (#2707).
 */
export const FORMAT_BLOCKING_CODES: ReadonlySet<DiagnosticCode> = new Set<DiagnosticCode>([
  "annotation-param-value-unreadable",
  "annotation-param-conflict",
]);

/**
 * Format a .krs source string.
 *
 * - Normalises indentation (2 spaces), blank lines, and spacing.
 * - Preserves line comments (// ...) and block comments (/* ... *\/).
 * - Throws FormatError when the source has parse errors, or a value the
 *   formatter cannot preserve (`FORMAT_BLOCKING_CODES`).
 * - Idempotent: format(format(src)) === format(src).
 *
 * A comment stays with the line it annotates: above it, or after it on the
 * same line. Properties print in a canonical order, so a comment written
 * above or beside a property moves with that property (#3263).
 */
export function format(src: string): string {
  const parseResult = Parser.parse(src);
  if (parseResult.diagnostics.some((d) => d.severity === "error")) {
    throw new FormatError("Cannot format: source contains parse errors");
  }
  const unpreservable = [
    ...new Set(
      parseResult.diagnostics.filter((d) => FORMAT_BLOCKING_CODES.has(d.code)).map((d) => d.code),
    ),
  ];
  if (unpreservable.length > 0) {
    throw new FormatError(
      `Cannot format: the source holds a value this command cannot preserve (${unpreservable.join(", ")})`,
    );
  }
  return new Printer(new Lexer(src).tokenizeWithComments()).printFile(parseResult.value);
}

/**
 * Serialize an already-parsed (or merged) {@link KrsFile} AST back to `.krs`
 * source text. Unlike {@link format}, which parses a source string first, this
 * takes an AST directly — used to flatten a multi-file project (resolved by
 * `ImportResolver`) into a single self-contained `.krs` for inline sharing.
 *
 * Comments are not preserved (no source/token stream is available for a merged
 * AST); structural content round-trips faithfully.
 */
export function serializeKrsFile(file: KrsFile): string {
  return new Printer([]).printFile(file);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function kindToKeyword(kind: string): string {
  // queue-item uses "queue" keyword in source
  return kind === "queue-item" ? "queue" : kind;
}

type HasLoc = { loc: SourceRange };

function isComment(tok: Token): boolean {
  return tok.type === TokenType.LineComment || tok.type === TokenType.BlockComment;
}

/**
 * One statement of a block body, as written in the source: the first token on
 * a line inside the block's braces starts one, and it runs until the next.
 * A nested block (a child node, a capability block) belongs to the statement
 * that opened it.
 */
interface BodyStatement {
  keyword: string;
  startLine: number;
  endLine: number;
}

/** A block body: the line its `{` is on and the statements inside it. */
interface BlockBody {
  openOffset: number;
  openLine: number;
  statements: BodyStatement[];
}

// ---------------------------------------------------------------------------
// Printer
// ---------------------------------------------------------------------------

class Printer {
  /** Comment tokens indexed by source line (1-based). */
  private readonly byLine: Map<number, Token[]>;
  /** Lines whose comment tokens have already been emitted. */
  private readonly emitted: Set<number>;
  /** Lines that hold a non-comment token, so a comment there trails it. */
  private readonly tokenLines: Set<number>;
  /** Every block body in the source, in the order their `{` appears. */
  private readonly bodies: BlockBody[];

  /** `tokens` is the full stream from `tokenizeWithComments()`. */
  constructor(tokens: Token[]) {
    this.byLine = new Map();
    this.emitted = new Set();
    this.tokenLines = new Set();
    this.bodies = [];
    // The AST stores no position for most properties, so the statement
    // positions a comment is placed against come from the token stream.
    const open: { body: BlockBody; lastLine: number }[] = [];
    for (const tok of tokens) {
      if (isComment(tok)) {
        const bucket = this.byLine.get(tok.loc.line) ?? [];
        bucket.push(tok);
        this.byLine.set(tok.loc.line, bucket);
        continue;
      }
      if (tok.type === TokenType.EOF) continue;
      const endLine = tok.end?.line ?? tok.loc.line;
      this.tokenLines.add(tok.loc.line);
      this.tokenLines.add(endLine);
      if (tok.type === TokenType.RightBrace) open.pop();
      const top = open.at(-1);
      if (top) {
        const current = top.body.statements.at(-1);
        // A closing brace ends the statement that opened the block, whatever
        // line it is on.
        if (tok.type !== TokenType.RightBrace && tok.loc.line > top.lastLine) {
          top.body.statements.push({ keyword: tok.value, startLine: tok.loc.line, endLine });
        } else if (current) {
          current.endLine = endLine;
        }
        top.lastLine = endLine;
      }
      if (tok.type === TokenType.LeftBrace) {
        const body = { openOffset: tok.loc.offset, openLine: tok.loc.line, statements: [] };
        this.bodies.push(body);
        open.push({ body, lastLine: tok.loc.line });
      }
    }
  }

  // ── Public entry point ────────────────────────────────────────────────────

  printFile(file: KrsFile): string {
    const out: string[] = [];
    let prevEndLine = 0;

    // @import (style imports — no loc available)
    for (const path of file.styleImports) {
      out.push(`@import ${quoteString(path)}`);
    }

    // import (node imports — have loc)
    for (const imp of file.nodeImports) {
      const leadingToks = this.extractLeading(prevEndLine + 1, imp.loc.start.line - 1);
      out.push(...this.renderLeading(leadingToks, ""));
      const trail = this.extractTrailing(imp.loc.start.line);
      out.push(this.renderImport(imp) + trail);
      prevEndLine = imp.loc.end.line;
    }

    // Top-level blocks sorted by source line.
    //
    // This list must enumerate **every** block-valued top-level array on
    // `KrsFile`. An array omitted here is silently dropped from the output —
    // `fmt` then destroys source the parser accepted (#2076). The exhaustiveness
    // guard in `formatter-top-level-coverage.test.ts` fails when a new top-level
    // array is added to `KrsFile` without being wired in here.
    const topLevel = [
      ...file.systems,
      ...file.services,
      ...file.clients,
      ...file.domains,
      ...file.databases,
      ...file.queues,
      ...file.storages,
      ...file.deploys,
      ...file.organizations,
      ...file.boundaries,
      ...file.facets,
      ...file.legends,
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

  /** The body of the block declared at `loc`: the first `{` inside its range. */
  private bodyOf(loc: SourceRange): BlockBody | undefined {
    let lo = 0;
    let hi = this.bodies.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.bodies[mid].openOffset < loc.start.offset) lo = mid + 1;
      else hi = mid;
    }
    const body = this.bodies[lo];
    return body !== undefined && body.openOffset < loc.end.offset ? body : undefined;
  }

  /**
   * Give each property line of the block at `loc` the comments written above
   * and beside it in the source (#3263).
   *
   * `propLines` is what the block's renderer printed, in canonical order, at
   * `indent`; an element that starts a property begins with `indent` and its
   * keyword, anything else continues the property above it (a capability
   * block, its closing brace). Printed properties are paired with source
   * statements of the same keyword in order. Properties a canonical form
   * merges (repeated `facets` lines) take the comments of every statement
   * they came from; properties it splits (a `realizes` comma list) leave the
   * comments on the first. A trailing comment of the first statement stays
   * trailing; every other comment goes above the property, so none is lost
   * and a second pass leaves them where they are.
   *
   * Statements starting on a line in `itemLines` (child nodes, edges) are not
   * properties and are left to the item loop.
   */
  private withPropertyComments(
    loc: SourceRange,
    propLines: string[],
    indent: string,
    itemLines: ReadonlySet<number> = new Set(),
  ): string[] {
    const body = this.bodyOf(loc);
    if (!body || this.byLine.size === 0) return propLines;

    const entries: { keyword: string; lines: string[] }[] = [];
    for (const line of propLines) {
      const rest = line.startsWith(indent) ? line.slice(indent.length) : "";
      const current = entries.at(-1);
      if (/^[A-Za-z]/.test(rest) || !current) {
        entries.push({ keyword: rest.split(/\s/, 1)[0], lines: [line] });
      } else {
        current.lines.push(line);
      }
    }

    // Source statements by keyword, each with the line its predecessor ended on.
    const byKeyword = new Map<string, { stmt: BodyStatement; prevEnd: number }[]>();
    body.statements.forEach((stmt, i) => {
      if (itemLines.has(stmt.startLine)) return;
      const prevEnd = i === 0 ? body.openLine : body.statements[i - 1].endLine;
      const list = byKeyword.get(stmt.keyword) ?? [];
      list.push({ stmt, prevEnd });
      byKeyword.set(stmt.keyword, list);
    });

    const out: string[] = [];
    const seen = new Map<string, number>();
    entries.forEach((entry, i) => {
      const nth = seen.get(entry.keyword) ?? 0;
      seen.set(entry.keyword, nth + 1);
      const sources = byKeyword.get(entry.keyword) ?? [];
      const isLast = !entries.slice(i + 1).some((e) => e.keyword === entry.keyword);
      const paired = isLast ? sources.slice(nth) : sources.slice(nth, nth + 1);

      const above: Token[] = [];
      let trailing: Token[] | undefined;
      for (const { stmt, prevEnd } of paired) {
        above.push(...this.extractLeading(prevEnd + 1, stmt.startLine - 1));
        for (let line = stmt.startLine; line <= stmt.endLine; line++) {
          if (this.emitted.has(line)) continue;
          const toks = this.byLine.get(line);
          if (!toks) continue;
          this.emitted.add(line);
          if (trailing === undefined && this.tokenLines.has(line)) trailing = toks;
          else above.push(...toks);
        }
      }

      out.push(...this.renderLeading(above, indent));
      const lines = [...entry.lines];
      if (trailing) {
        // On the property's first element: for a multi-line description that
        // element holds the whole string, so the comment lands after the
        // closing quotes, where it was written.
        lines[0] += " " + trailing.map((t) => this.renderCommentToken(t)).join(" ");
      }
      out.push(...lines);
    });
    return out;
  }

  /** Whether a not-yet-emitted comment sits inside the block at `loc`. */
  private hasCommentsWithin(loc: SourceRange): boolean {
    for (let line = loc.start.line + 1; line < loc.end.line; line++) {
      if (!this.emitted.has(line) && this.byLine.has(line)) return true;
    }
    return false;
  }

  /**
   * Close the block at `loc`: the comments still unplaced inside it go above
   * the closing brace, and a comment after the brace stays after it.
   */
  private closeBlock(loc: SourceRange, indent: string): string[] {
    const inner = this.extractLeading(loc.start.line + 1, loc.end.line - 1);
    const close = `${indent}}`;
    const trail = loc.end.line > loc.start.line ? this.extractTrailing(loc.end.line) : "";
    return [...this.renderLeading(inner, indent + "  "), close + trail];
  }

  // ── Import ────────────────────────────────────────────────────────────────

  private renderImport(imp: ImportDeclaration): string {
    if (imp.ids.length === 0) return `import ${quoteString(imp.path)}`;
    // Bare ids are stored as `["Foo"]`; multi-segment paths as `["A", "B", "C"]`.
    // Re-join each path with "." to round-trip through the formatter.
    const formatted = imp.ids.map((entry) => entry.path.map(quoteId).join(".")).join(", ");
    return `import { ${formatted} } from ${quoteString(imp.path)}`;
  }

  // ── Top-level dispatch ────────────────────────────────────────────────────

  private renderTopLevel(block: HasLoc): string[] {
    if ("nodes" in block) return this.renderDeployBlock(block as DeployBlock);
    if ("teams" in block) return this.renderOrganizationBlock(block as OrganizationBlock);
    if ("contains" in block) return this.renderBoundaryBlock(block as BoundaryBlock);
    // A `facet` block has no distinguishing member array to duck-type on (its
    // whole point is having no membership list), so dispatch on the tag.
    if ("kind" in block && (block as { kind: unknown }).kind === "facet") {
      return this.renderFacetBlock(block as FacetBlock);
    }
    if ("entries" in block) return this.renderLegendBlock(block as LegendBlock);
    // Everything else is a KrsNode: system / service / client / domain and the
    // infra kinds (database / queue / storage), which are legal at top level
    // (ADR-702) and render exactly as they do when nested.
    return this.renderNode(block as KrsNode, 0);
  }

  // ── KrsNode ───────────────────────────────────────────────────────────────

  private renderNode(node: KrsNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const keyword = kindToKeyword(node.kind);

    // Declaration parts: keyword id [tags] @annotations
    // Resource dot-notation refs serialise each segment separately so the
    // joined id (which contains a `.`) does not get wrapped in quotes.
    const idText =
      node.kind === "resource" && node.ref
        ? `${quoteId(node.ref.parent)}.${quoteId(node.ref.child)}`
        : quoteId(node.id);
    const decl: string[] = [keyword, idText];
    if (node.tags.length > 0) decl.push(`[${node.tags.join(", ")}]`);
    decl.push(...renderAnnotations(node.annotations, node.annotationParams));

    const trail = this.extractTrailing(node.loc.start.line);
    const rawPropLines = this.renderProperties(node, indent + "  ");
    const hasProps = rawPropLines.length > 0;
    const hasChildren = node.children.length > 0;
    const hasEdges = node.edges.length > 0;
    const hasBoundaries = (node.boundaries ?? []).length > 0;

    // An empty body collapses to `{}` unless a comment is written inside it.
    if (
      !hasProps &&
      !hasChildren &&
      !hasEdges &&
      !hasBoundaries &&
      !this.hasCommentsWithin(node.loc)
    ) {
      return [`${indent}${decl.join(" ")} {}${trail}`];
    }

    const lines: string[] = [`${indent}${decl.join(" ")} {${trail}`];

    // Children and edges sorted by source line
    type Item =
      | { kind: "child"; node: KrsNode; line: number; endLine: number }
      | { kind: "edge"; edge: KrsEdge; line: number; endLine: number }
      | { kind: "boundary"; block: BoundaryBlock; line: number; endLine: number };

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
      // Scoped `boundary` blocks (#2036). They join the same line-ordered list
      // as children and edges so authored order round-trips; omitting them here
      // would make `fmt` delete them silently, the failure ADR-2076 fixed for
      // the top-level form (TPL-1101).
      ...(node.boundaries ?? []).map((b) => ({
        kind: "boundary" as const,
        block: b,
        line: b.loc.start.line,
        endLine: b.loc.end.line,
      })),
    ].sort((a, b) => a.line - b.line);

    lines.push(
      ...this.withPropertyComments(
        node.loc,
        rawPropLines,
        indent + "  ",
        new Set(items.map((item) => item.line)),
      ),
    );

    let prevEndLine = node.loc.start.line;
    let prevItemKind: "property" | "child" | "edge" | "boundary" | null = hasProps
      ? "property"
      : null;

    for (const item of items) {
      const leadingToks = this.extractLeading(prevEndLine + 1, item.line - 1);

      // Blank line rules:
      // - before each child block (always, unless it's the very first item and no properties)
      // - before first edge when preceded by properties or children
      // - no blank line between consecutive edges
      const needsBlank =
        item.kind === "child" || item.kind === "boundary"
          ? prevItemKind !== null // blank before child (except if very first with no props)
          : prevItemKind !== null && prevItemKind !== "edge"; // blank before first edge only

      if (needsBlank) lines.push("");
      lines.push(...this.renderLeading(leadingToks, indent + "  "));

      if (item.kind === "child") {
        lines.push(...this.renderNode(item.node, depth + 1));
      } else if (item.kind === "boundary") {
        lines.push(...this.renderBoundaryBlock(item.block).map((l) => `${indent}  ${l}`));
      } else {
        lines.push(...this.renderEdge(item.edge, node.kind).map((l) => `${indent}  ${l}`));
      }

      prevEndLine = item.endLine;
      prevItemKind = item.kind;
    }

    lines.push(...this.closeBlock(node.loc, indent));
    return lines;
  }

  private renderProperties(node: KrsNode, indent: string): string[] {
    const lines: string[] = [];
    if (node.label !== undefined) lines.push(`${indent}label ${quoteString(node.label)}`);
    if (node.properties.description !== undefined) {
      lines.push(this.renderDescription(node.properties.description, indent));
    }
    if (node.kind === "entity" && node.tableRef) {
      lines.push(`${indent}table ${quoteId(node.tableRef.parent)}.${quoteId(node.tableRef.child)}`);
    }
    if ("role" in node.properties && node.properties.role !== undefined) {
      lines.push(`${indent}role ${quoteString(node.properties.role)}`);
    }
    // `handles` was missing here until #2549, so `karasu fmt` deleted every
    // handles line it formatted — silently, since nothing else carries the
    // one-hop expose model. Canonicalized to a single comma list like `facets`
    // below, so `format(format(x)) === format(x)` holds for repeated lines.
    // Path refs print as written, each segment re-quoted only when needed
    // (TPL-1101, #2088).
    if (
      "handles" in node.properties &&
      Array.isArray(node.properties.handles) &&
      node.properties.handles.length > 0
    ) {
      const refs = node.properties.handles.map((h) => h.path.map(quoteId).join("."));
      lines.push(`${indent}handles ${refs.join(", ")}`);
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
    // Client-only. Neither was printed until #3101, so `karasu fmt` and
    // format-on-save deleted every `resource` / `capability` line of a client.
    // `formatter-property-coverage.test.ts` now fails on any property key
    // without a fixture that round-trips (TPL-1101).
    if (node.kind === "client") {
      for (const resource of node.properties.resources) {
        lines.push(`${indent}resource ${resource.storageKind} ${quoteString(resource.name)}`);
      }
      for (const capability of node.properties.capabilities) {
        lines.push(...this.renderCapability(capability, indent));
      }
    }
    // Canonicalized to a single comma list, whatever the author wrote: repeated
    // `facets` lines and duplicate ids were already collapsed at parse time, so
    // emitting one line is what makes `format(format(x)) === format(x)` hold.
    if (node.facets !== undefined && node.facets.length > 0) {
      lines.push(`${indent}facets ${node.facets.map(quoteId).join(", ")}`);
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

  /** `capability <name>`, or the block form when it carries a label or description. */
  private renderCapability(capability: ClientCapability, indent: string): string[] {
    const head = `${indent}capability ${capability.name}`;
    if (capability.label === undefined && capability.description === undefined) return [head];
    const inner = indent + "  ";
    const props: string[] = [];
    if (capability.label !== undefined)
      props.push(`${inner}label ${quoteString(capability.label)}`);
    if (capability.description !== undefined) {
      props.push(this.renderDescription(capability.description, inner));
    }
    return [
      `${head} {`,
      ...this.withPropertyComments(capability.loc, props, inner),
      ...this.closeBlock(capability.loc, indent),
    ];
  }

  private renderDescription(value: string, indent: string): string {
    return emitDescription(value, indent);
  }

  private renderLink(link: LinkEntry, indent: string): string {
    if (link.label !== undefined)
      return `${indent}link ${quoteString(link.url)} ${quoteString(link.label)}`;
    return `${indent}link ${quoteString(link.url)}`;
  }

  /**
   * One edge, canonicalized. The condition is a single one (#2543, #2544):
   * **does the edge carry anything the shorthand cannot express** — a
   * `description`, a `link`, or `facets`. If not, it folds to
   * `A -> B "label"`; if so, it emits the block
   * with `label` inside it. A label-only block is therefore not a stable form,
   * which is what keeps the two spellings from becoming a dual representation
   * of one fact (TPL-1415, TPL-2542).
   */
  private renderEdge(edge: KrsEdge, parentKind?: string): string[] {
    // The trailing comment belongs to the declaration line, which for the
    // block form is the line that opens the block.
    const trail = this.extractTrailing(edge.loc.start.line);
    const arrow = edgeArrow(edge.kind);
    const tags = edge.tags.length > 0 ? ` [${edge.tags.join(", ")}]` : "";
    // The author's `#<id>` is data, not decoration. Dropping it here silently
    // deleted an `edge#<id>` style selector's target (#2543).
    const id = edge.authorId !== undefined ? ` #${edge.authorId}` : "";
    // Use implicit-source shorthand for service/domain blocks (from is always parentId)
    const from =
      parentKind === "service" || parentKind === "domain" ? "" : `${quoteId(edge.from)} `;
    // A qualified target prints segment by segment, like every other reference
    // site, so the author's `Shop.Checkout.Payment` does not come back as one
    // quoted literal (#2650). Only `toPath` can say where the segments were:
    // `to` has already joined them, and a segment may hold a dot of its own.
    const to = edge.toPath ? edge.toPath.map(quoteId).join(".") : quoteId(edge.to);
    const head = `${from}${arrow} ${to}`;

    const hasBlockOnlyProperty =
      edge.description !== undefined ||
      (edge.links !== undefined && edge.links.length > 0) ||
      (edge.facets !== undefined && edge.facets.length > 0);
    if (!hasBlockOnlyProperty) {
      const label = edge.label !== undefined ? ` ${quoteString(edge.label)}` : "";
      // A label-only block folds onto one line, so the comments written
      // inside it go above the edge.
      const inner = this.extractLeading(edge.loc.start.line + 1, edge.loc.end.line);
      return [...this.renderLeading(inner, ""), `${head}${label}${tags}${id}${trail}`];
    }

    const props: string[] = [];
    if (edge.label !== undefined) props.push(`  label ${quoteString(edge.label)}`);
    if (edge.description !== undefined) props.push(this.renderDescription(edge.description, "  "));
    // Same slot and same canonicalization the node property gets in
    // `renderProperties`: one comma list, before `link`.
    if (edge.facets !== undefined && edge.facets.length > 0) {
      props.push(`  facets ${edge.facets.map(quoteId).join(", ")}`);
    }
    for (const link of edge.links ?? []) props.push(this.renderLink(link, "  "));
    return [
      `${head}${tags}${id} {${trail}`,
      ...this.withPropertyComments(edge.loc, props, "  "),
      ...this.closeBlock(edge.loc, ""),
    ];
  }

  // ── DeployBlock ───────────────────────────────────────────────────────────

  private renderDeployBlock(block: DeployBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const lines: string[] = [`deploy ${quoteId(block.id)} {${trail}`];

    const props = block.label !== undefined ? [`  label ${quoteString(block.label)}`] : [];
    lines.push(
      ...this.withPropertyComments(
        block.loc,
        props,
        "  ",
        new Set(block.nodes.map((n) => n.loc.start.line)),
      ),
    );

    let prevEndLine = block.loc.start.line;
    for (let i = 0; i < block.nodes.length; i++) {
      const node = block.nodes[i];
      const leadingToks = this.extractLeading(prevEndLine + 1, node.loc.start.line - 1);
      if (i > 0 || block.label !== undefined) lines.push("");
      lines.push(...this.renderLeading(leadingToks, "  "));
      lines.push(...this.renderDeployNode(node));
      prevEndLine = node.loc.end.line;
    }

    lines.push(...this.closeBlock(block.loc, ""));
    return lines;
  }

  private renderDeployNode(node: DeployNode): string[] {
    const trail = this.extractTrailing(node.loc.start.line);
    const lines: string[] = [`  ${node.kind} ${quoteId(node.id)} {${trail}`];

    const props: string[] = [];
    if (node.label !== undefined) props.push(`    label ${quoteString(node.label)}`);
    if (node.properties.runtime !== undefined)
      props.push(`    runtime ${quoteString(node.properties.runtime)}`);
    if (node.properties.image !== undefined)
      props.push(`    image ${quoteString(node.properties.image)}`);
    if (node.properties.type !== undefined)
      props.push(`    type ${quoteString(node.properties.type)}`);
    if (node.properties.schedule !== undefined)
      props.push(`    schedule ${quoteString(node.properties.schedule)}`);
    // One target per line, even when the source wrote them comma-separated
    // (#2167): repeated lines are the canonical form the comma list sugars.
    for (const r of node.properties.realizes ?? []) {
      // Path refs print as written; each segment is re-quoted only when
      // needed (TPL-1101, #2088).
      props.push(`    realizes ${r.path.map(quoteId).join(".")}`);
    }

    lines.push(...this.withPropertyComments(node.loc, props, "    "));
    lines.push(...this.closeBlock(node.loc, "  "));
    return lines;
  }

  // ── OrganizationBlock ─────────────────────────────────────────────────────

  private renderOrganizationBlock(block: OrganizationBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const lines: string[] = [`organization ${quoteId(block.id)} {${trail}`];

    const props: string[] = [];
    if (block.label !== undefined) props.push(`  label ${quoteString(block.label)}`);
    if (block.properties.description !== undefined) {
      props.push(this.renderDescription(block.properties.description, "  "));
    }
    for (const link of block.properties.links) {
      props.push(this.renderLink(link, "  "));
    }
    lines.push(
      ...this.withPropertyComments(
        block.loc,
        props,
        "  ",
        new Set(block.teams.map((t) => t.loc.start.line)),
      ),
    );

    let prevEndLine = block.loc.start.line;
    for (let i = 0; i < block.teams.length; i++) {
      const team = block.teams[i];
      const leadingToks = this.extractLeading(prevEndLine + 1, team.loc.start.line - 1);
      if (lines.length > 1) lines.push("");
      lines.push(...this.renderLeading(leadingToks, "  "));
      lines.push(...this.renderTeam(team, 1));
      prevEndLine = team.loc.end.line;
    }

    lines.push(...this.closeBlock(block.loc, ""));
    return lines;
  }

  private renderTeam(team: TeamNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const trail = this.extractTrailing(team.loc.start.line);
    const decl = [
      "team",
      quoteId(team.id),
      ...renderAnnotations(team.annotations, team.annotationParams),
    ];
    const lines: string[] = [`${indent}${decl.join(" ")} {${trail}`];

    const props: string[] = [];
    if (team.label !== undefined) props.push(`${indent}  label ${quoteString(team.label)}`);
    if (team.properties.description !== undefined) {
      props.push(this.renderDescription(team.properties.description, `${indent}  `));
    }
    for (const link of team.properties.links) {
      props.push(this.renderLink(link, `${indent}  `));
    }
    for (const owns of team.properties.owns) {
      // Author notation is preserved segment-for-segment (TPL-1101): a path
      // ref prints as written, each segment re-quoted only if it needs it.
      props.push(`${indent}  owns ${owns.map(quoteId).join(".")}`);
    }
    lines.push(
      ...this.withPropertyComments(
        team.loc,
        props,
        `${indent}  `,
        new Set(team.children.map((c) => c.loc.start.line)),
      ),
    );

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

    lines.push(...this.closeBlock(team.loc, indent));
    return lines;
  }

  private renderMember(member: MemberNode, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const trail = this.extractTrailing(member.loc.start.line);
    const lines: string[] = [`${indent}member ${quoteId(member.id)} {${trail}`];

    const props: string[] = [];
    if (member.label !== undefined) props.push(`${indent}  label ${quoteString(member.label)}`);
    if (member.properties.description !== undefined) {
      props.push(this.renderDescription(member.properties.description, `${indent}  `));
    }
    if (member.properties.slack !== undefined)
      props.push(`${indent}  slack ${quoteString(member.properties.slack)}`);
    if (member.properties.github !== undefined)
      props.push(`${indent}  github ${quoteString(member.properties.github)}`);

    lines.push(...this.withPropertyComments(member.loc, props, `${indent}  `));
    lines.push(...this.closeBlock(member.loc, indent));
    return lines;
  }

  // ── BoundaryBlock ─────────────────────────────────────────────────────────

  private renderBoundaryBlock(block: BoundaryBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    // The label is emitted as a `label` property rather than in the header
    // position (`boundary g "G" {`). Both parse to the same AST; picking one
    // canonical form keeps the output idempotent.
    const lines: string[] = [`boundary ${quoteId(block.id)} {${trail}`];

    const props: string[] = [];
    if (block.label !== undefined) props.push(`  label ${quoteString(block.label)}`);
    if (block.properties.description !== undefined) {
      props.push(this.renderDescription(block.properties.description, "  "));
    }
    for (const link of block.properties.links) {
      props.push(this.renderLink(link, "  "));
    }
    for (const ref of block.contains) {
      // Same round-trip rule as `owns` (TPL-1101): print the path as written.
      props.push(`  contains ${ref.map(quoteId).join(".")}`);
    }

    lines.push(...this.withPropertyComments(block.loc, props, "  "));
    lines.push(...this.closeBlock(block.loc, ""));
    return lines;
  }

  // ── FacetBlock ────────────────────────────────────────────────────────────

  private renderFacetBlock(block: FacetBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const lines: string[] = [`facet ${quoteId(block.id)} {${trail}`];

    const props: string[] = [];
    if (block.label !== undefined) props.push(`  label ${quoteString(block.label)}`);
    if (block.properties.description !== undefined) {
      props.push(this.renderDescription(block.properties.description, "  "));
    }
    for (const link of block.properties.links) {
      props.push(this.renderLink(link, "  "));
    }

    lines.push(...this.withPropertyComments(block.loc, props, "  "));
    lines.push(...this.closeBlock(block.loc, ""));
    return lines;
  }

  // ── LegendBlock ───────────────────────────────────────────────────────────

  private renderLegendBlock(block: LegendBlock): string[] {
    const trail = this.extractTrailing(block.loc.start.line);
    const decl = ["legend"];
    if (block.scope !== undefined) decl.push(block.scope);
    if (block.title !== undefined) decl.push(`${quoteString(block.title)}`);

    const lines: string[] = [`${decl.join(" ")} {${trail}`];
    const entries = block.entries.map((entry) => `  ${this.renderLegendEntry(entry)}`);
    lines.push(...this.withPropertyComments(block.loc, entries, "  "));
    lines.push(...this.closeBlock(block.loc, ""));
    return lines;
  }

  private renderLegendEntry(entry: LegendEntry): string {
    if (entry.kind === "swatch") {
      // `color` is stored verbatim including the leading `#` (the lexer emits
      // `#xxx` as one token), so it round-trips as-is.
      return `swatch ${entry.color} ${quoteString(entry.label)}`;
    }
    return `ref ${renderLegendRefTarget(entry.target)} ${quoteString(entry.label)}`;
  }
}

/**
 * Emit an annotation list, parameters included.
 *
 * Shared by `renderNode` and `renderTeam` because both hosts carry
 * `annotationParams` and both lost them before #2571: the node axis dropped
 * the parameters, the team axis dropped the annotation whole. That is the
 * "parsed, then silently discarded" break TPL-1101 / ADR-2076 name.
 *
 * A parameter value reaches the AST as a bare string, so the author's choice
 * of quoting is not recoverable and one canonical spelling has to be picked
 * per value kind (see `AnnotationParamKind`). Key order follows the parse
 * order `annotationParams` holds, so the order the author wrote survives.
 */
function renderAnnotations(
  annotations: string[],
  annotationParams: Record<string, Record<string, string>> | undefined,
): string[] {
  // `annotationParams` is keyed by annotation name, so a name written twice
  // shares one entry and the AST cannot say which occurrence held it. Both
  // occurrences therefore print it. That widens `@deprecated
  // @deprecated(until: "x")` to two parameterized copies, which is the only
  // reading that keeps the AST intact: emitting the second one bare would
  // delete the parameter, the very break this function exists to fix.
  return annotations.map((name) => {
    const entries = Object.entries(annotationParams?.[name] ?? {});
    if (entries.length === 0) return `@${name}`;
    const params = entries.map(
      ([key, value]) => `${key}: ${renderAnnotationParam(name, key, value)}`,
    );
    return `@${name}(${params.join(", ")})`;
  });
}

/** Quote one annotation parameter value by the kind the parser recorded for it. */
function renderAnnotationParam(annotation: string, key: string, value: string): string {
  // Only recognized keys reach the AST (the parser warns on and drops the
  // rest), so the lookup hits. The `string` fallback keeps a value that
  // somehow arrived unrecognized parseable rather than emitting it bare.
  return annotationParamKind(annotation, key) === "ref" ? quoteId(value) : quoteString(value);
}

function renderLegendRefTarget(target: LegendRefTarget): string {
  switch (target.kind) {
    case "annotation":
      return `@${target.name}`;
    case "tag":
      return `[${target.name}]`;
    case "selector":
      // Selectors keep their sigil (`.foo`, `#Node`) or are a bare type name.
      return target.selector;
  }
}
