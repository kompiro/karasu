import { useCallback, useMemo, useState, type ReactNode, type RefObject } from "react";
import { format, FormatError } from "@karasu-tools/core";
import { SnapshotManager } from "../fs/snapshot-manager.js";
import { EditArea } from "./EditArea.js";
import { PreviewColumn } from "./PreviewColumn.js";
import { downloadSvg } from "../utils/download-svg.js";
import { downloadDrawio } from "../utils/download-drawio.js";
import { useAppContext } from "../state/app-context.js";
import { PreviewProvider, type PreviewContextValue } from "../state/preview-context.js";
import { useAppViews } from "../hooks/useAppViews.js";
import { useSnapshotAutoCapture } from "../hooks/useSnapshotAutoCapture.js";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs.js";
import { useJumpToEditor } from "../hooks/useJumpToEditor.js";
import { useCrossNavigation } from "../hooks/useCrossNavigation.js";
import { useViewSvg } from "../hooks/useViewSvg.js";
import { useStyleSource } from "../hooks/useStyleSource.js";
import { DiffModeBanner } from "./DiffModeBanner.js";

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
  /**
   * When set, the diff banner renders a "View pasted" button that invokes
   * this callback to re-display the pasted blob (Issue #739).
   */
  onViewPasted?: () => void;
  /**
   * Restores the open file when the URL hash changes (browser back/forward
   * or initial deep-link). ProjectMode passes `selectFile`; modes without
   * per-file navigation (Serve/Memory) omit this. Issue #811.
   */
  onFileChange?: (path: string) => Promise<void> | void;
}

/**
 * AppShell — shared layout and logic for all app modes.
 *
 * View compilation, navigation, breadcrumbs, editor-jump, and cross-view
 * navigation live in dedicated hooks (`useAppViews`, `useBreadcrumbs`,
 * `useJumpToEditor`, `useCrossNavigation`). AppShell is a thin orchestrator
 * that wires them to `PreviewColumn` and `EditArea`.
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
  onViewPasted,
  onFileChange,
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
    compareSource,
    diffSwapped,
  } = state;

  const projectRoot = currentProject?.rootPath ?? null;
  const snapshotManager = useMemo(
    () => (projectRoot ? new SnapshotManager(fs, projectRoot) : null),
    [fs, projectRoot],
  );

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
    compareSource,
    snapshotManager,
    projectRoot,
    swapped: diffSwapped,
    onFileChange,
  });
  const { recompile, navigateViewPath, navigateActiveView } = views;

  useSnapshotAutoCapture(snapshotManager, projectRoot, currentFilePath, fileContent);

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

  const toggleAllLayers = useCallback(() => setIsAllLayersOpen((v) => !v), []);
  const togglePreviewFocus = useCallback(() => setPreviewFocused((v) => !v), []);
  const toggleOrgTreeView = useCallback(() => setIsOrgTreeViewOpen((v) => !v), []);

  const previewContextValue = useMemo<PreviewContextValue>(
    () => ({
      activeView,
      hasDeployDiagram: views.system.hasDeployDiagram,
      onActiveViewChange: navigateActiveView,
      systemView: {
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
        nodeDiff: views.system.nodeDiff,
      },
      deployView: {
        svg: views.deploy.svg,
        diagnostics: views.deploy.diagnostics,
        warnings: views.deploy.warnings,
        highlightedNodeId,
        onClearHighlight: nav.clearHighlight,
        onContainerClick: nav.handleContainerClick,
      },
      orgView: {
        svg: views.org.svg,
        diagnostics: views.org.diagnostics,
        viewPath,
        breadcrumbItems: orgBreadcrumbItems,
        warnings: views.org.warnings,
        onBreadcrumbNavigate: navigateViewPath,
        highlightedNodeId,
        onClearHighlight: nav.clearHighlight,
        onOwnedServiceClick: nav.handleOwnedServiceClick,
      },
      nodeMetadata,
      deployBlocks: views.deploy.deployBlocks,
      selectedDeployBlockId,
      onDeployBlockChange: nav.handleDeployBlockChange,
      displayMode,
      onDisplayModeChange: nav.handleDisplayModeChange,
      onExportSvg: downloadSvg,
      onExportDrawio: entryPath
        ? (filename: string) => downloadDrawio(entryPath, fs, filename)
        : undefined,
      isAllLayersOpen,
      onAllLayersToggle: toggleAllLayers,
      drillDownSvg,
      allLayersSvg,
      orgAllLayersSvg,
      orgDrillDownSvg,
      allViewsSvg,
      previewFocused,
      onPreviewFocusToggle: togglePreviewFocus,
      onJumpToEditor: !hideEditor ? handleJumpToEditor : undefined,
      isOrgTreeViewOpen,
      onOrgTreeViewToggle: toggleOrgTreeView,
      orgTreeSvg: views.org.orgTreeSvg,
      onTeamToggle: views.org.toggleTeamExpand,
      orgTreeExportSvg: views.org.orgTreeExportSvg,
    }),
    [
      activeView,
      navigateActiveView,
      navigateViewPath,
      views.system.hasDeployDiagram,
      views.system.svg,
      views.system.diagnostics,
      views.system.warnings,
      views.system.nodeDiff,
      views.deploy.svg,
      views.deploy.diagnostics,
      views.deploy.warnings,
      views.deploy.deployBlocks,
      views.org.svg,
      views.org.diagnostics,
      views.org.warnings,
      views.org.orgTreeSvg,
      views.org.toggleTeamExpand,
      views.org.orgTreeExportSvg,
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
      hideEditor,
      handleJumpToEditor,
      isOrgTreeViewOpen,
      toggleOrgTreeView,
      entryPath,
      fs,
    ],
  );

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
      <PreviewProvider value={previewContextValue}>
        {compareSource && (
          <DiffModeBanner
            source={compareSource}
            snapshotManager={snapshotManager}
            currentPath={currentFilePath}
            swapped={diffSwapped}
            onExit={() => dispatch({ type: "SET_COMPARE_SOURCE", source: null })}
            onSwap={() => dispatch({ type: "TOGGLE_DIFF_SWAPPED" })}
            onViewPasted={onViewPasted}
          />
        )}
        <PreviewColumn />
      </PreviewProvider>
    </div>
  );
}
