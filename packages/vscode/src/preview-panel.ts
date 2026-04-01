import * as vscode from "vscode";
import { compile } from "@karasu/core";

type ViewType = "system" | "deploy" | "org";

export class PreviewPanel {
  static readonly viewType = "karasu.preview";

  private readonly _panel: vscode.WebviewPanel;
  private _viewType: ViewType = "system";
  private _currentDocument: vscode.TextDocument | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private _disposed = false;
  private readonly _onDispose: () => void;
  private readonly _onNavigate: (nodeId: string) => void;

  private constructor(
    panel: vscode.WebviewPanel,
    onDispose: () => void,
    onNavigate: (nodeId: string) => void,
  ) {
    this._panel = panel;
    this._onDispose = onDispose;
    this._onNavigate = onNavigate;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (message: { type: string; viewType?: ViewType; nodeId?: string }) => {
        if (message.type === "switchView" && message.viewType) {
          this._viewType = message.viewType;
          if (this._currentDocument) {
            this._render(this._currentDocument.getText());
          }
        } else if (message.type === "navigate" && message.nodeId) {
          this._onNavigate(message.nodeId);
        }
      },
      null,
      this._disposables,
    );
  }

  static create(onDispose: () => void, onNavigate: (nodeId: string) => void): PreviewPanel {
    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      "karasu Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    return new PreviewPanel(panel, onDispose, onNavigate);
  }

  update(document: vscode.TextDocument): void {
    this._currentDocument = document;
    this._render(document.getText());
  }

  highlight(nodeId: string | null): void {
    void this._panel.webview.postMessage({ type: "highlight", nodeId });
  }

  reveal(): void {
    this._panel.reveal();
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  private _render(krsSource: string): void {
    let svg: string;
    try {
      svg = compile(krsSource, { diagramType: this._viewType }).svg;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60">
        <text x="10" y="30" fill="#f44" font-family="monospace" font-size="13">Error: ${_escape(msg)}</text>
      </svg>`;
    }
    this._panel.webview.html = this._buildHtml(svg);
  }

  private _buildHtml(svg: string): string {
    const nonce = _nonce();
    const activeStyle =
      "background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);";
    const btnStyle = (view: ViewType) => (view === this._viewType ? activeStyle : "");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
    [data-node-id].karasu-highlighted > rect,
    [data-node-id].karasu-highlighted > path,
    [data-node-id].karasu-highlighted > circle,
    [data-node-id].karasu-highlighted > ellipse {
      stroke: var(--vscode-focusBorder, #007fd4);
      stroke-width: 3;
    }
    [data-node-id] { cursor: pointer; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button data-view="system" style="${btnStyle("system")}">System</button>
    <button data-view="deploy" style="${btnStyle("deploy")}">Deploy</button>
    <button data-view="org" style="${btnStyle("org")}">Org</button>
  </div>
  <div id="preview">${svg}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // View switcher
    document.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'switchView', viewType: btn.dataset.view });
      });
    });

    // Node click → navigate
    document.querySelectorAll('[data-node-id]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'navigate', nodeId: el.dataset.nodeId });
      });
    });

    // Highlight message from extension
    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'highlight') {
        document.querySelectorAll('[data-node-id].karasu-highlighted').forEach(function(el) {
          el.classList.remove('karasu-highlighted');
        });
        if (msg.nodeId) {
          var target = document.querySelector('[data-node-id="' + msg.nodeId + '"]');
          if (target) {
            target.classList.add('karasu-highlighted');
            target.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    });
  </script>
</body>
</html>`;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._onDispose();
    this._panel.dispose();
    for (const d of this._disposables) d.dispose();
    this._disposables.length = 0;
  }
}

function _nonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function _escape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
