import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { NodeAtPositionRequest, PositionOfNodeRequest } from "@karasu-tools/lsp/protocol";
import { isKarasuSourcePath } from "./host-files.js";
import { PreviewPanel } from "./preview-panel.js";

const CURSOR_DEBOUNCE_MS = 150;

/**
 * `deactivate()` is called by VS Code independently of `activate`'s closure,
 * so it needs a way to reach the running `LanguageClient` without the rest of
 * `activate`'s mutable state (`previewPanel`, debounce timers) being visible
 * at module scope. `activate` assigns this callback once the client exists;
 * everything else stays local to `activate`.
 */
let onDeactivate: (() => Thenable<void> | undefined) | undefined;

export function activate(context: vscode.ExtensionContext): void {
  let client: LanguageClient | undefined;
  let previewPanel: PreviewPanel | undefined;
  let cursorDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  // --- LSP ---
  // The vscode build script copies the bundled server into `out/server.js`
  // so installed extensions can load it from inside the .vsix. In the
  // dev tree (F5 from packages/vscode) that copy might not exist yet;
  // fall back to packages/lsp's build output as a sibling of the
  // extension folder.
  const serverModuleCandidates = [
    context.asAbsolutePath(path.join("out", "server.js")),
    context.asAbsolutePath(path.join("..", "lsp", "out", "server.js")),
  ];
  const serverModule =
    serverModuleCandidates.find((p) => fs.existsSync(p)) ?? serverModuleCandidates[0];

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "krs" },
      { scheme: "file", language: "krs-style" },
    ],
  };

  client = new LanguageClient("karasu", "karasu Language Server", serverOptions, clientOptions);
  // Wire the deactivate stop-path to the client as soon as it is *constructed*,
  // before `start()`. The client spawns the language-server child process, so
  // `deactivate()` (window reload / uninstall) must be able to stop it even if
  // `start()` throws synchronously — otherwise the child process is orphaned.
  onDeactivate = () => client?.stop();
  client.start();

  // Which editor column the user last worked in on a .krs, so a jump to
  // another file opens beside it rather than over the preview.
  let lastSourceColumn: vscode.ViewColumn | undefined;
  // Set while a jump opens a file, so the editor change it causes does not
  // switch the preview to that file: the user asked to see a definition, not
  // a different model.
  let jumpingTo: string | undefined;

  // Jump from the preview to a node's definition (ADR-177), in the file that
  // defines it, which may be another file than the preview's entry (#3312).
  // The panel has checked that `filePath` is a readable .krs.
  async function revealNode(nodeId: string, filePath: string): Promise<void> {
    if (!client) return;
    const uri = vscode.Uri.file(filePath);
    const visible = vscode.window.visibleTextEditors.find(
      (e) => e.document.uri.fsPath === uri.fsPath,
    );
    jumpingTo = uri.fsPath;
    let editor: vscode.TextEditor;
    try {
      editor = visible
        ? await vscode.window.showTextDocument(visible.document, visible.viewColumn)
        : await vscode.window.showTextDocument(uri, {
            viewColumn: lastSourceColumn ?? vscode.ViewColumn.One,
          });
    } finally {
      jumpingTo = undefined;
    }

    const result = await client.sendRequest(PositionOfNodeRequest, {
      uri: editor.document.uri.toString(),
      nodeId,
    });
    if (!result.range) return;
    const range = new vscode.Range(
      new vscode.Position(result.range.start.line, result.range.start.character),
      new vscode.Position(result.range.end.line, result.range.end.character),
    );
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** Whether a document is a .krs / .krs.style on disk, the only files the preview reads. */
  const isSourceDocument = (doc: vscode.TextDocument) =>
    doc.uri.scheme === "file" && isKarasuSourcePath(doc.uri.fsPath);

  // --- Preview ---
  const openPreviewCmd = vscode.commands.registerCommand("karasu.openPreview", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "krs") {
      void vscode.window.showInformationMessage("Open a .krs file to preview it.");
      return;
    }
    lastSourceColumn = editor.viewColumn;

    if (!previewPanel || previewPanel.isDisposed) {
      previewPanel = PreviewPanel.create(
        {
          extensionUri: context.extensionUri,
          onRevealNode: (nodeId, filePath) => {
            // A file deleted since it was drawn, or an LSP that is not up:
            // the jump does nothing rather than leave a rejection unhandled.
            revealNode(nodeId, filePath).catch(() => undefined);
          },
          onDispose: () => {
            previewPanel = undefined;
          },
        },
        editor.document,
      );
    } else {
      previewPanel.showEntry(editor.document);
    }
    previewPanel.reveal();
  });

  // Every .krs / .krs.style buffer, not only the entry: an import's unsaved
  // edit reaches the preview too (TPL-2996). The viewer debounces the compile.
  const changeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
    if (previewPanel && !previewPanel.isDisposed && isSourceDocument(e.document)) {
      previewPanel.filesChanged([e.document.uri.fsPath]);
    }
  });

  // Closing a buffer with unsaved edits puts the disk's text back in force.
  const closeWatcher = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (previewPanel && !previewPanel.isDisposed && isSourceDocument(doc)) {
      previewPanel.filesChanged([doc.uri.fsPath]);
    }
  });

  // A change on disk that no editor made: a pull, a generator, another tool.
  const fileWatcher = vscode.workspace.createFileSystemWatcher("**/*.{krs,krs.style}");
  const onDiskChange = (uri: vscode.Uri) => {
    if (previewPanel && !previewPanel.isDisposed && uri.scheme === "file") {
      previewPanel.filesChanged([uri.fsPath]);
    }
  };
  fileWatcher.onDidChange(onDiskChange);
  fileWatcher.onDidCreate(onDiskChange);
  fileWatcher.onDidDelete(onDiskChange);

  const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || editor.document.languageId !== "krs") return;
    lastSourceColumn = editor.viewColumn;
    if (!previewPanel || previewPanel.isDisposed) return;
    if (jumpingTo === editor.document.uri.fsPath) return;
    previewPanel.showEntry(editor.document);
  });

  // --- Cursor tracking → preview highlight ---
  const cursorWatcher = vscode.window.onDidChangeTextEditorSelection((e) => {
    if (
      !previewPanel ||
      previewPanel.isDisposed ||
      e.textEditor.document.languageId !== "krs" ||
      !client
    ) {
      return;
    }

    // Narrow `client` into a local const: the `!client` guard above proves
    // it's defined at this point, but that narrowing doesn't survive into
    // the `setTimeout` callback below (a reassignment could race it in
    // theory), so capture the checked reference now instead of asserting
    // non-null across the async gap.
    const c = client;

    clearTimeout(cursorDebounceTimer);
    cursorDebounceTimer = setTimeout(() => {
      const pos = e.textEditor.selection.active;
      const uri = e.textEditor.document.uri.toString();
      void c
        .sendRequest(NodeAtPositionRequest, {
          uri,
          position: { line: pos.line, character: pos.character },
        })
        .then(({ nodeId }) => {
          previewPanel?.highlight(nodeId);
        });
    }, CURSOR_DEBOUNCE_MS);
  });

  // --- Tidy Style palette command ---
  // The actual formatter is provided by the LSP server (which routes
  // `krs` and `krs-style` to their respective formatters), so we only
  // need a palette entry that triggers `editor.action.formatDocument`
  // when the active document is `.krs.style`. This keeps a single
  // formatter registered for the language and avoids VS Code's
  // "Configure default formatter" prompt.
  const tidyStyleCmd = vscode.commands.registerCommand("karasu.tidyStyle", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "krs-style") {
      void vscode.window.showInformationMessage("Open a .krs.style file to run Tidy Style.");
      return;
    }
    await vscode.commands.executeCommand("editor.action.formatDocument");
  });

  context.subscriptions.push(
    { dispose: () => client?.stop() },
    openPreviewCmd,
    changeWatcher,
    closeWatcher,
    fileWatcher,
    editorWatcher,
    cursorWatcher,
    tidyStyleCmd,
  );
}

export function deactivate(): Thenable<void> | undefined {
  return onDeactivate?.();
}
