import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { FileTree } from "./components/FileTree.js";
import { AppShell } from "./components/AppShell.js";
import { PasteCompareDialog } from "./components/PasteCompareDialog.js";
import { useAppContext } from "./state/app-context.js";
import { ProjectManager } from "./fs/project-manager.js";
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

  const { currentProject, projects, currentFilePath, loading, compareEntryPath, compareSource } =
    state;
  const [pasteDialog, setPasteDialog] = useState<
    { mode: "edit"; initial: string } | { mode: "view"; content: string } | null
  >(null);

  // Hidden file path within the project used to hold a pasted .krs blob while
  // diff mode is active (Issue #739). The file-tree loader filters `.karasu-*`
  // so it does not surface to the user.
  const pastedPath = currentProject ? `${currentProject.rootPath}/.karasu-paste-compare.krs` : null;

  // Clean up the temp pasted file whenever diff mode exits (or the source is
  // no longer "pasted"). Keeps the OPFS clean across project switches.
  useEffect(() => {
    if (!pastedPath) return;
    if (compareSource === "pasted" && compareEntryPath === pastedPath) return;
    void (async () => {
      if (await fs.exists(pastedPath)) {
        await fs.delete(pastedPath);
      }
    })();
  }, [fs, pastedPath, compareSource, compareEntryPath]);

  // エントリパスを計算（現在のプロジェクトの index.krs）
  const entryPath = currentProject ? `${currentProject.rootPath}/index.krs` : null;

  const { navigateToProject } = useProjectNavigation(projects, currentProject, dispatch);
  const { selectFile } = useFileSelection(fs, dispatch);

  useProjectInitialization({ pm, fs, dispatch, currentProject, selectFile });

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
      dispatch({ type: "SET_COMPARE_ENTRY_PATH", path, source: "file" });
    },
    [dispatch],
  );

  const handleOpenPasteDialog = useCallback(() => {
    setPasteDialog({ mode: "edit", initial: "" });
  }, []);

  const handleViewPasted = useCallback(async () => {
    if (!pastedPath) return;
    const content = await fs.readFile(pastedPath);
    setPasteDialog({ mode: "view", content });
  }, [fs, pastedPath]);

  const handlePasteConfirm = useCallback(
    async (content: string) => {
      if (!pastedPath) return;
      await fs.writeFile(pastedPath, content);
      dispatch({ type: "SET_COMPARE_ENTRY_PATH", path: pastedPath, source: "pasted" });
      setPasteDialog(null);
    },
    [fs, pastedPath, dispatch],
  );

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
      onCompareWithPaste={ENABLE_DIFF_VIEWER ? handleOpenPasteDialog : undefined}
    />
  ) : undefined;

  return (
    <>
      <AppShell
        entryPath={entryPath}
        sidebarHeaderContent={sidebarHeader}
        sidebarContent={sidebarContent}
        onViewPasted={compareSource === "pasted" ? handleViewPasted : undefined}
      />
      {pasteDialog?.mode === "edit" && (
        <PasteCompareDialog
          initialValue={pasteDialog.initial}
          onConfirm={handlePasteConfirm}
          onCancel={() => setPasteDialog(null)}
        />
      )}
      {pasteDialog?.mode === "view" && (
        <PasteCompareDialog
          initialValue={pasteDialog.content}
          readOnly
          onCancel={() => setPasteDialog(null)}
        />
      )}
    </>
  );
}
