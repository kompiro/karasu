import { useCallback, useMemo, useRef, useState } from "react";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { FileTree } from "./components/FileTree.js";
import { AppShell } from "./components/AppShell.js";
import { SnapshotPickerModal } from "./components/SnapshotPickerModal.js";
import { useAppContext } from "./state/app-context.js";
import { ProjectManager } from "./fs/project-manager.js";
import { SnapshotManager } from "./fs/snapshot-manager.js";
import { useProjectNavigation } from "./hooks/useProjectNavigation.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { useProjectInitialization } from "./hooks/useProjectInitialization.js";
import { type Project } from "@karasu-tools/core";
import { exportProjectAsZip } from "./utils/export-project-zip.js";
import { parseZipForImport, disambiguateName } from "./utils/import-project-zip.js";
import { ENABLE_DIFF_VIEWER } from "./utils/feature-flags.js";

/**
 * ProjectModeApp — OPFS モードのアプリケーションシェル。
 * プロジェクト管理 + サイドバーを AppShell に注入する。
 */
export function ProjectModeApp() {
  const { state, dispatch, fs } = useAppContext();
  const pmRef = useRef(new ProjectManager(fs));
  const pm = pmRef.current;

  const { currentProject, projects, currentFilePath, fileContent, loading } = state;

  const projectRoot = currentProject?.rootPath ?? null;
  const snapshotManager = useMemo(
    () => (projectRoot ? new SnapshotManager(fs, projectRoot) : null),
    [fs, projectRoot],
  );
  const [pickerFilePath, setPickerFilePath] = useState<string | null>(null);

  // エントリパスを計算（現在のプロジェクトの index.krs）
  const entryPath = currentProject ? `${currentProject.rootPath}/index.krs` : null;

  const { navigateToProject } = useProjectNavigation(projects, currentProject, dispatch);
  const { selectFile } = useFileSelection(fs, dispatch);

  useProjectInitialization({ pm, dispatch, currentProject, selectFile });

  // ── ファイル選択 ────────────────────────────────────────────────

  const handleFileCreated = useCallback(
    (path: string) => {
      void selectFile(path);
    },
    [selectFile],
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
        void selectFile(newPath);
      }
    },
    [currentFilePath, selectFile],
  );

  // ── プロジェクト操作 ────────────────────────────────────────────

  const handleSelectProject = useCallback(
    (project: Project) => {
      navigateToProject(project);
    },
    [navigateToProject],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      const project = await pm.createProject(name);
      dispatch({ type: "ADD_PROJECT", project });
      navigateToProject(project);
    },
    [pm, dispatch, navigateToProject],
  );

  const handleRenameProject = useCallback(
    async (id: string, newName: string) => {
      const updated = await pm.renameProject(id, newName);
      dispatch({ type: "RENAME_PROJECT", id, name: updated.name });
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
        navigateToProject(remaining[0]);
      }
    },
    [pm, dispatch, projects, navigateToProject],
  );

  const handleExportProject = useCallback(() => {
    if (!currentProject) return;
    void exportProjectAsZip(fs, currentProject.rootPath, currentProject.name);
  }, [fs, currentProject]);

  const handleImportProject = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const { files, detectedName } = parseZipForImport(new Uint8Array(buffer));
      const baseName = detectedName ?? file.name.replace(/\.zip$/i, "");
      const finalName = disambiguateName(
        baseName,
        projects.map((p) => p.name),
      );
      const project = await pm.createProject(finalName, files);
      dispatch({ type: "ADD_PROJECT", project });
      navigateToProject(project);
    },
    [pm, dispatch, projects, navigateToProject],
  );

  const handleCompareWithCurrent = useCallback(
    (path: string) => {
      dispatch({ type: "SET_COMPARE_SOURCE", source: { kind: "file", path } });
    },
    [dispatch],
  );

  const handleSnapshotNow = useCallback(
    async (path: string) => {
      if (!snapshotManager || !projectRoot || !path.startsWith(`${projectRoot}/`)) return;
      const relPath = path.slice(projectRoot.length + 1);
      const label = window.prompt("Label this snapshot (optional):") ?? undefined;
      const content =
        path === currentFilePath ? fileContent : await fs.readFile(path).catch(() => "");
      await snapshotManager.capture(relPath, content, {
        trigger: "manual",
        label: label || undefined,
      });
    },
    [snapshotManager, projectRoot, currentFilePath, fileContent, fs],
  );

  const handleCompareWithSnapshot = useCallback((path: string) => {
    setPickerFilePath(path);
  }, []);

  if (loading || !currentProject) {
    return <div className="app-loading">Loading...</div>;
  }

  const sidebarHeader = (
    <ProjectSelector
      projects={projects}
      currentProject={currentProject}
      onSelectProject={handleSelectProject}
      onCreateProject={handleCreateProject}
      onRenameProject={handleRenameProject}
      onDeleteProject={handleDeleteProject}
      onExportProject={handleExportProject}
      onImportProject={handleImportProject}
    />
  );

  const sidebarContent = currentProject ? (
    <FileTree
      rootPath={currentProject.rootPath}
      fs={fs}
      currentFilePath={currentFilePath}
      onSelectFile={selectFile}
      onFileCreated={handleFileCreated}
      onFileDeleted={handleFileDeleted}
      onFileRenamed={handleFileRenamed}
      onCompareWithCurrent={ENABLE_DIFF_VIEWER ? handleCompareWithCurrent : undefined}
      onSnapshotNow={ENABLE_DIFF_VIEWER ? handleSnapshotNow : undefined}
      onCompareWithSnapshot={ENABLE_DIFF_VIEWER ? handleCompareWithSnapshot : undefined}
    />
  ) : undefined;

  const pickerRelPath =
    pickerFilePath && projectRoot && pickerFilePath.startsWith(`${projectRoot}/`)
      ? pickerFilePath.slice(projectRoot.length + 1)
      : null;

  return (
    <>
      <AppShell
        entryPath={entryPath}
        sidebarHeaderContent={sidebarHeader}
        sidebarContent={sidebarContent}
      />
      {pickerFilePath && pickerRelPath && snapshotManager && (
        <SnapshotPickerModal
          snapshots={snapshotManager}
          filePath={pickerRelPath}
          fileBasename={pickerRelPath.split("/").pop() ?? pickerRelPath}
          onSelect={(record) => {
            dispatch({
              type: "SET_COMPARE_SOURCE",
              source: { kind: "snapshot", filePath: pickerRelPath, snapshotId: record.id },
            });
            setPickerFilePath(null);
          }}
          onClose={() => setPickerFilePath(null)}
        />
      )}
    </>
  );
}
