import { useState } from "react";
import type { Diagnostic, NodeMetadata, Warning, OrgViewPath } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";
import { DiagramTabBar } from "./DiagramTabBar.js";
import { BreadcrumbBar } from "./BreadcrumbBar.js";
import { PreviewPane } from "./PreviewPane.js";
import { WarningPanel } from "./WarningPanel.js";
import { ReferencePanel } from "./ReferencePanel.js";

interface SystemViewProps {
  svg: string;
  diagnostics: Diagnostic[];
  viewPath: string[];
  breadcrumbItems: { id: string; label: string }[];
  warnings: Warning[];
  onBreadcrumbNavigate: (path: string[]) => void;
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
}: KarasuPreviewColumnProps) {
  const [refOpen, setRefOpen] = useState(false);

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

  return (
    <div className="preview-column">
      <DiagramTabBar
        active={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onChange={onActiveViewChange}
      />
      <div className="preview-toolbar">
        <button
          className="toolbar-btn"
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
      <PreviewPane
        svg={svg}
        diagnostics={diagnostics}
        viewPath={viewPath}
        nodeMetadata={nodeMetadata}
        onDrillDown={activeView !== "deploy" ? onDrillDown : () => {}}
        onContainerClick={activeView === "deploy" ? deployView.onContainerClick : undefined}
        highlightedNodeId={activeView === "deploy" ? deployView.highlightedNodeId : undefined}
        onClearHighlight={activeView === "deploy" ? deployView.onClearHighlight : undefined}
      />
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
