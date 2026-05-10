import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
  RequestType,
} from "vscode-languageclient/node";
import { PreviewPanel } from "./preview-panel.js";

const PREVIEW_DEBOUNCE_MS = 300;
const CURSOR_DEBOUNCE_MS = 150;

// Custom LSP request types (must mirror packages/lsp/src/server.ts)
const NodeAtPositionRequest = new RequestType<
  { uri: string; position: { line: number; character: number } },
  { nodeId: string | null },
  void
>("karasu/nodeAtPosition");

const PositionOfNodeRequest = new RequestType<
  { uri: string; nodeId: string },
  {
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    } | null;
  },
  void
>("karasu/positionOfNode");

let client: LanguageClient | undefined;
let previewPanel: PreviewPanel | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let cursorDebounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
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
  client.start();

  // --- Preview ---
  const openPreviewCmd = vscode.commands.registerCommand("karasu.openPreview", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "krs") {
      void vscode.window.showInformationMessage("Open a .krs file to preview it.");
      return;
    }

    if (!previewPanel || previewPanel.isDisposed) {
      previewPanel = PreviewPanel.create(
        () => {
          previewPanel = undefined;
        },
        (nodeId) => {
          void handleNavigate(nodeId, editor.document.uri.toString());
        },
      );
    }

    previewPanel.update(editor.document);
    previewPanel.reveal();
  });

  const changeWatcher = vscode.workspace.onDidChangeTextDocument((e) => {
    if (previewPanel && !previewPanel.isDisposed && e.document.languageId === "krs") {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        previewPanel?.update(e.document);
      }, PREVIEW_DEBOUNCE_MS);
    }
  });

  const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (
      previewPanel &&
      !previewPanel.isDisposed &&
      editor &&
      editor.document.languageId === "krs"
    ) {
      previewPanel.update(editor.document);
    }
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

    clearTimeout(cursorDebounceTimer);
    cursorDebounceTimer = setTimeout(() => {
      const pos = e.textEditor.selection.active;
      const uri = e.textEditor.document.uri.toString();
      void client!
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
    editorWatcher,
    cursorWatcher,
    tidyStyleCmd,
  );
}

async function handleNavigate(nodeId: string, uri: string): Promise<void> {
  if (!client) return;

  const result = await client.sendRequest(PositionOfNodeRequest, { uri, nodeId });
  if (!result.range) return;

  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri);
  if (!editor) return;

  const range = new vscode.Range(
    new vscode.Position(result.range.start.line, result.range.start.character),
    new vscode.Position(result.range.end.line, result.range.end.character),
  );
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
