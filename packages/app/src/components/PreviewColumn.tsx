import { useState } from "react";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { ReferencePanel } from "./ReferencePanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";
import { usePreview } from "../state/preview-context.js";

export function PreviewColumn() {
  const {
    activeView,
    hasDeployDiagram,
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
  } = usePreview();

  const [refOpen, setRefOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

  function handleOpenAllViews() {
    if (!allViewsSvg) return;
    const blob = new Blob([allViewsSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <div className="preview-column">
      <DiagramTabBar
        active={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onChange={onActiveViewChange}
        deployBlocks={deployBlocks}
        selectedDeployBlockId={selectedDeployBlockId}
        onDeployBlockChange={onDeployBlockChange}
      />
      <div className="preview-toolbar">
        <button
          className={`toolbar-btn toolbar-btn--actionable toolbar-btn--icon-mode${displayMode === "icon" ? " active" : ""}`}
          onClick={() => onDisplayModeChange(displayMode === "icon" ? "shape" : "icon")}
          aria-label="Toggle icon mode"
        >
          ◇ Icon Mode
        </button>
        {activeView === "org" && (
          <button
            className={`toolbar-btn toolbar-btn--actionable toolbar-btn--org-tree${isOrgTreeViewOpen ? " active" : ""}`}
            onClick={onOrgTreeViewToggle}
            aria-label="Toggle org tree view"
          >
            ⬡ Tree View
          </button>
        )}
        <button
          className={`toolbar-btn toolbar-btn--actionable toolbar-btn--all-layers${isAllLayersOpen ? " active" : ""}`}
          onClick={onAllLayersToggle}
          aria-label="Toggle all layers"
          disabled={!allLayersAvailable}
        >
          ⊞ Show All Layers
        </button>
        <button
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--all-views"
          onClick={handleOpenAllViews}
          aria-label="Open all views in new window"
          disabled={!allViewsSvg}
        >
          ⊟ Open All Views
        </button>

        {/* Split export button: left = export current/full, right = drill-down export */}
        <div className="toolbar-btn-group">
          <button
            className="toolbar-btn toolbar-btn--actionable toolbar-btn--export toolbar-btn--export-main"
            onClick={handleExport}
            aria-label="Export SVG"
            disabled={!exportAvailable}
          >
            ↓ Export SVG
          </button>
          <button
            className={`toolbar-btn toolbar-btn--actionable toolbar-btn--export toolbar-btn--export-toggle${exportMenuOpen ? " active" : ""}`}
            onClick={() => setExportMenuOpen((v) => !v)}
            aria-label="SVG export options"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            disabled={!exportAvailable}
          >
            ▾
          </button>
          {exportMenuOpen && (
            <div className="export-menu" role="menu" onMouseLeave={() => setExportMenuOpen(false)}>
              <button
                role="menuitem"
                className="export-menu-item"
                onClick={handleExportDrillDown}
                disabled={!drillDownAvailable}
              >
                Export Drill-down SVG
              </button>
              <button
                role="menuitem"
                className="export-menu-item"
                onClick={handleExportAllDiagrams}
                disabled={!allViewsSvg}
              >
                Export All Diagrams SVG
              </button>
            </div>
          )}
        </div>

        <button
          className="toolbar-btn toolbar-btn--actionable toolbar-btn--reference"
          onClick={() => setRefOpen(true)}
          aria-label="Open reference"
        >
          ? Reference
        </button>

        <button
          className={`toolbar-btn toolbar-btn--actionable toolbar-btn--focus${previewFocused ? " active" : ""}`}
          onClick={onPreviewFocusToggle}
          aria-label={previewFocused ? "Exit focus mode" : "Enter focus mode"}
        >
          {previewFocused ? "↙ Exit Focus" : "↗ Focus"}
        </button>
      </div>
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
