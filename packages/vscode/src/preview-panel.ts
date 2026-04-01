import * as vscode from "vscode";
import { compile, compileOrgView } from "@karasu/core";

type ViewType = "system" | "deploy" | "org";

export class PreviewPanel {
  static readonly viewType = "karasu.preview";

  private readonly _panel: vscode.WebviewPanel;
  private _viewType: ViewType = "system";
  private _currentDocument: vscode.TextDocument | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: { type: string; viewType?: ViewType }) => {
        if (message.type === "switchView" && message.viewType) {
          this._viewType = message.viewType;
          if (this._currentDocument) {
            this._render(this._currentDocument.getText());
          }
        }
      },
      null,
      this._disposables,
    );
  }

  static create(): PreviewPanel {
    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      "karasu Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    return new PreviewPanel(panel);
  }

  update(document: vscode.TextDocument): void {
    this._currentDocument = document;
    this._render(document.getText());
  }

  reveal(): void {
    this._panel.reveal();
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  onDidDispose(callback: () => void): void {
    this._panel.onDidDispose(callback, null, this._disposables);
  }

  private _render(krsSource: string): void {
    let svg: string;
    try {
      if (this._viewType === "org") {
        svg = compileOrgView(krsSource).svg;
      } else {
        svg = compile(krsSource, undefined, undefined, this._viewType).svg;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60">
        <text x="10" y="30" fill="#f44" font-family="monospace" font-size="13">Error: ${_escape(msg)}</text>
      </svg>`;
    }
    this._panel.webview.html = this._buildHtml(svg);
  }

  private _buildHtml(svg: string): string {
    const activeStyle =
      "background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);";
    const btnStyle = (view: ViewType) => (view === this._viewType ? activeStyle : "");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    #toolbar {
      display: flex;
      gap: 6px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    button {
      padding: 3px 10px;
      border: 1px solid var(--vscode-button-secondaryBackground, #555);
      border-radius: 3px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      font-size: 12px;
    }
    button:hover { opacity: 0.85; }
    #preview {
      flex: 1;
      overflow: auto;
      padding: 12px;
    }
    #preview svg { max-width: 100%; height: auto; display: block; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button data-view="system" style="${btnStyle("system")}">System</button>
    <button data-view="deploy" style="${btnStyle("deploy")}">Deploy</button>
    <button data-view="org" style="${btnStyle("org")}">Org</button>
  </div>
  <div id="preview">${svg}</div>
  <script>
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'switchView', viewType: btn.dataset.view });
      });
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

function _escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
