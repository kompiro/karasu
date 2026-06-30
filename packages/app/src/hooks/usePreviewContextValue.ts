import { useMemo } from "react";
import type {
  Diagnostic,
  Warning,
  DisplayMode,
  EdgeDirection,
  NodeMetadata,
  NodeDiffMeta,
  DeployBlockInfo,
  SystemNode,
  CategoryId,
} from "@karasu-tools/core";
import type { ActiveView } from "../state/app-reducer.js";
import type { PreviewContextValue } from "../state/preview-context.js";
import type { SharePayload } from "../utils/inline-share.js";
import type { UseCrossNavigationResult } from "./useCrossNavigation.js";

type BreadcrumbItems = { id: string; label: string }[];

interface UsePreviewContextValueArgs {
  activeView: ActiveView;
  viewPath: string[];
  selectedDeployBlockId: string | null;
  displayMode: DisplayMode;
  highlightedNodeId: string | null;
  nodeMetadata: Map<string, NodeMetadata>;

  system: {
    svg: string;
    diagnostics: Diagnostic[];
    warnings: Warning[];
    hasDeployDiagram: boolean;
    nodeDiff?: Map<string, NodeDiffMeta>;
    resolvedSystems: SystemNode[];
    toggleCategory: (category: CategoryId) => void;
  };
  deploy: {
    svg: string;
    diagnostics: Diagnostic[];
    warnings: Warning[];
    deployBlocks: DeployBlockInfo[];
  };
  org: {
    svg: string;
    diagnostics: Diagnostic[];
    warnings: Warning[];
    orgTreeSvg?: string;
    orgTreeExportSvg?: string;
    toggleTeamExpand: (teamId: string) => void;
  };

  breadcrumbItems: BreadcrumbItems;
  orgBreadcrumbItems: BreadcrumbItems;
  nav: UseCrossNavigationResult;
  navigateActiveView: (view: ActiveView) => void;
  navigateViewPath: (path: string[]) => void;

  isAllLayersOpen: boolean;
  toggleAllLayers: () => void;
  drillDownSvg?: string;
  allLayersSvg?: string;
  orgAllLayersSvg?: string;
  orgDrillDownSvg?: string;
  allViewsSvg?: string;

  previewFocused: boolean;
  togglePreviewFocus: () => void;
  /** Already gated by the host (undefined in editor-less modes). */
  onJumpToEditor?: (nodeId: string) => void;

  isOrgTreeViewOpen: boolean;
  toggleOrgTreeView: () => void;

  styleTargetPath?: string;
  onPickEdgeDirection?: (canonicalId: string, direction: EdgeDirection) => void;

  onExportSvg: (svg: string, filename: string) => void;
  /** Already built by the host (undefined when no project is available). */
  onExportDrawio?: (filename: string) => Promise<void>;
  /** Whether the active file has shareable source (Share button enabled state). */
  hasKrsSource?: boolean;
  /** Flattens the project into a share payload (PreviewColumn's Share button). */
  getShareBundle?: () => Promise<SharePayload>;
}

/**
 * Assembles the {@link PreviewContextValue} consumed by `PreviewColumn`. This
 * is the 35-property object with the wide dependency array that previously
 * dominated AppShell; isolating it here keeps AppShell to layout wiring (#1541).
 */
export function usePreviewContextValue(args: UsePreviewContextValueArgs): PreviewContextValue {
  const {
    activeView,
    viewPath,
    selectedDeployBlockId,
    displayMode,
    highlightedNodeId,
    nodeMetadata,
    system,
    deploy,
    org,
    breadcrumbItems,
    orgBreadcrumbItems,
    nav,
    navigateActiveView,
    navigateViewPath,
    isAllLayersOpen,
    toggleAllLayers,
    drillDownSvg,
    allLayersSvg,
    orgAllLayersSvg,
    orgDrillDownSvg,
    allViewsSvg,
    previewFocused,
    togglePreviewFocus,
    onJumpToEditor,
    isOrgTreeViewOpen,
    toggleOrgTreeView,
    styleTargetPath,
    onPickEdgeDirection,
    onExportSvg,
    onExportDrawio,
    hasKrsSource,
    getShareBundle,
  } = args;

  return useMemo<PreviewContextValue>(
    () => ({
      activeView,
      hasDeployDiagram: system.hasDeployDiagram,
      onActiveViewChange: navigateActiveView,
      systemView: {
        svg: system.svg,
        diagnostics: system.diagnostics,
        viewPath,
        breadcrumbItems,
        warnings: system.warnings,
        onBreadcrumbNavigate: navigateViewPath,
        onDeployButtonClick: nav.handleDeployButtonClick,
        onTeamButtonClick: nav.handleTeamButtonClick,
        onCategoryToggle: system.toggleCategory,
        highlightedNodeId,
        onClearHighlight: nav.clearHighlight,
        nodeDiff: system.nodeDiff,
        systems: system.resolvedSystems,
      },
      deployView: {
        svg: deploy.svg,
        diagnostics: deploy.diagnostics,
        warnings: deploy.warnings,
        highlightedNodeId,
        onClearHighlight: nav.clearHighlight,
        onContainerClick: nav.handleContainerClick,
      },
      orgView: {
        svg: org.svg,
        diagnostics: org.diagnostics,
        viewPath,
        breadcrumbItems: orgBreadcrumbItems,
        warnings: org.warnings,
        onBreadcrumbNavigate: navigateViewPath,
        highlightedNodeId,
        onClearHighlight: nav.clearHighlight,
        onOwnedServiceClick: nav.handleOwnedServiceClick,
      },
      nodeMetadata,
      deployBlocks: deploy.deployBlocks,
      selectedDeployBlockId,
      onDeployBlockChange: nav.handleDeployBlockChange,
      displayMode,
      onDisplayModeChange: nav.handleDisplayModeChange,
      onExportSvg,
      onExportDrawio,
      isAllLayersOpen,
      onAllLayersToggle: toggleAllLayers,
      drillDownSvg,
      allLayersSvg,
      orgAllLayersSvg,
      orgDrillDownSvg,
      allViewsSvg,
      previewFocused,
      onPreviewFocusToggle: togglePreviewFocus,
      onJumpToEditor,
      isOrgTreeViewOpen,
      onOrgTreeViewToggle: toggleOrgTreeView,
      orgTreeSvg: org.orgTreeSvg,
      onTeamToggle: org.toggleTeamExpand,
      orgTreeExportSvg: org.orgTreeExportSvg,
      styleTargetPath,
      onPickEdgeDirection,
      hasKrsSource,
      getShareBundle,
    }),
    [
      activeView,
      navigateActiveView,
      navigateViewPath,
      system.hasDeployDiagram,
      system.svg,
      system.diagnostics,
      system.warnings,
      system.nodeDiff,
      system.resolvedSystems,
      deploy.svg,
      deploy.diagnostics,
      deploy.warnings,
      deploy.deployBlocks,
      org.svg,
      org.diagnostics,
      org.warnings,
      org.orgTreeSvg,
      org.toggleTeamExpand,
      system.toggleCategory,
      org.orgTreeExportSvg,
      viewPath,
      breadcrumbItems,
      orgBreadcrumbItems,
      highlightedNodeId,
      nodeMetadata,
      selectedDeployBlockId,
      displayMode,
      nav,
      isAllLayersOpen,
      toggleAllLayers,
      drillDownSvg,
      allLayersSvg,
      orgAllLayersSvg,
      orgDrillDownSvg,
      allViewsSvg,
      previewFocused,
      togglePreviewFocus,
      onJumpToEditor,
      isOrgTreeViewOpen,
      toggleOrgTreeView,
      styleTargetPath,
      onPickEdgeDirection,
      onExportSvg,
      onExportDrawio,
      hasKrsSource,
      getShareBundle,
    ],
  );
}
