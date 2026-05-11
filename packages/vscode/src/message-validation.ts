/**
 * Validators for messages received from the webview over `onDidReceiveMessage`.
 *
 * The webview is a trust boundary: although it is sandboxed, the messages it
 * posts cross into the extension-host process. A buggy or compromised webview
 * (or a future webview change) can send out-of-range indices, unknown view
 * types, or hostile URLs. These predicates let the message handler treat
 * incoming payloads as tainted and reject anything that doesn't match the
 * expected shape.
 *
 * Kept free of any `vscode` import so it can be unit-tested without mocking
 * the extension host.
 */

/** The view types the preview panel understands. Mirrors `ViewType` in preview-panel.ts. */
export const VIEW_TYPES = ["system", "deploy", "org"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

/** True when `value` is one of the known view types. */
export function isViewType(value: unknown): value is ViewType {
  return typeof value === "string" && (VIEW_TYPES as readonly string[]).includes(value);
}

/**
 * True when `index` is a valid breadcrumb-navigation target: a non-negative
 * integer no greater than the current view-path length. `slice(0, index)` on
 * the path/labels arrays then keeps `[0, index)` segments — a negative or
 * fractional index would silently drop the wrong elements.
 */
export function isValidNavIndex(index: unknown, pathLength: number): index is number {
  return typeof index === "number" && Number.isInteger(index) && index >= 0 && index <= pathLength;
}

/**
 * Schemes allowed for `vscode.env.openExternal`. Restricting to web / mail
 * schemes prevents a hostile webview message from opening `file:`,
 * `javascript:`, or arbitrary custom-protocol URLs through the extension host.
 */
const ALLOWED_EXTERNAL_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** True when `url` is a well-formed string with an allowed external scheme. */
export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return ALLOWED_EXTERNAL_URL_SCHEMES.has(parsed.protocol);
}
