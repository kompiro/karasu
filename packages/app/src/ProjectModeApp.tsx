import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { SwitchProjectCommand } from "./components/SwitchProjectCommand.js";
import { FileTree } from "./components/FileTree.js";
import { AppShell } from "./components/AppShell.js";
import { PasteCompareDialog } from "./components/PasteCompareDialog.js";
import { useOpenTranslateDialog } from "./components/TranslateProvider.js";
import { SnapshotPickerModal } from "./components/SnapshotPickerModal.js";
import { useAppContext } from "./state/app-context.js";
import { useTranslation } from "./i18n/index.js";
import { ProjectManager } from "./fs/project-manager.js";
import { SnapshotManager } from "./fs/snapshot-manager.js";
import { useProjectNavigation } from "./hooks/useProjectNavigation.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { useProjectInitialization } from "./hooks/useProjectInitialization.js";
import { type Project } from "@karasu-tools/core";
import { exportProjectAsZip } from "./utils/export-project-zip.js";
import { parseZipForImport, disambiguateName } from "./utils/import-project-zip.js";

/**
 * ProjectModeApp — OPFS モードのアプリケーションシェル。
 * プロジェクト管理 + サイドバーを AppShell に注入する。
 */
export function ProjectModeApp() {
  const { state, dispatch, fs } = useAppContext();
  const { t } = useTranslation();
  const pmRef = useRef(new ProjectManager(fs));
  const pm = pmRef.current;

  const {
    currentProject,
    projects,
    currentFilePath,
    fileContent,
    loading,
    initError,
    compareSource,
    lastKrsFilePath,
  } = state;

  const projectRoot = currentProject?.rootPath ?? null;
  const snapshotManager = useMemo(
    () => (projectRoot ? new SnapshotManager(fs, projectRoot) : null),
    [fs, projectRoot],
  );

  const [pasteDialog, setPasteDialog] = useState<
    { mode: "edit"; initial: string } | { mode: "view"; content: string } | null
  >(null);
  const [pickerFilePath, setPickerFilePath] = useState<string | null>(null);
  const openTranslate = useOpenTranslateDialog();

  // Hidden file path within the project used to hold a pasted .krs blob while
  // diff mode is active (Issue #739). The file-tree loader hides dot-prefixed
  // entries so it does not surface to the user.
  const pastedPath = projectRoot ? `${projectRoot}/.karasu-paste-compare.krs` : null;

  // Clean up the temp pasted file whenever diff mode exits (or the source is
  // no longer "pasted"). Keeps the OPFS clean across project switches.
  useEffect(() => {
    if (!pastedPath) return;
    if (compareSource?.kind === "pasted" && compareSource.path === pastedPath) return;
    void (async () => {
      if (await fs.exists(pastedPath)) {
        await fs.delete(pastedPath);
      }
    })();
  }, [fs, pastedPath, compareSource]);

  // Preview entry: the last `.krs` the user opened, falling back to
  // `${project}/index.krs` (Issue #811). Editing a non-`.krs` file (e.g.
  // `.krs.style`) keeps `lastKrsFilePath` pointing at the prior `.krs`, so
  // the diagram stays visible while the user tweaks styles.
  const entryPath = currentProject
    ? (lastKrsFilePath ?? `${currentProject.rootPath}/index.krs`)
    : null;

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
      try {
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
      } catch (err) {
        // parseZipForImport throws on corrupt archives and on the #1526/#1527
        // hardening limits (decompression bomb, entry-count cap). Keep the
        // rejection handled so it can't surface as an uncaught error; a
        // user-facing error banner for import failures is tracked by #1532.
        // eslint-disable-next-line no-console
        console.error("Project import failed:", err);
      }
    },
    [pm, dispatch, projects, navigateToProject],
  );

  const handleCompareWithCurrent = useCallback(
    (path: string) => {
      dispatch({ type: "SET_COMPARE_SOURCE", source: { kind: "file", path } });
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
      dispatch({
        type: "SET_COMPARE_SOURCE",
        source: { kind: "pasted", path: pastedPath },
      });
      setPasteDialog(null);
    },
    [fs, pastedPath, dispatch],
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

  if (initError) {
    return (
      <div className="app-loading" role="alert">
        <p>{t("projectInit.error.title")}</p>
        <p className="app-loading__detail">{initError}</p>
        <p className="app-loading__hint">{t("projectInit.error.hint")}</p>
      </div>
    );
  }

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
      onTranslate={openTranslate}
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
      onCompareWithCurrent={handleCompareWithCurrent}
      onCompareWithPaste={handleOpenPasteDialog}
      onSnapshotNow={handleSnapshotNow}
      onCompareWithSnapshot={handleCompareWithSnapshot}
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
        onViewPasted={compareSource?.kind === "pasted" ? handleViewPasted : undefined}
        onFileChange={selectFile}
      />
      <SwitchProjectCommand
        projects={projects}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
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
