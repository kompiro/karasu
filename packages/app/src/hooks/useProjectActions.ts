import { useCallback } from "react";
import type { Dispatch } from "react";
import type { FileSystemProvider, Project } from "@karasu-tools/core";
import type { AppAction } from "../state/app-reducer.js";
import type { ProjectManager } from "../fs/project-manager.js";
import { useTranslation } from "../i18n/index.js";
import { exportProjectAsZip } from "../utils/export-project-zip.js";
import { parseZipForImport, disambiguateName } from "../utils/import-project-zip.js";
import { errorDetail } from "../utils/error-detail.js";

interface UseProjectActionsArgs {
  pm: ProjectManager;
  fs: FileSystemProvider;
  projects: Project[];
  currentProject: Project | null;
  dispatch: Dispatch<AppAction>;
  navigateToProject: (project: Project) => void;
  /** Surface a failure to the user (banner / toast). */
  reportError: (message: string) => void;
}

interface ProjectActions {
  createProject: (name: string) => Promise<void>;
  renameProject: (id: string, newName: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  exportProject: () => Promise<void>;
  importProject: (file: File) => Promise<void>;
}

/**
 * Project lifecycle actions (create / rename / delete / export / import)
 * extracted from ProjectModeApp (#1547). Every action catches its failure and
 * routes it to `reportError`, so a corrupt ZIP, an OPFS read error, or a quota
 * failure surfaces to the user instead of vanishing as an unhandled rejection
 * (#1532).
 */
export function useProjectActions({
  pm,
  fs,
  projects,
  currentProject,
  dispatch,
  navigateToProject,
  reportError,
}: UseProjectActionsArgs): ProjectActions {
  const { t } = useTranslation();

  const createProject = useCallback(
    async (name: string) => {
      try {
        const project = await pm.createProject(name);
        dispatch({ type: "ADD_PROJECT", project });
        navigateToProject(project);
      } catch (err) {
        reportError(t("project.error.create", { detail: errorDetail(err) }));
      }
    },
    [pm, dispatch, navigateToProject, reportError, t],
  );

  const renameProject = useCallback(
    async (id: string, newName: string) => {
      try {
        const updated = await pm.renameProject(id, newName);
        dispatch({ type: "RENAME_PROJECT", id, name: updated.name });
      } catch (err) {
        reportError(t("project.error.rename", { detail: errorDetail(err) }));
      }
    },
    [pm, dispatch, reportError, t],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      try {
        await pm.deleteProject(id);
        dispatch({ type: "REMOVE_PROJECT", id });
        // Select the first remaining project, if any.
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          navigateToProject(remaining[0]);
        }
      } catch (err) {
        reportError(t("project.error.delete", { detail: errorDetail(err) }));
      }
    },
    [pm, dispatch, projects, navigateToProject, reportError, t],
  );

  const exportProject = useCallback(async () => {
    if (!currentProject) return;
    try {
      await exportProjectAsZip(fs, currentProject.rootPath, currentProject.name);
    } catch (err) {
      reportError(t("project.error.export", { detail: errorDetail(err) }));
    }
  }, [fs, currentProject, reportError, t]);

  const importProject = useCallback(
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
        // hardening limits (decompression bomb, entry-count cap).
        reportError(t("project.error.import", { detail: errorDetail(err) }));
      }
    },
    [pm, dispatch, projects, navigateToProject, reportError, t],
  );

  return { createProject, renameProject, deleteProject, exportProject, importProject };
}
