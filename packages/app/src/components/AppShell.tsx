import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { Parser } from "@karasu-tools/core";
import { EditorPane } from "./EditorPane.js";
import { KarasuPreviewColumn } from "./KarasuPreviewColumn.js";
import { downloadSvg } from "../utils/download-svg.js";
import { useAppContext } from "../state/app-context.js";
import { useSystemView } from "../hooks/useSystemView.js";
import { useDeployView } from "../hooks/useDeployView.js";
import { useOrgView } from "../hooks/useOrgView.js";
import { useViewSvg } from "../hooks/useViewSvg.js";
import { useStyleSource } from "../hooks/useStyleSource.js";
import { useHistoryNavigation } from "../hooks/useHistoryNavigation.js";

import type { ReactNode } from "react";
import type { KrsFile, KrsNode, TeamNode, OrgNode, DisplayMode } from "@karasu-tools/core";
import type { editor } from "monaco-editor";
import type { ActiveView } from "../state/app-reducer.js";
import type { BreadcrumbItem } from "./Breadcrumb.js";

interface AppShellProps {
  entryPath: string | null;
  sidebarContent?: ReactNode;
  hideEditor?: boolean;
  recompileRef?: RefObject<(() => void) | null>;
}

/**
 * AppShell — shared layout and logic for all app modes.
 *
 * Contains all view hooks, cross-navigation handlers, breadcrumb computation,
 * and the EditorPane + KarasuPreviewColumn assembly.
 *
 * Mode-specific concerns (initialization, project management, sidebar content)
 * are handled by the parent wrapper components.
 */
export function AppShell({ entryPath, sidebarContent, hideEditor, recompileRef }: AppShellProps) {
  const { state, dispatch, fs } = useAppContext();
  const {
    fileContent,
    viewPath,
    activeView,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    currentFilePath,
  } = state;

  const [isAllLayersOpen, setIsAllLayersOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [previewFocused, setPreviewFocused] = useState(false);

  // ── View hooks ──────────────────────────────────────────────────

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    recompile: recompileSystem,
  } = useSystemView(entryPath, fs, viewPath, displayMode);

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    deployBlocks,
    recompile: recompileDeploy,
  } = useDeployView(entryPath, fs, selectedDeployBlockId, displayMode);

  const {
    orgSvg,
    orgDiagnostics,
    orgWarnings,
    nodePathIndex,
    recompile: recompileOrg,
    toggleTeamExpand,
    orgTreeSvg,
    orgTreeExportSvg,
  } = useOrgView(entryPath, fs, viewPath, displayMode);

  const [isOrgTreeViewOpen, setIsOrgTreeViewOpen] = useState(false);

  const { navigateActiveView, navigateViewPath } = useHistoryNavigation({
    activeView,
    viewPath,
    currentFilePath,
    nodePathIndex,
    dispatch,
    isOrgTreeView: isOrgTreeViewOpen,
    setIsOrgTreeView: setIsOrgTreeViewOpen,
  });

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  // Expose recompile to parent via ref (used by ServeModeApp for SSE-driven updates)
  if (recompileRef) {
    recompileRef.current = recompile;
  }

  const nodeMetadata = activeView === "deploy" ? deployNodeMetadata : systemNodeMetadata;

  // ── Editor instance ref ─────────────────────────────────────────

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorReady = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInstance;
  }, []);

  // ── Editor handler ──────────────────────────────────────────────

  const handleEditorChange = useCallback(
    async (value: string) => {
      dispatch({ type: "UPDATE_FILE_CONTENT", content: value });
      if (currentFilePath) {
        await fs.writeFile(currentFilePath, value);
        recompile();
      }
    },
    [currentFilePath, fs, dispatch, recompile],
  );

  const handleJumpToEditor = useCallback(
    (nodeId: string) => {
      const ed = editorRef.current;
      if (!ed || !fileContent) return;
      let parseResult;
      try {
        parseResult = Parser.parse(fileContent);
      } catch {
        return;
      }
      const line = findNodeLine(parseResult.value, nodeId);
      if (line === null) return;
      // line is 0-based (LSP convention); Monaco is 1-based
      const monacoLine = line + 1;
      ed.setPosition({ lineNumber: monacoLine, column: 1 });
      ed.revealLineInCenter(monacoLine);
      ed.focus();
    },
    [fileContent],
  );

  // ── View & cross-navigation handlers ────────────────────────────

  const handleActiveViewChange = useCallback(
    (view: ActiveView) => {
      navigateActiveView(view);
    },
    [navigateActiveView],
  );

  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: containerId });
    },
    [dispatch],
  );

  const handleDeployButtonClick = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy", highlightNodeId: serviceId });
    },
    [dispatch],
  );

  const handleTeamButtonClick = useCallback(
    (teamId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org", highlightNodeId: teamId });
    },
    [dispatch],
  );

  const handleOwnedServiceClick = useCallback(
    (serviceId: string) => {
      const resolvedPath = nodePathIndex.get(serviceId);
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system", highlightNodeId: serviceId });
      if (resolvedPath !== undefined) {
        navigateViewPath(resolvedPath);
      }
    },
    [navigateViewPath, nodePathIndex, dispatch],
  );

  const handleDisplayModeChange = useCallback(
    (mode: DisplayMode) => {
      dispatch({ type: "SET_DISPLAY_MODE", displayMode: mode });
    },
    [dispatch],
  );

  const handleDeployBlockChange = useCallback(
    (id: string) => {
      dispatch({ type: "SET_SELECTED_DEPLOY_BLOCK", id });
    },
    [dispatch],
  );

  // ── Breadcrumbs ─────────────────────────────────────────────────

  const breadcrumbItems = useMemo(() => {
    if (!fileContent) return [];
    try {
      const parseResult = Parser.parse(fileContent);
      const systems = parseResult.value.systems;
      if (systems.length === 0) return [];

      if (viewPath.length === 0) {
        // Root view: show only the active system label (not clickable)
        const system = systems[0];
        return [{ id: system.id, label: system.label ?? system.id }];
      }

      // Phase 2: viewPath[0] is the system ID, viewPath[1:] is the navigation within it.
      // Build breadcrumb items with explicit navigatePath so that clicking each item
      // navigates to the correct Phase 2 path (including system ID prefix).
      const activeSystem = systems.find((s) => s.id === viewPath[0]) ?? systems[0];
      const items: BreadcrumbItem[] = [
        {
          id: activeSystem.id,
          label: activeSystem.label ?? activeSystem.id,
          navigatePath: [], // Clicking the system root goes back to root view
        },
      ];

      let current: KrsNode = activeSystem;
      for (let i = 1; i < viewPath.length; i++) {
        const child: KrsNode | undefined = current.children.find((c) => c.id === viewPath[i]);
        if (!child) break;
        items.push({
          id: child.id,
          label: child.label ?? child.id,
          navigatePath: viewPath.slice(0, i + 1),
        });
        current = child;
      }

      return items;
    } catch {
      return [];
    }
  }, [fileContent, viewPath]);

  const orgBreadcrumbItems = useMemo(() => {
    if (!fileContent) return [];
    try {
      const parseResult = Parser.parse(fileContent);
      const orgs = parseResult.value.organizations;
      if (orgs.length === 0) return [];

      const rootLabel = orgs[0].label ?? orgs[0].id;
      const items: { id: string; label: string }[] = [{ id: "__org__", label: rootLabel }];

      let teams = orgs.flatMap((o) => o.teams);
      for (const segment of viewPath) {
        const team = teams.find((t) => t.id === segment);
        if (!team) break;
        items.push({ id: team.id, label: team.label ?? team.id });
        teams = team.children.filter((c): c is TeamNode => c.kind === "team");
      }

      return items;
    } catch {
      return [];
    }
  }, [fileContent, viewPath]);

  // ── All-layers SVGs ─────────────────────────────────────────────

  const styleSource = useStyleSource(fileContent, currentFilePath ?? undefined, fs);
  const { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg, allViewsSvg } = useViewSvg(
    fileContent,
    displayMode,
    styleSource,
  );

  // ── Render ──────────────────────────────────────────────────────

  const className = hideEditor
    ? "app serve-mode"
    : [
        "app-shell",
        sidebarContent ? "has-sidebar" : "",
        sidebarCollapsed ? "sidebar-collapsed" : "",
        previewFocused ? "preview-focused" : "",
      ]
        .filter(Boolean)
        .join(" ");

  return (
    <div className={className}>
      {sidebarContent && !previewFocused && (
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? "» Expand" : "« Collapse"}
        </button>
      )}
      {sidebarContent}
      {!hideEditor && (
        <EditorPane
          value={fileContent}
          onChange={handleEditorChange}
          onEditorReady={handleEditorReady}
        />
      )}
      <KarasuPreviewColumn
        activeView={activeView}
        hasDeployDiagram={hasDeployDiagram}
        onActiveViewChange={handleActiveViewChange}
        systemView={{
          svg: systemSvg,
          diagnostics: systemDiagnostics,
          viewPath,
          breadcrumbItems,
          warnings: systemWarnings,
          onBreadcrumbNavigate: navigateViewPath,
          onDeployButtonClick: handleDeployButtonClick,
          onTeamButtonClick: handleTeamButtonClick,
          highlightedNodeId,
          onClearHighlight: () => {
            // eslint-disable-next-line no-console
            console.debug("[karasu/highlight] clearHighlight called (system)", new Error().stack);
            dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null });
          },
        }}
        deployView={{
          svg: deploySvg,
          diagnostics: deployDiagnostics,
          warnings: deployWarnings,
          highlightedNodeId,
          onClearHighlight: () => {
            // eslint-disable-next-line no-console
            console.debug("[karasu/highlight] clearHighlight called (deploy)", new Error().stack);
            dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null });
          },
          onContainerClick: handleContainerClick,
        }}
        orgView={{
          svg: orgSvg,
          diagnostics: orgDiagnostics,
          viewPath,
          breadcrumbItems: orgBreadcrumbItems,
          warnings: orgWarnings,
          onBreadcrumbNavigate: navigateViewPath,
          highlightedNodeId,
          onClearHighlight: () => dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null }),
          onOwnedServiceClick: handleOwnedServiceClick,
        }}
        nodeMetadata={nodeMetadata}
        deployBlocks={deployBlocks}
        selectedDeployBlockId={selectedDeployBlockId}
        onDeployBlockChange={handleDeployBlockChange}
        displayMode={displayMode}
        onDisplayModeChange={handleDisplayModeChange}
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
        orgTreeSvg={orgTreeSvg}
        onTeamToggle={toggleTeamExpand}
        orgTreeExportSvg={orgTreeExportSvg}
      />
    </div>
  );
}

/**
 * Find the 0-based start line of a node in the KrsFile AST.
 * Returns null if the node is not found.
 * AST positions are 1-based, so we subtract 1 to convert to LSP/Monaco convention.
 */
function findNodeLine(krsFile: KrsFile, nodeId: string): number | null {
  function searchKrsNode(node: KrsNode): number | null {
    if (node.id === nodeId) return node.loc.start.line - 1;
    for (const child of node.children) {
      const found = searchKrsNode(child);
      if (found !== null) return found;
    }
    return null;
  }

  function searchOrgNode(node: OrgNode): number | null {
    if (node.id === nodeId) return node.loc.start.line - 1;
    for (const child of node.children) {
      const found = searchOrgNode(child);
      if (found !== null) return found;
    }
    return null;
  }

  for (const sys of krsFile.systems) {
    const found = searchKrsNode(sys);
    if (found !== null) return found;
  }
  for (const svc of krsFile.services) {
    const found = searchKrsNode(svc);
    if (found !== null) return found;
  }
  for (const domain of krsFile.domains) {
    const found = searchKrsNode(domain);
    if (found !== null) return found;
  }
  for (const block of krsFile.deploys) {
    if (block.id === nodeId) return block.loc.start.line - 1;
    for (const node of block.nodes) {
      if (node.id === nodeId) return node.loc.start.line - 1;
    }
  }
  for (const org of krsFile.organizations) {
    if (org.id === nodeId) return org.loc.start.line - 1;
    for (const team of org.teams) {
      const found = searchOrgNode(team);
      if (found !== null) return found;
    }
  }
  return null;
}
