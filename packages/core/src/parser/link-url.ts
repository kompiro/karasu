/**
 * Trust-boundary scheme allowlist for `link` URLs (#1525 / TPL-20260510-17).
 *
 * Link URLs come from untrusted .krs content and are rendered as `<a href>`
 * in the app and the VS Code webview, where a `javascript:` URL executes in
 * the app origin (React does not block javascript: hrefs). The parser drops
 * disallowed links with a `link-url-scheme-not-allowed` warning; renderers
 * use `isSafeLinkUrl` as defense in depth.
 *
 * The WHATWG URL parser matches browser href semantics (case folding,
 * tab/newline stripping), so scheme tricks like `JaVaScRiPt:` normalize
 * before the check; anything unparseable (incl. relative paths) is rejected.
 */

/** Schemes a `link` URL may use; everything else is rejected. */
export const ALLOWED_LINK_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);

/**
 * Returns the WHATWG-normalized scheme (e.g. "https:") of an absolute URL,
 * or null when the string is not parseable as one.
 */
export function parseUrlScheme(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

/** True when the URL parses and its scheme is in the allowlist. */
export function isSafeLinkUrl(url: string): boolean {
  const scheme = parseUrlScheme(url);
  return scheme !== null && ALLOWED_LINK_SCHEMES.has(scheme);
}
