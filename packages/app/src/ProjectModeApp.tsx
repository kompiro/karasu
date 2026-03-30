import { useEffect, useCallback, useMemo, useRef } from "react";
import { Parser } from "@karasu/core";
import { EditorPane } from "./components/EditorPane.js";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { FileTree } from "./components/FileTree.js";
import { KarasuPreviewColumn } from "./components/KarasuPreviewColumn.js";
import { downloadSvg } from "./utils/download-svg.js";
import { useAppContext } from "./state/app-context.js";
import { useSystemView } from "./hooks/useSystemView.js";
import { useDeployView } from "./hooks/useDeployView.js";
import { useOrgView } from "./hooks/useOrgView.js";
import { useFullViewSvg } from "./hooks/useFullViewSvg.js";

import { ProjectManager } from "./fs/project-manager.js";
import type { Project, KrsNode, OrgViewPath, DisplayMode } from "@karasu/core";
import type { ActiveView } from "./state/app-reducer.js";

const LAST_PROJECT_KEY = "karasu-last-project-id";

/**
 * ProjectModeApp — OPFS モードのアプリケーションシェル。
 * プロジェクトセレクタ + ファイルツリー + エディタ + プレビューの4ペイン構成。
 */
export function ProjectModeApp() {
  const { state, dispatch, fs } = useAppContext();
  const pmRef = useRef(new ProjectManager(fs));
  const pm = pmRef.current;

  const {
    currentProject,
    projects,
    currentFilePath,
    fileContent,
    viewPath,
    activeView,
    orgPath,
    selectedDeployBlockId,
    highlightedNodeId,
    displayMode,
    isFullView,
    loading,
  } = state;

  // エントリパスを計算（現在のプロジェクトの index.krs）
  const entryPath = currentProject ? `${currentProject.rootPath}/index.krs` : null;

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
  } = useDeployView(entryPath, fs, viewPath, selectedDeployBlockId, displayMode);

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

  // 初期化: プロジェクト一覧を読み込み
  useEffect(() => {
    (async () => {
      const projectList = await pm.listProjects();

      if (projectList.length === 0) {
        // 初回起動: Getting Started プロジェクトを自動作成
        const starter = await pm.createProject("Getting Started");
        dispatch({ type: "SET_PROJECTS", projects: [starter] });
        dispatch({ type: "SET_CURRENT_PROJECT", project: starter });
      } else {
        dispatch({ type: "SET_PROJECTS", projects: projectList });

        // 最後に開いたプロジェクトを復元
        const lastId = localStorage.getItem(LAST_PROJECT_KEY);
        const lastProject = projectList.find((p) => p.id === lastId);
        dispatch({
          type: "SET_CURRENT_PROJECT",
          project: lastProject ?? projectList[0],
        });
      }

      dispatch({ type: "SET_LOADING", loading: false });
    })();
  }, [pm, dispatch]);

  // プロジェクト切り替え時に localStorage に保存
  useEffect(() => {
    if (currentProject) {
      localStorage.setItem(LAST_PROJECT_KEY, currentProject.id);
    }
  }, [currentProject]);

  // プロジェクト切り替え時に index.krs を自動選択
  useEffect(() => {
    if (!currentProject) return;
    (async () => {
      const indexPath = `${currentProject.rootPath}/index.krs`;
      try {
        const content = await fs.readFile(indexPath);
        dispatch({ type: "SELECT_FILE", path: indexPath, content });
      } catch {
        dispatch({ type: "SELECT_FILE", path: indexPath, content: "" });
      }
    })();
  }, [currentProject, fs, dispatch]);

  // ファイル選択
  const handleSelectFile = useCallback(
    async (path: string) => {
      try {
        const content = await fs.readFile(path);
        dispatch({ type: "SELECT_FILE", path, content });
      } catch {
        dispatch({ type: "SELECT_FILE", path, content: "" });
      }
    },
    [fs, dispatch],
  );

  // エディタ変更時: ファイルに保存 + コンパイル
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

  // ビュー切り替え
  const handleActiveViewChange = useCallback(
    (view: ActiveView) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: view });
    },
    [dispatch],
  );

  // Deploy コンテナクリック → System タブへクロスナビゲーション
  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "system" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: containerId });
    },
    [dispatch],
  );

  // Display mode toggle
  const handleDisplayModeChange = useCallback(
    (mode: DisplayMode) => {
      dispatch({ type: "SET_DISPLAY_MODE", displayMode: mode });
    },
    [dispatch],
  );

  // Full View toggle
  const handleFullViewToggle = useCallback(() => {
    dispatch({ type: "SET_FULL_VIEW", isFullView: !isFullView });
  }, [dispatch, isFullView]);

  const multiLevelSvg = useFullViewSvg(fileContent, "", isFullView, activeView);

  // Deploy ブロックセレクタ変更
  const handleDeployBlockChange = useCallback(
    (id: string) => {
      dispatch({ type: "SET_SELECTED_DEPLOY_BLOCK", id });
    },
    [dispatch],
  );

  // System ノードの Deploy ボタンクリック → Deploy タブへクロスナビゲーション
  const handleDeployButtonClick = useCallback(
    (serviceId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "deploy" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: serviceId });
    },
    [dispatch],
  );

  // System ノードの Team ラベルクリック → Org タブへクロスナビゲーション
  const handleTeamButtonClick = useCallback(
    (teamId: string) => {
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: "org" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: teamId });
    },
    [dispatch],
  );

  // Org チームノードの所有サービスクリック → System タブへクロスナビゲーション
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

  // プロジェクト操作
  const handleSelectProject = useCallback(
    (project: Project) => {
      dispatch({ type: "SET_CURRENT_PROJECT", project });
    },
    [dispatch],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      const project = await pm.createProject(name);
      dispatch({ type: "ADD_PROJECT", project });
      dispatch({ type: "SET_CURRENT_PROJECT", project });
    },
    [pm, dispatch],
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await pm.deleteProject(id);
      dispatch({ type: "REMOVE_PROJECT", id });

      // 残りのプロジェクトがあれば先頭を選択
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        dispatch({ type: "SET_CURRENT_PROJECT", project: remaining[0] });
      }
    },
    [pm, dispatch, projects],
  );

  // ファイル操作コールバック
  const handleFileCreated = useCallback(
    (path: string) => {
      handleSelectFile(path);
    },
    [handleSelectFile],
  );

  const handleFileDeleted = useCallback(
    (path: string) => {
      if (currentFilePath === path) {
        dispatch({ type: "SELECT_FILE", path: "", content: "" });
      }
    },
    [currentFilePath, dispatch],
  );

  const handleFileRenamed = useCallback(
    (oldPath: string, newPath: string) => {
      if (currentFilePath === oldPath) {
        handleSelectFile(newPath);
      }
    },
    [currentFilePath, handleSelectFile],
  );

  // ブレッドクラム
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

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app-project-mode">
      <ProjectSelector
        projects={projects}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
      />
      {currentProject && (
        <FileTree
          rootPath={currentProject.rootPath}
          fs={fs}
          currentFilePath={currentFilePath}
          onSelectFile={handleSelectFile}
          onFileCreated={handleFileCreated}
          onFileDeleted={handleFileDeleted}
          onFileRenamed={handleFileRenamed}
        />
      )}
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
        isFullView={isFullView}
        onFullViewToggle={handleFullViewToggle}
        multiLevelSvg={multiLevelSvg}
      />
    </div>
  );
}
