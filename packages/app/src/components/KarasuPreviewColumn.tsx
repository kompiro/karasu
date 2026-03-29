import { useState, useEffect } from "react";
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
import { downloadSvg } from "../utils/download-svg.js";
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
  drillViewSvg: string;

  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;

  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
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
  drillViewSvg,
  deployBlocks,
  selectedDeployBlockId,
  onDeployBlockChange,
  displayMode,
  onDisplayModeChange,
}: KarasuPreviewColumnProps) {
  const [refOpen, setRefOpen] = useState(false);
  const [isDrillView, setIsDrillView] = useState(false);

  // Reset full view mode when switching away from system tab
  useEffect(() => {
    if (activeView !== "system") setIsDrillView(false);
  }, [activeView]);

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

  const exportFilename = (drillView: boolean) =>
    buildSvgExportFilename(activeView, {
      breadcrumbItems:
        activeView === "system"
          ? systemView.breadcrumbItems
          : activeView === "org"
            ? orgView.breadcrumbItems
            : [],
      deployBlocks,
      selectedDeployBlockId,
      isFullView: drillView,
    });

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
        {activeView === "system" && (
          <button
            className={`toolbar-btn${displayMode === "icon" ? " active" : ""}`}
            onClick={() => onDisplayModeChange(displayMode === "icon" ? "shape" : "icon")}
            aria-label="Toggle icon mode"
          >
            ◇ Icon Mode
          </button>
        )}
        <button
          className={`toolbar-btn toolbar-btn--drilldown${isDrillView ? " toolbar-btn--active" : ""}`}
          onClick={() => setIsDrillView((v) => !v)}
          aria-label="Toggle drill-down view"
          aria-pressed={isDrillView}
          disabled={!drillViewSvg || activeView !== "system"}
        >
          ⊞ Drill-down View
        </button>
        <button
          className="toolbar-btn toolbar-btn--export"
          onClick={() =>
            isDrillView
              ? downloadSvg(drillViewSvg, exportFilename(true))
              : downloadSvg(svg, exportFilename(false))
          }
          aria-label="Export SVG"
          disabled={!(isDrillView ? drillViewSvg : svg)}
        >
          ↓ Export SVG
        </button>
        <button
          className="toolbar-btn toolbar-btn--reference"
          onClick={() => setRefOpen(true)}
          aria-label="Open reference"
        >
          ? Reference
        </button>
      </div>
      <ReferencePanel isOpen={refOpen} onClose={() => setRefOpen(false)} activeView={activeView} />
      {activeView === "system" && (
        <BreadcrumbBar
          items={systemView.breadcrumbItems}
          onNavigate={systemView.onBreadcrumbNavigate}
        />
      )}
      {activeView === "org" && (
        <BreadcrumbBar items={orgView.breadcrumbItems} onNavigate={orgView.onBreadcrumbNavigate} />
      )}
      {isDrillView ? (
        <iframe
          srcDoc={drillViewSvg}
          sandbox="allow-same-origin"
          style={{ width: "100%", flex: 1, border: "none", minHeight: 0 }}
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
