import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { NodeMetadata } from "@karasu-tools/core";
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

// Stable identity for "this pane has no node metadata" — an inline `new Map()`
// would be a fresh object on every render and break PreviewPane's memoized
// click handler.
const NO_NODE_METADATA: Map<string, NodeMetadata> = new Map();

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
    getAllViewsSvg,
    exportBundlesAvailable,
    onJumpToEditor,
    isOrgTreeViewOpen,
    orgTreeSvg,
    onTeamToggle,
    orgTreeExportSvg,
    isTeamDependenciesOpen,
    teamDependencySvg,
    hasTeamDependencyView,
    isEntityViewOpen,
    entityViewSvg,
    entityViewDiagnostics,
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
  // toolbar's height depends on locale and width, so it is measured and
  // published as `--preview-toolbar-bottom` — the toolbar's bottom edge,
  // measured from the top of `.preview-column`, which is the containing block
  // those surfaces position against.
  //
  // What is published is the *offset*, not the height, because the offset is
  // what every consumer needs. Publishing the height instead is what caused
  // #2492: read as an offset it left out the diagram tab bar above the toolbar,
  // and the facet overview panel started 28px inside the toolbar. One number
  // with one meaning leaves no such choice to make.
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const publish = () => {
      const bottom = toolbar.offsetTop + toolbar.getBoundingClientRect().height;
      toolbar.parentElement?.style.setProperty(
        "--preview-toolbar-bottom",
        `${Math.round(bottom)}px`,
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

  // The bundles are built on demand (#2758): availability is "there is settled
  // content to build from", not "a bundle exists". The All-layers SVG is the
  // one bundle kept while its panel is open, because it is the panel's content.
  const activeAllLayersSvg = view.allLayersSvg;
  const allLayersAvailable = activeView !== "deploy" && exportBundlesAvailable;
  const drillDownAvailable =
    (activeView === "system" || activeView === "org") && exportBundlesAvailable;
  const showAllLayersIframe = isAllLayersOpen && allLayersAvailable && !!activeAllLayersSvg;
  const showOrgTreeView = activeView === "org" && isOrgTreeViewOpen;
  // The org tab's third mode. Gated on the model declaring an organization for
  // the same reason the toggle is: with no team there is nothing to draw, and a
  // mode that renders a blank canvas reads as a bug rather than as an empty
  // model (ADR-766).
  const showTeamDependencies =
    activeView === "org" && isTeamDependenciesOpen && hasTeamDependencyView;
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
      : showTeamDependencies
        ? !!teamDependencySvg
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
    } else if (showTeamDependencies && teamDependencySvg) {
      onExportSvg(teamDependencySvg, exportFilename.replace(/\.svg$/, "-team-dependencies.svg"));
    } else if (showAllLayersIframe && activeAllLayersSvg) {
      onExportSvg(activeAllLayersSvg, exportFilename.replace(/\.svg$/, "-all-layers.svg"));
    } else {
      onExportSvg(svg, exportFilename);
    }
  }

  // The export menu is a shadcn DropdownMenu — Radix closes it on select, so
  // these handlers no longer manage open state.
  function handleExportDrillDown() {
    const drillDownSvg = view.getDrillDownSvg?.();
    if (drillDownSvg) {
      onExportSvg(drillDownSvg, exportFilename.replace(/\.svg$/, "-drilldown.svg"));
    }
  }

  function handleExportAllDiagrams() {
    const allViewsSvg = getAllViewsSvg?.();
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
    const allViewsSvg = getAllViewsSvg?.();
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
          allViewsAvailable={exportBundlesAvailable}
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
        {activeView === "org" && !showOrgTreeView && !showTeamDependencies && (
          <BreadcrumbBar
            items={orgView.breadcrumbItems}
            onNavigate={orgView.onBreadcrumbNavigate}
          />
        )}
        <PreviewViewControls onOpenFacetOverview={() => setFacetOverviewOpen(true)} />
      </div>
      {showEntityView ? (
        /* The entity sub-mode goes through `PreviewPane` like every other
           diagram (#2800). It used to inject its SVG into a bare
           `overflow: auto` div, which left it the one view with no
           `.preview-container` — so no fit-to-pane, and no zoom or pan
           (#2799). A domain's ER diagram is the surface where "show me the
           whole shape" matters most, and on a real model it is far wider than
           any pane (36,053px for Dify's IdentityAccess).

           `nodeMetadata` is deliberately empty rather than the system view's
           map: entities are filtered out of the system slice
           (`view-extract.ts`), so the map holds no entity — but a bare
           `resource X` promoted into the usecase view carries the *entity's*
           id, so passing it would answer a click on entity `X` with the
           resource's detail panel. */
        <PreviewPane
          className="preview-pane--entity"
          svg={entityViewSvg ?? ""}
          diagnostics={entityViewDiagnostics}
          nodeMetadata={NO_NODE_METADATA}
        />
      ) : showOrgTreeView ? (
        /* The org tab's two sub-modes follow the entity view onto `PreviewPane`
           (#2799). Both were bare `overflow: auto` divs, so neither could be
           fitted, zoomed or panned — the failure ADR-309 left open as "大規模
           組織での SVG サイズ上限": a wide org tree could only ever be read
           through a scrollbar.

           `diagnostics` is the org view's own: all three org modes are drawn
           from the same compiled report, so a parse error that dims the grid
           has to reach these panes too rather than leaving them silently
           stale.

           `nodeMetadata` is empty for the reason the entity pane's is — a team
           id and a system node id live in different id spaces, and the map is
           the system/org node index, so passing it could answer a click on
           team `X` with an unrelated node's detail panel. With it empty,
           `PreviewPane` opens no panel, which is what clicking a member-less
           team card did before.

           Each sub-mode is its own `PreviewPane` instance, so switching modes
           resets the zoom to 1. That is deliberate (#2799 point 2): the three
           diagrams have different coordinate systems and extents, and a scale
           and offset carried over from one lands the reader off-canvas in the
           next. */
        <PreviewPane
          className="preview-pane--org-tree"
          svg={orgTreeSvg ?? ""}
          diagnostics={diagnostics}
          nodeMetadata={NO_NODE_METADATA}
          onTeamToggle={onTeamToggle}
        />
      ) : showTeamDependencies ? (
        <PreviewPane
          className="preview-pane--team-dependencies"
          svg={teamDependencySvg ?? ""}
          diagnostics={diagnostics}
          nodeMetadata={NO_NODE_METADATA}
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
