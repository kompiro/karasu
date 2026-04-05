import * as vscode from "vscode";
import { compileProject, type NodeMetadata } from "@karasu-tools/core";
import { marked } from "marked";
import { VsCodeFileSystemProvider } from "./vscode-fs-provider.js";

type ViewType = "system" | "deploy" | "org";

/** Subset of NodeMetadata serialized as JSON for the webview. */
interface SerializedNodeMeta {
  kind: string;
  label: string;
  descriptionHtml: string;
  links: { url: string; label?: string }[];
  team?: string;
  role?: string;
  runtime?: string;
  realizes?: string;
  tags: string[];
  hasChildren: boolean;
  hasDeployContainer?: boolean;
}

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
      (message: {
        type: string;
        viewType?: ViewType;
        nodeId?: string;
        index?: number;
        url?: string;
      }) => {
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
        } else if (
          message.type === "switchViewAndHighlight" &&
          message.viewType &&
          message.nodeId
        ) {
          this._viewType = message.viewType;
          this._viewPath = [];
          this._viewLabels = [];
          const highlightId = message.nodeId;
          if (this._currentDocument) {
            void this._render(this._currentDocument).then(() => {
              this.highlight(highlightId);
            });
          }
        } else if (message.type === "navigate" && message.nodeId) {
          this._onNavigate(message.nodeId);
        } else if (message.type === "openExternal" && message.url) {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
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
        this._viewType === "org" || this._viewType === "system" ? { viewPath: this._viewPath } : {};
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
    this._panel.webview.html = this._buildHtml(svg, this._lastNodeMetadata);
  }

  private _buildHtml(svg: string, nodeMetadata?: Map<string, NodeMetadata>): string {
    const nonce = _nonce();
    const activeStyle =
      "background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-color:var(--vscode-button-background);";
    const btnStyle = (view: ViewType) => (view === this._viewType ? activeStyle : "");

    const breadcrumb = this._buildBreadcrumb();

    // Serialize full node metadata for the webview, with pre-rendered description HTML.
    const metadataMap: Record<string, SerializedNodeMeta> = {};
    if (nodeMetadata) {
      for (const [id, meta] of nodeMetadata) {
        metadataMap[id] = {
          kind: meta.kind,
          label: meta.label,
          descriptionHtml: meta.description
            ? (marked.parse(meta.description, { async: false }) as string)
            : "",
          links: meta.links,
          team: meta.team,
          role: meta.role,
          runtime: meta.runtime,
          realizes: meta.realizes,
          tags: meta.tags,
          hasChildren: meta.hasChildren,
          hasDeployContainer: meta.hasDeployContainer,
        };
      }
    }
    const metadataJson = JSON.stringify(metadataMap);

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
    #jump-hint {
      margin-left: auto;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
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
    #preview-wrapper {
      flex: 1;
      overflow: auto;
      position: relative;
    }
    #preview {
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
    #karasu-tooltip {
      position: fixed;
      display: none;
      max-width: 320px;
      padding: 6px 10px;
      background: var(--vscode-editorHoverWidget-background, #252526);
      color: var(--vscode-editorHoverWidget-foreground, #cccccc);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 3px;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      pointer-events: none;
      z-index: 1000;
    }

    /* ── Detail Panel ──────────────────────────────────────── */
    #detail-panel {
      display: none;
      position: absolute;
      max-width: 360px;
      max-height: 400px;
      z-index: 100;
      background: var(--vscode-editorHoverWidget-background, #252526);
      border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3);
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    #detail-panel.visible {
      display: flex;
    }
    .dp-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .dp-icon { font-size: 15px; flex-shrink: 0; }
    .dp-label {
      font-weight: 600;
      font-size: 13.5px;
      color: var(--vscode-editor-foreground);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .dp-close {
      background: none !important;
      border: none !important;
      color: var(--vscode-descriptionForeground);
      font-size: 16px;
      cursor: pointer;
      padding: 1px 5px !important;
      line-height: 1;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .dp-close:hover {
      color: var(--vscode-editor-foreground);
      background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.1)) !important;
    }
    .dp-body {
      overflow-y: auto;
      flex: 1;
    }
    .dp-description {
      padding: 10px 12px;
      font-size: 13px;
      color: var(--vscode-editorHoverWidget-foreground, #ccc);
      line-height: 1.65;
    }
    .dp-description p { margin-bottom: 8px; }
    .dp-description h1,
    .dp-description h2,
    .dp-description h3 {
      font-size: 13px;
      color: var(--vscode-editor-foreground);
      margin: 8px 0 4px;
    }
    .dp-description code {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11.5px;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
    .dp-description ul,
    .dp-description ol {
      padding-left: 20px;
      margin-bottom: 8px;
    }
    .dp-section {
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .dp-section-title {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.09em;
      font-weight: 700;
    }
    .dp-links { list-style: none; padding: 0; }
    .dp-links li { margin: 2px 0; }
    .dp-links a {
      color: var(--vscode-textLink-foreground, #4daafc);
      text-decoration: none;
      font-size: 13px;
      cursor: pointer;
    }
    .dp-links a:hover { text-decoration: underline; }
    .dp-prop {
      font-size: 11.5px;
      color: var(--vscode-descriptionForeground);
      margin: 2px 0;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
    .dp-jump {
      display: block;
      width: 100%;
      padding: 6px 8px !important;
      background: var(--vscode-button-background) !important;
      border: none !important;
      border-radius: 3px;
      color: var(--vscode-button-foreground) !important;
      font-size: 12px;
      text-align: center;
      cursor: pointer;
    }
    .dp-jump:hover {
      background: var(--vscode-button-hoverBackground, #1177bb) !important;
      opacity: 1 !important;
    }
    .dp-nav-btn {
      display: block;
      width: 100%;
      padding: 5px 8px !important;
      background: var(--vscode-button-secondaryBackground, #3a3d41) !important;
      border: none !important;
      border-radius: 3px;
      color: var(--vscode-button-secondaryForeground, #cccccc) !important;
      font-size: 12px;
      text-align: left;
      cursor: pointer;
    }
    .dp-nav-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, #45494e) !important;
      opacity: 1 !important;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button data-view="system" style="${btnStyle("system")}">System</button>
    <button data-view="deploy" style="${btnStyle("deploy")}">Deploy</button>
    <button data-view="org" style="${btnStyle("org")}">Org</button>
    <div class="toolbar-sep"></div>
    <div id="breadcrumb">${breadcrumb}</div>
    <span id="jump-hint">\u24d8 for details \u00b7 Cmd/Ctrl+Click to jump</span>
  </div>
  <div id="preview-wrapper">
    <div id="preview">${svg}</div>
    <div id="detail-panel"></div>
  </div>
  <div id="karasu-tooltip"></div>
  <script nonce="${nonce}">
    var vscode = acquireVsCodeApi();
    var nodeMetadataMap = ${metadataJson};
    var tooltip = document.getElementById('karasu-tooltip');
    var detailPanel = document.getElementById('detail-panel');
    var currentDetailNodeId = null;

    var KIND_ICONS = {
      service: '\\u2699', user: '\\ud83d\\udc64', domain: '\\ud83d\\udce6',
      resource: '\\ud83d\\udcbe', usecase: '\\ud83d\\udce6', team: '\\ud83d\\udc65',
      member: '\\ud83d\\udc64', oci: '\\ud83d\\udc33', lambda: '\\u03bb',
      jar: '\\u2615', war: '\\u2615', function: 'f\\u2099',
      assets: '\\ud83d\\udcc1', job: '\\u23f0', artifact: '\\ud83d\\udce6',
      system: '\\ud83c\\udfd7'
    };

    // ── View switcher ──
    document.querySelectorAll('[data-view]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'switchView', viewType: btn.dataset.view });
      });
    });

    // ── Breadcrumb navigation ──
    document.querySelectorAll('[data-nav-index]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'navigateTo', index: Number(btn.dataset.navIndex) });
      });
    });

    // ── Detail panel functions ──
    function showDetailPanel(nodeId, targetEl) {
      var meta = nodeMetadataMap[nodeId];
      if (!meta) return;

      currentDetailNodeId = nodeId;
      var icon = KIND_ICONS[meta.kind] || '\\u25a0';

      // Build panel HTML
      var html = '<div class="dp-header">';
      html += '<span class="dp-icon">' + icon + '</span>';
      html += '<span class="dp-label">' + escapeHtml(meta.label) + '</span>';
      html += '<button class="dp-close" id="dp-close-btn" aria-label="Close">\\u00d7</button>';
      html += '</div>';
      html += '<div class="dp-body">';

      // Description (pre-rendered HTML from extension host)
      if (meta.descriptionHtml) {
        html += '<div class="dp-description">' + meta.descriptionHtml + '</div>';
      }

      // Links
      if (meta.links && meta.links.length > 0) {
        html += '<div class="dp-section">';
        html += '<div class="dp-section-title">\\ud83d\\udd17 Links</div>';
        html += '<ul class="dp-links">';
        for (var i = 0; i < meta.links.length; i++) {
          var link = meta.links[i];
          html += '<li><a href="' + escapeAttr(link.url) + '">'
            + escapeHtml(link.label || link.url) + ' \\u2197</a></li>';
        }
        html += '</ul></div>';
      }

      // Runtime / realizes (own section, matching app layout)
      if (meta.runtime || meta.realizes) {
        html += '<div class="dp-section">';
        if (meta.runtime) html += '<div class="dp-prop">\\ud83d\\udda5 runtime: ' + escapeHtml(meta.runtime) + '</div>';
        if (meta.realizes) html += '<div class="dp-prop">\\ud83d\\udd17 realizes: ' + escapeHtml(meta.realizes) + '</div>';
        html += '</div>';
      }

      // Team / role / tags
      var teamRoleTagsProps = [];
      if (meta.role) teamRoleTagsProps.push('\\ud83d\\udccc ' + escapeHtml(meta.role));
      if (meta.tags && meta.tags.length > 0) {
        teamRoleTagsProps.push('\\ud83c\\udff7 ' + meta.tags.map(function(t) { return '[' + escapeHtml(t) + ']'; }).join(' '));
      }
      if (meta.team || teamRoleTagsProps.length > 0) {
        html += '<div class="dp-section">';
        if (meta.team) {
          html += '<button class="dp-nav-btn" data-nav-view="org" data-nav-node="' + escapeAttr(meta.team) + '">'
            + '\\ud83d\\udc65 ' + escapeHtml(meta.team) + ' \\u2192</button>';
        }
        for (var j = 0; j < teamRoleTagsProps.length; j++) {
          html += '<div class="dp-prop">' + teamRoleTagsProps[j] + '</div>';
        }
        html += '</div>';
      }

      // Deploy navigation button
      if (meta.hasDeployContainer) {
        html += '<div class="dp-section">';
        html += '<button class="dp-nav-btn" data-nav-view="deploy" data-nav-node="' + escapeAttr(nodeId) + '">'
          + '\\ud83d\\ude80 Deploy \\u56f3\\u3067\\u78ba\\u8a8d \\u2192</button>';
        html += '</div>';
      }

      // Jump to editor button
      html += '<div class="dp-section">';
      html += '<button class="dp-jump" id="dp-jump-btn">Jump to editor</button>';
      html += '</div>';

      html += '</div>'; // .dp-body

      detailPanel.innerHTML = html;

      // Position near the clicked node
      var wrapper = document.getElementById('preview-wrapper');
      var wrapperRect = wrapper.getBoundingClientRect();
      var targetRect = targetEl.getBoundingClientRect();

      var anchorX = targetRect.right - wrapperRect.left + wrapper.scrollLeft + 8;
      var anchorY = targetRect.top - wrapperRect.top + wrapper.scrollTop;

      // If panel would overflow right edge, position to the left
      if (anchorX + 360 > wrapper.scrollWidth && anchorX + 360 > wrapperRect.width) {
        anchorX = targetRect.left - wrapperRect.left + wrapper.scrollLeft - 368;
        if (anchorX < 0) anchorX = 8;
      }

      detailPanel.style.left = anchorX + 'px';
      detailPanel.style.top = anchorY + 'px';
      detailPanel.classList.add('visible');

      // Close button
      document.getElementById('dp-close-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        hideDetailPanel();
      });

      // Jump button
      document.getElementById('dp-jump-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        vscode.postMessage({ type: 'navigate', nodeId: currentDetailNodeId });
      });

      // Cross-diagram navigation buttons (team → org, service → deploy)
      detailPanel.querySelectorAll('[data-nav-view]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var viewType = btn.getAttribute('data-nav-view');
          var navNodeId = btn.getAttribute('data-nav-node');
          hideDetailPanel();
          vscode.postMessage({ type: 'switchViewAndHighlight', viewType: viewType, nodeId: navNodeId });
        });
      });
    }

    function hideDetailPanel() {
      detailPanel.classList.remove('visible');
      detailPanel.innerHTML = '';
      currentDetailNodeId = null;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function escapeAttr(str) {
      return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── Intercept link clicks inside detail panel ──
    detailPanel.addEventListener('click', function(e) {
      var link = e.target.closest('a[href]');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        vscode.postMessage({ type: 'openExternal', url: link.getAttribute('href') });
      }
    });

    // Stop events on detail panel from propagating to preview
    detailPanel.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    detailPanel.addEventListener('mouseup', function(e) { e.stopPropagation(); });
    detailPanel.addEventListener('wheel', function(e) { e.stopPropagation(); });

    // ── Node click ──
    document.querySelector('#preview').addEventListener('click', function(e) {
      // 1. Info button → detail panel
      var infoBtn = e.target.closest('[data-info-button]');
      if (infoBtn) {
        var infoNodeId = infoBtn.getAttribute('data-info-button');
        var infoGroup = infoBtn.closest('[data-node-id]');
        if (infoNodeId && infoGroup) {
          showDetailPanel(infoNodeId, infoGroup);
        }
        return;
      }

      // 2. Link button → detail panel
      var linkBtn = e.target.closest('[data-link-button]');
      if (linkBtn) {
        var linkNodeId = linkBtn.getAttribute('data-link-button');
        var linkGroup = linkBtn.closest('[data-node-id]');
        if (linkNodeId && linkGroup) {
          showDetailPanel(linkNodeId, linkGroup);
        }
        return;
      }

      // 3. Find the node group
      var group = e.target.closest('[data-node-id]');
      if (!group) {
        // Click outside any node → close detail panel
        hideDetailPanel();
        return;
      }

      var nodeId = group.getAttribute('data-node-id');
      if (!nodeId) return;

      // 4. Cmd/Ctrl+Click → editor jump (any node)
      if (e.metaKey || e.ctrlKey) {
        vscode.postMessage({ type: 'navigate', nodeId: nodeId });
        return;
      }

      // 5. Parent node → drill-down
      if (group.getAttribute('data-has-children') === 'true') {
        hideDetailPanel();
        vscode.postMessage({ type: 'drillDown', nodeId: nodeId });
        return;
      }

      // 6. Leaf node → detail panel
      showDetailPanel(nodeId, group);
    });

    // ── Node hover: show description tooltip ──
    document.querySelector('#preview').addEventListener('mousemove', function(e) {
      // Don't show tooltip when detail panel is open
      if (currentDetailNodeId) { tooltip.style.display = 'none'; return; }
      var group = e.target.closest('[data-node-id]');
      if (!group) { tooltip.style.display = 'none'; return; }
      var nodeId = group.getAttribute('data-node-id');
      var meta = nodeId && nodeMetadataMap[nodeId];
      if (!meta || !meta.descriptionHtml) { tooltip.style.display = 'none'; return; }
      // Show plain description summary in tooltip (strip HTML)
      var tmp = document.createElement('div');
      tmp.innerHTML = meta.descriptionHtml;
      var plain = (tmp.textContent || '').trim();
      if (!plain) { tooltip.style.display = 'none'; return; }
      // Truncate for tooltip
      if (plain.length > 200) plain = plain.substring(0, 200) + '\\u2026';
      tooltip.textContent = plain;
      tooltip.style.display = 'block';
      var x = e.clientX + 14;
      var y = e.clientY + 14;
      if (x + tooltip.offsetWidth > window.innerWidth) x = e.clientX - tooltip.offsetWidth - 8;
      if (y + tooltip.offsetHeight > window.innerHeight) y = e.clientY - tooltip.offsetHeight - 8;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    });

    document.querySelector('#preview').addEventListener('mouseleave', function() {
      tooltip.style.display = 'none';
    });

    // ── Highlight message from extension ──
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
