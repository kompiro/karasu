import { KRS_KEYWORD_NAMES, Lexer } from "../../lexer/lexer.js";
import { Parser } from "../../parser/parser.js";
import { TokenType } from "../../types/tokens.js";
import { quoteId } from "../quote-id.js";

/**
 * Ways to respell an id so that it must be quoted (TPL-2707). Each targets a
 * different way an emit path can get bareness wrong without `quoteId`:
 *
 * - `punctuated`: a `-` and a space, which no bare word holds.
 * - `keyword`: a word the lexer reserves. It has the shape of a bare word, so
 *   a bareness check copied by hand without the lexer's keyword set prints it
 *   bare and it reads back as the keyword. Distinct ids get distinct keywords.
 */
export const HOSTILE_RESPELLINGS = {
  punctuated: (id: string) => `${id}-x ${id}`,
  keyword: (_id: string, index: number) => {
    const keyword = KRS_KEYWORD_NAMES[index];
    if (keyword === undefined) throw new Error("fixture declares more ids than there are keywords");
    return keyword;
  },
} satisfies Record<string, (id: string, index: number) => string>;

export type HostileRespelling = keyof typeof HOSTILE_RESPELLINGS;

/**
 * Rewrite a `.krs` fixture so every id it declares is spelled in a way that
 * needs quotes.
 *
 * The ids are found generically, as every `id` field the parsed file holds,
 * and every bare token spelling one of them (its declaration and every
 * reference) is replaced by the quoted respelling. No list of which
 * properties carry an id is kept here: a new property's fixture is rewritten
 * the same way, so an emit path that decides on its own to print an id bare
 * prints a spelling the parser cannot read back.
 *
 * Test support for the formatter's coverage tests; not part of the package API.
 */
export function withHostileIds(source: string, respelling: HostileRespelling): string {
  const ids: string[] = [];
  collectIds(Parser.parse(source).value, ids);
  const respelled = new Map(ids.map((id, i) => [id, HOSTILE_RESPELLINGS[respelling](id, i)]));
  const tokens = new Lexer(source).tokenize();
  let out = source;
  for (const token of [...tokens].reverse()) {
    const to = respelled.get(token.value);
    if (token.type !== TokenType.Identifier || to === undefined || !token.end) continue;
    out = out.slice(0, token.loc.offset) + quoteId(to) + out.slice(token.end.offset);
  }
  return out;
}

function collectIds(value: unknown, ids: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids);
    return;
  }
  if (value === null || typeof value !== "object" || value.constructor !== Object) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "loc") continue;
    if (key === "id" && typeof child === "string") {
      if (!ids.includes(child)) ids.push(child);
    } else collectIds(child, ids);
  }
}
