import { TokenType, type Token } from "../types/tokens.js";
import type {
  OrganizationBlock,
  BoundaryBlock,
  FacetBlock,
  TeamNode,
  MemberNode,
  OrgNode,
  CommonProperties,
  NodeIdPath,
} from "../types/ast.js";
import { readNodeIdPathTail } from "./node-path.js";
import { parseAnnotations } from "./annotation-parser.js";
import { handleNestedLegend } from "./legend-parser.js";
import {
  parseDescriptionValue,
  parseLink,
  parseIdOrString,
  commaSeparatedValues,
} from "./property-readers.js";
import type { ParseContext } from "./parse-context.js";

// ─── Organization ──────────────────────────────────────────────────────────
// The organization view's blocks (organization, team, member), plus the two
// groupings that cut across views: `boundary` (top level, or scoped inside a
// block) and `facet` (top level only). Free functions over the parse context
// (#3441).

export function parseOrganizationBlock(ctx: ParseContext): OrganizationBlock {
  const start = ctx.advance(); // organization
  const idToken = parseIdOrString(ctx, "organization");
  let label = parseRetiredPositionalLabel(ctx, "organization");
  ctx.expect(TokenType.LeftBrace);

  const properties: CommonProperties = { links: [] };
  const teams: TeamNode[] = [];

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
    } else if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
    } else if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
    } else if (token.type === TokenType.Team) {
      teams.push(parseTeamBlock(ctx));
    } else if (token.type === TokenType.Legend) {
      handleNestedLegend(ctx, "organization");
    } else {
      ctx.error("unexpected-token-in-block", {
        blockKind: "organization",
        tokenType: String(token.type),
        value: token.value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  // Validate duplicate team IDs within this organization
  const seen = new Set<string>();
  collectTeamIds(ctx, teams, seen);

  return {
    id: idToken.value,
    label,
    properties,
    teams,
    loc: ctx.range(start.loc, end.loc),
  };
}

/**
 * The positional `<kw> <id> "<label>"` form on organization / team / member.
 * ADR-19 made `label` a property; these constructs kept the positional read as
 * undocumented leniency, deprecated in #2133 and removed in #2208.
 *
 * Unlike boundary / facet below, the value is **kept**. That is a fidelity
 * choice, not a rescue: recovery reads the string the author wrote rather
 * than discarding it, so `Parser.parse` callers that inspect the AST past the
 * diagnostic still see the name. It does not keep any drawing alive — every
 * render path refuses to draw while an error stands (the app republishes the
 * last valid SVG, `karasu render` and `karasu subtree` exit 1), and
 * `format()` refuses the source too, so `karasu fmt` can no longer rewrite
 * the form once it errors.
 */
function parseRetiredPositionalLabel(ctx: ParseContext, construct: string): string | undefined {
  if (ctx.peek().type !== TokenType.StringLiteral) return undefined;
  ctx.error("positional-label-removed", { construct });
  return ctx.advance().value;
}

// Grammar: `boundary <id> { (label | description | link | contains)* }`
// Mirrors parseOrganizationBlock; `contains <id>` reuses the one-target-per-line
// shape of `owns` (parseTeamBlock). See ADR-1974.
export function parseBoundaryBlock(ctx: ParseContext): BoundaryBlock {
  const start = ctx.advance(); // boundary
  const idToken = parseIdOrString(ctx, "boundary");
  let label: string | undefined;
  // The positional label form is removed on boundary (ADR-19 / #2133;
  // experimental construct, so no deprecation window). Consume the stray
  // string so parsing resumes cleanly at `{`.
  if (ctx.peek().type === TokenType.StringLiteral) {
    ctx.error("positional-label-removed", { construct: "boundary" });
    ctx.advance();
  }
  ctx.expect(TokenType.LeftBrace);

  const properties: CommonProperties = { links: [] };
  const contains: NodeIdPath[] = [];

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
    } else if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
    } else if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
    } else if (token.type === TokenType.Contains) {
      ctx.advance();
      if (ctx.peek().type === TokenType.Identifier || ctx.peek().type === TokenType.StringLiteral) {
        const tail = readNodeIdPathTail(ctx.advance(), ctx, {
          acceptStringSegments: true,
        });
        if (tail.dangling) {
          // Dangling dot: report once and record nothing (#2088), matching
          // the `owns` reader in parseTeamBlock.
          ctx.error("expected-id-after", { property: "contains" });
        } else {
          contains.push(tail.segments);
        }
      } else {
        ctx.error("expected-id-after", { property: "contains" });
      }
    } else {
      ctx.error("unexpected-token-in-block", {
        blockKind: "boundary",
        tokenType: String(token.type),
        value: token.value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    kind: "boundary" as const,
    id: idToken.value,
    label,
    properties,
    contains,
    loc: ctx.range(start.loc, end.loc),
  };
}

// Grammar: `facet <id> { (label | description | link)* }` (#2065 Part B).
//
// Deliberately **not** `parseBoundaryBlock` with one more property: a facet
// declaration has no membership list and no value language at all. `contains`
// is rejected here like any other unexpected token, and that rejection is the
// structural half of ADR-832's fence — the metadata home stays prose + link,
// so there is no gradient from "declare a scope" to "declare a rule".
export function parseFacetBlock(ctx: ParseContext): FacetBlock {
  const start = ctx.advance(); // facet
  const idToken = parseIdOrString(ctx, "facet");
  let label: string | undefined;
  // Positional label is not part of the grammar (ADR-19 / #2133). `facet` is
  // new, so there is nothing to deprecate — reject and consume, as `boundary`
  // does, so parsing resumes cleanly at `{`.
  if (ctx.peek().type === TokenType.StringLiteral) {
    ctx.error("positional-label-removed", { construct: "facet" });
    ctx.advance();
  }
  ctx.expect(TokenType.LeftBrace);

  const properties: CommonProperties = { links: [] };

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
    } else if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
    } else if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
    } else {
      ctx.error("unexpected-token-in-block", {
        blockKind: "facet",
        tokenType: String(token.type),
        value: token.value,
      });
      // Skip the whole offending clause, not just its first token. The
      // closed grammar makes this safe and worthwhile: the rejected forms are
      // the value-carrying ones (`contains Order`, `requires plan in [...]`),
      // and reporting each of their tokens separately would turn one authoring
      // mistake into a pile of diagnostics. Always advances at least once, so
      // the loop cannot stall.
      do {
        ctx.advance();
      } while (!isFacetPropertyStart(ctx.peek().type));
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    kind: "facet" as const,
    id: idToken.value,
    label,
    properties,
    loc: ctx.range(start.loc, end.loc),
  };
}

/** Tokens that begin a legal `facet` body entry, or end the block. */
function isFacetPropertyStart(type: TokenType): boolean {
  return (
    type === TokenType.Label ||
    type === TokenType.Description ||
    type === TokenType.Link ||
    type === TokenType.RightBrace ||
    type === TokenType.EOF
  );
}

/**
 * Parse the value of a `facets` property: `<id>[, <id>]*`.
 *
 * Reads on the list grammar every reference list shares (#2551). Ids are
 * appended to `existing` rather than returned fresh so repeated `facets`
 * lines accumulate, and a duplicate id (within one line or across lines)
 * collapses — membership is a set, and saying it twice is not a mistake
 * worth a diagnostic.
 */
export function parseFacetsList(ctx: ParseContext, keyword: Token, existing: string[]): void {
  for (const facet of commaSeparatedValues(ctx, keyword, "facets")) {
    if (!existing.includes(facet.value)) existing.push(facet.value);
  }
}

/**
 * A `facet` block written inside a node block. Declarations are top-level only
 * — a facet is a model-wide name, not a per-node one — so consume the whole
 * block and report it once, instead of letting its body cascade into a dozen
 * unexpected-token errors.
 */
export function rejectNestedFacetBlock(ctx: ParseContext, blockKind: string): void {
  const token = ctx.peek();
  // Diagnostics raised while consuming the misplaced block are dropped: the
  // author's mistake is the placement, and complaints about the body of a
  // block that has no business being here are noise pointing at the wrong
  // fix. Truncating rather than not-parsing keeps the recovery — the block is
  // still consumed whole, so the enclosing block resumes cleanly.
  const block = ctx.discardDiagnostics(() => parseFacetBlock(ctx));
  ctx.pushDiagnostic({
    severity: "error",
    code: "unexpected-token-in-block",
    params: { blockKind, tokenType: String(token.type), value: token.value },
    loc: block.loc,
  });
}

function parseTeamBlock(ctx: ParseContext): TeamNode {
  const start = ctx.advance(); // team
  const idToken = parseIdOrString(ctx, "team");
  let label = parseRetiredPositionalLabel(ctx, "team");
  const { names: annotations, params: annotationParams } = parseAnnotations(ctx);
  ctx.expect(TokenType.LeftBrace);

  const properties: CommonProperties & { owns: NodeIdPath[] } = { links: [], owns: [] };
  const children: OrgNode[] = [];

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
    } else if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
    } else if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
    } else if (token.type === TokenType.Owns) {
      ctx.advance();
      if (ctx.peek().type === TokenType.Identifier || ctx.peek().type === TokenType.StringLiteral) {
        const tail = readNodeIdPathTail(ctx.advance(), ctx, {
          acceptStringSegments: true,
        });
        if (tail.dangling) {
          // Dangling dot: report once and record nothing — recording the
          // read segments would put a wrong model next to the error (#2088).
          ctx.error("expected-id-after", { property: "owns" });
        } else {
          properties.owns.push(tail.segments);
        }
      } else {
        ctx.error("expected-id-after", { property: "owns" });
      }
    } else if (token.type === TokenType.Member) {
      children.push(parseMemberBlock(ctx));
    } else if (token.type === TokenType.Team) {
      children.push(parseTeamBlock(ctx));
    } else if (token.type === TokenType.Legend) {
      handleNestedLegend(ctx, "team");
    } else {
      ctx.error("unexpected-token-in-block", {
        blockKind: "team",
        tokenType: String(token.type),
        value: token.value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    kind: "team" as const,
    id: idToken.value,
    label,
    annotations,
    ...(Object.keys(annotationParams).length > 0 ? { annotationParams } : {}),
    properties,
    children,
    loc: ctx.range(start.loc, end.loc),
  };
}

function parseMemberBlock(ctx: ParseContext): MemberNode {
  const start = ctx.advance(); // member
  const idToken = parseIdOrString(ctx, "member");
  let label = parseRetiredPositionalLabel(ctx, "member");
  ctx.expect(TokenType.LeftBrace);

  const properties: CommonProperties & { slack?: string; github?: string } = { links: [] };

  while (ctx.peek().type !== TokenType.RightBrace && ctx.peek().type !== TokenType.EOF) {
    const token = ctx.peek();
    if (token.type === TokenType.Label) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        label = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "label" });
      }
    } else if (token.type === TokenType.Description) {
      ctx.advance();
      properties.description = parseDescriptionValue(ctx);
    } else if (token.type === TokenType.Link) {
      ctx.advance();
      properties.links.push(parseLink(ctx));
    } else if (token.type === TokenType.Slack) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        properties.slack = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "slack" });
      }
    } else if (token.type === TokenType.Github) {
      ctx.advance();
      if (ctx.peek().type === TokenType.StringLiteral) {
        properties.github = ctx.advance().value;
      } else {
        ctx.error("expected-string-after", { property: "github" });
      }
    } else if (token.type === TokenType.Legend) {
      handleNestedLegend(ctx, "member");
    } else {
      ctx.error("unexpected-token-in-block", {
        blockKind: "member",
        tokenType: String(token.type),
        value: token.value,
      });
      ctx.advance();
    }
  }

  const end = ctx.expect(TokenType.RightBrace);

  return {
    kind: "member" as const,
    id: idToken.value,
    label,
    properties,
    children: [] as const,
    loc: ctx.range(start.loc, end.loc),
  };
}

function collectTeamIds(ctx: ParseContext, teams: TeamNode[], seen: Set<string>): void {
  for (const team of teams) {
    if (seen.has(team.id)) {
      ctx.pushDiagnostic({
        severity: "error",
        code: "duplicate-team-id",
        params: { teamId: team.id },
        loc: team.loc,
      });
    } else {
      seen.add(team.id);
    }
    collectTeamIds(
      ctx,
      team.children.filter((c): c is TeamNode => c.kind === "team"),
      seen,
    );
  }
}
