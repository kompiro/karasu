import { useCallback, useMemo, useRef } from "react";
import { ProjectSelector } from "./components/ProjectSelector.js";
import { SwitchProjectCommand } from "./components/SwitchProjectCommand.js";
import { FileTree } from "./components/FileTree.js";
import { AppShell } from "./components/AppShell.js";
import { PasteCompareDialog } from "./components/PasteCompareDialog.js";
import { ErrorBanner } from "./components/ErrorBanner.js";
import { useOpenTranslateDialog } from "./components/TranslateProvider.js";
import { SnapshotPickerModal } from "./components/SnapshotPickerModal.js";
import { useAppContext } from "./state/app-context.js";
import { useTranslation } from "./i18n/index.js";
import { ProjectManager } from "./fs/project-manager.js";
import { SnapshotManager } from "./fs/snapshot-manager.js";
import { useProjectNavigation } from "./hooks/useProjectNavigation.js";
import { useFileSelection } from "./hooks/useFileSelection.js";
import { useProjectInitialization } from "./hooks/useProjectInitialization.js";
import { useProjectActions } from "./hooks/useProjectActions.js";
import { usePasteCompare } from "./hooks/usePasteCompare.js";
import { useSnapshotCompare } from "./hooks/useSnapshotCompare.js";
import { useTransientError } from "./hooks/useTransientError.js";
import { type Project } from "@karasu-tools/core";

const ACTION_ERROR_DISMISS_MS = 6000;

/**
 * ProjectModeApp — OPFS モードのアプリケーションシェル。
 * プロジェクト管理 + サイドバーを AppShell に注入する。
 *
 * 機能クラスタ（プロジェクト操作 / ペースト比較 / スナップショット比較）は
 * それぞれ専用フックに切り出してあり、本コンポーネントは配線に徹する（#1547）。
 * 各操作の失敗は `useTransientError` 経由で `ErrorBanner` に表示する（#1532）。
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

  const openTranslate = useOpenTranslateDialog();
  const {
    error: actionError,
    reportError,
    clearError,
  } = useTransientError(ACTION_ERROR_DISMISS_MS);

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

  const { createProject, renameProject, deleteProject, exportProject, importProject } =
    useProjectActions({
      pm,
      fs,
      projects,
      currentProject,
      dispatch,
      navigateToProject,
      reportError,
    });

  const paste = usePasteCompare({ fs, projectRoot, compareSource, dispatch });
  const snapshot = useSnapshotCompare({
    snapshotManager,
    projectRoot,
    currentFilePath,
    fileContent,
    fs,
    reportError,
  });

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

  const handleSelectProject = useCallback(
    (project: Project) => {
      navigateToProject(project);
    },
    [navigateToProject],
  );

  const handleCompareWithCurrent = useCallback(
    (path: string) => {
      dispatch({ type: "SET_COMPARE_SOURCE", source: { kind: "file", path } });
    },
    [dispatch],
  );

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
      onCreateProject={createProject}
      onRenameProject={renameProject}
      onDeleteProject={deleteProject}
      onExportProject={exportProject}
      onImportProject={importProject}
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
      onCompareWithPaste={paste.openPasteDialog}
      onSnapshotNow={snapshot.snapshotNow}
      onCompareWithSnapshot={snapshot.compareWithSnapshot}
    />
  ) : undefined;

  return (
    <>
      {actionError && <ErrorBanner message={actionError} onDismiss={clearError} />}
      <AppShell
        entryPath={entryPath}
        sidebarHeaderContent={sidebarHeader}
        sidebarContent={sidebarContent}
        onViewPasted={compareSource?.kind === "pasted" ? paste.viewPasted : undefined}
        onFileChange={selectFile}
      />
      <SwitchProjectCommand
        projects={projects}
        currentProject={currentProject}
        onSelectProject={handleSelectProject}
      />
      {paste.pasteDialog?.mode === "edit" && (
        <PasteCompareDialog
          initialValue={paste.pasteDialog.initial}
          onConfirm={paste.confirmPaste}
          onCancel={paste.closePasteDialog}
        />
      )}
      {paste.pasteDialog?.mode === "view" && (
        <PasteCompareDialog
          initialValue={paste.pasteDialog.content}
          readOnly
          onCancel={paste.closePasteDialog}
        />
      )}
      {snapshot.pickerFilePath && snapshot.pickerRelPath && snapshotManager && (
        <SnapshotPickerModal
          snapshots={snapshotManager}
          filePath={snapshot.pickerRelPath}
          fileBasename={snapshot.pickerRelPath.split("/").pop() ?? snapshot.pickerRelPath}
          onSelect={(record) => {
            const relPath = snapshot.pickerRelPath;
            if (relPath) {
              dispatch({
                type: "SET_COMPARE_SOURCE",
                source: { kind: "snapshot", filePath: relPath, snapshotId: record.id },
              });
            }
            snapshot.closePicker();
          }}
          onClose={snapshot.closePicker}
        />
      )}
    </>
  );
}
