import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { PreviewPanel } from "./preview-panel.js";

const PREVIEW_DEBOUNCE_MS = 300;

let client: LanguageClient | undefined;
let previewPanel: PreviewPanel | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // --- LSP ---
  const serverModule = context.asAbsolutePath(path.join("..", "lsp", "out", "server.js"));

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
      previewPanel = PreviewPanel.create(() => {
        previewPanel = undefined;
      });
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

  context.subscriptions.push(
    { dispose: () => client?.stop() },
    openPreviewCmd,
    changeWatcher,
    editorWatcher,
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
