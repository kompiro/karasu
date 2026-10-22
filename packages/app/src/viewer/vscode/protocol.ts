/**
 * The messages between the VS Code preview webview and the extension host
 * (#3312, slice B of #2996).
 *
 * This file is the one contract both sides read: the webview entry
 * (`main.tsx`) builds and handles these, and the extension imports the types
 * through `@karasu-tools/app/vscode-webview-protocol` and validates every
 * message it receives against them (the webview is a trust boundary,
 * TPL-168). It imports nothing but types from core and i18n, which the
 * extension already depends on, so compiling it there pulls in no React.
 */
import type { DirEntry } from "@karasu-tools/core";
import type { Locale } from "@karasu-tools/i18n";

/** The id of the `<script type="application/json">` the host writes the start values into. */
export const WEBVIEW_INIT_ELEMENT_ID = "karasu-webview-init";

/** What the webview starts with, written into the page by the host. */
export interface WebviewInit {
  /** The `.krs` to open first, as a file system path. */
  entryPath: string;
  theme: "light" | "dark";
  locale: Locale;
}

/** The file reads the viewer asks the host for. */
export type HostFsOp = "readFile" | "readDir" | "exists";

/** Which SVG attribute a highlight names (#2818). */
export type WebviewHighlightAttribute = "data-node-id" | "data-realized-node-id";

/** Webview → host. */
export type WebviewMessage =
  /** The webview's listener is up; the host may send from now on. */
  | { type: "ready" }
  /** A file read. Answered by exactly one `fsResult` with the same `id`. */
  | { type: "fs"; id: number; op: HostFsOp; path: string }
  /** Jump the editor to `nodeId` in `filePath` (ADR-177). */
  | { type: "revealNode"; nodeId: string; filePath: string }
  /** Open a link the user clicked, outside VS Code. */
  | { type: "openExternal"; url: string };

/** The value an `fsResult` carries, by operation. */
export interface HostFsValue {
  readFile: string;
  readDir: DirEntry[];
  exists: boolean;
}

/** Host → webview. */
export type HostMessage =
  | { type: "fsResult"; id: number; ok: true; value: HostFsValue[HostFsOp] }
  /** `notFound` tells a missing file from one the host refused or failed to read. */
  | { type: "fsResult"; id: number; ok: false; notFound: boolean; error: string }
  /** The active `.krs` editor changed: open this one instead. */
  | { type: "setEntry"; path: string }
  /** These files changed (an edit, a save, or a change on disk). */
  | { type: "filesChanged"; paths: string[] }
  | { type: "setTheme"; theme: "light" | "dark" }
  /** The editor cursor is on this node (`null` when it is on none). */
  | { type: "highlight"; nodeId: string | null; attribute?: WebviewHighlightAttribute };
