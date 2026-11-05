import { isBareWord } from "../lexer/lexer.js";
import { StyleLexer } from "../lexer/style-lexer.js";
import { quotedIdLiteral } from "../formatter/quote-id.js";
import { TokenType } from "../types/tokens.js";

/**
 * An edge endpoint in the form `.krs.style` reads back as the same value: bare
 * when it is one style identifier, the `.krs` string literal otherwise
 * (`"a b"`, `"b->c"`). The base form of a canonical id is written into
 * `.krs.style` as `edge#<base>`, so it must re-lex there (#3480, TPL-3480).
 *
 * Bare needs three things. The style lexer reads the endpoint alone as one
 * `Identifier` with the same value, so its rules (`-`, `.`, digits, dropped
 * symbols) are not copied here. It does not end with `-`, which an arrow after
 * it would swallow (`"a-" -> c` would read as `a --> c`); the to side gets the
 * same test so this helper need not know the side. It does not start with `#`,
 * which the lexer reads as a color (`#abc`) or a `#` token, not an id.
 */
export function styleEndpointLiteral(endpoint: string): string {
  // Most ids are `.krs` bare words, which pass all three tests.
  if (isBareWord(endpoint)) return endpoint;
  if (endpoint.endsWith("-") || endpoint.startsWith("#")) return quotedIdLiteral(endpoint);
  const tokens = new StyleLexer(endpoint).tokenize();
  const [only, eof] = tokens;
  const bare =
    tokens.length === 2 &&
    only.type === TokenType.Identifier &&
    only.value === endpoint &&
    eof.type === TokenType.EOF;
  return bare ? endpoint : quotedIdLiteral(endpoint);
}

/**
 * The base form `<from><arrow><to>` of an edge's canonical id, each endpoint
 * written by {@link styleEndpointLiteral}. The canonical id and the
 * `edge#<from><arrow><to>` selector both go through here, so a rule written
 * from the id matches the edge (TPL-1352).
 */
export function edgeBaseForm(from: string, arrow: "->" | "-->", to: string): string {
  return `${styleEndpointLiteral(from)}${arrow}${styleEndpointLiteral(to)}`;
}
