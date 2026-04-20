import { createContext, useContext, type ReactNode } from "react";
import type {
  Diagnostic,
  NodeMetadata,
  Warning,
  DeployBlockInfo,
  DisplayMode,
} from "@karasu-tools/core";
import type { ActiveView } from "./app-reducer.js";

export interface SystemViewData {
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
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
}

export interface DeployViewData {
  svg: string;
  diagnostics: Diagnostic[];
  warnings: Warning[];
  highlightedNodeId?: string | null;
  onClearHighlight?: () => void;
  onContainerClick?: (containerId: string) => void;
}

export interface OrgViewData {
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

export interface PreviewContextValue {
  activeView: ActiveView;
  hasDeployDiagram: boolean;
  onActiveViewChange: (view: ActiveView) => void;

  systemView: SystemViewData;
  deployView: DeployViewData;
  orgView: OrgViewData;

  nodeMetadata: Map<string, NodeMetadata>;

  deployBlocks?: DeployBlockInfo[];
  selectedDeployBlockId?: string | null;
  onDeployBlockChange?: (id: string) => void;

  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onExportSvg: (svg: string, filename: string) => void;

  isAllLayersOpen: boolean;
  onAllLayersToggle: () => void;
  /** SVG with all system levels stacked vertically (Show All Layers on system tab) */
  allLayersSvg?: string;
  /** SVG with all org levels stacked vertically (Show All Layers on org tab) */
  orgAllLayersSvg?: string;
  /** SVG with CSS :target navigation for system drill-down export */
  drillDownSvg?: string;
  /** SVG with CSS :target navigation for org drill-down export */
  orgDrillDownSvg?: string;
  /** Bundled SVG with all views (system/deploy/org) and CSS-only tab navigation */
  allViewsSvg?: string;

  previewFocused: boolean;
  onPreviewFocusToggle: () => void;
  /** Called when user clicks "Jump to editor" in the detail panel */
  onJumpToEditor?: (nodeId: string) => void;

  isOrgTreeViewOpen: boolean;
  onOrgTreeViewToggle: () => void;
  /** Rendered SVG for the current Org Tree expand state */
  orgTreeSvg?: string;
  /** Called when a team node is clicked in the tree view */
  onTeamToggle?: (teamId: string) => void;
  /** Fully-expanded org tree SVG for export */
  orgTreeExportSvg?: string;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

/**
 * Provides the view state + handlers consumed by `PreviewColumn` and its
 * children. AppShell is the sole producer — mode apps don't need to touch it.
 */
export function PreviewProvider({
  value,
  children,
}: {
  value: PreviewContextValue;
  children: ReactNode;
}) {
  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

export function usePreview(): PreviewContextValue {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error("usePreview must be used within a PreviewProvider");
  }
  return ctx;
}
