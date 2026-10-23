import * as vscode from "vscode";
import { promises as nodeFs } from "node:fs";
import * as nodePath from "node:path";
import { resolveLocaleTag } from "@karasu-tools/i18n";
import type {
  HostMessage,
  WebviewHighlightAttribute,
  WebviewMessage,
} from "@karasu-tools/app/vscode-webview-protocol";
import {
  allowedRoots,
  checkRequestedPath,
  decideExists,
  decideFileRead,
  isRealPathWithinRoots,
  isWithinRoots,
  readThroughBuffers,
  type HostFileDeps,
} from "./host-files.js";
import { isAllowedExternalUrl, parseWebviewMessage } from "./message-validation.js";
import { coalesce } from "./message-queue.js";
import { diagramThemeFromColorTheme } from "./theme-mapping.js";
import { WEBVIEW_DIR, WEBVIEW_SCRIPT, WEBVIEW_STYLESHEET } from "./webview-assets.js";
import { buildWebviewHtml, generateNonce } from "./webview-html.js";

type FsRequest = Extract<WebviewMessage, { type: "fs" }>;

/** What the panel needs from the extension that the panel itself does not own. */
export interface PreviewPanelHost {
  extensionUri: vscode.Uri;
  /** Jump the editor to `nodeId`, defined in `filePath` (already checked to be readable). */
  onRevealNode(nodeId: string, filePath: string): void;
  onDispose(): void;
}

/**
 * The preview: the app's viewer running in a webview (#3312, slice B of #2996).
 *
 * The page is written once. The viewer compiles in the webview and asks this
 * panel for every file it reads; the panel answers from the open editor buffer
 * or from disk, inside the workspace only. Editor events reach the viewer as
 * messages (`setEntry`, `filesChanged`, `highlight`, `setTheme`), so a drill,
 * a view switch or an edit never reloads the page and the view is kept.
 */
export class PreviewPanel {
  static readonly viewType = "karasu.preview";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _host: PreviewPanelHost;
  private _entryPath: string;
  private _theme: "light" | "dark";
  /** Messages posted before the webview's listener is up, sent once it says `ready`. */
  private _queue: HostMessage[] | null = [];
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;

  private constructor(panel: vscode.WebviewPanel, host: PreviewPanelHost, entryPath: string) {
    this._panel = panel;
    this._host = host;
    this._entryPath = entryPath;
    this._theme = diagramThemeFromColorTheme(vscode.window.activeColorTheme.kind);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (data: unknown) => this._receive(data),
      null,
      this._disposables,
    );
    vscode.window.onDidChangeActiveColorTheme(
      (colorTheme) => {
        const next = diagramThemeFromColorTheme(colorTheme.kind);
        if (next === this._theme) return;
        this._theme = next;
        this._post({ type: "setTheme", theme: next });
      },
      null,
      this._disposables,
    );

    const webview = this._panel.webview;
    const asset = (name: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(host.extensionUri, ...WEBVIEW_DIR, name)).toString();
    webview.html = buildWebviewHtml({
      cspSource: webview.cspSource,
      nonce: generateNonce(),
      scriptUri: asset(WEBVIEW_SCRIPT),
      styleUri: asset(WEBVIEW_STYLESHEET),
      init: {
        entryPath,
        theme: this._theme,
        // VS Code applies a language change only after a reload, so the
        // locale is read once, here (TPL-2536).
        locale: resolveLocaleTag(vscode.env.language),
      },
    });
  }

  static create(host: PreviewPanelHost, entry: vscode.TextDocument): PreviewPanel {
    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      "karasu Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // The page loads only the staged bundle (#2996 decision 2).
        localResourceRoots: [vscode.Uri.joinPath(host.extensionUri, ...WEBVIEW_DIR)],
      },
    );
    return new PreviewPanel(panel, host, entry.uri.fsPath);
  }

  get entryPath(): string {
    return this._entryPath;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Show `document`'s model. The view starts over when the file is a
   * different one; for the same file the preview reads everything again,
   * keeping the view, since a file outside the watched folders may have
   * changed unseen.
   */
  showEntry(document: vscode.TextDocument): void {
    const path = document.uri.fsPath;
    if (path === this._entryPath) {
      this._post({ type: "refresh" });
      return;
    }
    this._entryPath = path;
    this._post({ type: "setEntry", path });
  }

  /** These files changed: an edit, a closed buffer, or a change on disk. */
  filesChanged(paths: string[]): void {
    if (paths.length > 0) this._post({ type: "filesChanged", paths });
  }

  /**
   * Light the element that stands for `nodeId`. `attribute` names the id space
   * the caller hands over (#2818); the editor cursor names the source's own ids.
   */
  highlight(nodeId: string | null, attribute?: WebviewHighlightAttribute): void {
    this._post({ type: "highlight", nodeId, attribute });
  }

  /**
   * Where the preview may list directories (#3312): the workspace folders,
   * plus the entry's directory when the entry lies outside all of them. File
   * contents are not bound to these (`decideFileRead`).
   */
  listableRoots(): string[] {
    const folders = (vscode.workspace.workspaceFolders ?? [])
      .filter((folder) => folder.uri.scheme === "file")
      .map((folder) => folder.uri.fsPath);
    return allowedRoots(folders, this._entryPath);
  }

  /**
   * The checked path of a `.krs` / `.krs.style` the preview may read, or
   * `null`. Shared by file reads and jump targets, so both draw the same line.
   */
  async readableSourcePath(value: unknown): Promise<string | null> {
    const path = checkRequestedPath(value);
    if (!path) return null;
    const decision = await decideFileRead(path, HOST_FILE_DEPS);
    return decision.kind === "read" ? path : null;
  }

  reveal(): void {
    this._panel.reveal();
  }

  private _post(message: HostMessage): void {
    if (this._disposed) return;
    if (this._queue) {
      this._queue = coalesce(this._queue, message);
      return;
    }
    void this._panel.webview.postMessage(message);
  }

  private _receive(data: unknown): void {
    // The webview is a trust boundary: every message is parsed against the
    // protocol before it is acted on (TPL-168).
    const message = parseWebviewMessage(data);
    if (!message) return;
    switch (message.type) {
      case "ready": {
        // The page's start values were the entry and theme when it was
        // written. Restate the current ones, so a page VS Code recreated
        // later does not open a file the user has since left (the viewer
        // ignores a repeat of what it already shows), then send what queued.
        const queued = this._queue ?? [];
        this._queue = null;
        void this._panel.webview.postMessage({ type: "setEntry", path: this._entryPath });
        void this._panel.webview.postMessage({ type: "setTheme", theme: this._theme });
        for (const m of queued) void this._panel.webview.postMessage(m);
        break;
      }
      case "fs":
        void this._answer(message);
        break;
      case "revealNode":
        void this.readableSourcePath(message.filePath).then((path) => {
          if (path && !this._disposed) this._host.onRevealNode(message.nodeId, path);
        });
        break;
      case "openExternal":
        // Parsed already, but the scheme check is the gate that matters here.
        if (isAllowedExternalUrl(message.url)) {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
        break;
    }
  }

  private async _answer(request: FsRequest): Promise<void> {
    const { id } = request;
    const reply = (value: string | boolean | DirEntryValue[]) =>
      this._post({ type: "fsResult", id, ok: true, value });
    const fail = (error: string, notFound = false) =>
      this._post({ type: "fsResult", id, ok: false, notFound, error });
    const path = checkRequestedPath(request.path);
    if (!path) return fail("Not a plain absolute path.");
    try {
      switch (request.op) {
        case "readFile": {
          const decision = await decideFileRead(path, HOST_FILE_DEPS);
          if (decision.kind === "notFound") return fail(`No such file: ${path}`, true);
          if (decision.kind === "refused") return fail(decision.reason);
          return reply(
            await readThroughBuffers(decision.path, openBuffer, () => readDisk(decision.diskPath)),
          );
        }
        case "exists":
          return reply(await decideExists(path, this.listableRoots(), HOST_FILE_DEPS));
        case "readDir": {
          const roots = this.listableRoots();
          if (
            !isWithinRoots(path, roots) ||
            !(await isRealPathWithinRoots(path, roots, nodeFs.realpath))
          ) {
            return fail("Directories are listed only inside the workspace.");
          }
          return reply(await listDirectory(path));
        }
      }
    } catch (err) {
      const notFound = err instanceof vscode.FileSystemError && err.code === "FileNotFound";
      fail(err instanceof Error ? err.message : String(err), notFound);
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._host.onDispose();
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

type DirEntryValue = { name: string; kind: "file" | "directory" };

/** The text of an open editor for `path`, or `undefined` when it is not open (TPL-2996). */
function openBuffer(path: string): string | undefined {
  const target = nodePath.resolve(path);
  return vscode.workspace.textDocuments
    .find((doc) => doc.uri.scheme === "file" && nodePath.resolve(doc.uri.fsPath) === target)
    ?.getText();
}

const HOST_FILE_DEPS: HostFileDeps = {
  realpath: (path) => nodeFs.realpath(path),
  hasBuffer: (path) => openBuffer(path) !== undefined,
};

async function readDisk(path: string): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
  return Buffer.from(bytes).toString("utf-8");
}

async function listDirectory(path: string): Promise<DirEntryValue[]> {
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
  return entries.map(([name, type]) => ({
    name,
    kind: type === vscode.FileType.Directory ? ("directory" as const) : ("file" as const),
  }));
}
