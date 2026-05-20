import { useEffect, useState } from "react";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { ReferencePanel } from "./ReferencePanel.js";
import { CrudMatrixPanel } from "./CrudMatrixPanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";
import { usePreview } from "../state/preview-context.js";
import { useTranslation } from "../i18n/index.js";
import { useCommand } from "../keyboard/use-command.js";
import { Button } from "@/components/ui/button";

const EXPORT_ERROR_AUTO_DISMISS_MS = 6000;

export function PreviewColumn() {
  const {
    activeView,
    onActiveViewChange,
    systemView,
    deployView,
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
    allLayersSvg,
    orgAllLayersSvg,
    drillDownSvg,
    orgDrillDownSvg,
    allViewsSvg,
    previewFocused,
    onPreviewFocusToggle,
    onJumpToEditor,
    isOrgTreeViewOpen,
    onOrgTreeViewToggle,
    orgTreeSvg,
    onTeamToggle,
    orgTreeExportSvg,
    onExportDrawio,
    styleTargetPath,
    onPickEdgeDirection,
  } = usePreview();

  const { t } = useTranslation();
  const [refOpen, setRefOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Register "Toggle Reference" as a command so the References panel is
  // reachable from the command palette. Palette-only — no dedicated
  // keybinding. No-ops when no CommandProvider is mounted (e.g. in
  // isolated unit tests).
  useCommand({
    id: "view.toggleReference",
    title: "Toggle Reference",
    run: () => setRefOpen((open) => !open),
  });

  useEffect(() => {
    if (!exportError) return undefined;
    const id = window.setTimeout(() => setExportError(null), EXPORT_ERROR_AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [exportError]);

  const svg =
    activeView === "system"
      ? systemView.svg
      : activeView === "deploy"
        ? deployView.svg
        : orgView.svg;
  const diagnostics =
    activeView === "system"
      ? systemView.diagnostics
      : activeView === "deploy"
        ? deployView.diagnostics
        : orgView.diagnostics;
  const viewPath =
    activeView === "system" ? systemView.viewPath : activeView === "org" ? orgView.viewPath : [];
  const onDrillDown =
    activeView === "system"
      ? systemView.onBreadcrumbNavigate
      : activeView === "org"
        ? orgView.onBreadcrumbNavigate
        : undefined;

  const exportFilename = buildSvgExportFilename(activeView, {
    breadcrumbItems:
      activeView === "system"
        ? systemView.breadcrumbItems
        : activeView === "org"
          ? orgView.breadcrumbItems
          : [],
    deployBlocks,
    selectedDeployBlockId,
  });

  const activeAllLayersSvg =
    activeView === "system" ? allLayersSvg : activeView === "org" ? orgAllLayersSvg : undefined;
  const allLayersAvailable = activeView !== "deploy" && !!activeAllLayersSvg;
  const activedrillDownSvg =
    activeView === "system" ? drillDownSvg : activeView === "org" ? orgDrillDownSvg : undefined;
  const drillDownAvailable =
    (activeView === "system" || activeView === "org") && !!activedrillDownSvg;
  const showAllLayersIframe = isAllLayersOpen && allLayersAvailable;
  const showOrgTreeView = activeView === "org" && isOrgTreeViewOpen;

  // `handleExport` picks the tree-view SVG or the all-layers SVG over `svg`
  // when those modes are active; keep the button's disabled state aligned
  // with what the click handler would actually export.
  const exportAvailable = showOrgTreeView
    ? !!orgTreeExportSvg
    : showAllLayersIframe
      ? !!activeAllLayersSvg
      : !!svg;

  function handleExport() {
    if (showOrgTreeView && orgTreeExportSvg) {
      onExportSvg(orgTreeExportSvg, exportFilename.replace(/\.svg$/, "-tree.svg"));
    } else if (showAllLayersIframe && activeAllLayersSvg) {
      onExportSvg(activeAllLayersSvg, exportFilename.replace(/\.svg$/, "-all-layers.svg"));
    } else {
      onExportSvg(svg, exportFilename);
    }
  }

  function handleExportDrillDown() {
    if (activedrillDownSvg) {
      onExportSvg(activedrillDownSvg, exportFilename.replace(/\.svg$/, "-drilldown.svg"));
    }
    setExportMenuOpen(false);
  }

  function handleExportAllDiagrams() {
    if (allViewsSvg) {
      onExportSvg(allViewsSvg, "all-diagrams.svg");
    }
    setExportMenuOpen(false);
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
    setExportMenuOpen(false);
  }

  function handleOpenAllViews() {
    if (!allViewsSvg) return;
    const blob = new Blob([allViewsSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
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
          <Button
            variant="actionable"
            className="rounded-l-none px-1.5"
            aria-pressed={exportMenuOpen}
            onClick={() => setExportMenuOpen((v) => !v)}
            aria-label={t("preview.export.options.ariaLabel")}
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            disabled={!exportAvailable}
          >
            ▾
          </Button>
          {exportMenuOpen && (
            <div className="export-menu" role="menu" onMouseLeave={() => setExportMenuOpen(false)}>
              <button
                role="menuitem"
                className="export-menu-item"
                onClick={handleExportDrillDown}
                disabled={!drillDownAvailable}
              >
                {t("preview.export.drillDown.label")}
              </button>
              <button
                role="menuitem"
                className="export-menu-item"
                onClick={handleExportAllDiagrams}
                disabled={!allViewsSvg}
              >
                {t("preview.export.allDiagrams.label")}
              </button>
              <button
                role="menuitem"
                className="export-menu-item"
                onClick={handleExportDrawio}
                disabled={!onExportDrawio}
                title={t("preview.export.drawio.title")}
              >
                {t("preview.export.drawio.label")}
              </button>
            </div>
          )}
        </div>

        <Button variant="actionable" onClick={() => setRefOpen(true)} aria-label="Open reference">
          ? Reference
        </Button>

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
      <ReferencePanel isOpen={refOpen} onClose={() => setRefOpen(false)} activeView={activeView} />
      {activeView === "system" && !showAllLayersIframe && (
        <BreadcrumbBar
          items={systemView.breadcrumbItems}
          onNavigate={systemView.onBreadcrumbNavigate}
        />
      )}
      {activeView === "org" && !showOrgTreeView && (
        <BreadcrumbBar items={orgView.breadcrumbItems} onNavigate={orgView.onBreadcrumbNavigate} />
      )}
      {showOrgTreeView ? (
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
          onDrillDown={activeView !== "deploy" ? onDrillDown : undefined}
          onContainerClick={activeView === "deploy" ? deployView.onContainerClick : undefined}
          onDeployButtonClick={activeView === "system" ? systemView.onDeployButtonClick : undefined}
          onTeamButtonClick={activeView === "system" ? systemView.onTeamButtonClick : undefined}
          onOwnedServiceClick={activeView === "org" ? orgView.onOwnedServiceClick : undefined}
          highlightedNodeId={
            activeView === "deploy"
              ? deployView.highlightedNodeId
              : activeView === "org"
                ? orgView.highlightedNodeId
                : systemView.highlightedNodeId
          }
          onClearHighlight={
            activeView === "deploy"
              ? deployView.onClearHighlight
              : activeView === "org"
                ? orgView.onClearHighlight
                : systemView.onClearHighlight
          }
          onJumpToEditor={onJumpToEditor}
          nodeDiff={activeView === "system" ? systemView.nodeDiff : undefined}
          styleTargetPath={activeView === "system" ? styleTargetPath : undefined}
          onPickEdgeDirection={activeView === "system" ? onPickEdgeDirection : undefined}
        />
      )}
      <WarningPanel
        warnings={
          activeView === "org"
            ? orgView.warnings
            : activeView === "deploy"
              ? deployView.warnings
              : systemView.warnings
        }
      />
    </div>
  );
}
