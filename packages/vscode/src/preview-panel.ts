import * as vscode from "vscode";
import {
  compileProject,
  isSafeLinkUrl,
  type DiagramTheme,
  type NodeMetadata,
} from "@karasu-tools/core";
import { marked } from "marked";
import {
  type DrilldownNodeMeta,
  type DrilldownState,
  buildBreadcrumbHtml,
  drillDown,
  emptyDrilldownState,
  escapeHtml,
  navigateTo,
} from "./drilldown-state.js";
import {
  type ViewType,
  isAllowedExternalUrl,
  isNodeId,
  isValidNavIndex,
  isViewType,
} from "./message-validation.js";
import { diagramThemeFromColorTheme } from "./theme-mapping.js";
import { VsCodeFileSystemProvider } from "./vscode-fs-provider.js";
import { buildPreviewHtml, generateNonce } from "./webview-content.js";
import { buildPreviewPanelLabels, resolveWebviewLocale } from "./webview-i18n.js";

/** Subset of NodeMetadata serialized as JSON for the webview. */
interface SerializedNodeMeta {
  kind: string;
  label: string;
  descriptionHtml: string;
  links: { url: string; label?: string }[];
  /** Owning team id — what the org-view jump button navigates by. */
  team?: string;
  /** Owning team's declared label, shown instead of the id when present (#2157). */
  teamLabel?: string;
  role?: string;
  runtime?: string;
  type?: string;
  image?: string;
  schedule?: string;
  realizes?: string[];
  tags: string[];
  hasDeployContainer?: boolean;
  /** Client-only: operation-tied storage resources, in declaration order (Issue #2068). */
  resources?: { storageKind: string; name: string }[];
  /** Client-only: device / browser capabilities, in declaration order (Issue #2068). */
  capabilities?: { name: string; label?: string; description?: string }[];
  /**
   * Interpreted migration-intent params (`@deprecated(until:…)` /
   * `@experimental(until:…)` / `@migration_target(from:…)`), mirroring the
   * app's `NodeDetailPanel` migration section (Issue #2068). `until.kind`
   * is `"machine"` (parsed date/month/quarter) or `"opaque"` (free text);
   * `until.raw` / `from` are always the exact source text.
   */
  migrationIntent?: { until?: { kind: string; raw: string }; from?: string };
}

export class PreviewPanel {
  static readonly viewType = "karasu.preview";

  private readonly _panel: vscode.WebviewPanel;
  // Detail-panel labels resolved once from VS Code's display language: it is
  // constant for the panel's lifetime (a language change requires a reload),
  // so resolving per-render would re-run the i18n lookups on every keystroke.
  private readonly _panelLabels = buildPreviewPanelLabels(
    resolveWebviewLocale(vscode.env.language),
  );
  private _viewType: ViewType = "system";
  private _displayMode: "icon" | "shape" = "shape";
  private _theme: DiagramTheme = diagramThemeFromColorTheme(vscode.window.activeColorTheme.kind);
  private _drilldown: DrilldownState = emptyDrilldownState();
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
        type: unknown;
        viewType?: unknown;
        nodeId?: unknown;
        index?: unknown;
        url?: unknown;
      }) => {
        // The webview is a trust boundary: messages it posts are tainted and
        // must be validated here before acting on them. See message-validation.ts.
        // Path/label arithmetic lives in drilldown-state.ts (unit-tested).
        if (message.type === "switchView" && isViewType(message.viewType)) {
          this._viewType = message.viewType;
          this._drilldown = emptyDrilldownState();
          void this._rerender();
        } else if (message.type === "drillDown" && isNodeId(message.nodeId)) {
          // NodeMetadata satisfies DrilldownNodeMeta structurally; the
          // annotation records the subset the transition actually reads.
          const meta: DrilldownNodeMeta | undefined = this._lastNodeMetadata?.get(message.nodeId);
          this._drilldown = drillDown(this._drilldown, message.nodeId, meta);
          void this._rerender();
        } else if (
          message.type === "navigateTo" &&
          isValidNavIndex(message.index, this._drilldown.viewPath.length)
        ) {
          this._drilldown = navigateTo(this._drilldown, message.index);
          void this._rerender();
        } else if (
          message.type === "switchViewAndHighlight" &&
          isViewType(message.viewType) &&
          isNodeId(message.nodeId)
        ) {
          this._viewType = message.viewType;
          this._drilldown = emptyDrilldownState();
          const highlightId = message.nodeId;
          void this._rerender()?.then(() => {
            this.highlight(highlightId);
          });
        } else if (message.type === "toggleIconMode") {
          this._displayMode = this._displayMode === "icon" ? "shape" : "icon";
          void this._rerender();
        } else if (message.type === "navigate" && isNodeId(message.nodeId)) {
          this._onNavigate(message.nodeId);
        } else if (message.type === "openExternal" && isAllowedExternalUrl(message.url)) {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
        }
      },
      null,
      this._disposables,
    );

    // Re-render when the editor color theme changes so the diagram's
    // light/dark variant stays in sync with the editor chrome (mirrors
    // how a `_displayMode` toggle triggers a re-render).
    vscode.window.onDidChangeActiveColorTheme(
      (colorTheme) => {
        const next = diagramThemeFromColorTheme(colorTheme.kind);
        if (next === this._theme) return;
        this._theme = next;
        void this._rerender();
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

  /**
   * Re-render the current document, if one has been set. Returns the render
   * promise so callers can chain post-render work (e.g. highlighting), or
   * `undefined` when there is no document to render.
   */
  private _rerender(): Promise<void> | undefined {
    if (this._currentDocument) {
      return this._render(this._currentDocument);
    }
    return undefined;
  }

  private async _render(document: vscode.TextDocument): Promise<void> {
    let svg: string;
    try {
      const viewPathOpts =
        this._viewType === "org" || this._viewType === "system"
          ? { viewPath: this._drilldown.viewPath }
          : {};
      const result = await compileProject(document.uri.fsPath, new VsCodeFileSystemProvider(), {
        diagramType: this._viewType,
        displayMode: this._displayMode,
        theme: this._theme,
        ...viewPathOpts,
      });
      svg = result.svg;
      this._lastNodeMetadata = result.diagramType !== "org" ? result.nodeMetadata : undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60">
        <text x="10" y="30" fill="#f44" font-family="monospace" font-size="13">Error: ${escapeHtml(msg)}</text>
      </svg>`;
    }
    this._panel.webview.html = this._buildHtml(svg, this._lastNodeMetadata);
  }

  private _buildHtml(svg: string, nodeMetadata?: Map<string, NodeMetadata>): string {
    const breadcrumbHtml = buildBreadcrumbHtml(this._drilldown.viewLabels);

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
          // Filter disallowed-scheme links host-side (#1525) using core's
          // canonical allowlist, so an unsafe URL never reaches the webview
          // string at all. The webview can't import core (serialized IIFE), so
          // doing it here keeps a single source of truth instead of a second,
          // drift-prone regex inside the webview.
          links: meta.links.filter((l) => isSafeLinkUrl(l.url)),
          team: meta.team,
          teamLabel: meta.teamLabel,
          role: meta.role,
          runtime: meta.runtime,
          type: meta.type,
          image: meta.image,
          schedule: meta.schedule,
          realizes: meta.realizes,
          tags: meta.tags,
          hasDeployContainer: meta.hasDeployContainer,
          resources: meta.resources?.map((r) => ({ storageKind: r.storageKind, name: r.name })),
          capabilities: meta.capabilities?.map((c) => ({
            name: c.name,
            label: c.label,
            description: c.description,
          })),
          migrationIntent: meta.migrationIntent
            ? {
                until: meta.migrationIntent.until
                  ? { kind: meta.migrationIntent.until.kind, raw: meta.migrationIntent.until.raw }
                  : undefined,
                from: meta.migrationIntent.from,
              }
            : undefined,
        };
      }
    }
    const metadataJson = JSON.stringify(metadataMap);

    return buildPreviewHtml({
      svg,
      metadataJson,
      breadcrumbHtml,
      viewType: this._viewType,
      displayMode: this._displayMode,
      nonce: generateNonce(),
      // Labels match the app's NodeDetailPanel under any locale; resolved
      // once at panel creation (see _panelLabels) since the display language
      // is fixed for the panel's lifetime (#2074).
      labels: this._panelLabels,
    });
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
