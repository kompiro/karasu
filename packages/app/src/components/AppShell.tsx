import { useCallback, useState, type ReactNode, type RefObject } from "react";
import { format, FormatError } from "@karasu-tools/core";
import { EditArea } from "./EditArea.js";
import { KarasuPreviewColumn } from "./KarasuPreviewColumn.js";
import { downloadSvg } from "../utils/download-svg.js";
import { useAppContext } from "../state/app-context.js";
import { useAppViews } from "../hooks/useAppViews.js";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs.js";
import { useJumpToEditor } from "../hooks/useJumpToEditor.js";
import { useCrossNavigation } from "../hooks/useCrossNavigation.js";
import { useViewSvg } from "../hooks/useViewSvg.js";
import { useStyleSource } from "../hooks/useStyleSource.js";

interface AppShellProps {
  entryPath: string | null;
  /**
   * Sidebar content that is always visible — not affected by the collapse toggle.
   * Use for persistent controls like project selectors that should remain accessible
   * even when the sidebar is collapsed.
   */
  sidebarHeaderContent?: ReactNode;
  /** Sidebar content that collapses when the user clicks the Collapse button. */
  sidebarContent?: ReactNode;
  hideEditor?: boolean;
  recompileRef?: RefObject<(() => void) | null>;
}

/**
 * AppShell — shared layout and logic for all app modes.
 *
 * View compilation, navigation, breadcrumbs, editor-jump, and cross-view
 * navigation live in dedicated hooks (`useAppViews`, `useBreadcrumbs`,
 * `useJumpToEditor`, `useCrossNavigation`). AppShell is a thin orchestrator
 * that wires them to `KarasuPreviewColumn` and `EditArea`.
 *
 * Mode-specific concerns (initialization, project management, sidebar content)
 * are handled by the parent wrapper components.
 */
export function AppShell({
  entryPath,
  sidebarHeaderContent,
  sidebarContent,
  hideEditor,
  recompileRef,
}: AppShellProps) {
  const { state, dispatch, fs } = useAppContext();
  const {
    fileContent,
    viewPath,
    activeView,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    currentFilePath,
    currentProject,
  } = state;

  const [isAllLayersOpen, setIsAllLayersOpen] = useState(false);
  const [previewFocused, setPreviewFocused] = useState(false);
  const [isOrgTreeViewOpen, setIsOrgTreeViewOpen] = useState(false);

  const views = useAppViews({
    entryPath,
    fs,
    viewPath,
    activeView,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    currentFilePath,
    dispatch,
    isOrgTreeViewOpen,
    setIsOrgTreeViewOpen,
  });
  const { recompile, navigateViewPath, navigateActiveView } = views;

  // Expose recompile to parent via ref (used by ServeModeApp for SSE-driven updates)
  if (recompileRef) {
    recompileRef.current = recompile;
  }

  const { breadcrumbItems, orgBreadcrumbItems, scopeLabel } = useBreadcrumbs({
    resolvedSystems: views.system.resolvedSystems,
    organizations: views.org.organizations,
    viewPath,
    activeView,
    deployBlocks: views.deploy.deployBlocks,
    selectedDeployBlockId,
  });

  const { handleEditorReady, handleJumpToEditor } = useJumpToEditor({
    nodeFileIndex: views.system.nodeFileIndex,
    currentFilePath,
    fileContent,
    fs,
    dispatch,
  });

  const nav = useCrossNavigation({
    dispatch,
    teamPathIndex: views.teamPathIndex,
    orgNodePathIndex: views.org.nodePathIndex,
    navigateViewPath,
  });

  const nodeMetadata =
    activeView === "deploy" ? views.deploy.nodeMetadata : views.system.nodeMetadata;

  const handleEditorChange = useCallback(
    async (value: string) => {
      // eslint-disable-next-line no-console
      console.log("[AppShell] handleEditorChange", { currentFilePath, valueLength: value.length });
      dispatch({ type: "UPDATE_FILE_CONTENT", content: value });
      if (currentFilePath) {
        await fs.writeFile(currentFilePath, value);
        recompile();
      } else {
        // eslint-disable-next-line no-console
        console.warn(
          "[AppShell] handleEditorChange: currentFilePath is null — skipping writeFile and recompile",
        );
      }
    },
    [currentFilePath, fs, dispatch, recompile],
  );

  const hasParseErrors = views.system.diagnostics.some((d) => d.severity === "error");

  const handleFormat = useCallback(() => {
    if (!fileContent) return;
    let formatted: string;
    try {
      formatted = format(fileContent);
    } catch (e) {
      if (e instanceof FormatError) return;
      throw e;
    }
    if (formatted !== fileContent) {
      handleEditorChange(formatted);
    }
  }, [fileContent, handleEditorChange]);

  const styleSource = useStyleSource(fileContent, currentFilePath ?? undefined, fs);
  const { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg, allViewsSvg } = useViewSvg(
    fileContent,
    displayMode,
    styleSource,
  );

  const hasSidebar = !!(sidebarHeaderContent || sidebarContent);
  const className = hideEditor
    ? "app serve-mode"
    : ["app-shell", hasSidebar ? "has-sidebar" : "", previewFocused ? "preview-focused" : ""]
        .filter(Boolean)
        .join(" ");

  const systemViewProps = {
    svg: views.system.svg,
    diagnostics: views.system.diagnostics,
    viewPath,
    breadcrumbItems,
    warnings: views.system.warnings,
    onBreadcrumbNavigate: navigateViewPath,
    onDeployButtonClick: nav.handleDeployButtonClick,
    onTeamButtonClick: nav.handleTeamButtonClick,
    highlightedNodeId,
    onClearHighlight: nav.clearHighlight,
  };

  const deployViewProps = {
    svg: views.deploy.svg,
    diagnostics: views.deploy.diagnostics,
    warnings: views.deploy.warnings,
    highlightedNodeId,
    onClearHighlight: nav.clearHighlight,
    onContainerClick: nav.handleContainerClick,
  };

  const orgViewProps = {
    svg: views.org.svg,
    diagnostics: views.org.diagnostics,
    viewPath,
    breadcrumbItems: orgBreadcrumbItems,
    warnings: views.org.warnings,
    onBreadcrumbNavigate: navigateViewPath,
    highlightedNodeId,
    onClearHighlight: nav.clearHighlight,
    onOwnedServiceClick: nav.handleOwnedServiceClick,
  };

  return (
    <div className={className}>
      {sidebarHeaderContent}
      {!hideEditor && (
        <EditArea
          sidebarContent={sidebarContent}
          previewFocused={previewFocused}
          value={fileContent}
          currentFilePath={currentFilePath}
          onChange={handleEditorChange}
          onEditorReady={handleEditorReady}
          scopeLabel={scopeLabel}
          viewPath={viewPath}
          currentProjectId={currentProject?.id ?? null}
          resolvedSystems={views.system.resolvedSystems}
          onNavigateViewPath={navigateViewPath}
          onFormat={handleFormat}
          hasParseErrors={hasParseErrors}
        />
      )}
      <KarasuPreviewColumn
        activeView={activeView}
        hasDeployDiagram={views.system.hasDeployDiagram}
        onActiveViewChange={navigateActiveView}
        systemView={systemViewProps}
        deployView={deployViewProps}
        orgView={orgViewProps}
        nodeMetadata={nodeMetadata}
        deployBlocks={views.deploy.deployBlocks}
        selectedDeployBlockId={selectedDeployBlockId}
        onDeployBlockChange={nav.handleDeployBlockChange}
        displayMode={displayMode}
        onDisplayModeChange={nav.handleDisplayModeChange}
        onExportSvg={(svg, filename) => downloadSvg(svg, filename)}
        isAllLayersOpen={isAllLayersOpen}
        onAllLayersToggle={() => setIsAllLayersOpen((v) => !v)}
        drillDownSvg={drillDownSvg}
        allLayersSvg={allLayersSvg}
        orgAllLayersSvg={orgAllLayersSvg}
        orgDrillDownSvg={orgDrillDownSvg}
        allViewsSvg={allViewsSvg}
        previewFocused={previewFocused}
        onPreviewFocusToggle={() => setPreviewFocused((v) => !v)}
        onJumpToEditor={!hideEditor ? handleJumpToEditor : undefined}
        isOrgTreeViewOpen={isOrgTreeViewOpen}
        onOrgTreeViewToggle={() => setIsOrgTreeViewOpen((v) => !v)}
        orgTreeSvg={views.org.orgTreeSvg}
        onTeamToggle={views.org.toggleTeamExpand}
        orgTreeExportSvg={views.org.orgTreeExportSvg}
      />
    </div>
  );
}
