import { useEffect, useRef, type Dispatch } from "react";
import type { Project } from "@karasu-tools/core";
import type { AppAction } from "../../state/app-reducer.js";
import type { Scene } from "./tour-steps.js";

/** A scene to show in the project at `root`. A new `key` applies it again. */
export interface PendingScene {
  root: string;
  scene: Scene;
  key: string;
  /**
   * Apply it again when the visitor comes back to its project. A tour step
   * is still on screen, so its scene comes back with it; a one-off scene
   * has done its job once and must not override where the visitor went.
   */
  reapplyOnReturn: boolean;
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
 *
 * The file is selected even when it is already open: `selectFile` supersedes
 * an earlier, slower selection, so a scene left before its file loaded cannot
 * land over the next one. Its diff and view are dropped the same way, by
 * checking after the read that the scene is still the current one (TPL-1534).
 * Leaving the project of a scene that asks to be re-applied forgets it was
 * applied, so coming back shows it again: the switch back resets the file and
 * the diff. A visitor who switches projects during the read keeps the scene's
 * diff off the other project the same way.
 */
export function useGuidedScene({
  pending,
  currentProject,
  currentFilePath,
  selectFile,
  dispatch,
}: UseGuidedSceneArgs): void {
  const appliedKey = useRef<string | null>(null);
  // The scene the guide is on now and the open project, read after an await.
  // Synced in an effect, which runs before the apply effect below.
  const currentKey = useRef<string | null>(null);
  const currentRoot = useRef<string | null>(null);
  useEffect(() => {
    currentKey.current = pending?.key ?? null;
    currentRoot.current = currentProject?.rootPath ?? null;
  }, [pending, currentProject]);

  useEffect(() => {
    if (!pending) return;
    if (currentProject?.rootPath !== pending.root) {
      if (pending.reapplyOnReturn) appliedKey.current = null;
      return;
    }
    if (appliedKey.current === pending.key) return;
    if (!currentFilePath?.startsWith(`${pending.root}/`)) return;
    appliedKey.current = pending.key;

    const { root, scene, key } = pending;
    void (async () => {
      await selectFile(`${root}/${scene.file}`);
      if (currentKey.current !== key || currentRoot.current !== root) return;
      dispatch({
        type: "SET_COMPARE_SOURCE",
        source: scene.compareWith ? { kind: "file", path: `${root}/${scene.compareWith}` } : null,
      });
      dispatch({ type: "SET_ACTIVE_VIEW", activeView: scene.view });
    })();
  }, [pending, currentProject, currentFilePath, selectFile, dispatch]);
}
