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

import { isSafeLinkUrl } from "@karasu-tools/core";

/** The view types the preview panel understands. preview-panel.ts imports `ViewType` from here. */
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
 * True when `url` is a well-formed string with a scheme allowed for
 * `vscode.env.openExternal`. Delegates to core's canonical link-scheme
 * allowlist (`isSafeLinkUrl`, see `packages/core/src/parser/link-url.ts`) —
 * the same list the host uses to filter links before they reach the webview
 * — so a link can never render in the panel yet be rejected on click, or
 * vice versa. Rejecting `file:`, `javascript:`, and custom-protocol URLs
 * prevents a hostile webview message from opening them through the
 * extension host.
 */
export function isAllowedExternalUrl(url: unknown): url is string {
  return typeof url === "string" && isSafeLinkUrl(url);
}

/**
 * True when `value` is a usable node id: a non-empty string. Node ids index
 * into the node-metadata map and flow into `escapeHtml` when rendering, so a
 * non-string value (e.g. a number posted by a buggy webview) must be rejected
 * at the trust boundary rather than asserted away by a type annotation.
 */
export function isNodeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
