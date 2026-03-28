import { useEffect, useCallback, useMemo, useRef } from "react";
import {
  Parser,
  InMemoryFileSystemProvider,
  getReference,
  type KrsNode,
  type OrgViewPath,
} from "@karasu/core";
import { EditorPane } from "./components/EditorPane.js";
import { KarasuPreviewColumn } from "./components/KarasuPreviewColumn.js";
import { AppProvider } from "./state/app-context.js";
import { useAppContext } from "./state/app-context.js";
import { useSystemView } from "./hooks/useSystemView.js";
import { useDeployView } from "./hooks/useDeployView.js";
import { useOrgView } from "./hooks/useOrgView.js";
import type { ActiveView } from "./state/app-reducer.js";

const MEMORY_FILE_PATH = "/memory/index.krs";

/**
 * MemoryModeApp — OPFS 非対応ブラウザ向けの単一ファイル編集モード。
 * AppProvider + InMemoryFileSystemProvider で ProjectModeApp と同等の機能を提供する。
 */
export function MemoryModeApp() {
  const inMemoryFs = useRef(new InMemoryFileSystemProvider()).current;

  return (
    <AppProvider fs={inMemoryFs}>
      <MemoryModeInner />
    </AppProvider>
  );
}

function MemoryModeInner() {
  const { state, dispatch, fs } = useAppContext();
  const { fileContent, viewPath, activeView, orgPath, highlightedNodeId } = state;

  // Initialize: write sample KRS to in-memory FS and select the file
  useEffect(() => {
    (async () => {
      const sampleKrs = getReference().sampleKrs;
      await fs.writeFile(MEMORY_FILE_PATH, sampleKrs);
      dispatch({ type: "SELECT_FILE", path: MEMORY_FILE_PATH, content: sampleKrs });
      dispatch({ type: "SET_LOADING", loading: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    svg: systemSvg,
    warnings: systemWarnings,
    diagnostics: systemDiagnostics,
    nodeMetadata: systemNodeMetadata,
    hasDeployDiagram,
    recompile: recompileSystem,
  } = useSystemView(MEMORY_FILE_PATH, fs, viewPath);

  const {
    svg: deploySvg,
    warnings: deployWarnings,
    diagnostics: deployDiagnostics,
    nodeMetadata: deployNodeMetadata,
    recompile: recompileDeploy,
  } = useDeployView(MEMORY_FILE_PATH, fs, viewPath);

  const {
    orgSvg,
    orgDiagnostics,
    orgWarnings,
    recompile: recompileOrg,
  } = useOrgView(MEMORY_FILE_PATH, fs, orgPath as OrgViewPath);

  const recompile = useCallback(() => {
    recompileSystem();
    recompileDeploy();
    recompileOrg();
  }, [recompileSystem, recompileDeploy, recompileOrg]);

  const nodeMetadata = activeView === "deploy" ? deployNodeMetadata : systemNodeMetadata;

  const handleEditorChange = useCallback(
    async (value: string) => {
      dispatch({ type: "UPDATE_FILE_CONTENT", content: value });
      await fs.writeFile(MEMORY_FILE_PATH, value);
      recompile();
    },
    [dispatch, fs, recompile],
  );

  const handleDrillDown = useCallback(
    (newPath: string[]) => {
      if (activeView === "org") {
        dispatch({ type: "SET_ORG_PATH", path: newPath });
      } else {
        dispatch({ type: "SET_VIEW_PATH", path: newPath });
      }
    },
    [dispatch, activeView],
  );

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
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch],
  );

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

      const items: { id: string; label: string }[] = [{ id: "__org__", label: "Org" }];

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

  return (
    <div className="app">
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
        onDrillDown={handleDrillDown}
      />
    </div>
  );
}
