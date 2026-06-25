import { createContext, useContext, type ReactNode } from "react";
import type {
  Diagnostic,
  EdgeDirection,
  NodeMetadata,
  Warning,
  DeployBlockInfo,
  DisplayMode,
  NodeDiffMeta,
  SystemNode,
} from "@karasu-tools/core";
import type { ActiveView } from "./app-reducer.js";
import type { SharePayload } from "../utils/inline-share.js";

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
  /**
   * Per-node diff metadata when diff mode is active. Undefined outside
   * diff mode. Used by the detail panel to surface annotation diffs
   * (Issue #738 / design doc D-2).
   */
  nodeDiff?: Map<string, NodeDiffMeta>;
  /** Resolved system AST — used by the CRUD matrix view. */
  systems: SystemNode[];
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
  /**
   * Whether the active file has shareable source — drives the Share button's
   * enabled state. Kept as a boolean (not the source string) so it only flips
   * when crossing empty↔non-empty, never on every keystroke.
   */
  hasKrsSource?: boolean;
  /**
   * Flatten the current project into a self-contained share payload (a single
   * `.krs` + merged `.krs.style`) for an inline share URL (karasu-nest). Async
   * because multi-file projects are resolved from the filesystem. Stable
   * identity, so threading it through the preview memo doesn't re-render the
   * preview on every keystroke.
   */
  getShareBundle?: () => Promise<SharePayload>;
  /**
   * Export the current project as a draw.io (mxGraph XML) file. Absent when
   * the active shell has no project available (e.g. editor-only modes).
   */
  onExportDrawio?: (filename: string) => Promise<void>;

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

  /**
   * Path of the `.krs.style` file the GUI append writer should target,
   * resolved from the active project (typically the last `@import` in the
   * current `.krs`). `undefined` keeps the right-click → Direction menu
   * disabled with a hint.
   */
  styleTargetPath?: string;
  /**
   * Apply a GUI-driven edge `direction` override by appending an
   * `edge#<canonicalId> { direction: <value>; }` rule to the active
   * `.krs.style` file. `undefined` when the host shell does not support
   * GUI style writes.
   */
  onPickEdgeDirection?: (canonicalId: string, direction: EdgeDirection) => void;
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
