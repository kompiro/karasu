import { useEffect, useCallback, useMemo, useRef } from "react";
import { Parser } from "@karasu/core";
import { EditorPane } from "./components/EditorPane.js";
import { PreviewPane } from "./components/PreviewPane.js";
import { WarningPanel } from "./components/WarningPanel.js";
import { BreadcrumbBar } from "./components/BreadcrumbBar.js";
import { DiagramTabBar } from "./components/DiagramTabBar.js";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { FileTree } from "./components/FileTree.js";
import { useAppContext } from "./state/app-context.js";
import { useKarasuProject } from "./hooks/useKarasuProject.js";
import { ProjectManager } from "./fs/project-manager.js";
import type { Project, KrsNode } from "@karasu/core";

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
    diagramType,
    highlightedNodeId,
    loading,
  } = state;

  // エントリパスを計算（現在のプロジェクトの index.krs）
  const entryPath = currentProject ? `${currentProject.rootPath}/index.krs` : null;

  const { svg, warnings, diagnostics, nodeMetadata, hasDeployDiagram, recompile } =
    useKarasuProject(entryPath, fs, viewPath, diagramType);

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

  // ドリルダウン
  const handleDrillDown = useCallback(
    (newPath: string[]) => {
      dispatch({ type: "SET_VIEW_PATH", path: newPath });
    },
    [dispatch],
  );

  // タブ切り替え
  const handleDiagramTypeChange = useCallback(
    (type: typeof diagramType) => {
      dispatch({ type: "SET_DIAGRAM_TYPE", diagramType: type });
    },
    [dispatch],
  );

  // Deploy コンテナクリック → System タブへクロスナビゲーション
  const handleContainerClick = useCallback(
    (containerId: string) => {
      dispatch({ type: "SET_DIAGRAM_TYPE", diagramType: "system" });
      dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: containerId });
    },
    [dispatch],
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
      <div className="preview-column">
        <DiagramTabBar
          current={diagramType}
          hasDeployDiagram={hasDeployDiagram}
          onChange={handleDiagramTypeChange}
        />
        {diagramType === "system" && (
          <BreadcrumbBar
            items={breadcrumbItems}
            onNavigate={(path) => dispatch({ type: "SET_VIEW_PATH", path })}
          />
        )}
        <PreviewPane
          svg={svg}
          diagnostics={diagnostics}
          viewPath={viewPath}
          nodeMetadata={nodeMetadata}
          onDrillDown={handleDrillDown}
          onContainerClick={diagramType === "deploy" ? handleContainerClick : undefined}
          highlightedNodeId={highlightedNodeId}
          onClearHighlight={() => dispatch({ type: "SET_HIGHLIGHTED_NODE", nodeId: null })}
        />
      </div>
      <WarningPanel warnings={warnings} />
    </div>
  );
}
