import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { openReferenceWindow } from "../utils/open-reference-window.js";
import { CrudMatrixPanel } from "./CrudMatrixPanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";
import { usePreview } from "../state/preview-context.js";
import { useActiveViewData } from "../state/active-view-data.js";
import { ShareDialog } from "./ShareDialog.js";
import { useShareDialog } from "../hooks/useShareDialog.js";
import { useTranslation } from "../i18n/index.js";
import { useCommand } from "../keyboard/use-command.js";
import { Button } from "@/components/ui/button";
import { FacetOverviewPanel } from "./FacetOverviewPanel.js";
import { PreviewToolbar } from "./PreviewToolbar.js";
import { PreviewViewControls } from "./PreviewViewControls.js";

const EXPORT_ERROR_AUTO_DISMISS_MS = 6000;
// Unlike anchor downloads (which revoke at 0), the "Open All Views" blob must
// outlive the new tab's initial load, so we defer the revoke (#1529).
const ALL_VIEWS_BLOB_REVOKE_DELAY_MS = 10_000;

// The Group-by table moved to `preview-group-by.ts` with the selector itself
// (#2317). Re-exported here because this is the module the app's tests and the
// axis-addition guard (TPL-1094) have always reached for.
export { GROUP_BY_AXES } from "./preview-group-by.js";

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
    onExportSvg,
    isAllLayersOpen,
    allViewsSvg,
    onJumpToEditor,
    isOrgTreeViewOpen,
    orgTreeSvg,
    onTeamToggle,
    orgTreeExportSvg,
    isEntityViewOpen,
    entityViewSvg,
    hasEntityView,
    onExportDrawio,
    hasKrsSource,
    getShareBundle,
  } = usePreview();
  // Normalized active-view slice — collapses the per-view ternary chains (#1542).
  const view = useActiveViewData();

  const { t } = useTranslation();
  const [exportError, setExportError] = useState<string | null>(null);
  const [facetOverviewOpen, setFacetOverviewOpen] = useState(false);
  // Surfaces that float over the diagram cannot use a constant offset: the
  // toolbar's height depends on locale and width. Publish the measured height
  // and let CSS position against it.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const publish = () => {
      toolbar.parentElement?.style.setProperty(
        "--preview-toolbar-h",
        `${Math.round(toolbar.getBoundingClientRect().height)}px`,
      );
    };
    publish();
    // jsdom has no ResizeObserver. The one-shot publish above is enough there;
    // re-measuring on wrap is a browser-only concern.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

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
      <div className="preview-toolbar" ref={toolbarRef}>
        <PreviewToolbar
          exportAvailable={exportAvailable}
          drillDownAvailable={drillDownAvailable}
          allViewsAvailable={!!allViewsSvg}
          shareAvailable={shareAvailable}
          onExport={handleExport}
          onExportDrillDown={handleExportDrillDown}
          onExportAllDiagrams={handleExportAllDiagrams}
          onExportDrawio={handleExportDrawio}
          onOpenAllViews={handleOpenAllViews}
          onShare={handleShare}
        />
      </div>
      {facetOverviewOpen && (view.facetOverview?.length ?? 0) > 0 && (
        <FacetOverviewPanel
          facets={view.facetOverview ?? []}
          selectedFacets={view.selectedFacets ?? []}
          onFacetToggle={view.onFacetToggle}
          onClose={() => setFacetOverviewOpen(false)}
        />
      )}
      {exportError && (
        <div className="export-error" role="alert">
          <span className="export-error-message">{exportError}</span>
          <Button
            className="export-error-dismiss"
            onClick={() => setExportError(null)}
            aria-label={t("preview.exportError.dismiss.ariaLabel")}
          >
            ✕ {t("preview.exportError.dismiss.label")}
          </Button>
        </div>
      )}
      {/* The drill path and the controls that change the diagram share one
          row. Floating the controls over the diagram was the first cut; they
          then covered the top-left of the drawing and swallowed clicks meant
          for the node beneath them (TPL-948). This row already existed, and
          its right half was empty. */}
      <div className="preview-context-row">
        {activeView === "system" && !showAllLayersIframe && (
          <BreadcrumbBar
            items={systemView.breadcrumbItems}
            onNavigate={systemView.onBreadcrumbNavigate}
          />
        )}
        {activeView === "org" && !showOrgTreeView && (
          <BreadcrumbBar
            items={orgView.breadcrumbItems}
            onNavigate={orgView.onBreadcrumbNavigate}
          />
        )}
        <PreviewViewControls onOpenFacetOverview={() => setFacetOverviewOpen(true)} />
      </div>
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
