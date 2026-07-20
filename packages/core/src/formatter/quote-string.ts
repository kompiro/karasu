/**
 * Escapes and quotes a string **value** (label, description, url, ...) for
 * emission as a `.krs` string literal.
 *
 * The value-side analogue of {@link quoteId}. Unlike an id, a value is always
 * quoted — there is no bare form — so the only job here is escaping.
 *
 * The lexer (`Lexer.readString`) understands exactly three escapes: `\\`,
 * `\"`, and `\n`. Every other `\X` decodes to a bare `X`, so escaping anything
 * else would *corrupt* the value on the way back in (`\r` would round-trip as
 * a literal `r`). Characters outside that set — including carriage returns —
 * are therefore emitted raw, which round-trips faithfully because
 * `readString` consumes any non-quote byte verbatim.
 *
 * A literal newline is escaped rather than left raw. Raw would survive a
 * re-parse (`readString` spans lines), but it would break the formatter's
 * line-oriented output: comment attachment is keyed by source line, and the
 * emitted block would no longer be one property per line.
 *
 * See TPL-20260510-02 (round-trip guarantee) and ADR-20260720-02.
 */
export function escapeStringValue(value: string): string {
  // Backslash first — the later rules introduce backslashes of their own.
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** {@link escapeStringValue} plus the surrounding double quotes. */
export function quoteString(value: string): string {
  return `"${escapeStringValue(value)}"`;
}

/**
 * Whether `value` can be emitted inside a `"""` block.
 *
 * Triple-quoted strings are raw (`Lexer.readTripleQuoteString` performs no
 * escape processing) and terminate at the first `"""`, so a body containing
 * that sequence has no representable form and must fall back to the
 * single-line quoted form. Adding an escape to `"""` would be a syntax change
 * — see ADR-20260320-02, which chose `"""` precisely for verbatim Markdown.
 */
export function canUseTripleQuote(value: string): boolean {
  return !value.includes('"""');
}

/**
 * Emit a `description` property, picking the representable form.
 *
 * Multi-line bodies use a `"""` block (readable Markdown, per ADR-20260320-02)
 * unless the body contains `"""`, which would terminate the block early — those
 * fall back to the single-line quoted form with `\n` escapes.
 *
 * Shared by the formatter and the `translate` emitters: both build description
 * blocks from text they do not control (a description property, an OpenAPI
 * `summary`, a SQL table name), and both need the same fallback. Duplicating
 * the rule is how one of them drifts (#2087).
 */
export function emitDescription(value: string, indent: string): string {
  if (!value.includes("\n") || !canUseTripleQuote(value)) {
    return `${indent}description ${quoteString(value)}`;
  }
  const body = value
    .split("\n")
    .map((line) => (line ? `${indent}  ${line}` : ""))
    .join("\n");
  return `${indent}description """\n${body}\n${indent}  """`;
}
