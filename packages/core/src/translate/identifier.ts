/**
 * Shared identifier-derivation helpers for the translators. Keeping these in
 * one place ensures an id-derivation fix applies to every translator (the db
 * and openapi translators previously carried byte-identical private copies).
 */

/** Convert a string to a PascalCase identifier. */
export function toPascalCase(str: string): string {
  return str
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, ch: string) => ch.toUpperCase())
    .replace(/^(.)/, (ch: string) => ch.toUpperCase());
}
