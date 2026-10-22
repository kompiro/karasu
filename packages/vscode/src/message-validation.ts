/**
 * Validators for messages received from the webview over `onDidReceiveMessage`.
 *
 * The webview is a trust boundary: although it is sandboxed, the messages it
 * posts cross into the extension-host process. A buggy or compromised webview
 * (or a future webview change) can send unknown message types, non-numeric
 * request ids, or hostile URLs. `parseWebviewMessage` lets the message handler
 * treat every incoming payload as tainted and reject anything that does not
 * match the protocol's shape. The paths a message carries are only checked to
 * be strings here; `host-files.ts` decides whether they may be read.
 *
 * Kept free of any `vscode` import so it can be unit-tested without mocking
 * the extension host.
 */

import { isSafeLinkUrl } from "@karasu-tools/core";
import type { HostFsOp, WebviewMessage } from "@karasu-tools/app/vscode-webview-protocol";

const FS_OPS: readonly HostFsOp[] = ["readFile", "readDir", "exists"];

/**
 * True when `url` is a well-formed string with a scheme allowed for
 * `vscode.env.openExternal`. Delegates to core's canonical link-scheme
 * allowlist (`isSafeLinkUrl`, see `packages/core/src/parser/link-url.ts`) —
 * the same list the viewer uses to decide which links to render — so a link
 * can never render in the panel yet be rejected on click, or vice versa.
 * Rejecting `file:`, `javascript:`, and custom-protocol URLs prevents a
 * hostile webview message from opening them through the extension host.
 */
export function isAllowedExternalUrl(url: unknown): url is string {
  return typeof url === "string" && isSafeLinkUrl(url);
}

/**
 * True when `value` is a usable node id: a non-empty string. A non-string
 * value (e.g. a number posted by a buggy webview) must be rejected at the
 * trust boundary rather than asserted away by a type annotation.
 */
export function isNodeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** A request id the host can echo back: a positive safe integer. */
function isRequestId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * The message the webview posted, rebuilt from the fields the protocol names,
 * or `null` when it does not match any message (#3312). Rebuilding rather than
 * casting drops any extra field a hostile webview attached.
 */
export function parseWebviewMessage(data: unknown): WebviewMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "ready":
      return { type: "ready" };
    case "fs":
      if (!isRequestId(m.id) || !FS_OPS.includes(m.op as HostFsOp) || !isNonEmptyString(m.path)) {
        return null;
      }
      return { type: "fs", id: m.id, op: m.op as HostFsOp, path: m.path };
    case "revealNode":
      if (!isNodeId(m.nodeId) || !isNonEmptyString(m.filePath)) return null;
      return { type: "revealNode", nodeId: m.nodeId, filePath: m.filePath };
    case "openExternal":
      if (!isAllowedExternalUrl(m.url)) return null;
      return { type: "openExternal", url: m.url };
    default:
      return null;
  }
}
