import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useEditorWidth } from "../hooks/useEditorWidth.js";
import { SnapshotManager } from "../fs/snapshot-manager.js";
import { EditArea } from "./EditArea.js";
import { EditPane } from "./EditPane.js";
import { OutlineView } from "./OutlineView.js";
import { PreviewColumn } from "./PreviewColumn.js";
import { downloadSvg } from "../utils/download-svg.js";
import { downloadDrawio } from "../utils/download-drawio.js";
import { useAppContext } from "../state/app-context.js";
import { PreviewProvider } from "../state/preview-context.js";
import { useAppViews } from "../hooks/useAppViews.js";
import { useSnapshotAutoCapture } from "../hooks/useSnapshotAutoCapture.js";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs.js";
import { useJumpToEditor } from "../hooks/useJumpToEditor.js";
import { useCrossNavigation } from "../hooks/useCrossNavigation.js";
import { useViewSvg } from "../hooks/useViewSvg.js";
import { useTheme } from "../theme/index.js";
import { useStyleSource } from "../hooks/useStyleSource.js";
import { useEditorDocument } from "../hooks/useEditorDocument.js";
import { useEdgeDirectionWriter } from "../hooks/useEdgeDirectionWriter.js";
import { useOutline } from "../hooks/useOutline.js";
import { usePreviewContextValue } from "../hooks/usePreviewContextValue.js";
import { DiffModeBanner } from "./DiffModeBanner.js";
import { DiagramViewShortcuts } from "./DiagramViewShortcuts.js";
import { PreviewFocusShortcut } from "./PreviewFocusShortcut.js";

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
 * `useJumpToEditor`, `useCrossNavigation`). The editor document lifecycle,
 * GUI edge-direction writes, the outline, and the preview-context assembly are
 * likewise extracted (`useEditorDocument`, `useEdgeDirectionWriter`,
 * `useOutline`, `usePreviewContextValue` — #1541). AppShell is a thin
 * orchestrator that wires them to `PreviewColumn` and `EditArea`.
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

  // The SVG diagram follows the app's effective theme so the rendered
  // diagram matches the chrome (ADR-20260520-06 left SVG out of scope;
  // Issue #1479 closes that gap). `effectiveTheme` is the concrete
  // light/dark — `ThemeProvider` has already resolved `"system"`.
  const { effectiveTheme } = useTheme();

  const views = useAppViews({
    entryPath,
    fs,
    viewPath,
    activeView,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    theme: effectiveTheme,
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

  const outline = useOutline({
    activeView,
    deployTree: views.deploy.deployTree,
    organizations: views.org.organizations,
    resolvedSystems: views.system.resolvedSystems,
    systemNodeMetadata: views.system.nodeMetadata,
    orgPathIndex: views.orgPathIndex,
    dispatch,
    navigateViewPath,
  });

  const { handleEditorChange, handleFormat, handleTidyStyle, isStyleFile } = useEditorDocument({
    fs,
    currentFilePath,
    fileContent,
    dispatch,
    recompile,
  });

  const hasParseErrors = views.system.diagnostics.some((d) => d.severity === "error");

  const styleSource = useStyleSource(fileContent, currentFilePath ?? undefined, fs);

  const { onPickEdgeDirection, styleTargetPath } = useEdgeDirectionWriter({
    fs,
    currentFilePath,
    fileContent,
    handleEditorChange,
    recompile,
  });

  const { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg, allViewsSvg } = useViewSvg(
    fileContent,
    displayMode,
    styleSource,
    effectiveTheme,
  );

  const hasSidebar = !!(sidebarHeaderContent || sidebarContent);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const editorResize = useEditorWidth(shellRef);
  const showEditorResizeHandle = !hideEditor && !previewFocused;
  const hasExplicitEditorWidth = editorResize.editorWidth != null && !previewFocused && !hideEditor;
  const className = hideEditor
    ? "app serve-mode"
    : [
        "app-shell",
        hasSidebar ? "has-sidebar" : "",
        previewFocused ? "preview-focused" : "",
        hasExplicitEditorWidth ? "has-editor-width" : "",
        editorResize.isDragging ? "editor-dragging" : "",
      ]
        .filter(Boolean)
        .join(" ");
  const shellStyle: CSSProperties | undefined = hasExplicitEditorWidth
    ? ({ "--editor-w": `${editorResize.editorWidth}px` } as CSSProperties)
    : undefined;

  const toggleAllLayers = useCallback(() => setIsAllLayersOpen((v) => !v), []);
  const togglePreviewFocus = useCallback(() => setPreviewFocused((v) => !v), []);
  const toggleOrgTreeView = useCallback(() => setIsOrgTreeViewOpen((v) => !v), []);

  // Stable identity so it doesn't bust the preview-context memo every render
  // (the original kept this inside the memo, keyed on entryPath/fs).
  const onExportDrawio = useMemo(
    () => (entryPath ? (filename: string) => downloadDrawio(entryPath, fs, filename) : undefined),
    [entryPath, fs],
  );

  const previewContextValue = usePreviewContextValue({
    activeView,
    viewPath,
    selectedDeployBlockId,
    displayMode,
    highlightedNodeId,
    nodeMetadata,
    system: {
      svg: views.system.svg,
      diagnostics: views.system.diagnostics,
      warnings: views.system.warnings,
      hasDeployDiagram: views.system.hasDeployDiagram,
      nodeDiff: views.system.nodeDiff,
      resolvedSystems: views.system.resolvedSystems,
    },
    deploy: {
      svg: views.deploy.svg,
      diagnostics: views.deploy.diagnostics,
      warnings: views.deploy.warnings,
      deployBlocks: views.deploy.deployBlocks,
    },
    org: {
      svg: views.org.svg,
      diagnostics: views.org.diagnostics,
      warnings: views.org.warnings,
      orgTreeSvg: views.org.orgTreeSvg,
      orgTreeExportSvg: views.org.orgTreeExportSvg,
      toggleTeamExpand: views.org.toggleTeamExpand,
    },
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
    onJumpToEditor: !hideEditor ? handleJumpToEditor : undefined,
    isOrgTreeViewOpen,
    toggleOrgTreeView,
    styleTargetPath,
    onPickEdgeDirection,
    onExportSvg: downloadSvg,
    onExportDrawio,
  });

  return (
    <div className={className} style={shellStyle} ref={shellRef}>
      {sidebarHeaderContent}
      {showEditorResizeHandle && (
        <div
          className="editor-preview-handle"
          onMouseDown={editorResize.onMouseDown}
          onDoubleClick={editorResize.onDoubleClick}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize editor and preview"
        />
      )}
      {!hideEditor && (
        <EditArea
          sidebarContent={sidebarContent}
          outlineContent={
            sidebarContent ? (
              <OutlineView
                nodes={outline.nodes}
                highlightedNodeId={highlightedNodeId}
                onSelectNode={outline.onSelectNode}
                onActivateNode={outline.onActivateNode}
              />
            ) : undefined
          }
          previewFocused={previewFocused}
          editorContent={
            <EditPane
              value={fileContent}
              currentFilePath={currentFilePath}
              onChange={handleEditorChange}
              onEditorReady={handleEditorReady}
              scopeLabel={scopeLabel}
              viewPath={viewPath}
              currentProjectId={currentProject?.id ?? null}
              resolvedSystems={views.system.resolvedSystems}
              organizations={views.org.organizations}
              ownerIndex={views.org.ownerIndex}
              onNavigateViewPath={navigateViewPath}
              onFormat={isStyleFile ? undefined : handleFormat}
              onTidyStyle={isStyleFile ? handleTidyStyle : undefined}
              hasParseErrors={hasParseErrors}
            />
          }
        />
      )}
      <DiagramViewShortcuts onActiveViewChange={navigateActiveView} />
      <PreviewFocusShortcut onToggle={togglePreviewFocus} />
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
