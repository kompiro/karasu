/**
 * Where the preview's bundle lives inside the extension (#3312), and what it
 * is called. `scripts/stage-webview.ts` puts the app's VS Code build there,
 * and `preview-panel.ts` names the same files in the page it writes, so both
 * read these constants instead of spelling the names twice (TPL-1024).
 */

/** The staged directory, relative to the extension root. Shipped in the .vsix under `out/`. */
export const WEBVIEW_DIR = ["out", "webview"] as const;

/** The entry script and the stylesheet `vite.vscode-webview.config.ts` emits. */
export const WEBVIEW_SCRIPT = "viewer.js";
export const WEBVIEW_STYLESHEET = "viewer.css";
