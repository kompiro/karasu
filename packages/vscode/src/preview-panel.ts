import * as vscode from "vscode";
import {
  compileProject,
  isSafeLinkUrl,
  type DiagramTheme,
  type NodeMetadata,
  parseNodePathRefId,
} from "@karasu-tools/core";
import { bindTranslate, resolveLocaleTag } from "@karasu-tools/i18n";
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
  isOptionalNodePath,
} from "./message-validation.js";
import { diagramThemeFromColorTheme } from "./theme-mapping.js";
import { VsCodeFileSystemProvider } from "./vscode-fs-provider.js";
import { buildPreviewHtml, generateNonce } from "./webview-content.js";
import { buildPreviewPanelLabels } from "./webview-i18n.js";
import { gateRender, type LastValidRender } from "./render-gate.js";

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
  private readonly _panelLabels = buildPreviewPanelLabels(resolveLocaleTag(vscode.env.language));
  private _viewType: ViewType = "system";
  private _displayMode: "icon" | "shape" = "shape";
  private _theme: DiagramTheme = diagramThemeFromColorTheme(vscode.window.activeColorTheme.kind);
  private _drilldown: DrilldownState = emptyDrilldownState();
  private _lastNodeMetadata: Map<string, NodeMetadata> | undefined;
  /** The same metadata keyed by a card's `data-node-path` (#2917); system view only. */
  private _lastNodeMetadataByPath: Map<string, NodeMetadata> | undefined;
  private _currentDocument: vscode.TextDocument | undefined;
  private _lastValid: LastValidRender<RenderedPreview> | undefined;
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
        nodePath?: unknown;
      }) => {
        // The webview is a trust boundary: messages it posts are tainted and
        // must be validated here before acting on them. See message-validation.ts.
        // Path/label arithmetic lives in drilldown-state.ts (unit-tested).
        if (message.type === "switchView" && isViewType(message.viewType)) {
          this._viewType = message.viewType;
          this._drilldown = emptyDrilldownState();
          void this._rerender();
        } else if (
          message.type === "drillDown" &&
          isNodeId(message.nodeId) &&
          isOptionalNodePath(message.nodePath)
        ) {
          // The card's own path names one node where the bare id may name two
          // (#2917): read its metadata by path and drill to that path.
          const byPath =
            message.nodePath !== undefined
              ? this._lastNodeMetadataByPath?.get(message.nodePath)
              : undefined;
          // NodeMetadata satisfies DrilldownNodeMeta structurally; the
          // annotation records the subset the transition actually reads.
          const meta: DrilldownNodeMeta | undefined =
            byPath ?? this._lastNodeMetadata?.get(message.nodeId);
          const nodePath =
            message.nodePath !== undefined ? parseNodePathRefId(message.nodePath) : undefined;
          this._drilldown = drillDown(this._drilldown, message.nodeId, meta, nodePath);
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
          // A cross-view hand-over carries a node id; the deploy view marks
          // that node on the container realizing it (#2818).
          const attribute =
            message.viewType === "deploy" ? "data-realized-node-id" : "data-node-id";
          void this._rerender()?.then(() => {
            this.highlight(highlightId, attribute);
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

  /**
   * Light the element that stands for `nodeId`. `attribute` names the id
   * space the caller hands over (#2818): cursor tracking follows the source
   * file's own ids on `data-node-id`; a jump into the deploy view hands over a
   * node id, which the deploy view marks on the realizing container as
   * `data-realized-node-id`.
   */
  highlight(
    nodeId: string | null,
    attribute: "data-node-id" | "data-realized-node-id" = "data-node-id",
  ): void {
    void this._panel.webview.postMessage({ type: "highlight", nodeId, attribute });
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
    const viewPathOpts =
      this._viewType === "org" || this._viewType === "system"
        ? { viewPath: this._drilldown.viewPath }
        : {};
    const key = [
      document.uri.toString(),
      this._viewType,
      this._displayMode,
      this._theme,
      ...(viewPathOpts.viewPath ?? []),
    ].join("\u0001");
    let rendered: RenderedPreview;
    try {
      const result = await compileProject(document.uri.fsPath, new VsCodeFileSystemProvider(), {
        diagramType: this._viewType,
        displayMode: this._displayMode,
        theme: this._theme,
        // The webview routes `data-info-button` to the detail panel (see
        // webview-content.ts), so it asks for the buttons (#2420). It has no
        // category-collapse handling, which is why `interactive` stays off.
        // A click on the D is not routed either: it falls through to the node
        // handler, which opens the panel carrying "Open Deploy View" — the
        // behaviour this preview already had before the buttons were gated.
        nodeControls: true,
        ...viewPathOpts,
      });
      // Core returns an SVG of whatever it recovered even when an error stands.
      // Drawing it would show a model karasu does not accept (#2677), so the
      // gate keeps the last valid picture or says the drawing is blocked.
      const decision = gateRender({
        key,
        value: {
          svg: result.svg,
          nodeMetadata: result.diagramType !== "org" ? result.nodeMetadata : undefined,
          nodeMetadataByPath:
            result.diagramType === "system" ? result.nodeMetadataByPath : undefined,
        },
        errorCount: result.diagnostics.filter((d) => d.severity === "error").length,
        lastValid: this._lastValid,
      });
      if (decision.kind === "draw") this._lastValid = decision.remember;
      rendered =
        decision.kind === "blocked"
          ? { svg: messageSvg(this._blockedMessage(decision.errorCount), "#d19a00") }
          : decision.value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rendered = { svg: messageSvg(`Error: ${msg}`, "#f44") };
    }
    this._lastNodeMetadata = rendered.nodeMetadata;
    this._lastNodeMetadataByPath = rendered.nodeMetadataByPath;
    this._panel.webview.html = this._buildHtml(
      rendered.svg,
      this._lastNodeMetadata,
      this._lastNodeMetadataByPath,
    );
  }

  private _blockedMessage(count: number): string {
    return bindTranslate(resolveLocaleTag(vscode.env.language))("vscodePreview.blockedByErrors", {
      count,
    });
  }

  private _buildHtml(
    svg: string,
    nodeMetadata?: Map<string, NodeMetadata>,
    nodeMetadataByPath?: Map<string, NodeMetadata>,
  ): string {
    const breadcrumbHtml = buildBreadcrumbHtml(this._drilldown.viewLabels);

    // Serialize full node metadata for the webview, with pre-rendered description HTML.
    const serialize = (meta: NodeMetadata): SerializedNodeMeta => ({
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
    });
    const metadataMap: Record<string, SerializedNodeMeta> = {};
    if (nodeMetadata) {
      for (const [id, meta] of nodeMetadata) metadataMap[id] = serialize(meta);
    }
    // Keyed by `data-node-path` (#2917): a second object rather than extra keys
    // in the first, because a quoted dotted id (`"Shop.Api"`) and a two-segment
    // path (`Shop.Api`) can spell the same string.
    const metadataByPathMap: Record<string, SerializedNodeMeta> = {};
    if (nodeMetadataByPath) {
      for (const [path, meta] of nodeMetadataByPath) metadataByPathMap[path] = serialize(meta);
    }
    const metadataJson = JSON.stringify(metadataMap);
    const metadataByPathJson = JSON.stringify(metadataByPathMap);

    return buildPreviewHtml({
      svg,
      metadataJson,
      metadataByPathJson,
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

interface RenderedPreview {
  svg: string;
  nodeMetadata?: Map<string, NodeMetadata>;
  nodeMetadataByPath?: Map<string, NodeMetadata>;
}

function messageSvg(text: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="60">
        <text x="10" y="30" fill="${color}" font-family="monospace" font-size="13">${escapeHtml(text)}</text>
      </svg>`;
}
