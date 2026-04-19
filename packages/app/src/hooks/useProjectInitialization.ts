import { useEffect, type Dispatch } from "react";
import { EC_PLATFORM_PROJECTS, GETTING_STARTED_PROJECT, type Project } from "@karasu-tools/core";
import type { ProjectManager } from "../fs/project-manager.js";
import type { AppAction } from "../state/app-reducer.js";
import { LAST_PROJECT_KEY } from "./useProjectNavigation.js";

interface UseProjectInitializationArgs {
  pm: ProjectManager;
  dispatch: Dispatch<AppAction>;
  currentProject: Project | null;
  /** `selectFile` from `useFileSelection` — invoked with the project's `index.krs` on switch. */
  selectFile: (path: string) => Promise<void>;
}

/**
 * Coordinates ProjectMode startup in a single explicit location:
 *
 * 1. **Bootstrap** (runs once): read the project list from OPFS. On first
 *    run the list is empty, so seed it with the Getting Started project
 *    plus the ec-platform examples. Clear the loading flag when done.
 * 2. **On project switch**: persist `currentProject.id` to localStorage so
 *    the next session can restore it, and auto-select the project's
 *    `index.krs` as the active editor file.
 *
 * Previously these lived as three separate `useEffect`s in `ProjectModeApp`
 * whose ordering was implicit; consolidating them here makes the startup
 * sequence the single source of truth.
 */
export function useProjectInitialization({
  pm,
  dispatch,
  currentProject,
  selectFile,
}: UseProjectInitializationArgs): void {
  // Bootstrap: load the project list. If empty, seed the default projects.
  useEffect(() => {
    (async () => {
      const projectList = await pm.listProjects();

      if (projectList.length === 0) {
        const initialProjects: Project[] = [];
        const gsProject = await pm.createProject(
          GETTING_STARTED_PROJECT.name,
          GETTING_STARTED_PROJECT.files,
        );
        initialProjects.push(gsProject);
        for (const example of EC_PLATFORM_PROJECTS) {
          const project = await pm.createProject(example.name, example.files);
          initialProjects.push(project);
        }
        dispatch({ type: "SET_PROJECTS", projects: initialProjects });
      } else {
        dispatch({ type: "SET_PROJECTS", projects: projectList });
        // `useProjectNavigation` initialization reads URL / localStorage to restore the selection.
      }

      dispatch({ type: "SET_LOADING", loading: false });
    })();
  }, [pm, dispatch]);

  // On project switch: persist to localStorage + auto-select index.krs.
  useEffect(() => {
    if (!currentProject) return;
    localStorage.setItem(LAST_PROJECT_KEY, currentProject.id);
    void selectFile(`${currentProject.rootPath}/index.krs`);
  }, [currentProject, selectFile]);
}
