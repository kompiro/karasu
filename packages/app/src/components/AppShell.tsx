import { useCallback, useMemo, useState } from "react";
import { Parser } from "@karasu/core";
import { EditorPane } from "./EditorPane.js";
import { KarasuPreviewColumn } from "./KarasuPreviewColumn.js";
import { downloadSvg } from "../utils/download-svg.js";
import { useAppContext } from "../state/app-context.js";
import { useSystemView } from "../hooks/useSystemView.js";
import { useDeployView } from "../hooks/useDeployView.js";
import { useOrgView } from "../hooks/useOrgView.js";
import { useViewSvg } from "../hooks/useViewSvg.js";

import type { ReactNode } from "react";
import type { KrsNode, OrgViewPath, DisplayMode } from "@karasu/core";
import type { ActiveView } from "../state/app-reducer.js";

interface AppShellProps {
  entryPath: string | null;
  sidebarContent?: ReactNode;
}

/**
 * AppShell — shared layout and logic for MemoryModeApp and ProjectModeApp.
 *
 * Contains all view hooks, cross-navigation handlers, breadcrumb computation,
 * and the EditorPane + KarasuPreviewColumn assembly.
 *
 * Mode-specific concerns (initialization, project management, sidebar content)
 * are handled by the parent wrapper components.
 */
export function AppShell({ entryPath, sidebarContent }: AppShellProps) {
  const { state, dispatch, fs } = useAppContext();
  const {
    fileContent,
    viewPath,
    activeView,
    orgPath,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    currentFilePath,
  } = state;

  const [isAllLayersOpen, setIsAllLayersOpen] = useState(false);

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
  } = useOrgView(entryPath, fs, orgPath as OrgViewPath, displayMode);

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  const nodeMetadata = activeView === "deploy" ? deployNodeMetadata : systemNodeMetadata;

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

  // ── View & cross-navigation handlers ────────────────────────────

  const handleActiveViewChange = useCallback(
    (view: ActiveView) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: view });
    },
    [dispatch],
  );

  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: containerId });
    },
    [dispatch],
  );

  const handleDeployButtonClick = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch],
  );

  const handleTeamButtonClick = useCallback(
    (teamId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: teamId });
    },
    [dispatch],
  );

  const handleOwnedServiceClick = useCallback(
    (serviceId: string) => {
      const resolvedPath = nodePathIndex.get(serviceId);
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      if (resolvedPath !== undefined) {
        dispatch({ type: "SET_VIEW_PATH", path: resolvedPath });
      }
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch, nodePathIndex],
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

      const items: { id: string; label: string }[] = [];
      const system = systems[0];
      items.push({ id: system.id, label: system.label ?? system.id });

      let current: KrsNode = system;
      for (const segment of viewPath) {
        const child: KrsNode | undefined = current.children.find((c) => c.id === segment);
        if (!child) break;
        items.push({ id: child.id, label: child.label ?? child.id });
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
      for (const segment of orgPath) {
        const team = teams.find((t) => t.id === segment);
        if (!team) break;
        items.push({ id: team.id, label: team.label ?? team.id });
        teams = team.teams;
      }

      return items;
    } catch {
      return [];
    }
  }, [fileContent, orgPath]);

  // ── All-layers SVGs ─────────────────────────────────────────────

  const { drillDownSvg, allLayersSvg, orgAllLayersSvg, orgDrillDownSvg } = useViewSvg(
    fileContent,
    displayMode,
  );

  // ── Render ──────────────────────────────────────────────────────

  const className = sidebarContent ? "app-shell has-sidebar" : "app-shell";

  return (
    <div className={className}>
      {sidebarContent}
      <EditorPane value={fileContent} onChange={handleEditorChange} />
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
          onBreadcrumbNavigate: (path) => dispatch({ type: "SET_VIEW_PATH", path }),
          onDeployButtonClick: handleDeployButtonClick,
          onTeamButtonClick: handleTeamButtonClick,
        }}
        deployView={{
          svg: deploySvg,
          diagnostics: deployDiagnostics,
          warnings: deployWarnings,
          highlightedNodeId,
          onClearHighlight: () => dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null }),
          onContainerClick: handleContainerClick,
        }}
        orgView={{
          svg: orgSvg,
          diagnostics: orgDiagnostics,
          orgPath: orgPath as OrgViewPath,
          breadcrumbItems: orgBreadcrumbItems,
          warnings: orgWarnings,
          onBreadcrumbNavigate: (path) => dispatch({ type: "SET_ORG_PATH", path }),
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
      />
    </div>
  );
}
