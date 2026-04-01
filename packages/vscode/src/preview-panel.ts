import * as vscode from "vscode";
import { compileProject, type NodeMetadata } from "@karasu/core";
import { VsCodeFileSystemProvider } from "./vscode-fs-provider.js";

type ViewType = "system" | "deploy" | "org";

export class PreviewPanel {
  static readonly viewType = "karasu.preview";

  private readonly _panel: vscode.WebviewPanel;
  private _viewType: ViewType = "system";
  private _viewPath: string[] = [];
  private _viewLabels: string[] = [];
  private _lastNodeMetadata: Map<string, NodeMetadata> | undefined;
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
      (message: { type: string; viewType?: ViewType; nodeId?: string; index?: number }) => {
        if (message.type === "switchView" && message.viewType) {
          this._viewType = message.viewType;
          this._viewPath = [];
          this._viewLabels = [];
          if (this._currentDocument) {
            void this._render(this._currentDocument);
          }
        } else if (message.type === "drillDown" && message.nodeId) {
          const label = this._lastNodeMetadata?.get(message.nodeId)?.label ?? message.nodeId;
          this._viewPath = [...this._viewPath, message.nodeId];
          this._viewLabels = [...this._viewLabels, label];
          if (this._currentDocument) {
            void this._render(this._currentDocument);
          }
        } else if (message.type === "navigateTo" && message.index !== undefined) {
          this._viewPath = this._viewPath.slice(0, message.index);
          this._viewLabels = this._viewLabels.slice(0, message.index);
          if (this._currentDocument) {
            void this._render(this._currentDocument);
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
    void this._render(document);
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

  private async _render(document: vscode.TextDocument): Promise<void> {
    let svg: string;
    try {
      const viewPathOpts =
        this._viewType === "org"
          ? { orgPath: this._viewPath }
          : this._viewType === "system"
            ? { viewPath: this._viewPath }
            : {};
      const result = await compileProject(document.uri.fsPath, new VsCodeFileSystemProvider(), {
        diagramType: this._viewType,
        ...viewPathOpts,
      });
      svg = result.svg;
      this._lastNodeMetadata = result.diagramType !== "org" ? result.nodeMetadata : undefined;
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

    const breadcrumb = this._buildBreadcrumb();

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
      align-items: center;
    }
    .toolbar-sep {
      width: 1px;
      height: 16px;
      background: var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #breadcrumb {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 12px;
      overflow: hidden;
    }
    #breadcrumb button {
      padding: 2px 6px;
      border: none;
      background: none;
      color: var(--vscode-textLink-foreground, #4daafc);
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }
    #breadcrumb button:last-child {
      color: var(--vscode-editor-foreground);
      cursor: default;
      font-weight: bold;
    }
    #breadcrumb .sep { color: var(--vscode-descriptionForeground); padding: 0 2px; }
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
    [data-has-children="true"] { cursor: zoom-in; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button data-view="system" style="${btnStyle("system")}">System</button>
    <button data-view="deploy" style="${btnStyle("deploy")}">Deploy</button>
    <button data-view="org" style="${btnStyle("org")}">Org</button>
    <div class="toolbar-sep"></div>
    <div id="breadcrumb">${breadcrumb}</div>
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

    // Breadcrumb navigation
    document.querySelectorAll('[data-nav-index]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'navigateTo', index: Number(btn.dataset.navIndex) });
      });
    });

    // Node click: Cmd/Ctrl+click → navigate (editor jump); plain click on drillable node → drillDown
    document.querySelector('#preview').addEventListener('click', function(e) {
      var group = e.target.closest('[data-node-id]');
      if (!group) return;
      var nodeId = group.getAttribute('data-node-id');
      if (!nodeId) return;
      if (e.metaKey || e.ctrlKey) {
        vscode.postMessage({ type: 'navigate', nodeId: nodeId });
      } else if (group.getAttribute('data-has-children') === 'true') {
        vscode.postMessage({ type: 'drillDown', nodeId: nodeId });
      } else {
        vscode.postMessage({ type: 'navigate', nodeId: nodeId });
      }
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

  private _buildBreadcrumb(): string {
    // segments[0] = Root (navigateTo 0 → empty path)
    // segments[i] = _viewLabels[i-1] (navigateTo i → path of length i)
    // Last segment is current position — not clickable
    const labels = ["Root", ...this._viewLabels];
    return labels
      .map((label, i) => {
        const isLast = i === labels.length - 1;
        const sep = i > 0 ? `<span class="sep">›</span>` : "";
        if (isLast) {
          return `${sep}<button style="cursor:default;color:var(--vscode-editor-foreground);font-weight:bold;">${_escape(label)}</button>`;
        }
        return `${sep}<button data-nav-index="${i}">${_escape(label)}</button>`;
      })
      .join("");
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
