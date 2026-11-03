import { useEffect, useRef, type Dispatch } from "react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../../state/app-reducer.js";
import type { Scene } from "./tour-steps.js";

/** A scene to show in the project at `root`. A new `key` applies it again. */
export interface PendingScene {
  root: string;
  scene: Scene;
  key: string;
}

interface UseGuidedSceneArgs {
  pending: PendingScene | null;
  currentProject: Project | null;
  currentFilePath: string | null;
  selectFile: (path: string) => Promise<void>;
  dispatch: Dispatch<AppAction>;
}

/**
 * Applies a guide scene once its project is open (#3566).
 *
 * A guide usually starts by creating a project, and switching to a project
 * auto-selects its `index.krs` (`useProjectInitialization`). The scene waits
 * until that selection has landed: selecting the scene's file before it would
 * be overwritten by the slower auto-select. After that, the scene goes through
 * the same actions a click does, in the order the reducer needs: selecting a
 * file resets the view, so the view is set last.
 */
export function useGuidedScene({
  pending,
  currentProject,
  currentFilePath,
  selectFile,
  dispatch,
}: UseGuidedSceneArgs): void {
  const appliedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!pending || appliedKey.current === pending.key) return;
    if (currentProject?.rootPath !== pending.root) return;
    if (!currentFilePath?.startsWith(`${pending.root}/`)) return;
    appliedKey.current = pending.key;

    const { root, scene } = pending;
    const path = `${root}/${scene.file}`;
    void (async () => {
      if (currentFilePath !== path) await selectFile(path);
      dispatch({
        type: "SET_COMPARE_SOURCE",
        source: scene.compareWith ? { kind: "file", path: `${root}/${scene.compareWith}` } : null,
      });
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: scene.view });
    })();
  }, [pending, currentProject, currentFilePath, selectFile, dispatch]);
}
