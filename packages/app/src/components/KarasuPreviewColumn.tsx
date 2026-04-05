import { useState } from "react";
import type { Diagnostic, NodeMetadata, Warning, DeployBlockInfo, DisplayMode } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { ReferencePanel } from "./ReferencePanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";

interface SystemViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: string[]) => void;
  /** Called when user clicks the deploy button on a service node */
  onDeployButtonClick?: (serviceId: string) => void;
  /** Called when user clicks the team label on a service/domain node */
  onTeamButtonClick?: (teamId: string) => void;
}

interface DeployViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}

interface OrgViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: string[]) => void;
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  /** Called when user clicks an owned service link on a team node to cross-navigate to system view */
  onOwnedServiceClick?: (serviceId: string) => void;
}

interface KarasuPreviewColumnProps {
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  onActiveViewChange: (view: ActiveView) => void;

  systemView: SystemViewProps;
  deployView: DeployViewProps;
  orgView: OrgViewProps;

  nodeMetadata: Map<string, NodeMetadata>;

  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;

  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onExportSvg: (svg: string, filename: string) => void;

  /** Show All Layers toggle: show all levels stacked in an iframe */
  isAllLayersOpen: boolean;
  onAllLayersToggle: () => void;
  /** SVG with all system levels stacked vertically (for Show All Layers on system tab) */
  allLayersSvg?: string;
  /** SVG with all org levels stacked vertically (for Show All Layers on org tab) */
  orgAllLayersSvg?: string;
  /** SVG with CSS :target navigation for system drill-down export */
  drillDownSvg?: string;
  /** SVG with CSS :target navigation for org drill-down export */
  orgDrillDownSvg?: string;
  /** Bundled SVG with all views (system/deploy/org) and CSS-only tab navigation */
  allViewsSvg?: string;

  /** Whether the preview is in fullscreen focus mode */
  previewFocused: boolean;
  /** Toggle preview focus mode */
  onPreviewFocusToggle: () => void;
  /** Called when user clicks "Jump to editor" in the detail panel */
  onJumpToEditor?: (nodeId: string) => void;
}

export function KarasuPreviewColumn({
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
}: KarasuPreviewColumnProps) {
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

  function handleExport() {
    if (showAllLayersIframe && activeAllLayersSvg) {
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
            disabled={!svg}
          >
            ↓ Export SVG
          </button>
          <button
            className={`toolbar-btn toolbar-btn--actionable toolbar-btn--export toolbar-btn--export-toggle${exportMenuOpen ? " active" : ""}`}
            onClick={() => setExportMenuOpen((v) => !v)}
            aria-label="SVG export options"
            aria-haspopup="menu"
            aria-expanded={exportMenuOpen}
            disabled={!svg}
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
      {activeView === "org" && (
        <BreadcrumbBar items={orgView.breadcrumbItems} onNavigate={orgView.onBreadcrumbNavigate} />
      )}
      {showAllLayersIframe ? (
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
                : undefined
          }
          onClearHighlight={
            activeView === "deploy"
              ? deployView.onClearHighlight
              : activeView === "org"
                ? orgView.onClearHighlight
                : undefined
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
