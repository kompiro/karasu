// Entry of the VS Code preview build (`vite.vscode-webview.config.ts`, #3312).
// The extension writes the page: a CSP with a nonce, this script and its
// stylesheet through `asWebviewUri`, and the start values as JSON. This is the
// only module that knows `acquireVsCodeApi`; the viewer itself sees a file
// system, callbacks and a handle (`mountViewer`, #3311).
import { mountViewer } from "../mount-viewer.js";
import type { PreviewToolbarSlot } from "../../components/preview-toolbar-slot.js";
import { HostFileSystem } from "./host-fs.js";
import { isHostMessage, readWebviewInit } from "./messages.js";
import type { WebviewMessage } from "./protocol.js";
import { VscodeToolbarExtras } from "./VscodeToolbarExtras.js";
import "../../styles/index.css";

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

// Share, export and Docs need a download, the clipboard or a second window,
// none of which the webview has, and the all-layers view is left with them
// (#2996 decision 7). None is in today's preview, so nothing is lost.
const VSCODE_TOOLBAR: PreviewToolbarSlot = {
  extras: <VscodeToolbarExtras />,
  hide: ["share", "export", "allLayers", "docs"],
};

const vscode = acquireVsCodeApi();
const post = (message: WebviewMessage) => vscode.postMessage(message);
const init = readWebviewInit(document);
const fs = new HostFileSystem(post);
// The entry the viewer shows, so a refresh can name it as changed.
let entryPath = init.entryPath;

const viewer = mountViewer(document.getElementById("root")!, {
  fs,
  entryPath: init.entryPath,
  initialTheme: init.theme,
  initialLocale: init.locale,
  toolbar: VSCODE_TOOLBAR,
  // Writes go through the host as a WorkspaceEdit in slice C (#3313).
  readOnly: true,
  // VS Code reads every keydown in a webview as its own keybinding too, so
  // the app's chords (mod+1..4, mod+shift+f, mod+shift+p) would fire twice.
  keyboardShortcuts: false,
  onRevealNode: (nodeId, filePath) => post({ type: "revealNode", nodeId, filePath }),
  onOpenExternal: (url) => post({ type: "openExternal", url }),
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isHostMessage(message)) return;
  switch (message.type) {
    case "fsResult":
      fs.handleResult(message);
      break;
    case "setEntry":
      fs.reset();
      entryPath = message.path;
      viewer.setEntry(message.path);
      break;
    case "refresh":
      // Anything may have changed unseen (a file outside the watched folders):
      // forget it all and compile again, keeping the view.
      fs.reset();
      viewer.filesChanged([entryPath]);
      break;
    case "filesChanged":
      // The cache forgets first, so the recompile the viewer starts reads anew.
      fs.invalidate(message.paths);
      viewer.filesChanged(message.paths);
      break;
    case "setTheme":
      viewer.setTheme(message.theme);
      break;
    case "highlight":
      viewer.highlight(message.nodeId, message.attribute);
      break;
  }
});

window.addEventListener("pagehide", () => {
  fs.dispose();
  viewer.unmount();
});

post({ type: "ready" });
