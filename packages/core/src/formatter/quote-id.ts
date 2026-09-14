/**
 * Determines whether an identifier string can be emitted bare (without
 * surrounding quotes) by the formatter, and re-quotes it when needed so
 * that round-trip parsing is preserved.
 *
 * The lexer accepts a bare identifier as `[\p{L}_][\p{L}\p{N}_]*`. Any
 * string outside that shape — IDs containing spaces, hyphens, dots,
 * digits at the start, embedded quotes, etc. — must be emitted as a
 * quoted string literal. Strings that would tokenize as a reserved
 * keyword (e.g. `"system"`) also must keep their quotes; otherwise the
 * formatter would corrupt the source.
 */

const BARE_ID_PATTERN = /^[\p{L}_][\p{L}\p{N}_]*$/u;

const RESERVED_KEYWORDS = new Set([
  "system",
  "service",
  "domain",
  "usecase",
  "entity",
  "resource",
  "capability",
  "user",
  "client",
  "deploy",
  "war",
  "jar",
  "oci",
  "lambda",
  "function",
  "assets",
  "job",
  "artifact",
  "store",
  "runtime",
  "realizes",
  "handles",
  "delivers",
  "schedule",
  "image",
  "type",
  "label",
  "role",
  "description",
  "team",
  "link",
  "organization",
  "member",
  "owns",
  "slack",
  "github",
  "import",
  "from",
  "database",
  "queue",
  "storage",
  "table",
  "bucket",
  "legend",
  "swatch",
  "ref",
]);

export function needsQuotes(id: string): boolean {
  if (id.length === 0) return true;
  if (!BARE_ID_PATTERN.test(id)) return true;
  if (RESERVED_KEYWORDS.has(id)) return true;
  return false;
}

/**
 * Wrap a string in the `.krs` string-literal form, escaping backslashes first
 * and then embedded double quotes.
 *
 * Split out from {@link quoteId} because a caller can have its own reason to
 * quote: `nodePathRefId` (#2714) quotes a path segment that carries the `.`
 * separator, which is a narrower trigger than "cannot be emitted bare". The
 * escaping itself must stay one rule, so both go through here.
 */
export function quotedIdLiteral(id: string): string {
  const escaped = id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function quoteId(id: string): string {
  if (!needsQuotes(id)) return id;
  return quotedIdLiteral(id);
}
