import { TokenType } from "../types/tokens.js";
import type { LegendBlock, LegendEntry, LegendRefTarget, LegendViewScope } from "../types/ast.js";
import { stitchKebabTail } from "./kebab-name.js";
import { rejectEdge } from "./rejected-construct.js";
import type { ParseContext } from "./parse-context.js";

// ─── Legend block ────────────────────────────────────────────────────────
// Grammar: `legend <view-scope>? <title?> { (swatch | ref)* }`
//   view-scope ::= "system" | "deploy" | "org"
//   swatch     ::= "swatch" "#" hex-id <string>
//   ref        ::= "ref" ("@" id | "[" id "]" | "." id | "#" id | id) <string>
//
// Reference: docs/adr/833-diagram-legend-syntax.md.

/**
 * `legend` is only valid at the top level of a file (docs/spec/syntax.md
 * § Legend). When it appears inside a block, emit a single dedicated
 * diagnostic and skip the whole legend block so its contents do not
 * cascade into per-token `unexpected-token-in-block` errors.
 */
export function handleNestedLegend(ctx: ParseContext, parentKind: string): void {
  ctx.error("legend-not-top-level", { parentKind });
  ctx.advance(); // legend

  // Skip the optional view scope / title up to the legend's opening brace.
  // Stop early at `}` / EOF so a malformed legend (no body) does not eat
  // the enclosing block's closing brace.
  while (
    ctx.peek().type !== TokenType.LeftBrace &&
    ctx.peek().type !== TokenType.RightBrace &&
    ctx.peek().type !== TokenType.EOF
  ) {
    ctx.advance();
  }
  if (ctx.peek().type !== TokenType.LeftBrace) return;

  let depth = 0;
  while (ctx.peek().type !== TokenType.EOF) {
    const t = ctx.advance();
    if (t.type === TokenType.LeftBrace) depth++;
    else if (t.type === TokenType.RightBrace && --depth === 0) break;
  }
}

export function parseLegendBlock(ctx: ParseContext): LegendBlock {
  const start = ctx.advance(); // legend

  const scope = parseLegendScope(ctx);

  let title: string | undefined;
  if (ctx.peek().type === TokenType.StringLiteral) {
    title = ctx.advance().value;
  }

  ctx.expect(TokenType.LeftBrace);

  const entries: LegendEntry[] = [];
  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Swatch) {
      const entry = parseLegendSwatch(ctx);
      if (entry) entries.push(entry);
    } else if (token.type === TokenType.Ref) {
      const entry = parseLegendRef(ctx);
      if (entry) entries.push(entry);
    } else if (!rejectEdge(ctx, "legend")) {
      ctx.error("unexpected-token-in-block", {
        blockKind: "legend",
        tokenType: String(token.type),
        value: token.value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    scope,
    title,
    entries,
    loc: ctx.range(start.loc, end.loc),
  };
}

function parseLegendScope(ctx: ParseContext): LegendViewScope | undefined {
  const next = ctx.peek();
  if (next.type === TokenType.System) {
    ctx.advance();
    return "system";
  }
  if (next.type === TokenType.Service) {
    ctx.advance();
    return "service";
  }
  if (next.type === TokenType.Domain) {
    ctx.advance();
    return "domain";
  }
  if (next.type === TokenType.Deploy) {
    ctx.advance();
    return "deploy";
  }
  // "org" is intentionally not a reserved keyword (the block keyword is
  // "organization"). Match it contextually as an identifier here.
  if (next.type === TokenType.Identifier && next.value === "org") {
    ctx.advance();
    return "org";
  }
  return undefined;
}

function parseLegendSwatch(ctx: ParseContext): LegendEntry | null {
  const start = ctx.advance(); // swatch
  // The lexer emits `#xxx` as a single Identifier token (see lexer's
  // readHashToken). The parser stores the value verbatim and lets the
  // resolver / renderer validate the hex shape.
  const colorTok = ctx.expect(TokenType.Identifier);
  const labelTok = ctx.expect(TokenType.StringLiteral);
  return {
    kind: "swatch",
    color: colorTok.value,
    label: labelTok.value,
    loc: ctx.range(start.loc, labelTok.loc),
  };
}

function parseLegendRef(ctx: ParseContext): LegendEntry | null {
  const start = ctx.advance(); // ref
  const target = parseLegendRefTarget(ctx);
  if (!target) {
    // Skip until label or end of entry to recover.
    if (ctx.peek().type === TokenType.StringLiteral) ctx.advance();
    return null;
  }
  const labelTok = ctx.expect(TokenType.StringLiteral);
  return {
    kind: "ref",
    target,
    label: labelTok.value,
    loc: ctx.range(start.loc, labelTok.loc),
  };
}

function parseLegendRefTarget(ctx: ParseContext): LegendRefTarget | null {
  const tok = ctx.peek();
  switch (tok.type) {
    case TokenType.At: {
      ctx.advance();
      const first = ctx.expect(TokenType.Identifier);
      // Legend refs name the same vocabulary the model writes — stitch
      // kebab-case runs so `[my-team]` / `@my-mark` stay referenceable
      // (#2509).
      const { name } = stitchKebabTail(first, ctx);
      return { kind: "annotation", name };
    }
    case TokenType.LeftBracket: {
      ctx.advance();
      const first = ctx.expect(TokenType.Identifier);
      const { name } = stitchKebabTail(first, ctx);
      ctx.expect(TokenType.RightBracket);
      return { kind: "tag", name };
    }
    case TokenType.Dot: {
      ctx.advance();
      const name = ctx.expect(TokenType.Identifier);
      return { kind: "selector", selector: `.${name.value}` };
    }
    case TokenType.Identifier: {
      // `#xxx` is lexed as a single Identifier with the leading `#`
      // (see lexer's readHashToken). All other identifiers are bare type
      // selectors (e.g. unknown custom kinds).
      const name = ctx.advance();
      return { kind: "selector", selector: name.value };
    }
    default:
      // Accept node-kind keywords as type selectors (e.g. `service`,
      // `domain`, `client`). The lexer reserves these as keywords for
      // block parsing; here they are valid `.krs.style` selector names.
      if (isTypeSelectorKeyword(tok.type)) {
        const name = ctx.advance();
        return { kind: "selector", selector: name.value };
      }
      ctx.error("expected-identifier", {
        got: String(tok.type),
        value: tok.value,
      });
      ctx.advance();
      return null;
  }
}

const TYPE_SELECTOR_KEYWORDS = new Set<TokenType>([
  TokenType.System,
  TokenType.Service,
  TokenType.Domain,
  TokenType.Usecase,
  TokenType.Resource,
  TokenType.User,
  TokenType.Client,
  TokenType.Database,
  TokenType.Queue,
  TokenType.Storage,
  TokenType.Table,
  TokenType.Bucket,
  TokenType.Team,
  TokenType.Member,
  TokenType.Organization,
]);

function isTypeSelectorKeyword(type: TokenType): boolean {
  return TYPE_SELECTOR_KEYWORDS.has(type);
}
