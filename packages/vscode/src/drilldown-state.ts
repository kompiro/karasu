/**
 * Pure state arithmetic for the preview panel's drill-down breadcrumb.
 *
 * The webview posts `drillDown` / `navigateTo` / `switchView` messages and the
 * extension host answers by updating a (path, labels) pair and re-rendering.
 * That arithmetic is extracted here — mirroring the `message-validation.ts`
 * split — so the transitions can be unit-tested without the extension host.
 *
 * Kept free of any `vscode` import. Note this module covers only the
 * host-side reducer math: how the webview *renders and reacts to* the
 * breadcrumb stays under the ExTester WebView harness per ADR-20260429-09
 * (see `.claude/rules/vscode-webview-tests.md`).
 */

/** The preview panel's drill-down position: path segments plus display labels. */
export interface DrilldownState {
  /** Drill-down path (node ids; may include the system ID prefix). */
  viewPath: string[];
  /** Breadcrumb labels for each path segment; same length as `viewPath`. */
  viewLabels: string[];
}

/**
 * Subset of core's `NodeMetadata` the drill-down transition reads. Declared
 * structurally so this module needs no runtime (or type) dependency on core.
 */
export interface DrilldownNodeMeta {
  /** Resolved display label for the node. */
  label: string;
  /**
   * Full drill-down path for the node (includes the system ID as its first
   * segment), when the node is in the metadata index.
   */
  viewPath?: string[];
}

/**
 * The root state: no drill-down. Also the result of a `switchView` /
 * `switchViewAndHighlight` message — switching views resets the path.
 */
export function emptyDrilldownState(): DrilldownState {
  return { viewPath: [], viewLabels: [] };
}

/**
 * Transition for a `drillDown` message: descend into `nodeId`.
 *
 * Uses `viewPath` from metadata (includes the system ID prefix) when
 * available, falling back to appending `nodeId` for nodes not in the index.
 * Labels use the raw id for intermediate path segments and the resolved
 * label for the last (only the clicked node's label is known here).
 */
export function drillDown(
  state: DrilldownState,
  nodeId: string,
  meta: DrilldownNodeMeta | undefined,
): DrilldownState {
  const lastLabel = meta?.label ?? nodeId;
  const viewPath = meta?.viewPath ?? [...state.viewPath, nodeId];
  const viewLabels = viewPath.map((id, i) => (i === viewPath.length - 1 ? lastLabel : id));
  return { viewPath, viewLabels };
}

/**
 * Transition for a `navigateTo` message: keep the first `index` segments
 * (`[0, index)`), so index 0 is the Root crumb and index `viewPath.length`
 * is a no-op. `index` must already be validated with `isValidNavIndex`.
 */
export function navigateTo(state: DrilldownState, index: number): DrilldownState {
  return {
    viewPath: state.viewPath.slice(0, index),
    viewLabels: state.viewLabels.slice(0, index),
  };
}

/**
 * Render the breadcrumb bar HTML for the given labels.
 *
 * - segments[0] = Root (navigateTo 0 → empty path)
 * - segments[i] = viewLabels[i-1] (navigateTo i → path of length i)
 * - Last segment is the current position — not clickable
 */
export function buildBreadcrumbHtml(viewLabels: readonly string[]): string {
  const labels = ["Root", ...viewLabels];
  return labels
    .map((label, i) => {
      const isLast = i === labels.length - 1;
      const sep = i > 0 ? `<span class="sep">›</span>` : "";
      if (isLast) {
        return `${sep}<button style="cursor:default;color:var(--vscode-editor-foreground);font-weight:bold;">${escapeHtml(label)}</button>`;
      }
      return `${sep}<button data-nav-index="${i}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

/** Escape `& < > "` for embedding text in the preview panel's HTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
