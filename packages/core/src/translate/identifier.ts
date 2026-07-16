/**
 * Shared identifier-derivation helpers for the translators. The db and
 * openapi translators previously carried byte-identical private copies of
 * `toPascalCase`; they now share this one.
 *
 * NOTE: `translate/wrangler.ts` keeps its own `toIdentifier` on purpose — it
 * has different semantics (returns `undefined` for unusable input, prefixes a
 * leading digit with `_`, and drops trailing punctuation instead of keeping
 * it), so folding it in here would change wrangler's output.
 */

/** Convert a string to a PascalCase identifier. */
export function toPascalCase(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^(.)/, (ch: string) => ch.toUpperCase());
}
