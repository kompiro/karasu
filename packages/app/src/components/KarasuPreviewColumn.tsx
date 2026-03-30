import { useState } from "react";
import type {
  Diagnostic,
  NodeMetadata,
  Warning,
  OrgViewPath,
  DeployBlockInfo,
  DisplayMode,
} from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { ReferencePanel } from "./ReferencePanel.js";
import { buildSvgExportFilename } from "../utils/build-svg-export-filename.js";

export type ExportViewMode = "current" | "full" | "drilldown";

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
  orgPath: OrgViewPath;
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
  onDrillDown: (path: string[]) => void;

  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;

  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onExportSvg: (svg: string, filename: string) => void;

  /** Current export/view mode for the system diagram */
  exportViewMode: ExportViewMode;
  onExportViewModeChange: (mode: ExportViewMode) => void;
  /** Multi-level SVG for full view mode (all levels stacked) */
  fullViewSvg?: string;
  /** Multi-level SVG for drill-down mode (CSS :target navigation) */
  drillDownSvg?: string;
}

export function KarasuPreviewColumn({
  activeView,
  hasDeployDiagram,
  onActiveViewChange,
  systemView,
  deployView,
  orgView,
  nodeMetadata,
  onDrillDown,
  deployBlocks,
  selectedDeployBlockId,
  onDeployBlockChange,
  displayMode,
  onDisplayModeChange,
  onExportSvg,
  exportViewMode,
  onExportViewModeChange,
  fullViewSvg,
  drillDownSvg,
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
    activeView === "system" ? systemView.viewPath : activeView === "org" ? orgView.orgPath : [];

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

  // Export view modes are only relevant on the system tab
  const multiLevelAvailable = activeView === "system";

  function handleExport() {
    if (multiLevelAvailable && exportViewMode === "full" && fullViewSvg) {
      onExportSvg(fullViewSvg, exportFilename.replace(/\.svg$/, "-fullview.svg"));
    } else if (multiLevelAvailable && exportViewMode === "drilldown" && drillDownSvg) {
      onExportSvg(drillDownSvg, exportFilename.replace(/\.svg$/, "-drilldown.svg"));
    } else {
      onExportSvg(svg, exportFilename);
    }
  }

  function selectExportMode(mode: ExportViewMode) {
    onExportViewModeChange(mode);
    setExportMenuOpen(false);
  }

  // Resolve the preview content
  const showFullViewIframe = multiLevelAvailable && exportViewMode === "full" && !!fullViewSvg;
  const showDrillDownIframe =
    multiLevelAvailable && exportViewMode === "drilldown" && !!drillDownSvg;

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
          className={`toolbar-btn toolbar-btn--icon-mode${displayMode === "icon" ? " active" : ""}`}
          onClick={() => onDisplayModeChange(displayMode === "icon" ? "shape" : "icon")}
          aria-label="Toggle icon mode"
        >
          ◇ Icon Mode
        </button>

        {/* Split export button */}
        <div className="toolbar-btn-group">
          <button
            className="toolbar-btn toolbar-btn--export toolbar-btn--export-main"
            onClick={handleExport}
            aria-label="Export SVG"
            disabled={!svg}
          >
            ↓ Export SVG
          </button>
          <button
            className={`toolbar-btn toolbar-btn--export toolbar-btn--export-toggle${exportMenuOpen ? " active" : ""}`}
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
                className={`export-menu-item${exportViewMode === "current" ? " active" : ""}`}
                onClick={() => selectExportMode("current")}
              >
                Current view only
              </button>
              <button
                role="menuitem"
                className={`export-menu-item${exportViewMode === "full" ? " active" : ""}`}
                onClick={() => selectExportMode("full")}
                disabled={!multiLevelAvailable || !fullViewSvg}
              >
                Full view
              </button>
              <button
                role="menuitem"
                className={`export-menu-item${exportViewMode === "drilldown" ? " active" : ""}`}
                onClick={() => selectExportMode("drilldown")}
                disabled={!multiLevelAvailable || !drillDownSvg}
              >
                Drill-down view
              </button>
            </div>
          )}
        </div>

        <button
          className="toolbar-btn toolbar-btn--reference"
          onClick={() => setRefOpen(true)}
          aria-label="Open reference"
        >
          ? Reference
        </button>
      </div>
      <ReferencePanel isOpen={refOpen} onClose={() => setRefOpen(false)} activeView={activeView} />
      {activeView === "system" && !showFullViewIframe && !showDrillDownIframe && (
        <BreadcrumbBar
          items={systemView.breadcrumbItems}
          onNavigate={systemView.onBreadcrumbNavigate}
        />
      )}
      {activeView === "org" && (
        <BreadcrumbBar items={orgView.breadcrumbItems} onNavigate={orgView.onBreadcrumbNavigate} />
      )}
      {showFullViewIframe ? (
        <iframe
          srcDoc={fullViewSvg}
          sandbox="allow-same-origin"
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Full diagram view"
        />
      ) : showDrillDownIframe ? (
        <iframe
          srcDoc={drillDownSvg}
          sandbox="allow-same-origin"
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Drill-down diagram view"
        />
      ) : (
        <PreviewPane
          svg={svg}
          diagnostics={diagnostics}
          viewPath={viewPath}
          nodeMetadata={nodeMetadata}
          onDrillDown={activeView !== "deploy" ? onDrillDown : () => {}}
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
