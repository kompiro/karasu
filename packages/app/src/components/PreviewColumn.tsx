import { useEffect, useState } from "react";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { openReferenceWindow } from "../utils/open-reference-window.js";
import { CrudMatrixPanel } from "./CrudMatrixPanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";
import { usePreview, type GroupByMode } from "../state/preview-context.js";
import { useActiveViewData, type ActiveViewData } from "../state/active-view-data.js";
import { ShareDialog } from "./ShareDialog.js";
import { useShareDialog } from "../hooks/useShareDialog.js";
import { useTranslation } from "../i18n/index.js";
import type { TranslateFn } from "@karasu-tools/i18n";
import { useCommand } from "../keyboard/use-command.js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const EXPORT_ERROR_AUTO_DISMISS_MS = 6000;
// Unlike anchor downloads (which revoke at 0), the "Open All Views" blob must
// outlive the new tab's initial load, so we defer the revoke (#1529).
const ALL_VIEWS_BLOB_REVOKE_DELAY_MS = 10_000;

// The published documentation site (GitHub Pages). Reached from the Preview
// toolbar's "📖 Docs" dropdown, alongside the in-app Reference pop-out. Starlight
// serves the Japanese docs under the `/ja/` locale prefix, so the link follows
// the active app locale.
const DOCS_SITE_BASE_URL = "https://kompiro.github.io/karasu/";
const docsSiteUrl = (locale: string) =>
  locale === "ja" ? `${DOCS_SITE_BASE_URL}ja/` : DOCS_SITE_BASE_URL;

/** What the Group-by selector needs to know about one axis to offer it. */
interface GroupByAxisOption {
  /** Option label. Takes `t` so the key stays a checked literal at the call site. */
  label: (t: TranslateFn) => string;
  /** Data gate — the axis is offered only when the model carries it (#1822 P2b). */
  available: (view: ActiveViewData) => boolean;
}

/**
 * The axes the Group-by selector offers, keyed by `GroupByMode` minus the
 * always-present `"none"`. Insertion order is the option order.
 *
 * The `satisfies Record<…>` is the point of this table: adding a member to
 * `GroupByMode` without adding it here fails to typecheck, so a new axis cannot
 * ship while the selector silently keeps offering only the old ones — the
 * failure mode in TPL-20260510-03. This is the B3 defence ADR-2120 carried
 * forward (#2119); the axes are mutually exclusive by ADR-1974, so the selector
 * is the one permanent home for the choice.
 */
export const GROUP_BY_AXES = {
  team: {
    label: (t) => t("preview.groupBy.team"),
    available: (view) => view.hasTeamAxis === true,
  },
  boundary: {
    label: (t) => t("preview.groupBy.boundary"),
    available: (view) => view.hasBoundaryAxis === true,
  },
} satisfies Record<Exclude<GroupByMode, "none">, GroupByAxisOption>;

/**
 * `<select>` hands back a bare string. `"none"` plus {@link GROUP_BY_AXES}'
 * keys are exactly `GroupByMode`, so narrowing here replaces the unchecked
 * `as GroupByMode` cast the `onChange` handler used to carry.
 */
function isGroupByMode(value: string): value is GroupByMode {
  return value === "none" || value in GROUP_BY_AXES;
}

/**
 * The axes offered for this view — the table filtered by each axis' data gate.
 *
 * Both the option list and the selector's own visibility read this one result:
 * an empty list means no axis has data, so the control would be a no-op and is
 * not rendered (#1858). Deriving the visibility here is what makes the table
 * the *only* site a new axis has to touch — `useAppViews` previously carried a
 * hand-written `groupByAvailable: hasOrgDiagram || hasBoundaries`, which the
 * `satisfies` guard could not see and a fourth axis would have missed silently.
 */
function availableGroupByAxes(view: ActiveViewData) {
  return Object.entries(GROUP_BY_AXES).filter(([, axis]) => axis.available(view));
}

export function PreviewColumn() {
  const {
    activeView,
    onActiveViewChange,
    systemView,
    orgView,
    nodeMetadata,
    deployBlocks,
    selectedDeployBlockId,
    onDeployBlockChange,
    displayMode,
    onDisplayModeChange,
    onExportSvg,
    isAllLayersOpen,
    onAllLayersToggle,
    allViewsSvg,
    previewFocused,
    onPreviewFocusToggle,
    onJumpToEditor,
    isOrgTreeViewOpen,
    onOrgTreeViewToggle,
    orgTreeSvg,
    onTeamToggle,
    orgTreeExportSvg,
    isEntityViewOpen,
    onEntityViewToggle,
    entityViewSvg,
    hasEntityView,
    onExportDrawio,
    hasKrsSource,
    getShareBundle,
  } = usePreview();
  // Normalized active-view slice — collapses the per-view ternary chains (#1542).
  const view = useActiveViewData();
  const groupByAxes = availableGroupByAxes(view);

  const { t, locale } = useTranslation();
  const [exportError, setExportError] = useState<string | null>(null);

  const shareAvailable = !!hasKrsSource && !!getShareBundle;
  const { handleShare, shareDialogProps } = useShareDialog({
    activeView,
    viewPath: view.viewPath,
    highlightedNodeId: view.highlightedNodeId,
    isOrgTreeViewOpen,
    isEntityViewOpen,
    hasEntityView,
    getShareBundle,
  });

  // Register "Open Reference" as a command so the reference is reachable from
  // the command palette. Palette-only — no dedicated keybinding. No-ops when no
  // CommandProvider is mounted (e.g. in isolated unit tests). Opens a separate
  // window so it can stay open beside the editor (#1548).
  useCommand({
    id: "view.openReference",
    title: "Open Reference",
    run: () => openReferenceWindow(activeView),
  });

  useEffect(() => {
    if (!exportError) return undefined;
    const id = window.setTimeout(() => setExportError(null), EXPORT_ERROR_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [exportError]);

  const svg = view.svg;
  const diagnostics = view.diagnostics;
  const viewPath = view.viewPath;
  const onDrillDown = view.onBreadcrumbNavigate;

  const exportFilename = buildSvgExportFilename(activeView, {
    breadcrumbItems: view.breadcrumbItems,
    deployBlocks,
    selectedDeployBlockId,
  });

  const activeAllLayersSvg = view.allLayersSvg;
  const allLayersAvailable = activeView !== "deploy" && !!activeAllLayersSvg;
  const activedrillDownSvg = view.drillDownSvg;
  const drillDownAvailable =
    (activeView === "system" || activeView === "org") && !!activedrillDownSvg;
  const showAllLayersIframe = isAllLayersOpen && allLayersAvailable;
  const showOrgTreeView = activeView === "org" && isOrgTreeViewOpen;
  // Entity sub-mode: only while drilled into a domain that actually has an
  // entity view (mirrors org Tree View, but scoped to the system view).
  const showEntityView = activeView === "system" && isEntityViewOpen && hasEntityView;

  // `handleExport` picks the entity/tree-view SVG or the all-layers SVG over
  // `svg` when those modes are active; keep the button's disabled state aligned
  // with what the click handler would actually export.
  const exportAvailable = showEntityView
    ? !!entityViewSvg
    : showOrgTreeView
      ? !!orgTreeExportSvg
      : showAllLayersIframe
        ? !!activeAllLayersSvg
        : !!svg;

  function handleExport() {
    if (showEntityView && entityViewSvg) {
      onExportSvg(entityViewSvg, exportFilename.replace(/\.svg$/, "-entity.svg"));
      return;
    }
    if (showOrgTreeView && orgTreeExportSvg) {
      onExportSvg(orgTreeExportSvg, exportFilename.replace(/\.svg$/, "-tree.svg"));
    } else if (showAllLayersIframe && activeAllLayersSvg) {
      onExportSvg(activeAllLayersSvg, exportFilename.replace(/\.svg$/, "-all-layers.svg"));
    } else {
      onExportSvg(svg, exportFilename);
    }
  }

  // The export menu is a shadcn DropdownMenu — Radix closes it on select, so
  // these handlers no longer manage open state.
  function handleExportDrillDown() {
    if (activedrillDownSvg) {
      onExportSvg(activedrillDownSvg, exportFilename.replace(/\.svg$/, "-drilldown.svg"));
    }
  }

  function handleExportAllDiagrams() {
    if (allViewsSvg) {
      onExportSvg(allViewsSvg, "all-diagrams.svg");
    }
  }

  function handleExportDrawio() {
    if (!onExportDrawio) return;
    // Drawio export bundles every karasu view, so a single project-wide name
    // is clearer than the per-view SVG filename.
    const base = exportFilename.replace(/\.svg$/, "").replace(/^(system|deploy|org)-/, "");
    setExportError(null);
    onExportDrawio(`${base || "project"}.drawio`).catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      setExportError(t("preview.export.drawio.failed", { detail }));
    });
  }

  function handleOpenAllViews() {
    if (!allViewsSvg) return;
    const blob = new Blob([allViewsSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    // Revoke after a grace period so we don't pin a full multi-diagram SVG for
    // the tab's whole lifetime (#1529).
    setTimeout(() => URL.revokeObjectURL(url), ALL_VIEWS_BLOB_REVOKE_DELAY_MS);
  }

  if (activeView === "matrix") {
    return (
      <div className="preview-column">
        <DiagramTabBar
          active={activeView}
          onChange={onActiveViewChange}
          deployBlocks={deployBlocks}
          selectedDeployBlockId={selectedDeployBlockId}
          onDeployBlockChange={onDeployBlockChange}
        />
        <CrudMatrixPanel systems={systemView.systems} />
      </div>
    );
  }

  return (
    <div className="preview-column">
      <DiagramTabBar
        active={activeView}
        onChange={onActiveViewChange}
        deployBlocks={deployBlocks}
        selectedDeployBlockId={selectedDeployBlockId}
        onDeployBlockChange={onDeployBlockChange}
      />
      <div className="preview-toolbar">
        <Button
          variant="actionable"
          aria-pressed={displayMode === "icon"}
          onClick={() => onDisplayModeChange(displayMode === "icon" ? "shape" : "icon")}
          aria-label="Toggle icon mode"
        >
          ◇ Icon Mode
        </Button>
        {activeView === "system" && groupByAxes.length > 0 && (
          <span className="group-by-selector-label">
            <label htmlFor="group-by-select">{t("preview.groupBy.label")}</label>
            <select
              id="group-by-select"
              className="group-by-selector"
              value={view.groupBy ?? "none"}
              onChange={(e) => {
                if (isGroupByMode(e.target.value)) view.onGroupByChange?.(e.target.value);
              }}
            >
              <option value="none">{t("preview.groupBy.none")}</option>
              {groupByAxes.map(([mode, axis]) => (
                <option key={mode} value={mode}>
                  {axis.label(t)}
                </option>
              ))}
            </select>
          </span>
        )}
        {activeView === "system" && view.anyCollapsible && (
          <Button
            variant="actionable"
            aria-pressed={view.allCollapsed}
            onClick={() => view.onCollapseAllToggle?.()}
            aria-label={
              view.allCollapsed ? t("preview.groupBy.expandAll") : t("preview.groupBy.collapseAll")
            }
          >
            {view.allCollapsed
              ? `⊕ ${t("preview.groupBy.expandAll")}`
              : `⊖ ${t("preview.groupBy.collapseAll")}`}
          </Button>
        )}
        {activeView === "system" && view.expansionOverload && (
          <span
            role="status"
            className="preview-expansion-hint text-[11px] text-amber-500/90 self-center"
          >
            ⚠ {t("preview.expansion.overloadHint")}
          </span>
        )}
        {activeView === "org" && (
          <Button
            variant="actionable"
            aria-pressed={isOrgTreeViewOpen}
            onClick={onOrgTreeViewToggle}
            aria-label="Toggle org tree view"
          >
            ⬡ Tree View
          </Button>
        )}
        {activeView === "system" && hasEntityView && (
          <Button
            variant="actionable"
            aria-pressed={isEntityViewOpen}
            onClick={onEntityViewToggle}
            aria-label="Toggle entity view"
          >
            ◇ Entities
          </Button>
        )}
        <Button
          variant="actionable"
          aria-pressed={isAllLayersOpen}
          onClick={onAllLayersToggle}
          aria-label="Toggle all layers"
          disabled={!allLayersAvailable}
        >
          ⊞ Show All Layers
        </Button>
        <Button
          variant="actionable"
          onClick={handleOpenAllViews}
          aria-label="Open all views in new window"
          disabled={!allViewsSvg}
        >
          ⊟ Open All Views
        </Button>

        {/* Split export button: left = export current/full, right = drill-down export */}
        <div className="toolbar-btn-group">
          <Button
            variant="actionable"
            className="rounded-r-none border-r-0"
            onClick={handleExport}
            aria-label={t("preview.export.svg.ariaLabel")}
            disabled={!exportAvailable}
          >
            {t("preview.export.svg.label")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="actionable"
                className="rounded-l-none px-1.5"
                aria-label={t("preview.export.options.ariaLabel")}
                disabled={!exportAvailable}
              >
                ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleExportDrillDown} disabled={!drillDownAvailable}>
                {t("preview.export.drillDown.label")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleExportAllDiagrams} disabled={!allViewsSvg}>
                {t("preview.export.allDiagrams.label")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleExportDrawio}
                disabled={!onExportDrawio}
                title={t("preview.export.drawio.title")}
              >
                {t("preview.export.drawio.label")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          variant="actionable"
          onClick={handleShare}
          aria-label={t("preview.share.ariaLabel")}
          disabled={!shareAvailable}
        >
          {t("preview.share.label")}
        </Button>

        {/* Documentation links: the in-app Reference pop-out and the external
            docs site, grouped since both point at documentation. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="actionable" aria-label={t("preview.docs.ariaLabel")}>
              {t("preview.docs.label")} ▾
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openReferenceWindow(activeView)}>
              {t("preview.docs.reference.label")}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={docsSiteUrl(locale)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("preview.docs.site.ariaLabel")}
              >
                {t("preview.docs.site.label")}
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="actionable"
          aria-pressed={previewFocused}
          onClick={onPreviewFocusToggle}
          aria-label={previewFocused ? "Exit focus mode" : "Enter focus mode"}
        >
          {previewFocused ? "↙ Exit Focus" : "↗ Focus"}
        </Button>
      </div>
      {exportError && (
        <div className="export-error" role="alert">
          <span className="export-error-message">{exportError}</span>
          <Button
            className="export-error-dismiss"
            onClick={() => setExportError(null)}
            aria-label="Dismiss export error"
          >
            ✕ Dismiss
          </Button>
        </div>
      )}
      {activeView === "system" && !showAllLayersIframe && (
        <BreadcrumbBar
          items={systemView.breadcrumbItems}
          onNavigate={systemView.onBreadcrumbNavigate}
        />
      )}
      {activeView === "org" && !showOrgTreeView && (
        <BreadcrumbBar items={orgView.breadcrumbItems} onNavigate={orgView.onBreadcrumbNavigate} />
      )}
      {showEntityView ? (
        <div
          className="preview-pane preview-pane--entity"
          style={{ overflow: "auto", flex: 1 }}
          dangerouslySetInnerHTML={{ __html: entityViewSvg ?? "" }}
        />
      ) : showOrgTreeView ? (
        <div
          className="preview-pane preview-pane--org-tree"
          style={{ overflow: "auto", flex: 1 }}
          onClick={(e) => {
            const target = (e.target as Element).closest("[data-team-id]");
            const teamId = target?.getAttribute("data-team-id");
            if (teamId && onTeamToggle) onTeamToggle(teamId);
          }}
          dangerouslySetInnerHTML={{ __html: orgTreeSvg ?? "" }}
        />
      ) : showAllLayersIframe ? (
        <iframe
          srcDoc={activeAllLayersSvg}
          sandbox="allow-same-origin"
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Full diagram view"
        />
      ) : (
        <PreviewPane
          svg={svg}
          diagnostics={diagnostics}
          viewPath={viewPath}
          nodeMetadata={nodeMetadata}
          onDrillDown={onDrillDown}
          onContainerClick={view.onContainerClick}
          onDeployButtonClick={view.onDeployButtonClick}
          onTeamButtonClick={view.onTeamButtonClick}
          onCategoryToggle={view.onCategoryToggle}
          onGroupToggle={view.onGroupToggle}
          onExpandToggle={view.onExpandToggle}
          onOwnedServiceClick={view.onOwnedServiceClick}
          highlightedNodeId={view.highlightedNodeId}
          onClearHighlight={view.onClearHighlight}
          onJumpToEditor={onJumpToEditor}
          nodeDiff={view.nodeDiff}
          styleTargetPath={view.styleTargetPath}
          onPickEdgeDirection={view.onPickEdgeDirection}
        />
      )}
      <WarningPanel warnings={view.warnings} />
      <ShareDialog {...shareDialogProps} />
    </div>
  );
}
