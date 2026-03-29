/**
 * Sanitize a string for use as a filename segment.
 * - Spaces → underscore
 * - Filesystem-unsafe characters (/ \ : * ? " < > | NUL) → underscore
 * - Unicode letters (including Japanese) are preserved
 * Falls back to `fallback` if the result is empty after sanitization.
 */
export function sanitizeFilename(name: string, fallback: string): string {
  const sanitized = name
    .replace(/ /g, "_")
    // eslint-disable-next-line no-control-regex -- intentionally strip NUL bytes from filenames
    .replace(/[/\\:*?"<>|\u0000]/g, "_");
  return sanitized || fallback;
}
